import 'package:dio/dio.dart';

import '../core/config.dart';
import 'api_exception.dart';
import 'session_store.dart';

/// The single door to the server. Every request says `X-Client: staff` (the
/// server only accepts a staff session from this app) and carries the stored
/// token. The token is never written anywhere but the platform keystore.
class ApiClient {
  ApiClient(this._session, {String? baseUrl})
    : _baseUrl = AppConfig.normalize(baseUrl);

  final SessionStore _session;
  String? _baseUrl;

  /// Called when the server rejects a token that was actually sent, which means
  /// the session ended (expired, deactivated, password changed).
  void Function()? onUnauthorized;

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 25),
      headers: const {'X-Client': 'staff', 'Accept': 'application/json'},
    ),
  );

  String? get baseUrl => _baseUrl;
  bool get isConfigured => _baseUrl != null;

  void setBaseUrl(String? raw) {
    _baseUrl = AppConfig.normalize(raw);
  }

  Map<String, String> _headers({required bool json}) {
    final headers = <String, String>{'X-Client': 'staff'};
    if (json) headers['Content-Type'] = 'application/json';
    final token = _session.token;
    if (token != null) headers['Authorization'] = 'Bearer $token';
    return headers;
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? data,
  }) async {
    final baseUrl = _baseUrl;
    if (baseUrl == null) {
      throw ApiException(
        "The app isn't connected to a server yet. Add the server address to continue.",
        code: 'NOT_CONFIGURED',
      );
    }

    final tokenWasSent = _session.token != null;
    try {
      final response = await _dio.request<dynamic>(
        '$baseUrl$path',
        queryParameters: query,
        data: data,
        options: Options(
          method: method,
          headers: _headers(json: data != null),
        ),
      );
      final body = response.data;
      if (body is Map) return Map<String, dynamic>.from(body);
      return const {};
    } on DioException catch (error) {
      final failure = fromDio(error);
      if (failure.isUnauthorized &&
          tokenWasSent &&
          !path.endsWith('/auth/staff/login')) {
        onUnauthorized?.call();
      }
      throw failure;
    }
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) => _request('GET', path, query: query);

  Future<Map<String, dynamic>> post(String path, {Object? data}) =>
      _request('POST', path, data: data);

  Future<Map<String, dynamic>> patch(String path, {Object? data}) =>
      _request('PATCH', path, data: data);
}
