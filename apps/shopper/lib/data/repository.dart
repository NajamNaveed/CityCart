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

  Future<PublicBrand> brand(String brandId) async {
    final body = await _api.get('/brands/$brandId');
    return PublicBrand.fromJson(body['brand']);
  }

  // --- Products ------------------------------------------------------------

  Future<Product> product(String productId) async {
    final body = await _api.get('/products/$productId');
    return Product.fromJson(body['product']);
  }

  Future<ProductReviewPage> productReviews(
    String productId, {
    int page = 1,
    int limit = 10,
  }) async {
    final body = await _api.get(
      '/products/$productId/reviews',
      query: {'page': page, 'limit': limit},
    );
    return ProductReviewPage.fromJson(body);
  }

  // --- Product chat --------------------------------------------------------

  Future<ProductChatContext> productChatContext(String productId) async {
    final body = await _api.get('/chats/product/$productId');
    return ProductChatContext.fromJson(body);
  }

  Future<ChatStartResult> startProductChat(
    String productId, {
    required String body,
  }) async {
    final response = await _api.post(
      '/chats/start',
      data: {'productId': productId, 'body': body},
    );
    return ChatStartResult.fromJson(response);
  }

  Future<ChatMessagePage> chatMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    final body = await _api.get(
      '/chats/$conversationId/messages',
      query: {'limit': limit, 'before': ?before},
    );
    return ChatMessagePage.fromJson(body);
  }

  Future<ChatMessage> sendChatMessage(
    String conversationId,
    String body, {
    String? productId,
  }) async {
    final response = await _api.post(
      '/chats/$conversationId/messages',
      data: {'body': body, 'productId': ?productId},
    );
    return ChatMessage.fromJson(response['message']);
  }

  Future<void> markChatRead(String conversationId) async {
    await _api.post('/chats/$conversationId/read');
  }

  // --- Cart ----------------------------------------------------------------

  Future<CartView> cart() async {
    final body = await _api.get('/cart');
    return CartView.fromJson(body['cart']);
  }

  Future<CartView> addToCart(String productId, {int quantity = 1}) async {
    final body = await _api.post(
      '/cart/items',
      data: {'productId': productId, 'quantity': quantity},
    );
    return CartView.fromJson(body['cart']);
  }

  Future<CartView> updateCartItem(String productId, int quantity) async {
    final body = await _api.patch(
      '/cart/items/$productId',
      data: {'quantity': quantity},
    );
    return CartView.fromJson(body['cart']);
  }

  Future<CartView> removeCartItem(String productId) async {
    final body = await _api.delete('/cart/items/$productId');
    return CartView.fromJson(body['cart']);
  }

  Future<CartView> clearCart() async {
    final body = await _api.delete('/cart');
    return CartView.fromJson(body['cart']);
  }

  /// Which lines can still be delivered in the given blocks. Read-only: the
  /// shopper confirms any removal explicitly.
  Future<CartAreaCheck> checkCartArea(List<String> blockIds) async {
    final body = await _api.post(
      '/cart/area-check',
      data: {'blockIds': blockIds},
    );
    return CartAreaCheck.fromJson(body);
  }

  // --- Addresses -----------------------------------------------------------

  Future<List<SavedAddress>> addresses() async {
    final body = await _api.get('/addresses');
    return asList(body['addresses'])
        .map(SavedAddress.fromJson)
        .toList(growable: false);
  }

  Future<SavedAddress> createAddress({
    required String label,
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required double latitude,
    required double longitude,
    String? state,
    String? postalCode,
    String? country,
    String? additionalInstructions,
  }) async {
    final body = await _api.post(
      '/addresses',
      data: {
        'label': label,
        'fullName': fullName,
        'phone': phone,
        'addressLine': addressLine,
        'city': city,
        'latitude': latitude,
        'longitude': longitude,
        'state': ?state,
        'postalCode': ?postalCode,
        'country': ?country,
        'additionalInstructions': ?additionalInstructions,
      },
    );
    return SavedAddress.fromJson(body['address']);
  }

  // --- Checkout ------------------------------------------------------------

  /// Places the cart as one order per shop. Totals, stock and the split are
  /// decided by the server; the client only sends the address payload.
  Future<List<PlacedOrder>> placeOrder({
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required String deliveryNotes,
    required double latitude,
    required double longitude,
    String? state,
    String? postalCode,
    String? country,
    String? addressId,
    String? saveAsLabel,
    String paymentMethod = 'COD',
  }) async {
    final body = await _api.post(
      '/orders',
      data: {
        'shippingAddress': {
          'fullName': fullName,
          'phone': phone,
          'addressLine': addressLine,
          'city': city,
          'additionalInstructions': deliveryNotes,
          'state': ?state,
          'postalCode': ?postalCode,
          'country': ?country,
        },
        'deliveryLocation': {'latitude': latitude, 'longitude': longitude},
        'paymentMethod': paymentMethod,
        'addressId': ?addressId,
        if (saveAsLabel != null) 'saveAddress': {'label': saveAsLabel},
      },
    );
    return asList(body['orders'])
        .map(PlacedOrder.fromJson)
        .toList(growable: false);
  }
}
