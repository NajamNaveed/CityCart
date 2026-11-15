/**
 * Bookable service times (docs/24 §4.4), the server-side twin of
 * `client/src/utils/serviceSlots.js`.
 *
 * Providers publish weekly windows in Karachi wall-clock minutes. The
 * assistant must suggest only times a shopper could really book, so the server
 * generates them itself instead of trusting a time the model writes down.
 */
const { OFFSET_MINUTES } = require('./karachiTime');

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = OFFSET_MINUTES * 60 * 1000;

// Karachi parts of a day: morning before noon, afternoon until 5 pm, evening after.
const PARTS = {
  morning: [0, 720],
  afternoon: [720, 1020],
  evening: [1020, 1440],
};

const pad2 = (n) => String(n).padStart(2, '0');

function karachiDay(offsetDays, nowMs) {
  const shifted = new Date(nowMs + OFFSET_MS + offsetDays * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function karachiKey(day) {
  return `${day.year}-${pad2(day.month)}-${pad2(day.day)}`;
}

function minuteLabel(minutes) {
  const total = ((Number(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const suffix = hours >= 12 ? 'pm' : 'am';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${pad2(rest)} ${suffix}`;
}

const dayLabelFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const labelFor = (day) => dayLabelFormat.format(new Date(Date.UTC(day.year, day.month - 1, day.day)));

/**
 * Every bookable start for the next `days` days, honouring the published
 * windows, the slot step, blackout dates and the current time. An empty list
 * means the provider has not published hours (or has none left in range).
 */
function availableSlots(availability, durationMinutes, { days = 10, nowMs = Date.now() } = {}) {
  const windows = availability && Array.isArray(availability.windows) ? availability.windows : [];
  if (windows.length === 0) return [];
  const blackout = new Set(availability.blackoutDates || []);
  const duration = Number(durationMinutes) || 60;
  const slots = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = karachiDay(offset, nowMs);
    const key = karachiKey(day);
    if (blackout.has(key)) continue;

    const dayWindows = windows
      .filter((window) => window.weekday === day.weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    if (dayWindows.length === 0) continue;

    const dateLabel = labelFor(day);
    for (const window of dayWindows) {
      const step = window.slotMinutes || 60;
      for (let minute = window.startMinute; minute + duration <= window.endMinute; minute += step) {
        const startMs = Date.UTC(day.year, day.month - 1, day.day, Math.floor(minute / 60), minute % 60) - OFFSET_MS;
        if (startMs <= nowMs) continue;
        slots.push({
          start: new Date(startMs).toISOString(),
          label: `${dateLabel} · ${minuteLabel(minute)}`,
          dateKey: key,
          startMinute: minute,
        });
      }
    }
  }
  return slots;
}

/**
 * Narrows generated slots to a day offset (0 = today in Karachi) and/or a part
 * of the day. Unknown parts are ignored so a model typo cannot hide every slot.
 */
function filterSlots(slots, { day = null, part = null, nowMs = Date.now() } = {}) {
  let result = slots;
  if (Number.isInteger(day)) {
    const key = karachiKey(karachiDay(day, nowMs));
    result = result.filter((slot) => slot.dateKey === key);
  }
  const range = PARTS[part];
  if (range) {
    result = result.filter((slot) => slot.startMinute >= range[0] && slot.startMinute < range[1]);
  }
  return result;
}

module.exports = { availableSlots, filterSlots, minuteLabel, karachiDay, karachiKey, PARTS };
