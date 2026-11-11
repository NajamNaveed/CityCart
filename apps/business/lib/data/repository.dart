import 'api_client.dart';
import 'models.dart';

/// Which door the owner came through. The server has a separate login for
/// each, so a wrong choice can never look up the other kind of account.
enum AccessDoor { brand, service }

class BusinessRepository {
  BusinessRepository(this._api);

  final ApiClient _api;

  Future<AuthResult> signIn({
    required AccessDoor door,
    required String email,
    required String password,
  }) async {
    final path = door == AccessDoor.brand
        ? '/auth/business/brand/login'
        : '/auth/business/service/login';
    final body = await _api.post(
      path,
      data: {'email': email.trim(), 'password': password},
    );
    return _authFrom(body);
  }

  Future<AppUser> me() async {
    final body = await _api.get('/auth/me');
    final user = body['user'];
    if (user is! Map) {
      throw StateError('The server did not return an account.');
    }
    return AppUser.fromJson(Map<String, dynamic>.from(user));
  }

  Future<BrandSummary> currentBrand() async {
    final body = await _api.get('/brands/me');
    final brand = body['brand'];
    if (brand is! Map) {
      throw StateError('The server did not return a shop.');
    }
    return BrandSummary.fromJson(Map<String, dynamic>.from(brand));
  }

  Future<ProviderProfile> currentProvider() async {
    final body = await _api.get('/provider/me');
    final provider = body['provider'];
    if (provider is! Map) {
      throw StateError('The server did not return a business profile.');
    }
    return ProviderProfile.fromJson(Map<String, dynamic>.from(provider));
  }

