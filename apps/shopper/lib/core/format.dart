import 'package:intl/intl.dart';

final _number = NumberFormat('#,##0', 'en');
final _numberDecimals = NumberFormat('#,##0.00', 'en');
final _shortDay = DateFormat('EEE, d MMM', 'en');
final _shortDayYear = DateFormat('d MMM yyyy', 'en');
final _time = DateFormat('h:mm a', 'en');

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

String formatDate(DateTime? date) {
  if (date == null) return '';
  return _shortDayYear.format(date.toLocal());
}

String formatTime(DateTime? date) {
  if (date == null) return '';
  return _time.format(date.toLocal());
}

String formatDateTime(DateTime? date) {
  if (date == null) return '';
  return '${formatShortDate(date)} · ${formatTime(date)}';
}

/// "Today", "Yesterday", or a short date.
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

/// "just now", "14 min ago", "2 h ago", then the date.
String formatAge(DateTime? date) {
  if (date == null) return '';
  final local = date.toLocal();
  final difference = DateTime.now().difference(local);
  if (difference.inMinutes < 1) return 'just now';
  if (difference.inMinutes < 60) return '${difference.inMinutes} min ago';
  if (difference.inHours < 24) return '${difference.inHours} h ago';
  return formatShortDate(local);
}

/// "1.2 km" or "450 m" — never a bare long decimal.
String formatDistance(double? km) {
  if (km == null) return '';
  if (km < 1) return '${(km * 1000).round()} m';
  final rounded = km < 10 ? km.toStringAsFixed(1) : km.round().toString();
  return '$rounded km';
}

String initialsOf(String? name) {
  final parts = (name ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
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

String firstNameOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? 'there' : parts.first;
}

String plural(int count, String one, [String? many]) =>
    '$count ${count == 1 ? one : (many ?? '${one}s')}';

String unitsLabel(int count) => plural(count, 'unit');

String itemCountLabel(int count) => plural(count, 'item');

/// "2 stores" / "1 store" without a leading count duplication.
String storeCountLabel(int count) => plural(count, 'store');
