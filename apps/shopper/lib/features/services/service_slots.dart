import '../../data/models.dart';

/// Providers publish working hours in Karachi wall-clock time, while a booking
/// is stored as a UTC instant. Pakistan has used a fixed UTC+5 offset since
/// 2009, so a fixed shift is exact and avoids depending on the phone's zone.
const karachiOffset = Duration(hours: 5);

/// The server accepts a booking at most this many days ahead.
const serviceAdvanceDays = 60;

/// The Karachi calendar date, as a UTC midnight so date maths never drifts.
DateTime karachiToday(DateTime nowUtc) {
  final wall = nowUtc.toUtc().add(karachiOffset);
  return DateTime.utc(wall.year, wall.month, wall.day);
}

String serviceDateKey(DateTime day) {
  final month = day.month.toString().padLeft(2, '0');
  final date = day.day.toString().padLeft(2, '0');
  return '${day.year}-$month-$date';
}

/// The server counts Sunday as 0; Dart counts Monday as 1.
int serviceWeekday(DateTime day) => day.weekday % 7;

/// The instant a Karachi wall-clock minute happens on [day].
DateTime serviceInstant(DateTime day, int minuteOfDay) {
  return DateTime.utc(
    day.year,
    day.month,
    day.day,
  ).add(Duration(minutes: minuteOfDay)).subtract(karachiOffset);
}

/// Fourteen day chips, starting with today in Karachi.
List<DateTime> serviceDayOptions(DateTime nowUtc, {int count = 14}) {
  final today = karachiToday(nowUtc);
  return List<DateTime>.generate(
    count,
    (index) => today.add(Duration(days: index)),
    growable: false,
  );
}

/// The open times on one day that fit the whole job. When the provider has not
/// published hours, the server accepts any future time, so a calm set of
/// suggested times is offered instead of a wall of clock values.
List<DateTime> serviceSlotsFor({
  required DateTime day,
  required ServiceAvailability availability,
  required int durationMinutes,
  required DateTime nowUtc,
}) {
  final today = karachiToday(nowUtc);
  final lastDay = today.add(const Duration(days: serviceAdvanceDays - 1));
  if (day.isBefore(today) || day.isAfter(lastDay)) return const [];
  if (availability.isBlackout(serviceDateKey(day))) return const [];

  if (!availability.isPublished) {
    return _fallbackSlots(day, nowUtc);
  }

  final windows = availability.windows
      .where((window) => window.weekday == serviceWeekday(day))
      .toList(growable: false);
  if (windows.isEmpty) return const [];

  final latest = nowUtc.toUtc().add(const Duration(days: serviceAdvanceDays));
  final seen = <DateTime>{};
  final slots = <DateTime>[];
  for (final window in windows) {
    final step = window.slotMinutes < 15 ? 15 : window.slotMinutes;
    for (
      var minute = window.startMinute;
      minute + durationMinutes <= window.endMinute;
      minute += step
    ) {
      final start = serviceInstant(day, minute);
      if (!start.isAfter(nowUtc)) continue;
      if (start.isAfter(latest)) continue;
      if (seen.add(start)) slots.add(start);
    }
  }
  slots.sort();
  return slots;
}

const _suggestedMinutes = [8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60];

List<DateTime> _fallbackSlots(DateTime day, DateTime nowUtc) {
  final latest = nowUtc.toUtc().add(const Duration(days: serviceAdvanceDays));
  return [
    for (final minute in _suggestedMinutes)
      if (serviceInstant(day, minute).isAfter(nowUtc) &&
          !serviceInstant(day, minute).isAfter(latest))
        serviceInstant(day, minute),
  ];
}

/// The first day with an open slot, so the form never opens on an empty day.
DateTime? firstServiceDay({
  required ServiceProvider provider,
  required int durationMinutes,
  required DateTime nowUtc,
  int maxDays = 60,
}) {
  final first = karachiToday(nowUtc);
  for (var offset = 0; offset < maxDays; offset++) {
    final day = first.add(Duration(days: offset));
    final slots = serviceSlotsFor(
      day: day,
      availability: provider.availability,
      durationMinutes: durationMinutes,
      nowUtc: nowUtc,
    );
    if (slots.isNotEmpty) return day;
  }
  return null;
}

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String serviceWeekdayLabel(DateTime day) => _weekdays[day.weekday - 1];

String serviceDateLabel(DateTime day) => '${day.day} ${_months[day.month - 1]}';

/// "Today", "Tomorrow", then the weekday.
String serviceDayLabel(DateTime day, DateTime today) {
  final difference = day.difference(today).inDays;
  if (difference == 0) return 'Today';
  if (difference == 1) return 'Tomorrow';
  return serviceWeekdayLabel(day);
}

/// "9:00 AM" in Karachi, whatever the phone's own time zone is.
String formatKarachiTime(DateTime instant) {
  final wall = instant.toUtc().add(karachiOffset);
  final hour = wall.hour;
  final hour12 = hour == 0
      ? 12
      : hour > 12
      ? hour - 12
      : hour;
  final minute = wall.minute.toString().padLeft(2, '0');
  final suffix = hour < 12 ? 'AM' : 'PM';
  return '$hour12:$minute $suffix';
}

/// "9:00 AM – 6:00 PM" from the minutes the server sends.
String formatKarachiWindow(int startMinute, int endMinute) {
  String label(int minute) {
    final hour = minute ~/ 60;
    final hour12 = hour == 0
        ? 12
        : hour > 12
        ? hour - 12
        : hour;
    final minutePart = (minute % 60).toString().padLeft(2, '0');
    final suffix = hour < 12 ? 'AM' : 'PM';
    return '$hour12:$minutePart $suffix';
  }

  return '${label(startMinute)} – ${label(endMinute)}';
}
