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
  bool get needsWorkspace => code == 'WORKSPACE_REQUIRED';

  String? get workspaceToken {
    final value = extra?['workspaceToken'];
    return value is String ? value : null;
  }

  @override
  String toString() => message;
}

/// Server codewords explained in the words a store team uses. Each answer says
/// what to do next, not what went wrong internally.
const _codeMessages = <String, String>{
  'WEB_ONLY': 'Brand owners sign in on the CityCart website.',
  'WRONG_APP': 'This account signs in to a different CityCart app.',
  'STAFF_APP_ONLY': 'This sign-in is for the CityCart Staff app.',
  'WORKSPACE_REQUIRED': 'Choose which brand you are working for.',
  'WORKSPACE_EXPIRED': 'That choice expired. Please sign in again.',
  'WORKSPACE_UNAVAILABLE': 'You no longer have access to that brand.',
  'WORKSPACE_SWITCH_FORBIDDEN': 'Only team members can switch brands.',
  'CLAIM_REQUIRED': 'Claim this order before changing it.',
  'NOT_PICKING': 'This order is not being picked right now.',
  'PICK_TAKEN': 'Another picker took this order. Go back to the queue.',
  'NOT_YOUR_ORDER': 'This order belongs to another picker.',
  'ADJUSTMENT_PENDING': 'The customer is answering a change request. Packing waits until they decide.',
  'INVALID_PICKED_QUANTITY': 'Enter how many units were actually found.',
  'ORDER_CHANGED': 'This order changed. Pull down to reload it.',
  'NOTHING_TO_PROPOSE': 'Mark at least one item short or unavailable first.',
  'SUBSTITUTE_NOT_SHORT': 'A substitute can only replace a short item.',
  'DUPLICATE_SUBSTITUTE': 'That substitute was added twice.',
  'PICKING_INCOMPLETE':
      'Record every item as picked, short or unavailable first.',
  'RETURN_ALREADY_RECEIVED': 'This return was already taken in by the store.',
  'INVALID_RETURN_DECISIONS': 'Reload the return and try again.',
  'PROOF_ALREADY_DECIDED': 'This payment was already checked by someone.',
  'PROOF_NOT_FOUND': 'There is no photo for this payment.',
  'RETURN_PHOTO_NOT_FOUND': 'There is no photo for that item.',
  'CASH_CHANGED': 'The cash list changed. Pull down to reload it.',
  'NO_PAYMENTS_SELECTED': 'Tick at least one payment to settle.',
  'RECEIPT_NOT_READY': 'The receipt appears once the payment is complete.',
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
      429 => 'Too many attempts. Wait a moment, then try again.',
      _ => 'Something went wrong. Please try again.',
    };
  }

  if (status == 400) {
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
