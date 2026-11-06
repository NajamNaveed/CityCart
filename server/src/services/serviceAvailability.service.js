const ServiceAvailability = require('../models/serviceAvailability.model');
const { karachiDateKey, karachiMinuteOfDay, karachiParts, WEEKDAYS } = require('../utils/karachiTime');

/**
 * Provider availability (docs/24 §4.4).
 *
 * Windows are weekly and use Karachi wall-clock minutes. A provider with no
 * windows has not published availability yet: requests are accepted and the
 * provider can still propose another time. Once windows exist, a request must
 * sit fully inside one of them and not on a blackout date.
 */
class ServiceAvailabilityError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_WINDOWS = 21; // three windows per day
const MAX_BLACKOUT = ServiceAvailability.MAX_BLACKOUT_DATES;

const minuteLabel = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function serializeAvailability(doc) {
  const windows = doc ? doc.windows : [];
  return {
    windows: [...windows]
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
      .map((w) => ({
        weekday: w.weekday,
        weekdayName: WEEKDAYS[w.weekday],
        startMinute: w.startMinute,
        endMinute: w.endMinute,
        start: minuteLabel(w.startMinute),
        end: minuteLabel(w.endMinute),
        slotMinutes: w.slotMinutes,
      })),
    blackoutDates: [...(doc ? doc.blackoutDates : [])].sort(),
    updatedAt: doc ? doc.updatedAt : null,
    // The customer booking form shows a short explanation when the provider
    // has not opened any hours yet.
    isPublished: windows.length > 0,
  };
}

async function getAvailability(providerId) {
  const doc = await ServiceAvailability.findOne({ providerId });
  return serializeAvailability(doc);
}

/** Rejects two windows of the same weekday that share minutes. */
function assertNoOverlaps(windows) {
  const byDay = new Map();
  for (const w of windows) {
    const list = byDay.get(w.weekday) || [];
    list.push(w);
    byDay.set(w.weekday, list);
  }
  for (const [weekday, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        throw new ServiceAvailabilityError(
          400,
          `${WEEKDAYS[weekday]} has overlapping hours (${minuteLabel(sorted[i - 1].startMinute)}–${minuteLabel(
            sorted[i - 1].endMinute
          )} and ${minuteLabel(sorted[i].startMinute)}–${minuteLabel(sorted[i].endMinute)}).`,
          'OVERLAPPING_WINDOWS'
        );
      }
    }
  }
}

async function replaceAvailability(providerId, { windows = [], blackoutDates = [] }) {
  if (windows.length > MAX_WINDOWS) {
    throw new ServiceAvailabilityError(400, `At most ${MAX_WINDOWS} weekly windows are allowed.`);
  }
  assertNoOverlaps(windows);

  const uniqueDates = [...new Set(blackoutDates)].sort();
  if (uniqueDates.length > MAX_BLACKOUT) {
    throw new ServiceAvailabilityError(400, `At most ${MAX_BLACKOUT} blackout dates are allowed.`);
  }

  const doc = await ServiceAvailability.findOneAndUpdate(
    { providerId },
    {
      $set: {
        windows: [...windows].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
        blackoutDates: uniqueDates,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return serializeAvailability(doc);
}

/**
 * The requested slot must be a future instant no more than 60 days away, and
 * (when the provider published hours) inside a window on a non-blackout day.
 * Returns the computed end instant.
 */
function assertSlotWithinAvailability(availability, start, durationMinutes, { now = new Date(), maxAdvanceDays = 60 } = {}) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  if (Number.isNaN(startDate.getTime())) {
    throw new ServiceAvailabilityError(400, 'Choose a valid date and time.', 'INVALID_SLOT');
  }
  if (startDate.getTime() <= now.getTime()) {
    throw new ServiceAvailabilityError(400, 'Choose a time in the future.', 'SLOT_IN_PAST');
  }
  if (startDate.getTime() > now.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000) {
    throw new ServiceAvailabilityError(400, `Choose a time within the next ${maxAdvanceDays} days.`, 'SLOT_TOO_FAR');
  }

  const windows = availability && availability.windows ? availability.windows : [];
  if (windows.length === 0) {
    return { start: startDate, end: endDate };
  }

  const parts = karachiParts(startDate);
  const dayKey = karachiDateKey(startDate);
  if (availability.blackoutDates.includes(dayKey)) {
    throw new ServiceAvailabilityError(400, 'The provider is not available on that day.', 'BLACKOUT_DATE');
  }

  const startMinute = karachiMinuteOfDay(startDate);
  // A job that runs past midnight does not fit a same-day window.
  const endMinute = startMinute + durationMinutes;
  const fits = windows.some(
    (w) => w.weekday === parts.weekday && startMinute >= w.startMinute && endMinute <= w.endMinute
  );
  if (!fits) {
    throw new ServiceAvailabilityError(
      400,
      'That time is outside the provider’s working hours. Pick one of the offered times or ask for another.',
      'OUTSIDE_AVAILABILITY'
    );
  }
  return { start: startDate, end: endDate };
}

/** Loads the raw document for booking validation (null when not configured). */
async function rawAvailability(providerId) {
  return ServiceAvailability.findOne({ providerId });
}

module.exports = {
  ServiceAvailabilityError,
  serializeAvailability,
  getAvailability,
  replaceAvailability,
  assertSlotWithinAvailability,
  rawAvailability,
  MAX_WINDOWS,
  MAX_BLACKOUT,
};
