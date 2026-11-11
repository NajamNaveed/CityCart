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
  bool get needsEmailVerification => code == 'EMAIL_NOT_VERIFIED';

  @override
  String toString() => message;
}

/// Server codewords explained in the words a shopper uses. Each answer says
/// what to do next, not what went wrong internally. The server's own message is
/// used when a code is not listed here.
const _codeMessages = <String, String>{
  'WEB_ONLY': 'This account signs in on the CityCart website.',
  'EMAIL_NOT_VERIFIED':
      'Please check your inbox and open the link we sent, then sign in.',
  'PRODUCT_UNAVAILABLE': 'This product is no longer sold.',
  'BRAND_UNAVAILABLE': 'This store is closed right now.',
  'OUT_OF_STOCK': 'This item is out of stock.',
  'INSUFFICIENT_STOCK': 'The store has fewer of these than you asked for.',
  'QUANTITY_LIMIT': 'You can buy up to 99 of one item.',
  'CART_FULL': 'Your basket is full. Remove something before adding more.',
  'CART_CONFLICT': 'Your basket changed. Please try again.',
  'CART_EMPTY': 'Your basket is empty.',
  'NOT_IN_CART': 'That item is no longer in your basket.',
  'ADDRESS_LIMIT': 'You can save up to 10 addresses. Delete one first.',
  'ADDRESS_NOT_FOUND': 'That address could not be found. Choose another.',
  'OUTSIDE_DELIVERY_ZONE':
      'We do not deliver there yet. Pick a spot inside a delivery area.',
  'CHECKOUT_ISSUES': 'Some items in your basket cannot be delivered as they are. Check the list and try again.',
  'NOT_DELIVERABLE': 'This store does not deliver to your chosen area.',
  'SELLER_BILLING_RESTRICTED': 'This store cannot take new orders right now.',
  'NOT_CANCELLABLE':
      'This order is already being prepared and cannot be cancelled.',
  'PAID_ORDER_NOT_CANCELLABLE': 'This order is already paid. Ask the store to cancel it so your money is returned.',
  'CODE_NOT_AVAILABLE':
      'Your delivery code appears once the order is on its way.',
  'NO_RECEIPT': 'The receipt appears once your order is paid.',
  'NO_RIDER_ASSIGNED': 'A rider has not been assigned yet.',
  'ALREADY_REVIEWED': 'You already reviewed this item.',
  'ORDER_NOT_DELIVERED':
      'You can review an item after its order has been delivered.',
  'PRODUCT_NOT_IN_ORDER': 'That item is not part of this order.',
  'ADJUSTMENT_NOT_PENDING': 'The store already changed this order.',
  'ADJUSTMENT_EXPIRED': 'That change is no longer open. Reload the order.',
  'ADJUSTMENT_PENDING':
      'The store is waiting for your answer about a change to this order.',
  'ORDER_CHANGED': 'This order changed. Pull down to reload it.',
  'PAYMENT_NOT_FOUND': 'This order has no payment record yet.',
  'OUTSIDE_SERVICE_BLOCK':
      'This address is outside the area this provider serves. Try an address '
      'nearer their area, or choose another provider.',
  'SLOT_UNAVAILABLE': 'That time is not offered. Pick another open time.',
  'SLOT_TAKEN': 'Someone just booked that time. Pick another one.',
  'SLOT_IN_PAST': 'That time has already passed. Pick a later time.',
  'SLOT_TOO_FAR': 'You can book up to 60 days ahead.',
  'OUTSIDE_AVAILABILITY': 'That time is outside the provider’s working hours.',
  'BLACKOUT_DATE': 'The provider is not available on that day.',
  'INVALID_SLOT': 'Choose a valid date and time.',
  'PROVIDER_UNAVAILABLE': 'This provider is not taking requests right now.',
  'PRICE_BELOW_STARTING': 'Your offer is below this provider’s starting price.',
  'INVALID_STATUS': 'This booking changed. Reload it and try again.',
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

  if (status == 400) {
    final errors = map['errors'];
    if (errors is List && errors.isNotEmpty) {
      final first = errors.first;
      if (first is Map && first['message'] is String) {
        message = first['message'] as String;
      }
    }
  }

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

  if (code != null && _codeMessages.containsKey(code)) {
    message = _codeMessages[code]!;
  }

  return ApiException(message, status: status, code: code, extra: map);
}
