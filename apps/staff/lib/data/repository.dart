import 'api_client.dart';
import 'models.dart';

/// One method per server endpoint the app is allowed to use. Screens never
/// build URLs themselves, so every call keeps the same headers and the same
/// error handling.
class StaffRepository {
  StaffRepository(this._api);

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
      '/auth/staff/login',
      data: {'email': email, 'password': password},
    );
    return LoginResult.fromJson(body);
  }

  Future<LoginResult> chooseWorkspace({
    required String workspaceToken,
    required String brandId,
  }) async {
    final body = await _api.post(
      '/auth/workspace',
      data: {'workspaceToken': workspaceToken, 'brandId': brandId},
    );
    return LoginResult.fromJson(body);
  }

  Future<LoginResult> switchWorkspace(String brandId) async {
    final body = await _api.post(
      '/auth/workspace/switch',
      data: {'brandId': brandId},
    );
    return LoginResult.fromJson(body);
  }

  // --- Picking -------------------------------------------------------------

  Future<Page<PickQueueItem>> pickerQueue({int page = 1}) async {
    final body = await _api.get('/picker', query: {'page': page});
    return Page.fromJson(body, key: 'orders', parse: PickQueueItem.fromJson);
  }

  Future<PickOrder> pickerOrder(String orderId) async {
    final body = await _api.get('/picker/$orderId');
    return PickOrder.fromJson(body['order']);
  }

  Future<PickOrder> claimOrder(String orderId) async {
    final body = await _api.post('/picker/$orderId/claim');
    return PickOrder.fromJson(body['order']);
  }

  Future<PickOrder> setLinePick({
    required String orderId,
    required String itemId,
    required String pickStatus,
    int? pickedQty,
  }) async {
    final body = await _api.patch(
      '/picker/$orderId/items/$itemId',
      data: {'pickStatus': pickStatus, 'pickedQty': ?pickedQty},
    );
    return PickOrder.fromJson(body['order']);
  }

  Future<void> proposeChange({
    required String orderId,
    required bool restockRemoved,
    String? note,
    List<Map<String, dynamic>> substitutes = const [],
  }) async {
    await _api.post(
      '/picker/$orderId/propose',
      data: {
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        'restockRemoved': restockRemoved,
        'substitutes': substitutes,
      },
    );
  }

  Future<PickOrder> packOrder(String orderId) async {
    final body = await _api.post('/picker/$orderId/pack');
    return PickOrder.fromJson(body['order']);
  }

  Future<List<ProductOption>> searchProducts(String query) async {
    final body = await _api.get(
      '/picker/products',
      query: {'q': query, 'limit': 20},
    );
    return asList(body['products']).map(ProductOption.fromJson).toList();
  }

  // --- Orders and deliveries ----------------------------------------------

  Future<Page<OrderRecord>> brandOrders({String? status, int page = 1}) async {
    final body = await _api.get(
      '/brand/orders',
      query: {'status': ?status, 'page': page},
    );
    return Page.fromJson(body, key: 'orders', parse: OrderRecord.fromJson);
  }

  Future<OrderDetailBundle> brandOrder(String orderId) async {
    final body = await _api.get('/brand/orders/$orderId');
    return OrderDetailBundle.fromJson(body);
  }

  Future<Page<DeliveryRecord>> deliveries({
    String? status,
    String? riderId,
    int page = 1,
  }) async {
    final body = await _api.get(
      '/deliveries',
      query: {'status': ?status, 'riderId': ?riderId, 'page': page},
    );
    return Page.fromJson(
      body,
      key: 'deliveries',
      parse: DeliveryRecord.fromJson,
    );
  }

  Future<DeliveryRecord> delivery(String deliveryId) async {
    final body = await _api.get('/deliveries/$deliveryId');
    return DeliveryRecord.fromJson(body['delivery']);
  }

  Future<List<Rider>> riders() async {
    final body = await _api.get(
      '/riders',
      query: {'isActive': true, 'limit': 50},
    );
    return asList(body['riders']).map(Rider.fromJson).toList();
  }

  Future<void> assignRider({
    required String deliveryId,
    required String? riderId,
  }) async {
    await _api.patch(
      '/deliveries/$deliveryId/rider',
      data: {'riderId': riderId},
    );
  }

  // --- Returns -------------------------------------------------------------

  Future<Page<ReturnRecord>> returns({String? status, int page = 1}) async {
    final body = await _api.get(
      '/returns',
      query: {'status': ?status, 'page': page},
    );
    return Page.fromJson(body, key: 'returns', parse: ReturnRecord.fromJson);
  }

  Future<ReturnsSummary> returnsSummary() async {
    final body = await _api.get('/returns/summary');
    return ReturnsSummary.fromJson(body['summary']);
  }

  Future<ReturnRecord> returnDetail(String returnId) async {
    final body = await _api.get('/returns/$returnId');
    return ReturnRecord.fromJson(body['return']);
  }

  Future<String> returnPhotoUrl(String returnId, int line) async {
    final body = await _api.get(
      '/returns/$returnId/photo',
      query: {'line': line},
    );
    return text(body['url']);
  }

  Future<ReturnRecord> receiveReturn({
    required String returnId,
    required List<Map<String, dynamic>> decisions,
  }) async {
    final body = await _api.post(
      '/returns/$returnId/receive',
      data: {'decisions': decisions},
    );
    return ReturnRecord.fromJson(body['return']);
  }

  // --- Money ---------------------------------------------------------------

  Future<Page<ReceiptRecord>> receipts({int page = 1}) async {
    final body = await _api.get('/receipts', query: {'page': page});
    return Page.fromJson(body, key: 'receipts', parse: ReceiptRecord.fromJson);
  }

  Future<ReceiptRecord> receipt(String receiptId) async {
    final body = await _api.get('/receipts/$receiptId');
    return ReceiptRecord.fromJson(body['receipt']);
  }

  Future<ReceiptRecord> receiptForOrder(String orderId) async {
    final body = await _api.get('/receipts/order/$orderId');
    return ReceiptRecord.fromJson(body['receipt']);
  }

  Future<Page<ProofRecord>> proofs({
    String status = 'SUBMITTED',
    int page = 1,
  }) async {
    final body = await _api.get(
      '/payments/proofs',
      query: {'status': status, 'page': page},
    );
    return Page.fromJson(body, key: 'proofs', parse: ProofRecord.fromJson);
  }

  Future<ProofRecord> proofLink(String paymentId) async {
    final body = await _api.get('/payments/$paymentId/proof');
    return ProofRecord.fromJson(body['proof']);
  }

  Future<ProofRecord> decideProof({
    required String paymentId,
    required String verification,
    String? note,
  }) async {
    final body = await _api.patch(
      '/payments/$paymentId/proof',
      data: {
        'verification': verification,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
    return ProofRecord.fromJson(body['proof']);
  }

  Future<List<CashCollector>> outstandingCash() async {
    final body = await _api.get('/payments/cash/outstanding');
    return asList(body['collectors']).map(CashCollector.fromJson).toList();
  }

  Future<CollectorCash> collectorCash(String collectorId) async {
    final body = await _api.get(
      '/payments/cash/outstanding',
      query: {'collectorId': collectorId},
    );
    return CollectorCash.fromJson(body);
  }

  Future<SettledCash> settleCash({
    required String collectorId,
    required List<String> paymentIds,
  }) async {
    final body = await _api.post(
      '/payments/cash/settle',
      data: {'collectorId': collectorId, 'paymentIds': paymentIds},
    );
    return SettledCash.fromJson(body);
  }
}
