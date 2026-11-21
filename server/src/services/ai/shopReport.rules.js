/**
 * The weekly shop report (docs/29 Phase 3d-4).
 *
 * Everything here is read off the numbers the brand dashboard itself draws —
 * `getBrandAnalytics` is called twice over two equal windows and this file only
 * compares what it returned. No rupee, order count or unit figure is invented
 * or re-added, so the paragraph a shop reads and the chart above it cannot
 * disagree.
 *
 * The one thing a dashboard has no answer for is fairness of comparison: the
 * last day of the current window is still running, so a week measured against a
 * finished one always looks like a decline. `aligned` therefore compares the
 * same weekday positions in both windows and leaves the in-progress day out of
 * both, while `windowChanges` keeps the whole-window figures and says so.
 */

const { changePercent } = require('./tools/seller.tools');

// The roadmap's promise is the three products that moved, and the panel prints
// exactly the rows chosen here — the same list the prompt is handed.
const PRODUCT_ROWS = 3;
const ALERT_ROWS = 5;

const MOVEMENT_LABELS = {
  NEW: 'sold for the first time this week',
  UP: 'sold more than last week',
  DOWN: 'sold less than last week',
  FLAT: 'sold the same as last week',
};

function round(value) {
  return Math.round(Number(value) || 0);
}

const DAY_MS = 86400000;

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Every whole UTC day a resolved range covers, oldest first. `to` is exclusive. */
function dayKeys(range) {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const count = Math.round((to - from) / DAY_MS);
  if (!Number.isFinite(count) || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => dayKey(new Date(from + index * DAY_MS)));
}

function trendByDate(salesTrend) {
  const map = new Map();
  for (const row of salesTrend || []) {
    const key = dayKey(row.date);
    const existing = map.get(key) || { orders: 0, revenue: 0 };
    map.set(key, {
      orders: existing.orders + round(row.orders),
      revenue: existing.revenue + round(row.revenue),
    });
  }
  return map;
}

/**
 * The dashboard's `summary.productsSold` is units, not distinct listings, so it
 * is renamed here and never recomputed.
 */
function totalsOf(analytics) {
  const summary = (analytics && analytics.summary) || {};
  return {
    orders: round(summary.orders),
    deliveredOrders: round(summary.deliveredOrders),
    cancelledOrders: round(summary.cancelledOrders),
    pendingOrders: round(summary.pendingOrders),
    revenue: round(summary.revenue),
    averageOrderValue: round(summary.averageOrderValue),
    customers: round(summary.customers),
    repeatCustomers: round(summary.repeatCustomers),
    units: round(summary.productsSold),
    lowStockProducts: round(summary.lowStockProducts),
    outOfStockProducts: round(summary.outOfStockProducts),
  };
}

function pair(current, previous) {
  return { current, previous, pct: changePercent(current, previous) };
}

/**
 * Same-weekday comparison: offset `i` of one window is always `days` apart from
 * offset `i` of the other, so the two columns are the same weekdays. The last
 * offset is the day still running and is dropped from both sides.
 */
function alignedTotals(currentRange, previousRange, current, previous) {
  const currentDays = dayKeys(currentRange);
  const previousDays = dayKeys(previousRange);
  const shared = Math.min(currentDays.length, previousDays.length);
  const comparable = Math.max(0, shared - 1);
  const currentTrend = trendByDate(current && current.salesTrend);
  const previousTrend = trendByDate(previous && previous.salesTrend);

  const sum = (days, trend) =>
    days.reduce(
      (acc, key) => {
        const row = trend.get(key) || { orders: 0, revenue: 0 };
        return { orders: acc.orders + row.orders, revenue: acc.revenue + row.revenue };
      },
      { orders: 0, revenue: 0 },
    );

  const mine = sum(currentDays.slice(0, comparable), currentTrend);
  const theirs = sum(previousDays.slice(0, comparable), previousTrend);
  const average = (totals) => (totals.orders ? Math.round(totals.revenue / totals.orders) : 0);

  return {
    days: comparable,
    through: comparable ? currentDays[comparable - 1] : null,
    deliveredOrders: pair(mine.orders, theirs.orders),
    revenue: pair(mine.revenue, theirs.revenue),
    averageOrderValue: pair(average(mine), average(theirs)),
  };
}

function movementOf(units, previousUnits) {
  if (!previousUnits && units) return 'NEW';
  if (units > previousUnits) return 'UP';
  if (units < previousUnits) return 'DOWN';
  return 'FLAT';
}

/**
 * `previousUnits` comes from an aggregate over the whole previous window, so a
 * product missing from its rows genuinely sold nothing there — a real zero, not
 * a gap in the data.
 */
