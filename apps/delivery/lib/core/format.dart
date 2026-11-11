import 'package:intl/intl.dart';

final _number = NumberFormat('#,##0', 'en');
final _numberDecimals = NumberFormat('#,##0.00', 'en');
final _shortDay = DateFormat('EEE, d MMM', 'en');
final _time = DateFormat('h:mm a', 'en');
final _dayKey = DateFormat('yyyy-MM-dd');

/// `Rs 2,450` — paisa are only shown when the amount actually has them.
String formatMoney(double? amount, {String currency = 'PKR'}) {
  final value = amount ?? 0;
  final symbol = currency == 'PKR' ? 'Rs ' : '$currency ';
  final whole = value == value.roundToDouble();
  return '$symbol${whole ? _number.format(value) : _numberDecimals.format(value)}';
}

String formatAmountOnly(double? amount) {
  final value = amount ?? 0;
  final whole = value == value.roundToDouble();
  return whole ? _number.format(value) : _numberDecimals.format(value);
}

String formatShortDate(DateTime? date) {
  if (date == null) return '';
  return _shortDay.format(date.toLocal());
}

String formatTime(DateTime? date) {
  if (date == null) return '';
  return _time.format(date.toLocal());
}

/// "Today", "Yesterday", or a short date. Used for history grouping.
String formatDayLabel(DateTime date) {
  final local = date.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(local.year, local.month, local.day);
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'Today';
  if (difference == 1) return 'Yesterday';
  return _shortDay.format(local);
}

String dayKey(DateTime date) => _dayKey.format(date.toLocal());

String initialsOf(String? name) {
  final parts = (name ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'C';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}

String greetingFor(DateTime now) {
  if (now.hour < 12) return 'Good morning';
  if (now.hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/// The 6-digit proof-of-delivery code as `482 019` for reading aloud.
String spacedCode(String code) {
  final digits = code.replaceAll(RegExp(r'\D'), '');
  if (digits.length <= 3) return digits;
  return '${digits.substring(0, 3)} ${digits.substring(3)}';
}
