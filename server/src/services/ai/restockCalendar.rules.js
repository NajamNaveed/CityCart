/**
 * The arithmetic half of the restock calendar (docs/29 Phase 3d-2), pure on
 * purpose: the model is never allowed to average, compare or estimate, so every
 * figure a shop may see — weekly units, the jump against the shop's own earlier
 * weeks, weeks of cover, how many units would fill the next fortnight — is
 * worked out here and tested here.
 *
 * Demand is what this shop actually delivered: units from the `items` of its own
 * DELIVERED orders, which is the same order set the analytics dashboard counts
 * as revenue. Refused or cancelled goods are not demand met, so they are not
 * counted here either.
 *
 * Weeks are complete Monday-to-Monday UTC weeks, so no bar in the trend is a
 * part-week pretending to be a full one. The current week is therefore excluded
 * entirely, and the panel says so.
 *
 * Cover uses `quantity - reservedQuantity`, the same available stock the
 * inventory service computes and the dashboard's stock alerts use, so this can
 * never read "in stock" about something already promised to a cart.
 */

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
// Monday 5 January 1970. The aggregation measures each order's week as the
// number of Monday boundaries since this instant, and `weekIndexOf` below does
// the same arithmetic in JavaScript, so a bucket and a label can never drift.
const WEEK_EPOCH_UTC = Date.UTC(1970, 0, 5);

const DEFAULT_WEEKS = 8;
const MIN_WEEKS = 4;
const MAX_WEEKS = 13;
// Restocking is planned a fortnight ahead; that is the horizon the suggested
// units fill. It is printed with the number, so the shop knows what the figure
// means rather than being handed a magic quantity.
const COVER_HORIZON_WEEKS = 2;
// Half again the shop's own usual weekly rate is the point where "more than
// usual" becomes worth saying out loud.
const SPIKE_PCT = 50;
// A single week at twice the average is the shape of a festival or month-end
// rush, which is what this panel exists to catch before it happens again.
const SURGE_MULTIPLE = 2;

const ATTENTION = {
  EMPTY_NOW: 'empty now',
  RUNS_SHORT: 'runs out within a fortnight',
  JUST_SPIKED: 'sold far more last week',
  RUSH_BEFORE: 'had a rush week earlier in the window',
  SELLING: 'selling steadily',
  NOT_TRACKED: 'stock is not tracked',
};

// How many selling SKUs one calendar is measured over. The window's stock rows
// are read for exactly this set, so a shop with a very large catalogue is told
// it saw a limited set rather than being shown a partial one as if it were all.
const PRODUCT_LIMIT = 200;
// Rows the panel prints and the prompt is handed — one number for both.
const SHOWN_ROWS = 12;

const TIER_ORDER = ['EMPTY_NOW', 'RUNS_SHORT', 'JUST_SPIKED', 'RUSH_BEFORE', 'SELLING', 'NOT_TRACKED'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const whole = (value) => Math.max(0, Math.round(Number(value) || 0));
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

/** Monday-week index of a date, matching the aggregation's `$dateDiff`. */
function weekIndexOf(date) {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Math.floor((time - WEEK_EPOCH_UTC) / WEEK);
}

function weekStart(date) {
  return new Date(WEEK_EPOCH_UTC + weekIndexOf(date) * WEEK);
}

/**
 * The `count` most recent COMPLETE weeks, oldest first. The last entry ends at
 * this week's Monday, so every week in the window is exactly seven days.
 */
function completeWeeks(count, now = new Date()) {
  const weeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(Number(count) || DEFAULT_WEEKS)));
  const thisMonday = weekStart(now).getTime();
  const out = [];
  for (let back = weeks; back >= 1; back -= 1) {
    const from = new Date(thisMonday - back * WEEK);
    out.push({ index: weekIndexOf(from), from, to: new Date(from.getTime() + WEEK) });
  }
  return out;
}

