import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/config.dart';
import 'core/permissions.dart';
import 'data/api_client.dart';
import 'data/api_exception.dart';
import 'data/models.dart';
import 'data/repository.dart';
import 'data/session_store.dart';

/// Injected in `main()` after the preferences have loaded.
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('sharedPreferencesProvider must be overridden');
});

final serverSettingsProvider = Provider<ServerSettings>((ref) {
  return ServerSettings(ref.watch(sharedPreferencesProvider));
});

final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final settings = ref.watch(serverSettingsProvider);
  return ApiClient(ref.watch(sessionStoreProvider), baseUrl: settings.url);
});

final staffRepositoryProvider = Provider<StaffRepository>((ref) {
  return StaffRepository(ref.watch(apiClientProvider));
});

final sessionProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(staffRepositoryProvider),
    ref.watch(sessionStoreProvider),
    ref.watch(apiClientProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});

/// What the signed-in person may open. The server enforces the same rules on
/// every call; this only decides which doors are shown.
final accessProvider = Provider<StaffAccess>((ref) {
  final user = ref.watch(sessionProvider).user;
  if (user == null) {
    return const StaffAccess(
      isPicker: false,
      orders: false,
      deliveries: false,
      returns: false,
      money: false,
    );
  }
  return StaffAccess.from(role: user.role, permissions: user.permissions);
});

/// The server address: baked into a release build, or chosen on the sign-in
/// screen while developing.
class ServerSettings {
  ServerSettings(this._prefs);

  static const _key = 'citycart.staff.api_url';

  final SharedPreferences _prefs;

  bool get isLockedByBuild => AppConfig.hasBuildApiUrl;

  String? get url {
    if (AppConfig.hasBuildApiUrl) {
      return AppConfig.normalize(AppConfig.buildApiUrl);
    }
    return AppConfig.normalize(_prefs.getString(_key));
  }

  bool get isConfigured => url != null;

  Future<String> save(String raw) async {
    final normalized = AppConfig.normalize(raw);
    if (normalized == null) {
      throw const FormatException(
        'Enter a full address, for example http://10.0.2.2:5000',
      );
    }
    await _prefs.setString(_key, normalized);
    return normalized;
  }
}

enum SessionStatus { unknown, signedOut, signedIn }

/// Holds the signed-in team member for the whole app. A plain
/// [ChangeNotifier] so the router can redirect the instant the session starts
/// or ends.
class SessionController extends ChangeNotifier {
  SessionController(this._repository, this._store, this._api) {
    _api.onUnauthorized = _handleExpired;
  }

  final StaffRepository _repository;
  final SessionStore _store;
  final ApiClient _api;

  SessionStatus _status = SessionStatus.unknown;
  AppUser? _user;
  String? _notice;
  bool _offline = false;
  bool _profileIncomplete = false;
  List<Workspace> _workspaces = const [];

  SessionStatus get status => _status;
  AppUser? get user => _user;
  String? get notice => _notice;

  /// True when the stored session was kept because the server could not be
  /// reached at launch. Screens still open and show their own error.
  bool get isOffline => _offline;

  /// True when sign-in succeeded but the permission list could not be loaded,
  /// so an employee's tabs are not known yet.
  bool get profileIncomplete => _profileIncomplete;

  List<Workspace> get workspaces => _workspaces;

  void clearNotice() {
    if (_notice == null) return;
    _notice = null;
    notifyListeners();
  }

  Future<void> restore() async {
    await _store.load();
    if (_store.token == null || _store.user == null) {
      _status = SessionStatus.signedOut;
      notifyListeners();
      return;
    }

    _status = SessionStatus.signedIn;
    _user = _store.user;
    notifyListeners();

    try {
      final fresh = await _repository.me();
      if (!_isStaffRole(fresh.role)) {
        await _expire('This account does not use the Staff app.');
        return;
      }
      _user = fresh;
      _offline = false;
      _profileIncomplete = false;
      await _store.save(token: _store.token!, user: fresh);
      notifyListeners();
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _expire('Your session ended. Please sign in again.');
      } else {
        _offline = true;
        notifyListeners();
      }
    }
  }

  /// Signs in. A team member who belongs to more than one brand gets a
  /// `WORKSPACE_REQUIRED` error carrying the short-lived choice token; the
  /// caller then shows the brand chooser and calls [chooseWorkspace].
  Future<void> signIn({required String email, required String password}) async {
    final result = await _repository.signIn(email: email, password: password);
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _status = SessionStatus.signedIn;
    _offline = false;
    _notice = null;
    _profileIncomplete = true;
    notifyListeners();
    await _loadProfile();
  }

  Future<void> chooseWorkspace({
    required String workspaceToken,
    required String brandId,
    List<Workspace> workspaces = const [],
  }) async {
    final result = await _repository.chooseWorkspace(
      workspaceToken: workspaceToken,
      brandId: brandId,
    );
    _workspaces = workspaces;
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _status = SessionStatus.signedIn;
    _offline = false;
    _notice = null;
    _profileIncomplete = true;
    notifyListeners();
    await _loadProfile();
  }

  Future<void> switchWorkspace(String brandId) async {
    final result = await _repository.switchWorkspace(brandId);
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _profileIncomplete = true;
    notifyListeners();
    await _loadProfile();
  }

  /// Re-reads the permission list after a launch that could not reach the
  /// server. Safe to call from a retry button.
  Future<void> refreshProfile() async {
    try {
      final fresh = await _repository.me();
      _user = fresh;
      _offline = false;
      _profileIncomplete = false;
      final token = _store.token;
      if (token != null) await _store.save(token: token, user: fresh);
      notifyListeners();
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _expire('Your session ended. Please sign in again.');
      } else {
        _offline = true;
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _store.clear();
    _user = null;
    _workspaces = const [];
    _status = SessionStatus.signedOut;
    _notice = null;
    notifyListeners();
  }

  Future<void> _loadProfile() async {
    try {
      final fresh = await _repository.me();
      _user = fresh;
      _profileIncomplete = false;
      _offline = false;
      final token = _store.token;
      if (token != null) await _store.save(token: token, user: fresh);
      notifyListeners();
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _expire('Your session ended. Please sign in again.');
        return;
      }
      // Keep the signed-in user; the home screen offers a retry.
      _profileIncomplete = true;
      notifyListeners();
    }
  }

  bool _isStaffRole(String role) =>
      role == 'PICKER' || role == 'BRAND_EMPLOYEE';

  Future<void> _expire(String message) async {
    await _store.clear();
    _user = null;
    _workspaces = const [];
    _status = SessionStatus.signedOut;
    _notice = message;
    notifyListeners();
  }

  void _handleExpired() {
    if (_status != SessionStatus.signedIn) return;
    unawaited(_expire('Your session ended. Please sign in again.'));
  }

  @override
  void dispose() {
    _api.onUnauthorized = null;
    super.dispose();
  }
}
