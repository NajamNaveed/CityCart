import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/config.dart';
import 'data/api_client.dart';
import 'data/api_exception.dart';
import 'data/area_store.dart';
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

final shopperRepositoryProvider = Provider<ShopperRepository>((ref) {
  return ShopperRepository(ref.watch(apiClientProvider));
});

final areaProvider = Provider<AreaController>((ref) {
  final controller = AreaController(
    AreaStore(ref.watch(sharedPreferencesProvider)),
  );
  ref.onDispose(controller.dispose);
  return controller;
});

final sessionProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(shopperRepositoryProvider),
    ref.watch(sessionStoreProvider),
    ref.watch(apiClientProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});

// --- Public catalogue ------------------------------------------------------

final citiesProvider = FutureProvider<List<City>>((ref) {
  return ref.watch(shopperRepositoryProvider).cities();
});

final blocksProvider = FutureProvider.family<List<Block>, String>((
  ref,
  cityId,
) {
  return ref.watch(shopperRepositoryProvider).blocks(cityId);
});

final storefrontProvider = FutureProvider.autoDispose
    .family<Storefront, String>((ref, brandId) {
      return ref.watch(shopperRepositoryProvider).storefront(brandId);
    });

/// The first page of stores around the chosen area. Pull to refresh invalidates
/// this provider; changing the area changes its input, so it reloads itself.
final homeFeedProvider = FutureProvider.autoDispose<DiscoverResult>((ref) {
  final area = ref.watch(areaProvider).area;
  if (area == null) {
    throw ApiException('Choose an area to see nearby stores.');
  }
  return ref.watch(shopperRepositoryProvider).discover(area: area, limit: 12);
});

final brandProvider = FutureProvider.autoDispose.family<PublicBrand, String>((
  ref,
  brandId,
) {
  return ref.watch(shopperRepositoryProvider).brand(brandId);
});

final productProvider = FutureProvider.autoDispose.family<Product, String>((
  ref,
  productId,
) {
  return ref.watch(shopperRepositoryProvider).product(productId);
});

// --- Services --------------------------------------------------------------

final serviceCategoriesProvider = FutureProvider<List<ServiceCategory>>((ref) {
  return ref.watch(shopperRepositoryProvider).serviceCategories();
});

final serviceProviderProvider = FutureProvider.autoDispose
    .family<ServiceProvider, String>((ref, slug) {
      return ref.watch(shopperRepositoryProvider).serviceProvider(slug);
    });

/// Addresses the shopper saved on the website, offered as prefills when
/// requesting a service.
final savedAddressesProvider = FutureProvider.autoDispose<List<SavedAddress>>((
  ref,
) {
  return ref.watch(shopperRepositoryProvider).addresses();
});

/// The server address: baked into a release build, or chosen on the sign-in
/// screen while developing.
class ServerSettings {
  ServerSettings(this._prefs);

  static const _key = 'citycart.shopper.api_url';

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

/// Holds the signed-in shopper for the whole app. A plain [ChangeNotifier] so
/// the router can redirect the instant the session starts or ends.
class SessionController extends ChangeNotifier {
  SessionController(this._repository, this._store, this._api) {
    _api.onUnauthorized = _handleExpired;
  }

  final ShopperRepository _repository;
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
  /// reached at launch. Screens still open and show their own error.
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

    _status = SessionStatus.signedIn;
    _user = _store.user;
    notifyListeners();

    try {
      final fresh = await _repository.me();
      if (fresh.role != 'CUSTOMER') {
        await _expire('This account does not use the CityCart shopping app.');
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
    final result = await _repository.signIn(email: email, password: password);
    if (result.user.role != 'CUSTOMER') {
      throw ApiException('This account signs in to a different CityCart app.');
    }
    await _store.save(token: result.token, user: result.user);
    _user = result.user;
    _status = SessionStatus.signedIn;
    _offline = false;
    _notice = null;
    notifyListeners();
  }

  /// Creates the account and returns the address that must be verified. The
  /// shopper is not signed in until they open the link in their inbox.
  Future<AppUser> register({
    required String name,
    required String email,
    required String password,
  }) {
    return _repository.register(name: name, email: email, password: password);
  }

  /// Re-reads the profile after a launch that could not reach the server.
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
