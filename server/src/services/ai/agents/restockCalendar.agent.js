const mongoose = require('mongoose');
const { z } = require('zod');

const Inventory = require('../../../models/inventory.model');
const Order = require('../../../models/order.model');
const { orderMatch } = require('../../analytics.service');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const {
  buildRestockCalendar,
  completeWeeks,
  selectTopProducts,
  WEEK_EPOCH_UTC,
  PRODUCT_LIMIT,
  DEFAULT_WEEKS,
  MIN_WEEKS,
  MAX_WEEKS,
} = require('../restockCalendar.rules');
const {
  buildRestockCalendarMessages,
  SUMMARY_LIMIT,
  NOTE_LIMIT,
  WATCH_LIMIT,
  ACTION_LIMIT,
  PRODUCT_ROWS,
  NAME_LIMIT,
} = require('../prompts/restockCalendar.prompt');

/**
 * The restock calendar (docs/29 Phase 3d-2).
 *
 * Two reads, both locked to `ctx.brandId`: this shop's own delivered order lines
 * bucketed into complete weeks, and its own inventory rows for exactly the
 * products that sold. Everything a shop can compare — weekly units, the jump in
 * the last full week, weeks of cover, suggested units — is arithmetic done in
 * `restockCalendar.rules`, so the panel and the dashboard cannot disagree about
 * what was sold or what is on the shelf.
 *
 * Nothing is written here. A purchase is still the shop's own call, made on the
 * listing or through `POST /inventory/:id/adjust`; this endpoint only says what
 * the shop's own delivered weeks imply about the next one.
 */

class RestockCalendarError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'RestockCalendarError';
    this.status = status;
    this.code = code;
  }
}

const productSchema = z.object({
  productId: z.string().trim().regex(/^[0-9a-f]{24}$/i),
  note: z.string().trim().min(1).max(NOTE_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  watch: z.array(productSchema).max(WATCH_LIMIT * 2).optional(),
  actions: z.array(z.string().trim().min(1).max(NOTE_LIMIT)).max(ACTION_LIMIT * 2).optional(),
});

function clampWeeks(value) {
  const weeks = Number(value);
  if (!Number.isFinite(weeks)) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(weeks)));
}

/** A shop names its own products, so a name can carry markup; it is data. */
function cleanRow(row) {
  if (!row || row.productId == null) return null;
  const units = Math.round(Number(row.units) || 0);
  if (units <= 0) return null;
  return {
    productId: String(row.productId),
    productName: sanitizeUserText(row.productName || '', NAME_LIMIT).replace(/\s+/g, ' ').trim(),
    week: Number(row.week),
    units,
  };
}

function cleanWeekRow(row) {
  if (!row) return null;
  const units = Math.round(Number(row.units) || 0);
  if (units <= 0) return null;
  return { week: Number(row.week), units };
}

function cleanStock(row) {
  if (!row || row.productId == null) return null;
  return {
    productId: String(row.productId),
    quantity: Number(row.quantity) || 0,
    reservedQuantity: Number(row.reservedQuantity) || 0,
    lowStockThreshold: Number(row.lowStockThreshold) || 0,
    trackInventory: row.trackInventory !== false,
  };
}

/**
 * One pass over this shop's delivered orders, three honest shapes out of it.
 *
 * `products` is units per product per week; `weeks` is units per week for the
 * whole shop; `orders` counts delivered orders without unwinding, so it is the
 * same number the dashboard shows for the window. No distinct-id sets are built
 * anywhere, so nothing here grows with a shop's order size.
 *
 * The week bucket counts Mondays since the same epoch the rules use in
 * JavaScript, which is what keeps a bucket and its label from drifting apart.
 */
function calendarPipeline(range, brandId) {
  const weekExpr = {
    $dateDiff: {
      startDate: new Date(WEEK_EPOCH_UTC),
      endDate: '$createdAt',
      unit: 'week',
      startOfWeek: 'monday',
    },
  };
  return [
    { $match: orderMatch(range, brandId) },
    {
      $facet: {
        products: [
          { $match: { orderStatus: 'DELIVERED' } },
          { $unwind: '$items' },
          {
            $group: {
              _id: { productId: '$items.productId', week: weekExpr },
              productName: { $first: '$items.productName' },
              units: { $sum: '$items.quantity' },
            },
          },
          {
            $project: {
              _id: 0,
              productId: '$_id.productId',
              week: '$_id.week',
              productName: 1,
              units: 1,
            },
          },
        ],
        weeks: [
          { $match: { orderStatus: 'DELIVERED' } },
          { $unwind: '$items' },
          { $group: { _id: weekExpr, units: { $sum: '$items.quantity' } } },
          { $project: { _id: 0, week: '$_id', units: 1 } },
        ],
        orders: [
          { $match: { orderStatus: 'DELIVERED' } },
          { $group: { _id: null, deliveredOrders: { $sum: 1 } } },
          { $project: { _id: 0, deliveredOrders: 1 } },
        ],
      },
    },
  ];
}

