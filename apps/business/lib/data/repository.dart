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
