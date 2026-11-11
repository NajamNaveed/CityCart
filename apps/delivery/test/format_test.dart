import 'package:citycart_delivery/core/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('money', () {
    test('shows paisa only when the amount has them', () {
      expect(formatMoney(2450), 'Rs 2,450');
      expect(formatMoney(2450.5), 'Rs 2,450.50');
      expect(formatMoney(null), 'Rs 0');
      expect(formatMoney(12, currency: 'USD'), 'USD 12');
    });

    test('amount only skips the currency symbol', () {
      expect(formatAmountOnly(1300), '1,300');
      expect(formatAmountOnly(99.25), '99.25');
    });
  });

  group('dates', () {
    test('short date and time read like the screens show them', () {
      final date = DateTime(2026, 11, 10, 15, 5);
      expect(formatShortDate(date), 'Tue, 10 Nov');
      expect(formatTime(date), '3:05 PM');
      expect(formatShortDate(null), '');
      expect(formatTime(null), '');
    });

    test('day labels name today and yesterday', () {
      expect(formatDayLabel(DateTime.now()), 'Today');
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      expect(formatDayLabel(yesterday), 'Yesterday');
    });

    test('day keys group by local calendar day', () {
      expect(dayKey(DateTime(2026, 1, 2, 23, 59)), '2026-01-02');
    });
  });

  test('the delivery code is grouped for reading aloud', () {
    expect(spacedCode('482019'), '482 019');
    expect(spacedCode('48-20-19'), '482 019');
    expect(spacedCode('12'), '12');
  });

  test('initials fall back to C and never crash on blank names', () {
    expect(initialsOf('Bilal Ahmed'), 'BA');
    expect(initialsOf('Bilal'), 'B');
    expect(initialsOf('  '), 'C');
    expect(initialsOf(null), 'C');
  });
}
