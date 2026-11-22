/**
 * The promise check (docs/29 Phase 3d-5).
 *
 * Two questions, both answered from this shop's own records: how long its
 * deliveries actually take, and whether that fits the timeframe the shop itself
 * prints on its settings page. Every duration here is a subtraction between two
 * timestamps the order already carried — `createdAt` and a `statusHistory` entry
 * — so the shop reads its own log, not a model's impression of it.
 *
 * What is deliberately NOT here:
 *  - a promise that was never written down. `Brand.settings.estimatedDeliveryTime`
 *    is free text, and text that does not state a number of minutes, hours or
 *    days is reported as unreadable rather than guessed at. An invented promise
 *    would turn the shop's own words into a breach it never agreed to.
 *  - lateness inferred from a missing timestamp. An order with no `DELIVERED`
 *    entry in its history is counted as unmeasurable, never as on time.
 *  - money. No revenue, fee or payout field is read, so a slow week cannot
 *    become a financial claim.
 */

// The steps a shop can only have reached after someone worked on the order, and
// the two sets the stage table measures between. `DELIVERED` is deliberately in
// none of them: an order whose history holds nothing but the delivery timestamp
// has no recorded handling step, and treating the delivery itself as one would
// print a 0-minute stage the shop never had.
const FIRST_MOVE_STATUSES = ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY'];
const HANDLED_STATUSES = ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED'];
const ON_ROAD_STATUSES = ['OUT_FOR_DELIVERY'];
const OPEN_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY'];
const DEAD_STATUSES = ['CANCELLED', 'REJECTED'];

const UNIT_MINUTES = {
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  h: 60,
  day: 1440,
  days: 1440,
  d: 1440,
  week: 10080,
  weeks: 10080,
};

// A delivery promise longer than a month is not a delivery promise, and a stray
// "9999 hours" in a settings box must not become the yardstick for everything.
const MAX_PROMISE_MINUTES = 30 * 1440;

const PROMISE_TEXT_LIMIT = 100;
const SLOWEST_ROWS = 3;
const DAY_ROWS = 7;
const HOUR = 60;

function round(value) {
  return Math.round(Number(value) || 0);
}

function hoursOf(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return Math.round((minutes / HOUR) * 10) / 10;
}

function dateOf(value) {
  return value ? new Date(value) : null;
}

function minutesBetween(from, to) {
  const start = dateOf(from);
  const end = dateOf(to);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = (end.getTime() - start.getTime()) / 60000;
  // A clock that runs backwards is bad data, not a delivery made before it was
  // ordered, so the pair is left unmeasured instead of averaged as zero.
  if (minutes < 0) return null;
  return Math.round(minutes);
}

const NUMBER = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(minutes?|mins?|hours?|hrs?|days?|weeks?|h|d)';
const SEPARATOR = '(?:-|to)';
const PAIR_RE = new RegExp(`${NUMBER}\\s*${UNIT}\\b`, 'g');
const RANGE_ONE_UNIT_RE = new RegExp(`${NUMBER}\\s*${SEPARATOR}\\s*${NUMBER}\\s*${UNIT}\\b`);
const RANGE_TWO_UNIT_RE = new RegExp(`${NUMBER}\\s*${UNIT}\\s*${SEPARATOR}\\s*${NUMBER}\\s*${UNIT}\\b`);