function dayLabel(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "3 Nov – 9 Nov" — a whole week, spelled as the seven days it covers. */
function weekLabel(week) {
  const from = new Date(week.from);
  const to = new Date(week.to.getTime() - DAY);
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

function newProductRow(productId, position) {
  return {
    productId,
    // The name is kept per week and the most recent one wins, so a listing the
    // shop renamed mid-window is shown with the name it has now.
    names: new Array(position.size).fill(''),
    weekly: new Array(position.size).fill(0),
  };
}

function stockStatusOf(stockRow, available) {
  if (!stockRow || stockRow.trackInventory === false) return 'UNTRACKED';
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= whole(stockRow.lowStockThreshold)) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function attentionOf(row) {
  if (!row.tracked) return 'NOT_TRACKED';
  if (row.availableQuantity <= 0) return 'EMPTY_NOW';
  if (row.coverWeeks !== null && row.coverWeeks < COVER_HORIZON_WEEKS) return 'RUNS_SHORT';
  if (row.spikePct !== null && row.spikePct >= SPIKE_PCT) return 'JUST_SPIKED';
  if (row.surge && !row.peakIsLastWeek) return 'RUSH_BEFORE';
  return 'SELLING';
}

function compareRows(a, b) {
  const tier = TIER_ORDER.indexOf(a.attention) - TIER_ORDER.indexOf(b.attention);
  if (tier !== 0) return tier;
  if (b.suggestedUnits !== a.suggestedUnits) return b.suggestedUnits - a.suggestedUnits;
  if (b.units !== a.units) return b.units - a.units;
  if (b.lastWeekUnits !== a.lastWeekUnits) return b.lastWeekUnits - a.lastWeekUnits;
  return a.productName.localeCompare(b.productName);
}

function shopTrend(weekRows, weeks) {
  const byIndex = new Map(weeks.map((week, position) => [week.index, { position, units: 0 }]));
  for (const row of weekRows || []) {
    const slot = row && byIndex.get(Number(row.week));
    if (!slot) continue;
    slot.units += whole(row.units);
  }
  return weeks.map((week, position) => ({
    position,
    index: week.index,
    label: weekLabel(week),
    from: week.from.toISOString(),
    to: week.to.toISOString(),
    units: byIndex.get(week.index).units,
    isLast: position === weeks.length - 1,
  }));
}

/**
 * The products a calendar is built from, best-selling first.
 *
 * A shop with thousands of live SKUs would otherwise make this read grow with
 * its catalogue, and the `Inventory` lookup has to be made for exactly the same
 * set. Doing the selection once, here, is what keeps the stock rows, the table
 * and the counts describing the same group of products.
 */
function selectTopProducts(rows, limit = PRODUCT_LIMIT) {
  const totals = new Map();
  for (const row of rows || []) {
    if (!row || row.productId == null) continue;
    const units = whole(row.units);
    if (units <= 0) continue;
    const key = String(row.productId);
    totals.set(key, (totals.get(key) || 0) + units);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([productId]) => productId);
}

/** How many products this shop actually delivered at least one unit of. */
function countSellingProducts(rows) {
  const ids = new Set();
  for (const row of rows || []) {
    if (!row || row.productId == null) continue;
    if (whole(row.units) <= 0) continue;
    ids.add(String(row.productId));
  }
  return ids.size;
}

/**
 * @param rows      per product per week: { productId, productName, week, units }
 * @param weekRows  shop-wide units per week: { week, units }
 * @param stock     this brand's Inventory rows for the products above
 * @param weeks     the aligned window from `completeWeeks`
 * @param window    { weeks, from, to } as read
 * @param deliveredOrders how many of this shop's orders were delivered in the window
 * @param showLimit   how many ranked rows the panel and the prompt both print
 */
function buildRestockCalendar({ rows, weekRows, stock, weeks, window, deliveredOrders = 0, showLimit = SHOWN_ROWS }) {
  const position = new Map(weeks.map((week, index) => [week.index, index]));
  const keep = new Set(selectTopProducts(rows));
  const products = new Map();

  const list = rows || [];
  for (const row of list) {
    if (!row || row.productId == null) continue;
    const key = String(row.productId);
    if (!keep.has(key)) continue;
    const slot = position.get(Number(row.week));
    if (slot === undefined) continue;
    const units = whole(row.units);
    if (units <= 0) continue;
    if (!products.has(key)) products.set(key, newProductRow(key, position));
    const entry = products.get(key);
    entry.weekly[slot] += units;
    const name = typeof row.productName === 'string' ? row.productName.trim() : '';
    if (name && !entry.names[slot]) entry.names[slot] = name;
  }

  const stockByKey = new Map();
  for (const item of stock || []) {
    if (!item || item.productId == null) continue;
    stockByKey.set(String(item.productId), item);
  }

  const trend = shopTrend(weekRows, weeks);
  const lastPosition = weeks.length - 1;

  const measured = [...products.values()].map((entry) => {
    const units = entry.weekly.reduce((sum, value) => sum + value, 0);
    const productName = [...entry.names].reverse().find((name) => name) || 'Unnamed product';
    const lastWeekUnits = entry.weekly[lastPosition];
    const earlier = entry.weekly.slice(0, lastPosition);
    const priorAvg = earlier.length ? round1(earlier.reduce((sum, value) => sum + value, 0) / earlier.length) : null;
    const avgWeeklyUnits = round1(units / weeks.length);

    const stockRow = stockByKey.get(entry.productId);
    const tracked = Boolean(stockRow) && stockRow.trackInventory !== false;
    // The raw difference, the way the analytics service and the stock alerts
    // read it, so a shop never sees two different availability figures for one
    // SKU. Only the cover maths below treats a negative as zero.
    const availableQuantity = tracked ? whole(stockRow.quantity) - whole(stockRow.reservedQuantity) : null;

    let peakUnits = 0;
    let peakPosition = -1;
    entry.weekly.forEach((value, index) => {
      // The earliest week reaching the maximum wins, so a spike that has already
      // passed is not relabelled as "last week" when two weeks tie.
      if (value > peakUnits) {
        peakUnits = value;
        peakPosition = index;
      }
    });

    const surge = peakUnits > 0 && avgWeeklyUnits > 0 && peakUnits >= avgWeeklyUnits * SURGE_MULTIPLE;
    const spikePct = priorAvg && priorAvg > 0 ? Math.round(((lastWeekUnits - priorAvg) / priorAvg) * 100) : null;
    const coverWeeks = tracked
      ? availableQuantity <= 0
        ? 0
        : avgWeeklyUnits > 0
          ? round1(availableQuantity / avgWeeklyUnits)
          : null
      : null;
    const suggestedUnits =
      tracked && avgWeeklyUnits > 0 ? Math.max(0, Math.ceil(avgWeeklyUnits * COVER_HORIZON_WEEKS - availableQuantity)) : 0;

    return {
      productId: entry.productId,
      productName,
      weekly: entry.weekly,
      units,
      weeksSold: entry.weekly.filter((value) => value > 0).length,
      lastWeekUnits,
      priorAvg,
      spikePct,
      avgWeeklyUnits,
      tracked,
      availableQuantity,
      lowStockThreshold: tracked ? whole(stockRow.lowStockThreshold) : null,
      stockStatus: stockStatusOf(stockRow, availableQuantity === null ? 0 : availableQuantity),
      coverWeeks,
      suggestedUnits,
      peakUnits,
      peakWeekLabel: peakPosition >= 0 ? weekLabel(weeks[peakPosition]) : null,
      peakIsLastWeek: peakPosition === lastPosition,
      surge,
      attention: 'SELLING',
      tier: null,
    };
  });

  for (const row of measured) {
    row.attention = attentionOf(row);
    row.tier = TIER_ORDER.indexOf(row.attention);
  }
  measured.sort(compareRows);

  // These count facts, not the single tier each row was filed under: a product
  // can be both empty and jumping, and saying "0 products jumped" while one of
  // them did would be a lie told by a ranking rule.
  const countBy = (predicate) => measured.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
  const totalUnits = trend.reduce((sum, week) => sum + week.units, 0);
  const sellingProducts = countSellingProducts(list);
  const lastWeekTotal = trend.length ? trend[lastPosition].units : 0;
  const earlierWeeks = trend.slice(0, lastPosition);
  const priorWeeklyAvg = earlierWeeks.length
    ? round1(earlierWeeks.reduce((sum, week) => sum + week.units, 0) / earlierWeeks.length)
    : null;
  const shopSpikePct =
    priorWeeklyAvg && priorWeeklyAvg > 0 ? Math.round(((lastWeekTotal - priorWeeklyAvg) / priorWeeklyAvg) * 100) : null;

  return {
    window: {
      ...window,
      weekLabels: weeks.map(weekLabel),
      weekStarts: weeks.map((week) => week.from.toISOString()),
    },
    trend,
    // `products` is the ranked set the shop asked to be measured over; `shown`
    // is the slice the panel prints and the prompt is handed, so the table the
    // model explains and the table the shop reads can never be different lists.
    products: measured,
    shown: measured.slice(0, Math.max(0, showLimit)),
    productCount: sellingProducts,
    totals: {
      deliveredOrders: whole(deliveredOrders),
      units: totalUnits,
      sellingProducts,
      rankedProducts: measured.length,
      // True when the shop sells more SKUs in the window than the calendar
      // measures, so the panel can say so instead of implying it saw all.
      capped: sellingProducts > measured.length,
      emptyNow: countBy((row) => row.tracked && row.availableQuantity <= 0),
      runsShort: countBy((row) => row.tracked && row.availableQuantity > 0 && row.coverWeeks !== null && row.coverWeeks < COVER_HORIZON_WEEKS),
      spiked: countBy((row) => row.spikePct !== null && row.spikePct >= SPIKE_PCT),
      rushedBefore: countBy((row) => row.surge && !row.peakIsLastWeek),
      untracked: countBy((row) => !row.tracked),
      suggestedUnits: measured.reduce((sum, row) => sum + row.suggestedUnits, 0),
      lastWeekUnits: lastWeekTotal,
      priorWeeklyAvg,
      shopSpikePct,
    },
    coverHorizonWeeks: COVER_HORIZON_WEEKS,
    spikePctThreshold: SPIKE_PCT,
  };
}

module.exports = {
  buildRestockCalendar,
  completeWeeks,
  selectTopProducts,
  countSellingProducts,
  weekIndexOf,
  weekStart,
  weekLabel,
  dayLabel,
  attentionOf,
  compareRows,
  stockStatusOf,
  ATTENTION,
  TIER_ORDER,
  DEFAULT_WEEKS,
  MIN_WEEKS,
  MAX_WEEKS,
  PRODUCT_LIMIT,
  SHOWN_ROWS,
  COVER_HORIZON_WEEKS,
  SPIKE_PCT,
  SURGE_MULTIPLE,
  WEEK_EPOCH_UTC,
};
