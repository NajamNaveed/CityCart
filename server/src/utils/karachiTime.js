/**
 * Asia/Karachi calendar helpers (docs/24 D1, D14).
 *
 * Pakistan is UTC+5 all year (no daylight saving), so fixed-offset arithmetic
 * is exact and avoids pulling in a timezone library. A stored Date is shifted
 * by five hours and then read with the UTC getters: those getters then return
 * the wall-clock values a person in Karachi would see.
 */
const OFFSET_MINUTES = 5 * 60;
const MINUTES_PER_DAY = 24 * 60;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function shifted(date) {
  return new Date(new Date(date).getTime() + OFFSET_MINUTES * 60 * 1000);
}

function karachiParts(date) {
  const d = shifted(date);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    weekdayName: WEEKDAYS[d.getUTCDay()],
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' in Karachi. */
function karachiDateKey(date) {
  const { year, month, day } = karachiParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 'YYYY-MM' in Karachi — the billing/ranking calendar month. */
function karachiMonthKey(date) {
  const { year, month } = karachiParts(date);
  return `${year}-${pad(month)}`;
}

/** The instant of 00:00 Karachi on the 1st of that month. */
function startOfKarachiMonth(date) {
  const { year, month } = karachiParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - OFFSET_MINUTES * 60 * 1000);
}

/** Minutes since midnight in Karachi, used against availability windows. */
function karachiMinuteOfDay(date) {
  return karachiParts(date).minuteOfDay;
}

module.exports = {
  OFFSET_MINUTES,
  MINUTES_PER_DAY,
  WEEKDAYS,
  karachiParts,
  karachiDateKey,
  karachiMonthKey,
  startOfKarachiMonth,
  karachiMinuteOfDay,
};
