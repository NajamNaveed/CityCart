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

/// Reads a price typed in rupees and returns integer paisa, or null when the
/// text is not a usable amount.
int? paisaFromRupees(String raw) {
  final cleaned = raw.replaceAll(',', '').replaceAll('Rs', '').trim();
  if (cleaned.isEmpty) return null;
  final value = double.tryParse(cleaned);
  if (value == null || value < 0 || value > 10000000) return null;
  return (value * 100).round();
}

/// A price for a text field: no symbol and no thousands separators.
String rupeesField(int paisa) {
  final value = paisa / 100;
  return value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : value.toStringAsFixed(2);
}

/// Shop prices cross the API in decimal rupees; the app works in paisa.
double rupeesFromPaisa(int paisa) => paisa / 100;

String dayLabel(DateTime date) =>
    DateFormat('EEE d MMM').format(date.toLocal());

/// A duration in minutes as an owner reads it: "45 min", "1 hr", "1 hr 30 min".
String durationLabel(int minutes) {
  if (minutes <= 0) return '—';
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return '$rest min';
  if (rest == 0) return '$hours hr';
  return '$hours hr $rest min';
}

/// A wall-clock minute (0–1440) as "9:00 AM" / "5:30 PM".
String minuteLabel(int minutes) {
  final clamped = minutes.clamp(0, 1440);
  final hour = (clamped ~/ 60) % 24;
  final minute = clamped % 60;
  final period = hour < 12 ? 'AM' : 'PM';
  final displayHour = hour % 12 == 0 ? 12 : hour % 12;
  return '$displayHour:${minute.toString().padLeft(2, '0')} $period';
}

String fullDay(DateTime date) =>
    DateFormat('EEEE d MMMM').format(date.toLocal());

String timeLabel(DateTime date) => DateFormat.jm().format(date.toLocal());

String dateTimeLabel(DateTime date) =>
    DateFormat('d MMM, h:mm a').format(date.toLocal());

/// The time under a chat message.
String chatTime(DateTime date) => DateFormat.jm().format(date.toLocal());

/// The time on an inbox row: the clock for today, "Yesterday", then a date.
String inboxTime(DateTime date, {DateTime? now}) {
  final current = now ?? DateTime.now();
  if (sameDay(date, current)) return chatTime(date);
  if (sameDay(date, current.subtract(const Duration(days: 1)))) {
    return 'Yesterday';
  }
  final local = date.toLocal();
  return local.year == current.year
      ? DateFormat('d MMM').format(local)
      : DateFormat('d MMM yyyy').format(local);
}

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
