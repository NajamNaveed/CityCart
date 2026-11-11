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