function minutesOf(value, unit) {
  const factor = UNIT_MINUTES[unit];
  if (!factor) return null;
  const minutes = Number(value) * factor;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * The shop's own promise text read for a number. Only two shapes are trusted:
 * one duration ("48 hours", "2 days") and one range ("24-48 hours", "30 minutes
 * to 2 hours"). The upper end of a range is the yardstick, because a shop that
 * promised 24-48 hours keeps its promise at 48 — measuring it against 24 would
 * accuse it of a breach it never agreed to.
 *
 * Anything else — no number at all, two timeframes with no range word between
 * them, or a figure past a month — is refused with the reason printed, because a
 * mis-read promise turns the shop's own words into a violation of CityCart's
 * making.
 */
function parsePromise(text) {
  const raw =
    typeof text === 'string'
      ? text.trim().slice(0, PROMISE_TEXT_LIMIT)
      : text === null || text === undefined
        ? ''
        : String(text).trim().slice(0, PROMISE_TEXT_LIMIT);

  const normalized = raw.toLowerCase().replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  const refuse = (reason, note) => ({
    text: raw,
    reason,
    readable: null,
    minutes: null,
    hours: null,
    fromMinutes: null,
    fromHours: null,
    note,
  });

  if (!normalized) {
    return refuse('NOT_WRITTEN', 'No delivery timeframe is written in this shop’s settings, so nothing here is called late.');
  }

  let bounds = null;
  let reason = 'RANGE';
  const oneUnitRange = RANGE_ONE_UNIT_RE.exec(normalized);
  const twoUnitRange = RANGE_TWO_UNIT_RE.exec(normalized);
  if (oneUnitRange) {
    bounds = [minutesOf(oneUnitRange[1], oneUnitRange[3]), minutesOf(oneUnitRange[2], oneUnitRange[3])];
  } else if (twoUnitRange) {
    bounds = [minutesOf(twoUnitRange[1], twoUnitRange[2]), minutesOf(twoUnitRange[3], twoUnitRange[4])];
  } else {
    const pairs = [...normalized.matchAll(PAIR_RE)]
      .map((match) => minutesOf(match[1], match[2]))
      .filter((minutes) => minutes !== null);
    if (pairs.length === 1) {
      bounds = [pairs[0], pairs[0]];
      reason = 'SINGLE';
    } else if (pairs.length > 1) {
      return refuse(
        'AMBIGUOUS',
        `“${raw}” states more than one timeframe with no “to” or dash between them, so CityCart cannot tell which end is the promise. Nothing here is called late.`,
      );
    } else {
      return refuse(
        'NO_TIMEFRAME',
        `“${raw}” does not say how many minutes, hours or days a delivery should take, so nothing here is called late. Writing a number — “24 hours” or “2-3 days” — turns this into a measured rate.`,
      );
    }
  }

  if (bounds.some((minutes) => minutes === null)) {
    return refuse('NO_TIMEFRAME', `“${raw}” was not recognised as a timeframe, so nothing here is called late.`);
  }
  const lower = Math.min(...bounds);
  const upper = Math.max(...bounds);
  if (upper > MAX_PROMISE_MINUTES) {
    return refuse(
      'OUT_OF_RANGE',
      `“${raw}” is longer than the 30 days CityCart will measure a delivery promise against, so nothing here is called late.`,
    );
  }

  return {
    text: raw,
    reason,
    readable: lower === upper ? describeMinutes(upper) : `${describeMinutes(lower)}–${describeMinutes(upper)}`,
    minutes: upper,
    hours: hoursOf(upper),
    fromMinutes: lower,
    fromHours: hoursOf(lower),
    note:
      lower === upper
        ? `Every rate below is measured against the ${describeMinutes(upper)} this shop wrote in its settings.`
        : `“${raw}” is read as ${describeMinutes(lower)} to ${describeMinutes(upper)}, and lateness is measured against the ${describeMinutes(upper)} end — the only honest test of a range this shop may keep.`,
  };
}

function describeMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'no time';
  if (minutes < HOUR) return `${round(minutes)} minute${round(minutes) === 1 ? '' : 's'}`;
  if (minutes < 1440) {
    const hours = hoursOf(minutes);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The same minutes as words, or null when nothing was measured. Every duration
 * this feature publishes carries its wording beside its number so the panel and
 * the model read one string rather than each formatting the number themselves.
 */
function wordsOf(minutes) {
  return Number.isFinite(minutes) ? describeMinutes(minutes) : null;
}

function historyOf(order) {
  return (order && order.statusHistory ? order.statusHistory : [])
    .map((entry) => ({ status: entry.status, at: dateOf(entry.at) }))
    .filter((entry) => entry.at && !Number.isNaN(entry.at.getTime()));
}

function firstAt(order, statuses) {
  const entries = historyOf(order).filter((entry) => statuses.includes(entry.status));
  if (!entries.length) return null;
  return entries.reduce((earliest, entry) => (earliest && earliest < entry.at ? earliest : entry.at), null);
}

function lastAt(order, statuses) {
  const entries = historyOf(order).filter((entry) => statuses.includes(entry.status));
  if (!entries.length) return null;
  return entries.reduce((latest, entry) => (latest && latest > entry.at ? latest : entry.at), null);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function durationOf(order) {
  return minutesBetween(order.createdAt, lastAt(order, ['DELIVERED']));
}

/**
 * One stage of the shop's own pipeline, measured only across the orders that
 * recorded both ends. `measured` is published with every figure so a stage that
 * only three orders ever went through is not read as the shop's normal speed.
 */
function stageOf(key, label, orders, from, to) {
  const values = orders
    .map((order) => minutesBetween(from(order), to(order)))
    .filter((value) => value !== null);
  const measuredFrom =
    key === 'placed' ? 'the order being placed' : 'the step before it in the shop’s own history';
  return {
    key,
    label,
    measured: values.length,
    medianMinutes: median(values),
    medianText: wordsOf(median(values)),
    medianHours: hoursOf(median(values)),
    averageMinutes: average(values),
    averageText: wordsOf(average(values)),
    note: values.length
      ? `Measured on ${values.length} of ${orders.length} delivered orders, counted from ${measuredFrom}.`
      : 'No delivered order in this window has both of these timestamps, so this stage is not measured.',
  };
}

function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

const DAY_MS = 86400000;

/** Every whole UTC day a resolved range covers, oldest first. `to` is exclusive. */
function dayKeys(range) {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const count = Math.round((to - from) / DAY_MS);
  if (!Number.isFinite(count) || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => utcDay(new Date(from + index * DAY_MS)));
}

/**
 * Days read newest first, and only the days that delivered something: a day with
 * no delivery is not a slow day, it is a quiet one, and the tiles above already
 * say that. `late` is counted only when the shop really wrote a promise down.
 */
function byDayOf(delivered, promiseMinutes) {
  const rows = new Map();
  for (const order of delivered) {
    const minutes = durationOf(order);
    if (minutes === null) continue;
    const key = utcDay(order.createdAt);
    const row = rows.get(key) || { date: key, delivered: 0, late: null, durations: [] };
    row.delivered += 1;
    if (promiseMinutes !== null) row.late = (row.late || 0) + (minutes > promiseMinutes ? 1 : 0);
    row.durations.push(minutes);
    rows.set(key, row);
  }
  return [...rows.values()]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    .map((row) => ({
      date: row.date,
      delivered: row.delivered,
      late: row.late,
      medianMinutes: median(row.durations),
      medianText: wordsOf(median(row.durations)),
      medianHours: hoursOf(median(row.durations)),
    }));
}

function buildPromiseCheck({ days, range, now, promiseText, orders, sampled = false }) {
  const rows = orders || [];
  const delivered = rows.filter((order) => order.orderStatus === 'DELIVERED');
  const open = rows.filter((order) => OPEN_STATUSES.includes(order.orderStatus));
  const dead = rows.filter((order) => order.orderStatus && DEAD_STATUSES.includes(order.orderStatus));
  const measuredDurations = delivered.map(durationOf).filter((value) => value !== null);
  const missingHistory = delivered.length - measuredDurations.length;
  const clock = dateOf(now) || new Date();
  const promise = parsePromise(promiseText);

  const onTime =
    promise.minutes === null || !measuredDurations.length
      ? null
      : measuredDurations.filter((minutes) => minutes <= promise.minutes).length;
  const late = onTime === null ? null : measuredDurations.length - onTime;

  const slowest = delivered
    .map((order) => ({ order, minutes: durationOf(order) }))
    .filter((row) => row.minutes !== null)
    .sort((a, b) => b.minutes - a.minutes || String(a.order._id).localeCompare(String(b.order._id)))
    .slice(0, SLOWEST_ROWS)
    .map((row) => {
      const overPromise = promise.minutes === null ? null : Math.max(0, row.minutes - promise.minutes);
      return {
        orderId: String(row.order._id),
        date: utcDay(row.order.createdAt),
        minutes: row.minutes,
        minutesText: wordsOf(row.minutes),
        hours: hoursOf(row.minutes),
        overPromiseMinutes: overPromise,
        // Spelled out rather than left as a 0 the panel has to interpret: an
        // order inside the promise is not "0 minutes late".
        overPromiseText:
          overPromise === null ? null : overPromise > 0 ? `${wordsOf(overPromise)} past the promise` : 'inside the promise',
      };
    });

  const openAges = open
    .map((order) => minutesBetween(order.createdAt, clock))
    .filter((value) => value !== null);
  const openOverPromise = promise.minutes === null ? null : openAges.filter((minutes) => minutes > promise.minutes).length;

  const statuses = new Map();
  for (const order of open) {
    statuses.set(order.orderStatus, (statuses.get(order.orderStatus) || 0) + 1);
  }

  const windowDays = dayKeys(range);
  const dayRows = byDayOf(delivered, promise.minutes);
  const fastestMinutes = measuredDurations.length ? Math.min(...measuredDurations) : null;
  const slowestMinutes = measuredDurations.length ? Math.max(...measuredDurations) : null;
  const oldestOpenMinutes = openAges.length ? Math.max(...openAges) : null;

  return {
    window: {
      days,
      from: windowDays[0] || null,
      to: windowDays[windowDays.length - 1] || null,
      partialLastDay: windowDays[windowDays.length - 1] || null,
      now: clock.toISOString(),
    },
    promise,
    delivered: {
      orders: delivered.length,
      measured: measuredDurations.length,
      missingHistory,
      onTime,
      late,
      pct: measuredDurations.length && onTime !== null ? Math.round((onTime / measuredDurations.length) * 100) : null,
      medianMinutes: median(measuredDurations),
      medianText: wordsOf(median(measuredDurations)),
      medianHours: hoursOf(median(measuredDurations)),
      averageMinutes: average(measuredDurations),
      averageText: wordsOf(average(measuredDurations)),
      averageHours: hoursOf(average(measuredDurations)),
      fastestMinutes,
      fastestText: wordsOf(fastestMinutes),
      slowestMinutes,
      slowestText: wordsOf(slowestMinutes),
    },
    stages: [
      stageOf(
        'placed',
        'Placed to first handling step',
        delivered,
        (order) => order.createdAt,
        (order) => firstAt(order, FIRST_MOVE_STATUSES),
      ),
      stageOf(
        'handling',
        'First handling step to on the road',
        delivered,
        (order) => firstAt(order, HANDLED_STATUSES),
        (order) => firstAt(order, ON_ROAD_STATUSES),
      ),
      stageOf(
        'onTheRoad',
        'On the road to the door',
        delivered,
        (order) => firstAt(order, ON_ROAD_STATUSES),
        (order) => lastAt(order, ['DELIVERED']),
      ),
    ],
    byDay: dayRows.slice(0, DAY_ROWS),
    daysWithDeliveries: dayRows.length,
    daysOmitted: Math.max(0, dayRows.length - DAY_ROWS),
    open: {
      orders: open.length,
      overPromise: openOverPromise,
      oldestMinutes: oldestOpenMinutes,
      oldestText: wordsOf(oldestOpenMinutes),
      oldestHours: hoursOf(oldestOpenMinutes),
      medianMinutes: median(openAges),
      medianText: wordsOf(median(openAges)),
      statuses: [...statuses.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([status, count]) => ({ status, count })),
    },
    dead: {
      orders: dead.length,
      pct: rows.length ? Math.round((dead.length / rows.length) * 100) : null,
    },
    slowest,
    orders: rows.length,
    sampled: Boolean(sampled),
    empty: rows.length === 0,
    // Branch-level promises need a branch on the order and a timeframe on the
    // branch; neither field exists yet (docs/29 3d-5 note), so this read is
    // honestly the whole shop and says so instead of splitting by guesswork.
    scope: {
      branches: null,
      note: 'This is the whole shop. CityCart does not yet record which branch promised an order, so no branch is measured on its own.',
    },
    readable: {
      median: wordsOf(median(measuredDurations)),
      promise: promise.readable,
    },
  };
}

module.exports = {
  buildPromiseCheck,
  parsePromise,
  describeMinutes,
  wordsOf,
  durationOf,
  firstAt,
  lastAt,
  median,
  average,
  minutesBetween,
  dayKeys,
  byDayOf,
  hoursOf,
  HANDLED_STATUSES,
  FIRST_MOVE_STATUSES,
  ON_ROAD_STATUSES,
  OPEN_STATUSES,
  DEAD_STATUSES,
  MAX_PROMISE_MINUTES,
  PROMISE_TEXT_LIMIT,
  SLOWEST_ROWS,
  DAY_ROWS,
};
