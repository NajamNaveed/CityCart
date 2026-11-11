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

  // --- Orders --------------------------------------------------------------

  Future<Page<CustomerOrder>> myOrders({int page = 1, int limit = 10}) async {
    final body = await _api.get(
      '/orders/my',
      query: {'page': page, 'limit': limit},
    );
    return Page.fromJson(body, key: 'orders', parse: CustomerOrder.fromJson);
  }

  /// The order plus its payment, delivery, open change proposal and door return.
  Future<OrderDetail> order(String orderId) async {
    final body = await _api.get('/orders/$orderId');
    return OrderDetail.fromJson(body);
  }

  Future<CustomerOrder> cancelOrder(String orderId) async {
    final body = await _api.patch('/orders/$orderId/cancel');
    return CustomerOrder.fromJson(body['order']);
  }

  /// [action] is one of ACCEPT, REMOVE (send only what is available) or
  /// CANCEL_ORDER. The server rewrites the order and returns the refund.
  Future<AdjustmentOutcome> respondToAdjustment(
    String orderId,
    String adjustmentId,
    String action,
  ) async {
    final body = await _api.post(
      '/orders/$orderId/adjustments/$adjustmentId/respond',
      data: {'action': action},
    );
    return AdjustmentOutcome.fromJson(body);
  }

  /// The six-digit code the shopper reads to the rider. The server only gives
  /// it while the delivery is on its way, and only to the order's customer.
  Future<String> deliveryCode(String deliveryId) async {
    final body = await _api.get('/deliveries/$deliveryId/code');
    return text(body['code']);
  }

  Future<OrderReceipt> receiptForOrder(String orderId) async {
    final body = await _api.get('/receipts/order/$orderId');
    return OrderReceipt.fromJson(body['receipt']);
  }

  // --- Reviews -------------------------------------------------------------

  Future<List<MyReview>> myReviews({String? orderId}) async {
    final body = await _api.get('/reviews/mine', query: {'orderId': ?orderId});
    return asList(body['reviews'])
        .map(MyReview.fromJson)
        .toList(growable: false);
  }

  Future<MyReview> createReview({
    required String orderId,
    required String productId,
    required int rating,
    String? title,
    String? comment,
  }) async {
    final body = await _api.post(
      '/reviews',
      data: {
        'orderId': orderId,
        'productId': productId,
        'rating': rating,
        'title': ?title,
        'comment': ?comment,
      },
    );
    return MyReview.fromJson(body['review']);
  }

  Future<MyReview> updateReview(
    String reviewId, {
    required int rating,
    String? title,
    String? comment,
  }) async {
    final body = await _api.patch(
      '/reviews/$reviewId',
      data: {
        'rating': rating,
        'title': (title ?? '').trim(),
        'comment': (comment ?? '').trim(),
      },
    );
    return MyReview.fromJson(body['review']);
  }

  // --- Services ------------------------------------------------------------

  Future<List<ServiceCategory>> serviceCategories() async {
    final body = await _api.get('/services/categories');
    return asList(body['categories'])
        .map(ServiceCategory.fromJson)
        .toList(growable: false);
  }

  /// Approved providers around the chosen area. The server decides the scope
  /// from the area, and only ever returns published providers.
  Future<ServiceDiscoverResult> discoverServices({
    required AreaSelection area,
    String categoryId = '',
    String query = '',
    String sort = 'rank',
    int page = 1,
    int limit = 12,
  }) async {
    final search = query.trim();
    final body = await _api.get(
      '/services/discover',
      query: {
        ...area.discoverQuery(),
        'page': page,
        'limit': limit,
        'sort': sort,
        if (categoryId.isNotEmpty) 'categoryId': categoryId,
        if (search.isNotEmpty) 'q': search,
      },
    );
    return ServiceDiscoverResult.fromJson(body);
  }

  Future<ServiceProvider> serviceProvider(String slug) async {
    final body = await _api.get('/services/providers/$slug');
    return ServiceProvider.fromJson(body['provider']);
  }

  /// Sends a booking request. The server decides the block, the price floor and
  /// which provider may take the job; the client only names the offering, the
  /// time and where the work happens.
  Future<ServiceBookingCreated> requestServiceBooking({
    required String providerId,
    required String offeringId,
    required DateTime scheduledStart,
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required double latitude,
    required double longitude,
    String? note,
    int? customerOfferPaisa,
  }) async {
    final trimmedNote = (note ?? '').trim();
    final body = await _api.post(
      '/services/bookings',
      data: {
        'providerId': providerId,
        'offeringId': offeringId,
        'scheduledStart': scheduledStart.toUtc().toIso8601String(),
        'address': {
          'fullName': fullName,
          'phone': phone,
          'addressLine': addressLine,
          if (city.trim().isNotEmpty) 'city': city.trim(),
        },
        'location': {'lat': latitude, 'lng': longitude},
        if (trimmedNote.isNotEmpty) 'note': trimmedNote,
        'customerOfferPaisa': ?customerOfferPaisa,
      },
    );
    return ServiceBookingCreated.fromJson(body['booking']);
  }

  /// Opens (or reopens) the shopper's direct conversation with one provider.
  Future<DirectChatStart> startDirectChat(String providerId) async {
    final body = await _api.post(
      '/services/direct-chats/start',
      data: {'providerId': providerId},
    );
    return DirectChatStart.fromJson(body);
  }

  // --- Service bookings ----------------------------------------------------

  Future<Page<ServiceBooking>> serviceBookings({
    String? status,
    int page = 1,
    int limit = 10,
  }) async {
    final body = await _api.get(
      '/services/bookings',
      query: {'page': page, 'limit': limit, 'status': ?status},
    );
    return Page.fromJson(body, key: 'bookings', parse: ServiceBooking.fromJson);
  }

  /// The booking, its offers, the address and (once confirmed) the review.
  Future<ServiceBooking> serviceBooking(String bookingId) async {
    final body = await _api.get('/services/bookings/$bookingId');
    return ServiceBooking.fromJson(body['booking']);
  }

  Future<ServiceBooking> acceptBookingProposal(String bookingId) async {
    final body = await _api.post(
      '/services/bookings/$bookingId/proposals/accept',
    );
    return ServiceBooking.fromJson(body['booking']);
  }

  Future<ServiceBooking> declineBookingProposal(String bookingId) async {
    final body = await _api.post(
      '/services/bookings/$bookingId/proposals/decline',
    );
    return ServiceBooking.fromJson(body['booking']);
  }

  Future<ServiceBooking> confirmServiceBooking(String bookingId) async {
    final body = await _api.post('/services/bookings/$bookingId/confirm');
    return ServiceBooking.fromJson(body['booking']);
  }

  Future<ServiceBooking> disputeServiceBooking(
    String bookingId, {
    required String reason,
  }) async {
    final body = await _api.post(
      '/services/bookings/$bookingId/dispute',
      data: {'reason': reason},
    );
    return ServiceBooking.fromJson(body['booking']);
  }

  /// Cancels a job that has not finished. The server records who cancelled,
  /// why, and whether it was late; the client only sends the reason.
  Future<ServiceBooking> cancelServiceBooking(
    String bookingId, {
    required String reason,
  }) async {
    final body = await _api.post(
      '/services/bookings/$bookingId/cancel',
      data: {'reason': reason},
    );
    return ServiceBooking.fromJson(body['booking']);
  }

  // --- Service chat --------------------------------------------------------

  Future<Page<ServiceChatConversation>> bookingChats({
    int page = 1,
    int limit = 20,
  }) async {
    final body = await _api.get(
      '/services/chats',
      query: {'page': page, 'limit': limit},
    );
    return Page.fromJson(
      body,
      key: 'items',
      parse: ServiceChatConversation.fromJson,
    );
  }

  /// Booking chat routes are keyed by the booking id, not the conversation id.
  Future<ChatMessagePage> bookingChatMessages(
    String bookingId, {
    String? before,
    int limit = 30,
  }) async {
    final body = await _api.get(
      '/services/chats/$bookingId/messages',
      query: {'limit': limit, 'before': ?before},
    );
    return ChatMessagePage.fromJson(body);
  }

  Future<ChatMessage> sendBookingChatMessage(
    String bookingId,
    String body,
  ) async {
    final response = await _api.post(
      '/services/chats/$bookingId/messages',
      data: {'body': body},
    );
    return ChatMessage.fromJson(response['message']);
  }

  Future<void> markBookingChatRead(String bookingId) async {
    await _api.post('/services/chats/$bookingId/read');
  }

  Future<int> bookingChatUnread() async {
    final body = await _api.get('/services/chats/unread');
    return asInt(body['unread']);
  }

  Future<Page<DirectChatConversation>> directChats({
    int page = 1,
    int limit = 20,
  }) async {
    final body = await _api.get(
      '/services/direct-chats',
      query: {'page': page, 'limit': limit},
    );
    return Page.fromJson(
      body,
      key: 'conversations',
      parse: DirectChatConversation.fromJson,
    );
  }

  Future<ChatMessagePage> directChatMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    final body = await _api.get(
      '/services/direct-chats/$conversationId/messages',
      query: {'limit': limit, 'before': ?before},
    );
    return ChatMessagePage.fromJson(body);
  }

  Future<ChatMessage> sendDirectChatMessage(
    String conversationId,
    String body,
  ) async {
    final response = await _api.post(
      '/services/direct-chats/$conversationId/messages',
      data: {'body': body},
    );
    return ChatMessage.fromJson(response['message']);
  }

  Future<void> markDirectChatRead(String conversationId) async {
    await _api.post('/services/direct-chats/$conversationId/read');
  }

  Future<int> directChatUnread() async {
    final body = await _api.get('/services/direct-chats/unread');
    return asInt(body['unread']);
  }

  // --- Service reviews -----------------------------------------------------

  /// Null until the shopper reviews this confirmed booking.
  Future<ServiceReview?> bookingReview(String bookingId) async {
    final body = await _api.get('/services/bookings/$bookingId/review');
    final review = body['review'];
    return review is Map ? ServiceReview.fromJson(review) : null;
  }

  Future<ServiceReview> createBookingReview(
    String bookingId, {
    required int rating,
    String? comment,
  }) async {
    final trimmed = (comment ?? '').trim();
    final body = await _api.post(
      '/services/bookings/$bookingId/review',
      data: {'rating': rating, if (trimmed.isNotEmpty) 'comment': trimmed},
    );
    return ServiceReview.fromJson(body['review']);
  }
}
