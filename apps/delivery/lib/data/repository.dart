import 'dart:typed_data';

import '../data/api_client.dart';
import '../data/api_exception.dart';
import '../data/models.dart';

class AuthResult {
  const AuthResult({required this.user, required this.token});

  final AppUser user;
  final String token;
}

class DeliveryRepository {
  DeliveryRepository(this._api);

  final ApiClient _api;

  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    final body = await _api.post(
      '/auth/delivery/login',
      data: {'email': email.trim(), 'password': password},
    );
    final token = body['token'];
    final userJson = body['user'];
    if (token is! String || token.isEmpty || userJson is! Map) {
      throw ApiException(
        'The server did not return a session. Please try again.',
      );
    }
    final user = AppUser.fromJson(Map<String, dynamic>.from(userJson));
    if (!user.isRider) {
      throw ApiException('This account is not a delivery rider.');
    }
    return AuthResult(user: user, token: token);
  }

  Future<AppUser> me() async {
    final body = await _api.get('/auth/me');
    final userJson = body['user'];
    if (userJson is! Map) {
      throw ApiException(
        'Your session could not be checked. Please sign in again.',
      );
    }
    return AppUser.fromJson(Map<String, dynamic>.from(userJson));
  }

  Future<DeliveryPage> list({
    String scope = 'active',
    int page = 1,
    int limit = 20,
  }) async {
    final body = await _api.get(
      '/rider/deliveries',
      query: {'scope': scope, 'page': page, 'limit': limit},
    );
    final pagination = body['pagination'] is Map
        ? Map<String, dynamic>.from(body['pagination'] as Map)
        : const <String, dynamic>{};
    return DeliveryPage(
      items:
          (body['deliveries'] is List ? body['deliveries'] as List : const [])
              .map(
                (item) => RiderDelivery.fromJson(
                  Map<String, dynamic>.from(item as Map),
                ),
              )
              .toList(growable: false),
      page: (pagination['page'] is num)
          ? (pagination['page'] as num).toInt()
          : page,
      pages: (pagination['pages'] is num)
          ? (pagination['pages'] as num).toInt()
          : page,
      total: (pagination['total'] is num)
          ? (pagination['total'] as num).toInt()
          : 0,
    );
  }

  Future<RiderDelivery> get(String id) async {
    final body = await _api.get('/rider/deliveries/$id');
    final delivery = body['delivery'];
    if (delivery is! Map) throw ApiException('This job could not be loaded.');
    return RiderDelivery.fromJson(Map<String, dynamic>.from(delivery));
  }

  Future<RiderDelivery> updateStatus(
    String id,
    String status, {
    String? failureReason,
  }) async {
    final body = await _api.patch(
      '/rider/deliveries/$id/status',
      data: {
        'status': status,
        if (failureReason != null && failureReason.trim().isNotEmpty)
          'failureReason': failureReason.trim(),
      },
    );
    return _deliveryFrom(body);
  }

  Future<RiderDelivery> complete({
    required String id,
    required String code,
    Map<String, dynamic>? collection,
    List<Map<String, dynamic>>? lines,
  }) async {
    final body = await _api.post(
      '/rider/deliveries/$id/complete',
      data: {
        'code': code,
        'collection': ?collection,
        if (lines != null && lines.isNotEmpty) 'lines': lines,
      },
    );
    return _deliveryFrom(body);
  }

  Future<RiderDelivery> retryPayment({
    required String id,
    required Map<String, dynamic> collection,
  }) async {
    final body = await _api.post(
      '/rider/deliveries/$id/payment',
      data: {'collection': collection},
    );
    return _deliveryFrom(body);
  }

  Future<ProofUpload> requestProofUpload(String id) async {
    final body = await _api.post('/rider/deliveries/$id/proof-upload');
    final upload = body['upload'];
    if (upload is! Map) {
      throw ApiException('A payment photo cannot be added right now.');
    }
    return ProofUpload.fromJson(Map<String, dynamic>.from(upload));
  }

  Future<ProofUpload> requestReturnUpload(String id) async {
    final body = await _api.post('/rider/deliveries/$id/return-upload');
    final upload = body['upload'];
    if (upload is! Map) {
      throw ApiException('A return photo cannot be added right now.');
    }
    return ProofUpload.fromJson(Map<String, dynamic>.from(upload));
  }

  /// Signs one upload for THIS job's private folder and sends the photo
  /// straight to Cloudinary.
  Future<UploadedPhoto> uploadProofPhoto({
    required String deliveryId,
    required Uint8List bytes,
    required String filename,
  }) async {
    final upload = await requestProofUpload(deliveryId);
    return _api.uploadPhoto(upload: upload, bytes: bytes, filename: filename);
  }

  Future<UploadedPhoto> uploadReturnPhoto({
    required String deliveryId,
    required Uint8List bytes,
    required String filename,
  }) async {
    final upload = await requestReturnUpload(deliveryId);
    return _api.uploadPhoto(upload: upload, bytes: bytes, filename: filename);
  }

  Future<CashInHand> cash() async {
    final body = await _api.get('/rider/deliveries/cash');
    final cash = body['cash'];
    if (cash is! Map) return const CashInHand(count: 0, total: 0);
    return CashInHand.fromJson(Map<String, dynamic>.from(cash));
  }

  Future<void> shareLocation({
    required double latitude,
    required double longitude,
    double? accuracy,
  }) async {
    await _api.put(
      '/rider/deliveries/location',
      data: {
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': ?accuracy,
      },
    );
  }

  Future<void> stopSharingLocation() async {
    try {
      await _api.delete('/rider/deliveries/location');
    } on ApiException {
      // Stopping sharing is best-effort: the last point expires on its own.
    }
  }

  RiderDelivery _deliveryFrom(Map<String, dynamic> body) {
    final delivery = body['delivery'];
    if (delivery is! Map) {
      throw ApiException(
        'The job was updated, but its new state could not be read.',
      );
    }
    return RiderDelivery.fromJson(Map<String, dynamic>.from(delivery));
  }
}
