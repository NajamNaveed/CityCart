import 'package:intl/intl.dart';

/// Money arrives from the server as integer paisa. Screens show rupees, with no
/// decimals when the amount is whole.
String money(int? paisa) {
  if (paisa == null) return '—';
  final value = paisa / 100;
  final whole = value == value.roundToDouble();
  final format = NumberFormat.currency(
    locale: 'en_PK',
    symbol: 'Rs ',
    decimalDigits: whole ? 0 : 2,
  );
  return format.format(value);
}

String compactMoney(int? paisa) {
  if (paisa == null) return '—';
  final value = paisa / 100;
  if (value >= 100000) return 'Rs ${(value / 1000).toStringAsFixed(0)}k';
  return money(paisa);
}

String dayLabel(DateTime date) =>
    DateFormat('EEE d MMM').format(date.toLocal());

String fullDay(DateTime date) =>
    DateFormat('EEEE d MMMM').format(date.toLocal());

String timeLabel(DateTime date) => DateFormat.jm().format(date.toLocal());

String dateTimeLabel(DateTime date) =>
    DateFormat('d MMM, h:mm a').format(date.toLocal());

String shortDate(DateTime date) => DateFormat('d MMM').format(date.toLocal());

String firstNameOf(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'there';
  return trimmed.split(RegExp(r'\s+')).first;
}

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}

String greetingFor(DateTime now) {
  if (now.hour < 12) return 'Good morning';
  if (now.hour < 17) return 'Good afternoon';
  return 'Good evening';
}

bool sameDay(DateTime a, DateTime b) {
  final x = a.toLocal();
  final y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

/// "Today", "Tomorrow", or a short date — the label a booking card needs.
String dayRelation(DateTime date, {DateTime? now}) {
  final today = now ?? DateTime.now();
  final target = DateTime(
    date.toLocal().year,
    date.toLocal().month,
    date.toLocal().day,
  );
  final base = DateTime(today.year, today.month, today.day);
  final days = target.difference(base).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Tomorrow';
  if (days == -1) return 'Yesterday';
  return fullDay(date);
}
