import 'package:dio/dio.dart';

/// One readable answer for every failure: the screens never show a raw HTTP
/// status or a Dio type name to a rider.
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

  int? get attemptsRemaining {
    final value = extra?['attemptsRemaining'];
    return value is num ? value.toInt() : int.tryParse('${value ?? ''}');
  }

  @override
  String toString() => message;
}

/// Codewords the API uses to explain a refusal. Each one says what the rider
/// should do next, in plain language.
const _codeMessages = <String, String>{
  'WEB_ONLY': 'Brand owners and admins sign in on the CityCart website.',
  'WRONG_APP': 'This account signs in to a different CityCart app.',
  'DELIVERY_APP_ONLY': 'This sign-in is for the CityCart Delivery app.',
  'EMAIL_NOT_VERIFIED':
      'Verify your email first. Open the link CityCart sent you, then sign in.',
  'PAYMENT_VERIFICATION_PENDING': 'This job is waiting for the store to check a payment. You can finish it once they approve.',
  'NO_REFUSED_PAYMENT': 'There is no refused payment on this job.',
  'PAYMENT_ALREADY_COLLECTED': 'This payment was already collected.',
  'ORDER_OUT_OF_SYNC':
      'This order changed on the store side. Pull down to reload it.',
  'DELIVERY_CHANGED':
      'This job changed somewhere else. Pull down to reload it.',
  'PAYMENT_CHANGED': 'This job changed somewhere else. Pull down to reload it.',
  'INVALID_TRANSITION':
      'That step is not possible right now. Pull down to reload the job.',
  'PROOF_NOT_CONFIGURED':
      'Photo payments are not set up by the store. Collect cash only.',
  'PROOF_NOT_ALLOWED':
      'A payment photo can only be taken while the job is out for delivery.',
  'PROOF_NOT_YOURS': 'That photo is not for this job. Take it again.',
  'RETURN_PHOTO_NOT_CONFIGURED':
      'Return photos are not set up by the store. Continue without one.',
  'RETURN_PHOTO_NOT_YOURS': 'That photo is not for this job. Take it again.',
  'INVALID_RETURN_LINES':
      'Every item must be counted. Pull down to reload and try again.',
  'INVALID_RETURN_QUANTITY':
      'The kept and returned counts do not match the order.',
  'INVALID_RETURN_REASON': 'Choose a reason for every item coming back.',
  'NO_DELIVERY_CODE': 'This job has no code. Ask the store to complete it.',
  'CODE_LOCKED':
      'Too many wrong codes. Ask the store to complete this delivery.',
};

ApiException fromDio(DioException error) {
  final response = error.response;
  if (response == null) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return ApiException(
        'The server took too long to answer. Check your signal and try again.',
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
      "Can't reach CityCart. Check your internet connection and try again.",
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

  if (code == 'INVALID_CODE') {
    final remaining = map['attemptsRemaining'];
    final tries = remaining is num ? remaining.toInt() : null;
    if (tries != null && tries > 0) {
      message =
          'That code is not right. $tries ${tries == 1 ? 'try' : 'tries'} left.';
    } else {
      message = 'That code is not right. No tries left — ask the store to complete this job.';
    }
  }

  if (code != null && _codeMessages.containsKey(code)) {
    message = _codeMessages[code]!;
  }

  if (status == 429 && code == null) {
    message = map['message'] is String
        ? map['message'] as String
        : 'Too many attempts. Wait a few minutes, then try again.';
  }

  return ApiException(message, status: status, code: code, extra: map);
}
