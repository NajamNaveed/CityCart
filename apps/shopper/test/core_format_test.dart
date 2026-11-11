import 'package:citycart_shopper/core/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('money', () {
    test('whole amounts drop the decimals', () {
      expect(formatMoney(2450), 'Rs 2,450');
      expect(formatMoney(0), 'Rs 0');
    });

    test('paisa are shown only when present', () {
      expect(formatMoney(2450.5), 'Rs 2,450.50');
      expect(formatAmountOnly(19.99), '19.99');
    });

    test('a missing amount is zero, never a crash', () {
      expect(formatMoney(null), 'Rs 0');
    });
  });

  test('distance stays readable', () {
    expect(formatDistance(null), '');
    expect(formatDistance(0.45), '450 m');
    expect(formatDistance(1.24), '1.2 km');
    expect(formatDistance(14.6), '15 km');
  });

  test('initials never break on an empty name', () {
    expect(initialsOf(null), 'C');
    expect(initialsOf('Sana Iqbal'), 'SI');
    expect(initialsOf('Sana'), 'S');
  });

  test('greeting follows the local clock', () {
    expect(greetingFor(DateTime(2026, 1, 1, 8)), 'Good morning');
    expect(greetingFor(DateTime(2026, 1, 1, 14)), 'Good afternoon');
    expect(greetingFor(DateTime(2026, 1, 1, 20)), 'Good evening');
  });

  test('counts use a singular for one', () {
    expect(itemCountLabel(1), '1 item');
    expect(itemCountLabel(3), '3 items');
    expect(storeCountLabel(1), '1 store');
    expect(plural(2, 'block'), '2 blocks');
  });
}
