import 'api_client.dart';
import 'models.dart';

/// One method per server endpoint the app is allowed to use. Screens never
/// build URLs themselves, so every call keeps the same headers and the same
/// error handling.
class ShopperRepository {
  ShopperRepository(this._api);

  final ApiClient _api;

  // --- Session -------------------------------------------------------------

  Future<AppUser> me() async {
    final body = await _api.get('/auth/me');
    return AppUser.fromJson(body['user']);
  }

  Future<LoginResult> signIn({
    required String email,
    required String password,
  }) async {
    final body = await _api.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    return LoginResult.fromJson(body);
  }

  /// Creates an unverified account. No session is returned: the shopper must
  /// open the verification link in their inbox before signing in.
  Future<AppUser> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final body = await _api.post(
      '/auth/register',
      data: {'name': name, 'email': email, 'password': password},
    );
    return AppUser.fromJson(body['user']);
  }

  // --- Places --------------------------------------------------------------

  Future<List<City>> cities() async {
    final body = await _api.get('/cities', query: {'isActive': 'true'});
    return asList(body['cities']).map(City.fromJson).toList(growable: false);
  }

  Future<List<Block>> blocks(String cityId) async {
    final body = await _api.get(
      '/blocks',
      query: {'cityId': cityId, 'isActive': 'true'},
    );
    return asList(body['blocks']).map(Block.fromJson).toList(growable: false);
  }

  // --- Discovery -----------------------------------------------------------

  /// Stores (with a few of their products) around the chosen area, nearest
  /// first. Public — the shopper's coordinates are used for this query only.
  Future<DiscoverResult> discover({
    required AreaSelection area,
    int page = 1,
    int limit = 12,
    String? query,
  }) async {
    final search = (query ?? '').trim();
    final body = await _api.get(
      '/discover',
      query: {
        ...area.discoverQuery(),
        'page': page,
        'limit': limit,
        if (search.isNotEmpty) 'q': search,
      },
    );
    return DiscoverResult.fromJson(body);
  }

  Future<Storefront> storefront(String brandId) async {
    final body = await _api.get('/brands/$brandId/storefront');
    return Storefront.fromJson(body);
  }
}
