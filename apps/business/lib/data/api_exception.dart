import 'package:dio/dio.dart';

/// Every failure becomes one readable sentence; no screen ever shows a status
/// code or a Dio type name.
class ApiException implements Exception {
  ApiException(
    this.message, {
    this.status,
    this.code,
    this.extra,
    this.isNetwork = false,
    this.isTimeout = false,
  });

  final String message;
  final int? status;
  final String? code;
  final Map<String, dynamic>? extra;
  final bool isNetwork;
  final bool isTimeout;

  bool get isUnauthorized => status == 401;
  bool get isNotFound => status == 404;
  bool get isForbidden => status == 403;

  @override
  String toString() => message;
}

/// Server codewords explained in the words a business owner uses.
const _codeMessages = <String, String>{
  'BUSINESS_APP_ONLY': 'This sign-in is for the CityCart Business app.',
  'WRONG_APP': 'This account signs in to a different CityCart app.',
  'WEB_ONLY': 'Platform admins sign in on the CityCart website.',
  'PROVIDER_INACTIVE':
      'This provider account is not active. Contact CityCart support.',
  'EMAIL_NOT_VERIFIED': 'Confirm your email first. Open the link CityCart sent you, then sign in.',
  'PROVIDER_PENDING': 'Your provider account is waiting for approval. You can set things up, but customers cannot book yet.',
  'BLOCK_CHANGE_LIMIT':
      'You have already changed your area this month. Try again next month.',
  'OUTSIDE_BLOCK': 'That pin is outside the selected area. Move it inside.',
  'INVALID_BLOCK': 'That area is not available. Choose another one.',
  'BOOKING_NOT_FOUND': 'That booking could not be found.',
  'BOOKING_CHANGED': 'This booking changed. Pull down to reload it.',
  'INVALID_BOOKING_STATUS': 'This booking is no longer open for that step.',
  'INVALID_PRICE': 'Enter a price greater than zero.',
  'SLOT_UNAVAILABLE': 'That time is not available. Choose another slot.',
  'OFFERING_NOT_FOUND': 'That service could not be found.',
  'AVAILABILITY_OVERLAP':
      'Two time ranges overlap. Adjust them and save again.',
  'REVIEW_ALREADY_REPLIED': 'You already replied to this review.',
  'RETURN_ALREADY_RECEIVED': 'This return was already taken in.',
  'ORDER_CHANGED': 'This order changed. Pull down to reload it.',
  'INVALID_ORDER_STATUS': 'That status change is not allowed for this order.',
  'PRODUCT_NOT_FOUND': 'That product could not be found.',
  'INVENTORY_CHANGED': 'Stock changed somewhere else. Reload and try again.',
  'DUPLICATE_SKU': 'That SKU is already used by another product.',
  'RIDER_HAS_OPEN_DELIVERIES':
      'This rider still has deliveries on the way. Reassign them first.',
};

ApiException fromDio(DioException error) {
  final response = error.response;
  if (response == null) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return ApiException(
        'The server took too long to answer. Check the connection and try again.',
        isNetwork: true,
        isTimeout: true,
      );
    }
    if (error.type == DioExceptionType.badCertificate) {
      return ApiException(
        'The app could not make a secure connection to the server.',
        isNetwork: true,
      );
    }
    return ApiException(
      "Can't reach CityCart. Check the internet connection and try again.",
      isNetwork: true,
    );
  }

  final data = response.data;
  final map = data is Map
      ? Map<String, dynamic>.from(data)
      : const <String, dynamic>{};
  final status = response.statusCode;
  final code = map['code'] is String ? map['code'] as String : null;

  String? message = map['message'] is String ? map['message'] as String : null;

  if (message == null || message.trim().isEmpty) {
    message = switch (status) {
      400 => 'Please check the details and try again.',
      401 => 'Your session has ended. Please sign in again.',
      403 => 'This account cannot do that.',
      404 => 'That item could not be found.',
      409 => 'This changed somewhere else. Reload and try again.',
      422 => 'That action could not be completed. Check the details.',
      429 => 'Too many attempts. Wait a moment, then try again.',
      _ => 'Something went wrong. Please try again.',
    };
  }

  if (status == 400 || status == 422) {
    final errors = map['errors'];
    if (errors is List && errors.isNotEmpty) {
      final first = errors.first;
      if (first is Map && first['message'] is String) {
        message = first['message'] as String;
      }
    }
  }

  if (code != null && _codeMessages.containsKey(code)) {
    message = _codeMessages[code]!;
  }

  return ApiException(message, status: status, code: code, extra: map);
}