function productsOf(current, previousUnitsByProduct) {
  const rows = (current && current.topProducts) || [];
  return rows.map((row) => {
    const units = round(row.unitsSold);
    const previousUnits = previousUnitsByProduct.get(String(row.productId)) || 0;
    const changeUnits = units - previousUnits;
    return {
      productId: String(row.productId),
      productName: row.productName || null,
      units,
      revenue: round(row.revenue),
      previousUnits,
      changeUnits,
      changePct: changePercent(units, previousUnits),
      movement: movementOf(units, previousUnits),
    };
  });
}

/** Biggest change first, then the bigger seller, then a stable id order. */
function rankProducts(products) {
  return [...products]
    .sort(
      (a, b) =>
        Math.abs(b.changeUnits) - Math.abs(a.changeUnits) ||
        b.units - a.units ||
        String(a.productId).localeCompare(String(b.productId)),
    )
    .slice(0, PRODUCT_ROWS);
}

function bestDayOf(current, currentDays) {
  const trend = trendByDate(current && current.salesTrend);
  const last = currentDays[currentDays.length - 1] || null;
  let best = null;
  for (const [date, row] of trend) {
    if (!best || row.revenue > best.revenue || (row.revenue === best.revenue && date < best.date)) {
      best = { date, orders: row.orders, revenue: row.revenue };
    }
  }
  if (!best || !best.revenue) return null;
  return { ...best, isToday: best.date === last };
}

function cancellationOf(totals) {
  return {
    orders: totals.cancelledOrders,
    pct: totals.orders ? Math.round((totals.cancelledOrders / totals.orders) * 100) : null,
    previousPct: null,
  };
}

function stockOf(current, totals) {
  const alerts = ((current && current.inventoryAlerts) || []).slice(0, ALERT_ROWS).map((row) => ({
    productId: row.productId === undefined || row.productId === null ? null : String(row.productId),
    productName: row.productName || null,
    availableQuantity: round(row.availableQuantity),
    lowStockThreshold: round(row.lowStockThreshold),
    status: row.status,
  }));
  return {
    lowStockProducts: totals.lowStockProducts,
    outOfStockProducts: totals.outOfStockProducts,
    // The dashboard's alert list is capped at ten rows of its own, so a shop
    // with more short lines than that is told it is looking at a page, not all.
    alertsShown: alerts.length,
    alerts,
  };
}

/**
 * @param days      the window length actually used, after clamping
 * @param range     currentRange(days)
 * @param compare   previousRange(days)
 * @param current   getBrandAnalytics({ brandId, range }) — the dashboard payload
 * @param previous  getBrandAnalytics({ brandId, range: compare })
 * @param previousUnitsByProduct  Map of productId -> units in `compare`
 */
function buildShopReport({ days, range, compare, current, previous, previousUnitsByProduct }) {
  const totals = totalsOf(current);
  const previousTotals = totalsOf(previous);
  const currentDays = dayKeys(range);
  const previousDays = dayKeys(compare);

  const byProduct = productsOf(current, previousUnitsByProduct || new Map());
  const cancellation = cancellationOf(totals);
  const previousCancellation = cancellationOf(previousTotals);
  cancellation.previousPct = previousCancellation.pct;

  return {
    window: {
      days,
      from: currentDays[0] || null,
      to: currentDays[currentDays.length - 1] || null,
      // The last day is the one still running; every headline below excludes it.
      partialLastDay: currentDays[currentDays.length - 1] || null,
      compare: {
        from: previousDays[0] || null,
        to: previousDays[previousDays.length - 1] || null,
      },
    },
    totals,
    previousTotals,
    aligned: alignedTotals(range, compare, current, previous),
    windowChanges: {
      customers: pair(totals.customers, previousTotals.customers),
      repeatCustomers: pair(totals.repeatCustomers, previousTotals.repeatCustomers),
      units: pair(totals.units, previousTotals.units),
      pendingOrders: pair(totals.pendingOrders, previousTotals.pendingOrders),
      note: 'Whole window, including the day still running, so these are the dashboard figures and not a like-for-like comparison.',
    },
    cancellation,
    bestDay: bestDayOf(current, currentDays),
    products: rankProducts(byProduct),
    soldProducts: byProduct.length,
    movementLabels: { ...MOVEMENT_LABELS },
    stock: stockOf(current, totals),
    empty: totals.orders === 0,
  };
}

module.exports = {
  buildShopReport,
  alignedTotals,
  dayKeys,
  trendByDate,
  totalsOf,
  productsOf,
  rankProducts,
  movementOf,
  bestDayOf,
  stockOf,
  moneyOf: round,
  MOVEMENT_LABELS,
  PRODUCT_ROWS,
  ALERT_ROWS,
};
