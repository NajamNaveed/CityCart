import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../core/config.dart';
import 'api_exception.dart';
import 'models.dart';
import 'session_store.dart';

/// The one place the app talks to the server.
///
/// Every request identifies the app with `X-Client: delivery` — the server
/// requires it for a rider session — and carries the stored token. The base
/// address is supplied by the build (`API_URL`) or by the local setup dialog.
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
      headers: const {'X-Client': 'delivery', 'Accept': 'application/json'},
    ),
  );

  final Dio _uploadDio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 60),
    ),
  );

  String? get baseUrl => _baseUrl;
  bool get isConfigured => _baseUrl != null;

  void setBaseUrl(String? raw) {
    _baseUrl = AppConfig.normalize(raw);
  }

  Map<String, String> _headers({required bool json}) {
    final headers = <String, String>{'X-Client': 'delivery'};
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
          !path.endsWith('/auth/delivery/login')) {
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

  Future<Map<String, dynamic>> put(String path, {Object? data}) =>
      _request('PUT', path, data: data);

  Future<Map<String, dynamic>> delete(String path) => _request('DELETE', path);

  /// Straight to Cloudinary with the server's short-lived signature. The photo
  /// never passes through the CityCart API, and the signed `type` keeps it
  /// private.
  Future<UploadedPhoto> uploadPhoto({
    required ProofUpload upload,
    required Uint8List bytes,
    required String filename,
  }) async {
    if (bytes.isEmpty) {
      throw ApiException('That photo could not be read. Take it again.');
    }
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
      'api_key': upload.apiKey,
      'timestamp': '${upload.timestamp}',
      'signature': upload.signature,
      'folder': upload.folder,
      'allowed_formats': upload.allowedFormats,
      'type': upload.type,
    });

    try {
      final response = await _uploadDio.post<dynamic>(
        upload.uploadUrl,
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );
      final body = response.data;
      final map = body is Map
          ? Map<String, dynamic>.from(body)
          : const <String, dynamic>{};
      final publicId = map['public_id'];
      if (publicId is! String || publicId.isEmpty) {
        throw ApiException(
          'The photo service did not accept the photo. Take it again.',
        );
      }
      final etag = map['etag'];
      return UploadedPhoto(
        publicId: publicId,
        fingerprint: etag is String && etag.isNotEmpty ? etag : publicId,
      );
    } on DioException catch (error) {
      final response = error.response;
      if (response == null) {
        throw ApiException(
          "The photo could not be uploaded. Check the phone's internet connection and try again.",
          isNetwork: true,
        );
      }
      final body = response.data;
      String? reason;
      if (body is Map && body['error'] is Map) {
        final detail = body['error'] as Map;
        if (detail['message'] is String) reason = detail['message'] as String;
      } else if (body is String) {
        try {
          final decoded = jsonDecode(body);
          if (decoded is Map &&
              decoded['error'] is Map &&
              (decoded['error'] as Map)['message'] is String) {
            reason = (decoded['error'] as Map)['message'] as String;
          }
        } catch (_) {
          // Not JSON: use the generic message.
        }
      }
      throw ApiException(
        reason == null
            ? 'The photo service did not accept the photo. Take it again.'
            : 'The photo service did not accept the photo: $reason',
        status: response.statusCode,
      );
    }
  }
}
