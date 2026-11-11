import 'package:flutter_test/flutter_test.dart';

import 'package:citycart_delivery/core/config.dart';

void main() {
  group('AppConfig.normalize', () {
    test('rejects an empty or non-http address', () {
      expect(AppConfig.normalize(null), isNull);
      expect(AppConfig.normalize('   '), isNull);
      expect(AppConfig.normalize('api.example.com'), isNull);
      expect(AppConfig.normalize('ftp://example.com'), isNull);
    });

    test('adds the API version once', () {
      expect(
        AppConfig.normalize('http://localhost:5000'),
        'http://localhost:5000/api/v1',
      );
      expect(
        AppConfig.normalize('https://api.citycart.pk/'),
        'https://api.citycart.pk/api/v1',
      );
    });

    test('does not double the version', () {
      expect(
        AppConfig.normalize('https://api.citycart.pk/api/v1'),
        'https://api.citycart.pk/api/v1',
      );
      expect(
        AppConfig.normalize('https://api.citycart.pk/api/v1/'),
        'https://api.citycart.pk/api/v1',
      );
    });
  });
}