// Only products actually printed in the table may be watched, so a model cannot
// point a shop at a SKU it was never shown.
function watchableIds(stats) {
  return new Set(stats.shown.map((row) => String(row.productId)));
}

function insightOf(parsed, stats) {
  const allowed = watchableIds(stats);
  const watch = (parsed.watch || [])
    .filter((item) => allowed.has(String(item.productId)))
    .filter((item, index, all) => all.findIndex((t) => String(t.productId) === String(item.productId)) === index)
    .slice(0, WATCH_LIMIT);
  const actions = (parsed.actions || [])
    .map((action) => action.replace(/\s+/g, ' ').trim())
    .filter((action, index, all) => all.indexOf(action) === index)
    .slice(0, ACTION_LIMIT);
  return { summary: parsed.summary, watch, actions };
}

function payload({ stats, insight, degraded, empty }) {
  return {
    window: stats.window,
    coverHorizonWeeks: stats.coverHorizonWeeks,
    trend: stats.trend,
    products: stats.shown,
    productCount: stats.productCount,
    totals: stats.totals,
    insight,
    degraded,
    empty,
  };
}

async function restockCalendar({ weeks, ctx }) {
  if (!ctx.brandId) {
    throw new RestockCalendarError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const windowWeeks = clampWeeks(weeks);
  const buckets = completeWeeks(windowWeeks, new Date());
  const range = { from: buckets[0].from, to: buckets[buckets.length - 1].to };
  const window = { weeks: windowWeeks, from: range.from.toISOString(), to: range.to.toISOString() };

  const facet = (await Order.aggregate(calendarPipeline(range, brandId)))[0] || {};
  const rows = (facet.products || []).map(cleanRow).filter(Boolean);
  const weekRows = (facet.weeks || []).map(cleanWeekRow).filter(Boolean);
  const [orderRow] = facet.orders || [];
  const deliveredOrders = (orderRow && orderRow.deliveredOrders) || 0;

  // Stock is read for the products that actually sold, and only for those, so
  // an untracked or hidden listing cannot pull another shop's row into the
  // comparison. The id list is the same top-selling selection the rules rank
  // over, so the stock rows and the table always describe one group of products.
  const stock = [];
  const ids = selectTopProducts(rows, PRODUCT_LIMIT);
  if (ids.length) {
    const found = await Inventory.find({
      brandId,
      productId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('productId quantity reservedQuantity lowStockThreshold trackInventory')
      .lean();
    for (const row of found) {
      const cleaned = cleanStock(row);
      if (cleaned) stock.push(cleaned);
    }
  }

  const stats = buildRestockCalendar({ rows, weekRows, stock, weeks: buckets, window, deliveredOrders });

  const empty = stats.totals.units === 0;
  if (empty) {
    // Nothing was delivered, so there is no pattern to read — and no reason to
    // spend one of the shop's AI requests saying so.
    return payload({ stats, insight: null, degraded: false, empty: true });
  }

  try {
    const result = await generate({
      task: 'restock-calendar',
      messages: buildRestockCalendarMessages(stats),
      json: true,
      temperature: 0.3,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ stats, insight: insightOf(parsed, stats), degraded: false, empty: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The weeks and the cover figures are the useful half, and they never
      // needed a model.
      return payload({ stats, insight: null, degraded: true, empty: false });
    }
    throw err;
  }
}

module.exports = {
  restockCalendar,
  RestockCalendarError,
  calendarPipeline,
  insightOf,
  cleanRow,
  cleanWeekRow,
  cleanStock,
  clampWeeks,
  DEFAULT_WEEKS,
  MIN_WEEKS,
  MAX_WEEKS,
  PRODUCT_ROWS,
  PRODUCT_LIMIT,
};
