import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/api_client.dart';
import '../data/api_exception.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../data/session_store.dart';
import '../core/config.dart';

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

final deliveryRepositoryProvider = Provider<DeliveryRepository>((ref) {
  return DeliveryRepository(ref.watch(apiClientProvider));
});

final sessionProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(deliveryRepositoryProvider),
    ref.watch(sessionStoreProvider),
    ref.watch(apiClientProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});

/// The server address: baked into a release build, or chosen on the sign-in
/// screen while developing.
class ServerSettings {
  ServerSettings(this._prefs);

  static const _key = 'citycart.delivery.api_url';

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

/// Holds the signed-in rider for the whole app. It is a plain [ChangeNotifier]
/// so the router can listen to it directly and redirect as soon as the session
/// starts or ends.
class SessionController extends ChangeNotifier {
  SessionController(this._repository, this._store, this._api) {
    _api.onUnauthorized = _handleExpired;
  }

  final DeliveryRepository _repository;
  final SessionStore _store;
  final ApiClient _api;

  SessionStatus _status = SessionStatus.unknown;
  AppUser? _user;
  String? _notice;
  bool _offline = false;

  SessionStatus get status => _status;
  AppUser? get user => _user;
  String? get notice => _notice;

  /// True when the stored session was kept because the server could not be
  /// reached at launch. The app still opens; data screens show their own error.
  bool get isOffline => _offline;

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

    // Open with the cached rider immediately; refresh quietly behind it.
    _status = SessionStatus.signedIn;
    _user = _store.user;
    notifyListeners();

    try {
      final fresh = await _repository.me();
      if (!fresh.isRider) {
        await _expire('This account is not a delivery rider.');
        return;
      }
      _user = fresh;
      _offline = false;
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

  Future<void> signIn({required String email, required String password}) async {
    final result = await _repository.login(email: email, password: password);
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _status = SessionStatus.signedIn;
    _offline = false;
    _notice = null;
    notifyListeners();
  }

  Future<void> signOut() async {
    await _store.clear();
    _user = null;
    _status = SessionStatus.signedOut;
    _notice = null;
    notifyListeners();
  }

  Future<void> _expire(String message) async {
    await _store.clear();
    _user = null;
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
