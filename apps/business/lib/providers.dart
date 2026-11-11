import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/config.dart';
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

final businessRepositoryProvider = Provider<BusinessRepository>((ref) {
  return BusinessRepository(ref.watch(apiClientProvider));
});

final sessionProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(businessRepositoryProvider),
    ref.watch(sessionStoreProvider),
    ref.watch(apiClientProvider),
  );
  ref.onDispose(controller.dispose);
  unawaited(controller.restore());
  return controller;
});

/// The shop behind a brand owner. A provider account never asks for this.
final brandSummaryProvider = FutureProvider.autoDispose<BrandSummary>((
  ref,
) async {
  final user = ref.watch(sessionProvider).user;
  if (user == null || !user.isBrand) {
    throw ApiException('Sign in with a shop account to see this.');
  }
  return ref.watch(businessRepositoryProvider).currentBrand();
});

/// The service business behind a provider account.
final providerProfileProvider = FutureProvider.autoDispose<ProviderProfile>((
  ref,
) async {
  final user = ref.watch(sessionProvider).user;
  if (user == null || !user.isProvider) {
    throw ApiException('Sign in with a service account to see this.');
  }
  return ref.watch(businessRepositoryProvider).currentProvider();
});

/// The service catalog of the signed-in provider.
final providerOfferingsProvider =
    FutureProvider.autoDispose<List<ServiceOffering>>((ref) async {
      final user = ref.watch(sessionProvider).user;
      if (user == null || !user.isProvider) {
        throw ApiException('Sign in with a service account to see this.');
      }
      return ref.watch(businessRepositoryProvider).providerOfferings();
    });

/// Weekly working hours and days off of the signed-in provider.
final providerAvailabilityProvider =
    FutureProvider.autoDispose<ServiceAvailability>((ref) async {
      final user = ref.watch(sessionProvider).user;
      if (user == null || !user.isProvider) {
        throw ApiException('Sign in with a service account to see this.');
      }
      return ref.watch(businessRepositoryProvider).providerAvailability();
    });

/// The provider's merged inbox: job chats and direct customer questions.
final providerChatInboxProvider =
    FutureProvider.autoDispose<List<ProviderChatThread>>((ref) async {
      final user = ref.watch(sessionProvider).user;
      if (user == null || !user.isProvider) {
        throw ApiException('Sign in with a service account to see this.');
      }
      return ref.watch(businessRepositoryProvider).providerChatInbox();
    });

/// Reviews left for the provider, optionally narrowed to one star rating.
final providerReviewsProvider = FutureProvider.autoDispose
    .family<ProviderReviewPage, int?>((ref, rating) async {
      final user = ref.watch(sessionProvider).user;
      if (user == null || !user.isProvider) {
        throw ApiException('Sign in with a service account to see this.');
      }
      return ref
          .watch(businessRepositoryProvider)
          .providerReviews(rating: rating, limit: 30);
    });

/// The numbers a shop owner needs on opening the app. Two small requests give
/// the queue size and the latest orders without loading every order.
class BrandOverview {
  const BrandOverview({
    this.pendingOrders = 0,
    this.totalOrders = 0,
    this.recentOrders = const <BrandOrder>[],
  });

  final int pendingOrders;
  final int totalOrders;
  final List<BrandOrder> recentOrders;
}

final brandOverviewProvider = FutureProvider.autoDispose<BrandOverview>((
  ref,
) async {
  final user = ref.watch(sessionProvider).user;
  if (user == null || !user.isBrand) {
    throw ApiException('Sign in with a shop account to see this.');
  }
  final repository = ref.watch(businessRepositoryProvider);
  final results = await Future.wait([
    repository.brandOrders(status: 'PENDING', limit: 1),
    repository.brandOrders(limit: 5),
  ]);
  return BrandOverview(
    pendingOrders: results[0].pagination.total,
    totalOrders: results[1].pagination.total,
    recentOrders: results[1].items,
  );
});

/// The server address: baked into a release build, or chosen on the sign-in
/// screen while developing.
class ServerSettings {
  ServerSettings(this._prefs);

  static const _key = 'citycart.business.api_url';

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

/// Holds the signed-in owner for the whole app. A plain [ChangeNotifier] so the
/// router can redirect the instant the session starts or ends.
class SessionController extends ChangeNotifier {
  SessionController(this._repository, this._store, this._api) {
    _api.onUnauthorized = _handleExpired;
  }

  final BusinessRepository _repository;
  final SessionStore _store;
  final ApiClient _api;

  SessionStatus _status = SessionStatus.unknown;
  AppUser? _user;
  String? _notice;
  bool _offline = false;

  SessionStatus get status => _status;
  AppUser? get user => _user;
  String? get notice => _notice;
  bool get isOffline => _offline;

  void clearNotice() {
    if (_notice == null) return;
    _notice = null;
    notifyListeners();
  }

  static bool isOwnerRole(String role) =>
      role == brandRole || role == providerRole;

  Future<void> restore() async {
    await _store.load();
    final token = _store.token;
    final cached = _store.user;
    if (token == null || cached == null || !isOwnerRole(cached.role)) {
      await _store.clear();
      _status = SessionStatus.signedOut;
      notifyListeners();
      return;
    }

    _status = SessionStatus.signedIn;
    _user = cached;
    notifyListeners();

    try {
      final fresh = await _repository.me();
      if (!isOwnerRole(fresh.role)) {
        await _expire('This account does not use the CityCart Business app.');
        return;
      }
      _user = fresh;
      _offline = false;
      await _store.save(token: token, user: fresh);
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

  Future<void> signIn({
    required AccessDoor door,
    required String email,
    required String password,
  }) async {
    final result = await _repository.signIn(
      door: door,
      email: email,
      password: password,
    );
    if (!isOwnerRole(result.user.role)) {
      throw ApiException(
        'This account does not use the CityCart Business app.',
      );
    }
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _status = SessionStatus.signedIn;
    _offline = false;
    _notice = null;
    notifyListeners();
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    final token = await _repository.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
      confirmPassword: confirmPassword,
    );
    final user = _user;
    if (token != null && user != null) {
      await _store.save(token: token, user: user);
    }
  }

  Future<void> refreshProfile() async {
    try {
      final fresh = await _repository.me();
      _user = fresh;
      _offline = false;
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