  /// The server answers a business session with a replacement token, because
  /// changing the password ends every older session.
  Future<String?> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    final body = await _api.patch(
      '/auth/password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
        'confirmPassword': confirmPassword,
      },
    );
    return body['token'] is String ? body['token'] as String : null;
  }

  Future<String> requestPasswordReset(String email) async {
    final body = await _api.post(
      '/auth/forgot-password',
      data: {'email': email.trim()},
    );
    final message = body['message'];
    return message is String && message.trim().isNotEmpty
        ? message
        : 'If that email belongs to an account, a reset link is on its way.';
  }

  // --- Provider bookings ---------------------------------------------------

  Future<Page<BusinessBooking>> providerBookings({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    final body = await _api.get(
      '/provider/bookings',
      query: {'page': page, 'limit': limit, 'status': ?status},
    );
    return Page.fromJson(body, BusinessBooking.fromJson, 'bookings');
  }

  Future<BusinessBooking> providerBooking(String bookingId) async {
    final body = await _api.get('/provider/bookings/$bookingId');
    return _bookingFrom(body);
  }

  /// The provider binds the customer to a price at or above the published
  /// starting price.
  Future<BusinessBooking> acceptProviderBooking(
    String bookingId, {
    required int pricePaisa,
  }) async {
    final body = await _api.post(
      '/provider/bookings/$bookingId/accept',
      data: {'pricePaisa': pricePaisa},
    );
    return _bookingFrom(body);
  }

  /// Accepts the exact amount the customer offered, even below the published
  /// price. The amount comes from the booking on the server.
  Future<BusinessBooking> acceptProviderOffer(String bookingId) async {
    final body = await _api.post('/provider/bookings/$bookingId/offer/accept');
    return _bookingFrom(body);
  }

  Future<BusinessBooking> declineProviderBooking(
    String bookingId, {
    String? reason,
  }) async {
    final trimmed = reason?.trim();
    final body = await _api.post(
      '/provider/bookings/$bookingId/decline',
      data: {if (trimmed != null && trimmed.isNotEmpty) 'reason': trimmed},
    );
    return _bookingFrom(body);
  }

  Future<BusinessBooking> proposeProviderBooking(
    String bookingId, {
    required int pricePaisa,
    required String scope,
    required DateTime scheduledStart,
    int? expiresInHours,
  }) async {
    final body = await _api.post(
      '/provider/bookings/$bookingId/propose',
      data: {
        'pricePaisa': pricePaisa,
        'scope': scope.trim(),
        'scheduledStart': scheduledStart.toUtc().toIso8601String(),
        'expiresInHours': ?expiresInHours,
      },
    );
    return _bookingFrom(body);
  }

  Future<BusinessBooking> startProviderBooking(String bookingId) async {
    final body = await _api.post('/provider/bookings/$bookingId/start');
    return _bookingFrom(body);
  }

  Future<BusinessBooking> completeProviderBooking(
    String bookingId, {
    required int finalAmountPaisa,
    String? completionNote,
  }) async {
    final note = completionNote?.trim();
    final body = await _api.post(
      '/provider/bookings/$bookingId/complete',
      data: {
        'finalAmountPaisa': finalAmountPaisa,
        if (note != null && note.isNotEmpty) 'completionNote': note,
      },
    );
    return _bookingFrom(body);
  }

  Future<BusinessBooking> cancelProviderBooking(
    String bookingId, {
    required String reason,
  }) async {
    final body = await _api.post(
      '/provider/bookings/$bookingId/cancel',
      data: {'reason': reason.trim()},
    );
    return _bookingFrom(body);
  }

  BusinessBooking _bookingFrom(Map<String, dynamic> body) {
    final booking = body['booking'];
    if (booking is! Map) {
      throw StateError('The server did not return the booking.');
    }
    return BusinessBooking.fromJson(Map<String, dynamic>.from(booking));
  }

  // --- Provider profile ----------------------------------------------------

  /// Saves the public profile fields the owner may edit. The category and the
  /// public link are fixed by the server and never sent from here.
  Future<ProviderProfile> updateProviderProfile({
    required String displayName,
    required String phone,
    required String bio,
    required String addressLine,
    required int startingAtPricePaisa,
  }) async {
    final body = await _api.patch(
      '/provider/me',
      data: {
        'displayName': displayName.trim(),
        'phone': phone.trim().isEmpty ? null : phone.trim(),
        'bio': bio.trim(),
        'addressLine': addressLine.trim(),
        'startingAtPrice': startingAtPricePaisa,
      },
    );
    return _providerFrom(body);
  }

  /// Blocks of the provider's own city. The provider's city is fixed, so the
  /// server rejects a block from anywhere else.
  Future<List<BlockOption>> cityBlocks(String cityId) async {
    final body = await _api.get(
      '/blocks',
      query: {'cityId': cityId, 'isActive': 'true'},
    );
    final blocks = body['blocks'];
    if (blocks is! List) return const <BlockOption>[];
    return blocks
        .whereType<Map>()
        .map((value) => BlockOption.fromJson(Map<String, dynamic>.from(value)))
        .toList(growable: false);
  }

  /// Moves the provider to another block using that block's centre as the pin.
  /// The exact address is edited separately and is not shown publicly.
  Future<ProviderProfile> changeProviderBlock({
    required String blockId,
    required double latitude,
    required double longitude,
  }) async {
    final body = await _api.patch(
      '/provider/block',
      data: {'blockId': blockId, 'latitude': latitude, 'longitude': longitude},
    );
    return _providerFrom(body);
  }

  ProviderProfile _providerFrom(Map<String, dynamic> body) {
    final provider = body['provider'];
    if (provider is! Map) {
      throw StateError('The server did not return a business profile.');
    }
    return ProviderProfile.fromJson(Map<String, dynamic>.from(provider));
  }

  // --- Provider offerings --------------------------------------------------

  Future<List<ServiceOffering>> providerOfferings() async {
    final body = await _api.get('/provider/offerings');
    final offerings = body['offerings'];
    if (offerings is! List) return const <ServiceOffering>[];
    return offerings
        .whereType<Map>()
        .map(
          (value) => ServiceOffering.fromJson(Map<String, dynamic>.from(value)),
        )
        .toList(growable: false);
  }

  Future<ServiceOffering> createProviderOffering({
    required String title,
    required String description,
    required int startingAtPricePaisa,
    required int durationMinutes,
  }) async {
    final body = await _api.post(
      '/provider/offerings',
      data: {
        'title': title.trim(),
        'description': description.trim(),
        'startingAtPrice': startingAtPricePaisa,
        'durationMinutes': durationMinutes,
      },
    );
    return _offeringFrom(body);
  }

  Future<ServiceOffering> updateProviderOffering(
    String offeringId, {
    String? title,
    String? description,
    int? startingAtPricePaisa,
    int? durationMinutes,
    bool? isActive,
  }) async {
    final trimmedTitle = title?.trim();
    final trimmedDescription = description?.trim();
    final body = await _api.patch(
      '/provider/offerings/$offeringId',
      data: {
        'title': ?trimmedTitle,
        'description': ?trimmedDescription,
        'startingAtPrice': ?startingAtPricePaisa,
        'durationMinutes': ?durationMinutes,
        'isActive': ?isActive,
      },
    );
    return _offeringFrom(body);
  }

  /// Soft delete: the service stops appearing in discovery but past bookings
  /// keep their record.
  Future<ServiceOffering> deactivateProviderOffering(String offeringId) async {
    final body = await _api.delete('/provider/offerings/$offeringId');
    return _offeringFrom(body);
  }

  ServiceOffering _offeringFrom(Map<String, dynamic> body) {
    final offering = body['offering'];
    if (offering is! Map) {
      throw StateError('The server did not return the service.');
    }
    return ServiceOffering.fromJson(Map<String, dynamic>.from(offering));
  }

  // --- Provider availability ----------------------------------------------

  Future<ServiceAvailability> providerAvailability() async {
    final body = await _api.get('/provider/availability');
    final availability = body['availability'];
    if (availability is! Map) {
      throw StateError('The server did not return working hours.');
    }
    return ServiceAvailability.fromJson(
      Map<String, dynamic>.from(availability),
    );
  }

  Future<ServiceAvailability> saveProviderAvailability({
    required List<AvailabilityWindow> windows,
    required List<String> blackoutDates,
  }) async {
    final body = await _api.put(
      '/provider/availability',
      data: {
        'windows': windows.map((window) => window.toJson()).toList(),
        'blackoutDates': blackoutDates,
      },
    );
    final availability = body['availability'];
    if (availability is! Map) {
      throw StateError('The server did not return working hours.');
    }
    return ServiceAvailability.fromJson(
      Map<String, dynamic>.from(availability),
    );
  }

  // --- Provider chats ------------------------------------------------------

  /// One inbox for both kinds of conversation: threads attached to a booking
  /// and direct questions about the business. Both server lists are already
  /// scoped to the signed-in provider.
  Future<List<ProviderChatThread>> providerChatInbox({int limit = 30}) async {
    final responses = await Future.wait([
      _api.get('/services/chats', query: {'page': 1, 'limit': limit}),
      _api.get('/services/direct-chats', query: {'page': 1, 'limit': limit}),
    ]);
    final threads = <ProviderChatThread>[
      for (final row in _rows(responses[0]['items']))
        ProviderChatThread.fromBookingJson(row),
      for (final row in _rows(responses[1]['conversations']))
        ProviderChatThread.fromDirectJson(row),
    ];
    threads.sort((left, right) {
      final a = left.lastMessageAt;
      final b = right.lastMessageAt;
      if (a != null && b != null && a != b) return b.compareTo(a);
      if (a == null && b != null) return 1;
      if (a != null && b == null) return -1;
      return left.name.compareTo(right.name);
    });
    return List.unmodifiable(threads);
  }

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

  Future<ChatMessage> sendBookingChatMessage(
    String bookingId,
    String body,
  ) async {
    final response = await _api.post(
      '/services/chats/$bookingId/messages',
      data: {'body': body.trim()},
    );
    return _messageFrom(response);
  }

  Future<ChatMessage> sendDirectChatMessage(
    String conversationId,
    String body,
  ) async {
    final response = await _api.post(
      '/services/direct-chats/$conversationId/messages',
      data: {'body': body.trim()},
    );
    return _messageFrom(response);
  }

  Future<void> markBookingChatRead(String bookingId) async {
    await _api.post('/services/chats/$bookingId/read');
  }

  Future<void> markDirectChatRead(String conversationId) async {
    await _api.post('/services/direct-chats/$conversationId/read');
  }

  ChatMessage _messageFrom(Map<String, dynamic> body) {
    final message = body['message'];
    if (message is! Map) {
      throw StateError('The server did not return the message.');
    }
    return ChatMessage.fromJson(Map<String, dynamic>.from(message));
  }

  // --- Provider reviews ----------------------------------------------------

  Future<ProviderReviewPage> providerReviews({
    int? rating,
    int page = 1,
    int limit = 10,
  }) async {
    final body = await _api.get(
      '/provider/reviews',
      query: {'page': page, 'limit': limit, 'rating': ?rating},
    );
    return ProviderReviewPage.fromJson(body);
  }

  /// Each review accepts exactly one reply. The server answers 409
  /// `ALREADY_REPLIED` if a reply already exists.
  Future<ServiceReview> replyToProviderReview(
    String reviewId, {
    required String body,
  }) async {
    final response = await _api.post(
      '/provider/reviews/$reviewId/reply',
      data: {'body': body.trim()},
    );
    final review = response['review'];
    if (review is! Map) {
      throw StateError('The server did not return the review.');
    }
    return ServiceReview.fromJson(Map<String, dynamic>.from(review));
  }

  // --- Brand orders --------------------------------------------------------

  /// The signed-in shop's orders, newest first. The server takes the shop from
  /// the session, never from this request.
  Future<Page<BrandOrder>> brandOrders({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    final body = await _api.get(
      '/brand/orders',
      query: {'page': page, 'limit': limit, 'status': ?status},
    );
    return Page.fromJson(body, BrandOrder.fromJson, 'orders');
  }

  Future<BrandOrderDetail> brandOrder(String orderId) async {
    final body = await _api.get('/brand/orders/$orderId');
    return BrandOrderDetail.fromJson(body);
  }

  /// Moves an order to one of the four statuses a shop may set. The server
  /// re-checks the move and the shop's ownership atomically.
  Future<BrandOrder> updateBrandOrderStatus(
    String orderId,
    String status,
  ) async {
    final body = await _api.patch(
      '/brand/orders/$orderId/status',
      data: {'status': status},
    );
    final order = body['order'];
    if (order is! Map) {
      throw StateError('The server did not return the order.');
    }
    return BrandOrder.fromJson(Map<String, dynamic>.from(order));
  }

  /// Ends a waiting change proposal so the order can move on to shipment.
  Future<void> withdrawBrandAdjustment(
    String orderId,
    String adjustmentId,
  ) async {
    await _api.post(
      '/brand/orders/$orderId/adjustments/$adjustmentId/withdraw',
    );
  }

  // --- Brand products and stock -------------------------------------------
  Future<Page<BrandProduct>> brandProducts({
    String? status,
    String? search,
    int page = 1,
    int limit = 12,
  }) async {
    final term = search?.trim();
    final body = await _api.get(
      '/products/mine',
      query: {
        'page': page,
        'limit': limit,
        'status': ?status,
        if (term != null && term.isNotEmpty) 'search': term,
      },
    );
    return Page.fromJson(body, BrandProduct.fromJson, 'products');
  }

  Future<BrandProductDetail> brandProduct(String productId) async {
    final body = await _api.get('/products/mine/$productId');
    return BrandProductDetail.fromJson(body);
  }

  /// Price changes are sent in rupees because that is what the shop API
  /// stores. The app works in paisa everywhere else.
  Future<BrandProduct> updateBrandProduct(
    String productId, {
    int? pricePaisa,
    int? compareAtPricePaisa,
    String? sku,
    String? status,
    bool? isActive,
  }) async {
    final body = await _api.patch(
      '/products/$productId',
      data: {
        if (pricePaisa != null) 'price': pricePaisa / 100,
        if (compareAtPricePaisa != null)
          'compareAtPrice': compareAtPricePaisa / 100,
        if (sku != null) 'sku': sku.trim(),
        'status': ?status,
        'isActive': ?isActive,
      },
    );
    return _productFrom(body);
  }

  /// Archiving hides a product for good but keeps its past orders intact.
  Future<void> archiveBrandProduct(String productId) async {
    await _api.delete('/products/$productId');
  }

  Future<BrandStock> setBrandStock(
    String productId, {
    int? quantity,
    int? lowStockThreshold,
    bool? trackInventory,
  }) async {
    final body = await _api.patch(
      '/inventory/$productId',
      data: {
        'quantity': ?quantity,
        'lowStockThreshold': ?lowStockThreshold,
        'trackInventory': ?trackInventory,
      },
    );
    return _stockFrom(body);
  }

  Future<BrandStock> adjustBrandStock(
    String productId, {
    required int change,
    String? reason,
  }) async {
    final body = await _api.post(
      '/inventory/$productId/adjust',
      data: {'change': change, 'reason': ?reason},
    );
    return _stockFrom(body);
  }

  /// What this shop can list: active global catalogue items plus its own.
  Future<Page<CatalogItem>> catalogItems({
    String search = '',
    int page = 1,
    int limit = 20,
  }) async {
    final term = search.trim();
    final body = await _api.get(
      '/catalog',
      query: {'page': page, 'limit': limit, if (term.isNotEmpty) 'q': term},
    );
    return Page.fromJson(body, CatalogItem.fromJson, 'items');
  }

  Future<BrandProduct> addBrandProduct({
    required String catalogProductId,
    required int pricePaisa,
    int? compareAtPricePaisa,
    String? sku,
    String? status,
  }) async {
    final body = await _api.post(
      '/products',
      data: {
        'catalogProductId': catalogProductId,
        'price': pricePaisa / 100,
        if (compareAtPricePaisa != null && compareAtPricePaisa > 0)
          'compareAtPrice': compareAtPricePaisa / 100,
        if (sku != null && sku.trim().isNotEmpty) 'sku': sku.trim(),
        'status': ?status,
      },
    );
    return _productFrom(body);
  }

  BrandProduct _productFrom(Map<String, dynamic> body) {
    final product = body['product'];
    if (product is! Map) {
      throw StateError('The server did not return the product.');
    }
    return BrandProduct.fromJson(Map<String, dynamic>.from(product));
  }

  BrandStock _stockFrom(Map<String, dynamic> body) {
    final inventory = body['inventory'];
    if (inventory is! Map) {
      throw StateError('The server did not return the stock.');
    }
    return BrandStock.fromJson(Map<String, dynamic>.from(inventory));
  }

  // --- Brand deliveries ----------------------------------------------------

  Future<Page<BrandDelivery>> brandDeliveries({
    String? status,
    String? riderId,
    int page = 1,
    int limit = 12,
  }) async {
    final body = await _api.get(
      '/deliveries',
      query: {
        'page': page,
        'limit': limit,
        'status': ?status,
        'riderId': ?riderId,
      },
    );
    return Page.fromJson(body, BrandDelivery.fromJson, 'deliveries');
  }

  Future<BrandDelivery> brandDelivery(String deliveryId) async {
    final body = await _api.get('/deliveries/$deliveryId');
    return _deliveryFrom(body);
  }

  /// Moves a delivery along the shop's part of the lifecycle. The server
  /// checks the step and the shop's ownership.
  Future<BrandDelivery> updateBrandDeliveryStatus(
    String deliveryId,
    String status, {
    String? failureReason,
  }) async {
    final body = await _api.patch(
      '/deliveries/$deliveryId/status',
      data: {
        'status': status,
        if (failureReason != null && failureReason.trim().isNotEmpty)
          'failureReason': failureReason.trim(),
      },
    );
    return _deliveryFrom(body);
  }

  /// Assigns a rider, or takes the rider off when [riderId] is null.
  Future<BrandDelivery> assignBrandDeliveryRider(
    String deliveryId,
    String? riderId,
  ) async {
    final body = await _api.patch(
      '/deliveries/$deliveryId/rider',
      data: {'riderId': riderId},
    );
    return _deliveryFrom(body);
  }

  Future<BrandDelivery> updateBrandDeliveryDetails(
    String deliveryId, {
    String? trackingReference,
    String? assignedAgent,
  }) async {
    final body = await _api.patch(
      '/deliveries/$deliveryId',
      data: {
        if (trackingReference != null && trackingReference.trim().isNotEmpty)
          'trackingReference': trackingReference.trim(),
        if (assignedAgent != null && assignedAgent.trim().isNotEmpty)
          'assignedAgent': assignedAgent.trim(),
      },
    );
    return _deliveryFrom(body);
  }

  BrandDelivery _deliveryFrom(Map<String, dynamic> body) {
    final delivery = body['delivery'];
    if (delivery is! Map) {
      throw StateError('The server did not return the delivery.');
    }
    return BrandDelivery.fromJson(Map<String, dynamic>.from(delivery));
  }

  // --- Brand riders --------------------------------------------------------

  Future<Page<BrandRider>> brandRiders({
    bool? isActive,
    int page = 1,
    int limit = 20,
  }) async {
    final body = await _api.get(
      '/riders',
      query: {
        'page': page,
        'limit': limit,
        if (isActive != null) 'isActive': isActive ? 'true' : 'false',
      },
    );
    return Page.fromJson(body, BrandRider.fromJson, 'riders');
  }

  Future<BrandRider> createBrandRider({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    final body = await _api.post(
      '/riders',
      data: {
        'name': name.trim(),
        'email': email.trim(),
        'password': password,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      },
    );
    return _riderFrom(body);
  }

  Future<BrandRider> updateBrandRider(
    String riderId, {
    String? name,
    String? phone,
    bool? isActive,
  }) async {
    final body = await _api.patch(
      '/riders/$riderId',
      data: {
        if (name != null) 'name': name.trim(),
        if (phone != null) 'phone': phone.trim(),
        'isActive': ?isActive,
      },
    );
    return _riderFrom(body);
  }

  Future<void> resetBrandRiderPassword(
    String riderId, {
    required String password,
  }) async {
    await _api.patch('/riders/$riderId/password', data: {'password': password});
  }

  BrandRider _riderFrom(Map<String, dynamic> body) {
    final rider = body['rider'];
    if (rider is! Map) {
      throw StateError('The server did not return the rider.');
    }
    return BrandRider.fromJson(Map<String, dynamic>.from(rider));
  }

  // --- Brand returns -------------------------------------------------------

  Future<Page<BrandReturn>> brandReturns({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    final body = await _api.get(
      '/returns',
      query: {'page': page, 'limit': limit, 'status': ?status},
    );
    return Page.fromJson(body, BrandReturn.fromJson, 'returns');
  }

  Future<BrandReturnSummary> brandReturnSummary() async {
    final body = await _api.get('/returns/summary');
    final summary = body['summary'];
    if (summary is! Map) {
      throw StateError('The server did not return the return totals.');
    }
    return BrandReturnSummary.fromJson(Map<String, dynamic>.from(summary));
  }

  Future<BrandReturn> brandReturn(String returnId) async {
    final body = await _api.get('/returns/$returnId');
    return _returnFrom(body);
  }

  /// Receives the goods. Each line the shop puts back into stock must say so;
  /// every other line is written off by the server.
  Future<BrandReturn> receiveBrandReturn(
    String returnId, {
    required Map<int, bool> restockByIndex,
  }) async {
    final indexes = restockByIndex.keys.toList()..sort();
    final body = await _api.post(
      '/returns/$returnId/receive',
      data: {
        'decisions': [
          for (final index in indexes)
            {'index': index, 'restock': restockByIndex[index]},
        ],
      },
    );
    return _returnFrom(body);
  }

  BrandReturn _returnFrom(Map<String, dynamic> body) {
    final value = body['return'];
    if (value is! Map) {
      throw StateError('The server did not return the return.');
    }
    return BrandReturn.fromJson(Map<String, dynamic>.from(value));
  }

  // --- Brand shop settings, team and branches -----------------------------

  Future<BrandProfile> brandProfile() async {
    final body = await _api.get('/brands/me');
    final brand = body['brand'];
    if (brand is! Map) {
      throw StateError('The server did not return your shop.');
    }
    return BrandProfile.fromJson(Map<String, dynamic>.from(brand));
  }

  /// Saves the shop profile and its delivery defaults. The full contact and
  /// settings blocks are sent because the server replaces them as a whole.
  Future<BrandProfile> saveBrandProfile({
    required String brandId,
    required String name,
    required String description,
    required String street,
    required String area,
    required String city,
    required String supportPhone,
    required String supportEmail,
    required String opensAt,
    required String closesAt,
    required List<String> closedDays,
    required double? deliveryFee,
    required String estimatedDeliveryTime,
    required double? minimumOrderValue,
    required String deliveryNote,
  }) async {
    final body = await _api.patch(
      '/brands/$brandId',
      data: {
        'name': name.trim(),
        'description': description.trim(),
        'contact': {
          'address': {
            'street': street.trim(),
            'area': area.trim(),
            'city': city.trim(),
          },
          'supportPhone': supportPhone.trim(),
          'supportEmail': supportEmail.trim(),
          'operatingHours': {
            'opensAt': opensAt,
            'closesAt': closesAt,
            'closedDays': closedDays,
          },
        },
        'settings': {
          'deliveryFee': deliveryFee,
          'estimatedDeliveryTime': estimatedDeliveryTime.trim(),
          'minimumOrderValue': minimumOrderValue,
          'deliveryNote': deliveryNote.trim(),
        },
      },
    );
    final brand = body['brand'];
    if (brand is! Map) {
      throw StateError('The server did not return your shop.');
    }
    return BrandProfile.fromJson(Map<String, dynamic>.from(brand));
  }

  Future<Page<TeamMember>> teamMembers({
    bool? isActive,
    int page = 1,
    int limit = 20,
  }) async {
    final body = await _api.get(
      '/employees',
      query: {
        'page': page,
        'limit': limit,
        if (isActive != null) 'isActive': isActive ? 'true' : 'false',
      },
    );
    return Page.fromJson(body, TeamMember.fromJson, 'employees');
  }

  Future<TeamMember> createTeamMember({
    required String name,
    required String email,
    required String password,
    required String role,
    String? phone,
    String? jobTitle,
    List<String> permissions = const [],
  }) async {
    final body = await _api.post(
      '/employees',
      data: {
        'name': name.trim(),
        'email': email.trim(),
        'password': password,
        'role': role,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        if (jobTitle != null && jobTitle.trim().isNotEmpty)
          'jobTitle': jobTitle.trim(),
        if (role != 'PICKER') 'permissions': permissions,
      },
    );
    return _teamFrom(body);
  }

  Future<TeamMember> updateTeamMember(
    String memberId, {
    String? name,
    String? phone,
    String? jobTitle,
    bool? isActive,
  }) async {
    final body = await _api.patch(
      '/employees/$memberId',
      data: {
        if (name != null) 'name': name.trim(),
        if (phone != null) 'phone': phone.trim(),
        if (jobTitle != null) 'jobTitle': jobTitle.trim(),
        'isActive': ?isActive,
      },
    );
    return _teamFrom(body);
  }

  Future<TeamMember> updateTeamMemberPermissions(
    String memberId, {
    required List<String> permissions,
  }) async {
    final body = await _api.patch(
      '/employees/$memberId/permissions',
      data: {'permissions': permissions},
    );
    return _teamFrom(body);
  }

  Future<TeamMember> removeTeamMember(String memberId, {String? reason}) async {
    final body = await _api.delete(
      '/employees/$memberId',
      data: {
        if (reason != null && reason.trim().isNotEmpty)
          'removalReason': reason.trim(),
      },
    );
    return _teamFrom(body);
  }

  TeamMember _teamFrom(Map<String, dynamic> body) {
    final member = body['employee'];
    if (member is! Map) {
      throw StateError('The server did not return the team member.');
    }
    return TeamMember.fromJson(Map<String, dynamic>.from(member));
  }

  Future<List<BrandBranch>> brandBranches() async {
    final body = await _api.get('/branches');
    final items = body['branches'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => BrandBranch.fromJson(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }

  /// The neighbourhoods a branch can sit in. Only the brand's own city is
  /// offered because a branch cannot open anywhere else.
  Future<List<BranchBlock>> brandBranchBlocks(String cityId) async {
    final body = await _api.get('/blocks', query: {'cityId': cityId});
    final items = body['blocks'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => BranchBlock.fromJson(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }

  Future<BrandBranch> createBrandBranch({
    required String name,
    required String blockId,
    String? address,
    String? phone,
  }) async {
    final body = await _api.post(
      '/brand/branches',
      data: {
        'name': name.trim(),
        'blockId': blockId,
        if (address != null && address.trim().isNotEmpty)
          'address': address.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      },
    );
    return _branchFrom(body);
  }

  Future<BrandBranch> updateBrandBranch(
    String branchId, {
    String? name,
    String? blockId,
    String? address,
    String? phone,
    bool? isActive,
  }) async {
    final body = await _api.patch(
      '/brand/branches/$branchId',
      data: {
        if (name != null) 'name': name.trim(),
        'blockId': ?blockId,
        if (address != null) 'address': address.trim(),
        if (phone != null) 'phone': phone.trim(),
        'isActive': ?isActive,
      },
    );
    return _branchFrom(body);
  }

  BrandBranch _branchFrom(Map<String, dynamic> body) {
    final branch = body['branch'];
    if (branch is! Map) {
      throw StateError('The server did not return the branch.');
    }
    return BrandBranch.fromJson(Map<String, dynamic>.from(branch));
  }

  Future<BrandAnalytics> brandAnalytics({String? from, String? to}) async {
    final body = await _api.get(
      '/brand/analytics',
      query: {'from': ?from, 'to': ?to},
    );
    final analytics = body['analytics'];
    if (analytics is! Map) {
      throw StateError('The server did not return the shop numbers.');
    }
    return BrandAnalytics.fromJson(Map<String, dynamic>.from(analytics));
  }

  AuthResult _authFrom(Map<String, dynamic> body) {
    final token = body['token'];
    final user = body['user'];
    if (token is! String || user is! Map) {
      throw StateError('The server did not return a session.');
    }
    return AuthResult(
      token: token,
      user: AppUser.fromJson(Map<String, dynamic>.from(user)),
    );
  }
}

List<Map<String, dynamic>> _rows(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((row) => Map<String, dynamic>.from(row))
      .toList(growable: false);
}
