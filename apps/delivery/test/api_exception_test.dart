import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:citycart_delivery/data/api_exception.dart';

DioException _dioError({
  int? status,
  Object? data,
  DioExceptionType type = DioExceptionType.badResponse,
}) {
  final options = RequestOptions(path: '/rider/deliveries');
  return DioException(
    requestOptions: options,
    type: type,
    response: status == null
        ? null
        : Response(requestOptions: options, statusCode: status, data: data),
  );
}

void main() {
  group('fromDio turns server refusals into plain answers', () {
    test('an expired session is recognised', () {
      final error = fromDio(
        _dioError(status: 401, data: {'message': 'Unauthorized'}),
      );
      expect(error.isUnauthorized, isTrue);
      expect(error.message, 'Unauthorized');
    });

    test('a wrong code says how many tries are left', () {
      final error = fromDio(
        _dioError(
          status: 422,
          data: {
            'message': 'That code is not correct.',
            'code': 'INVALID_CODE',
            'attemptsRemaining': 2,
          },
        ),
      );
      expect(error.code, 'INVALID_CODE');
      expect(error.attemptsRemaining, 2);
      expect(error.message, 'That code is not right. 2 tries left.');
    });

    test('a locked code explains who can finish the job', () {
      final error = fromDio(
        _dioError(status: 429, data: {'code': 'CODE_LOCKED'}),
      );
      expect(
        error.message,
        'Too many wrong codes. Ask the store to complete this delivery.',
      );
    });

    test('a held payment tells the rider to wait for the store', () {
      final error = fromDio(
        _dioError(status: 409, data: {'code': 'PAYMENT_VERIFICATION_PENDING'}),
      );
      expect(
        error.message,
        'This job is waiting for the store to check a payment. You can finish it once they approve.',
      );
    });

    test('a validation failure shows the first field message', () {
      final error = fromDio(
        _dioError(
          status: 400,
          data: {
            'message': 'Validation failed.',
            'errors': [
              {
                'path': ['code'],
                'message': 'code must be 6 digits',
              },
            ],
          },
        ),
      );
      expect(error.message, 'code must be 6 digits');
    });

    test('a missing connection is a network problem, not a server refusal', () {
      final error = fromDio(_dioError(type: DioExceptionType.connectionError));
      expect(error.isNetwork, isTrue);
      expect(error.status, isNull);
      expect(
        error.message,
        "Can't reach CityCart. Check your internet connection and try again.",
      );
    });

    test('a timeout asks for a better signal', () {
      final error = fromDio(
        _dioError(type: DioExceptionType.connectionTimeout),
      );
      expect(error.isTimeout, isTrue);
      expect(error.message, contains('took too long'));
    });
  });
}
