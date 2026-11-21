const { z } = require('zod');
const mongoose = require('mongoose');

const Order = require('../../../models/order.model');
const Product = require('../../../models/product.model');
const Review = require('../../../models/review.model');
const { getBrandAnalytics, orderMatch } = require('../../analytics.service');
const {
  listInventory,
  getInventoryForProduct,
  serializeInventory,
} = require('../../inventory.service');
const { resolveDateRange } = require('../../../validators/analytics.validator');

/**
 * Read-only tools for the seller advisor (docs/29 Phase 3a).
 *
 * Everything here is scoped by `ctx.brandId`, which the controller takes from
 * the authenticated user's own brand — never from the request body. The model
 * only ever sees the JSON these functions return, so it cannot ask for another
 * brand's numbers even in principle.
 *
 * Every number is computed here (docs/27 §3.4: "the model explains, it does not
 * calculate"). Revenue follows the analytics definition exactly — DELIVERED
 * orders at `netTotal`, falling back to `total` for orders that predate door
 * returns — so the advisor can never contradict the dashboard the brand is
 * looking at. Amounts are Pakistani rupees, the unit the analytics service
 * already works in.
 */
const DELIVERED = 'DELIVERED';
const CANCELLED = ['CANCELLED', 'REJECTED'];

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 90;
// The answer quotes the last fortnight of the daily trend at most, whatever the
// window asked for, so one tool result stays inside the loop's 4000-character clip.
const TREND_PREVIEW = 14;
const TOP_PRODUCT_PREVIEW = 5;
const ALERT_LIMIT_DEFAULT = 8;
const ALERT_LIMIT_MAX = 20;
// Alerts are read from the service's newest-updated page, then re-ranked here by
// real urgency, so this scan is deliberately wider than the number of rows shown.
const ALERT_SCAN = 50;

const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i);
const daysSchema = z.number().int().min(MIN_DAYS).max(MAX_DAYS).optional();

function utcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shifted(day, offset) {
  const moved = new Date(day);
  moved.setUTCDate(moved.getUTCDate() + offset);
  return moved;
}

/** The `days` most recent full UTC days, ending today (inclusive). */
function currentRange(days, now = new Date()) {
  const today = utcDay(now);
  return resolveDateRange(
    { from: utcDay(shifted(today, -(days - 1))).toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) },
    now,
  );
}

/** The `days` immediately before `currentRange` — adjacent, never overlapping. */
function previousRange(days, now = new Date()) {
  const today = utcDay(now);
  return resolveDateRange(
    {
      from: utcDay(shifted(today, -(2 * days - 1))).toISOString().slice(0, 10),
      to: shifted(today, -days).toISOString().slice(0, 10),
    },
    now,
  );
}

/** Percentage change, or null when there is no baseline to compare against. */
function changePercent(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function round(value) {
  return Math.round(Number(value) || 0);
}

/**
 * Totals for one window, using the same order filter and revenue definition as
 * the dashboard. Analytics has no period-over-period comparison anywhere, so
 * this is the one light aggregation the advisor adds for its baseline.
 */
async function windowTotals(range, brandId) {
  const [row] = await Order.aggregate([
    { $match: orderMatch(range, brandId) },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              deliveredOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, 1, 0] } },
              cancelledOrders: { $sum: { $cond: [{ $in: ['$orderStatus', CANCELLED] }, 1, 0] } },
              revenue: {
                $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, { $ifNull: ['$netTotal', '$total'] }, 0] },
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        customers: [{ $group: { _id: '$customerId' } }, { $group: { _id: null, customers: { $sum: 1 } } }],
        units: [
          { $match: { orderStatus: DELIVERED } },
          { $unwind: '$items' },
          { $group: { _id: null, units: { $sum: '$items.quantity' } } },
        ],
      },
    },
  ]);

  const summary = row?.summary?.[0] || {};
  const deliveredOrders = summary.deliveredOrders || 0;
  return {
    orders: summary.orders || 0,
    deliveredOrders,
    cancelledOrders: summary.cancelledOrders || 0,
    revenue: round(summary.revenue || 0),
    customers: row?.customers?.[0]?.customers || 0,
    units: row?.units?.[0]?.units || 0,
    averageOrderValue: deliveredOrders ? round((summary.revenue || 0) / deliveredOrders) : 0,
  };
}

/** Units and revenue per product inside one window, delivered orders only. */
async function soldByProduct(range, brandId, productIds) {
  if (!productIds.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { ...orderMatch(range, brandId), orderStatus: DELIVERED } },
    { $unwind: '$items' },
    { $match: { 'items.productId': { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    {
      $group: {
        _id: '$items.productId',
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.totalPrice' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), { units: row.units || 0, revenue: round(row.revenue || 0) }]));
}

function stockRow(inventory, product, sold, days) {
  const available = inventory.availableQuantity;
  const units = sold?.units ?? null;
  // Days of cover is only meaningful while the product is actually selling; a
  // slow line is reported as null plus its unit count, never as "∞ days".
  const daysOfCover =
    available <= 0 ? 0 : !units ? null : Math.round((available / (units / days)) * 10) / 10;

  return {
    productId: String(inventory.productId),
    productName: product?.name || null,
    isActive: product ? product.isActive !== false : null,
    stockStatus: inventory.stockStatus,
    quantity: inventory.quantity,
    reservedQuantity: inventory.reservedQuantity,
    availableQuantity: available,
    lowStockThreshold: inventory.lowStockThreshold,
    // A threshold of 0 (the default) means the brand never set one, so
    // LOW_STOCK could not have fired for this product at all.
    thresholdSet: inventory.lowStockThreshold > 0,
    unitsSoldInWindow: units,
    daysOfCover,
  };
}

const salesSummaryTool = {
  name: 'get_sales_summary',
  argsHint: '{ days?: 7-90 }',
  description:
    'This shop’s own sales for the last N days (default 30) beside the same length of time straight before it: orders, delivered orders, cancelled orders, revenue, customers, units sold and average order value, each with the percentage change, plus the daily trend, the best sellers and how many products are low or out of stock. Amounts are rupees. Takes no other argument.',
  argsSchema: z.object({ days: daysSchema }).strict(),
  async run(ctx, args) {
    const days = args.days || DEFAULT_DAYS;
    const range = currentRange(days);
    const previous = previousRange(days);

    // The current window comes from the dashboard's own analytics call, so the
    // advisor and the charts the brand already reads can never disagree.
    const [analytics, baseline] = await Promise.all([
      getBrandAnalytics({ brandId: ctx.brandId, range }),
      windowTotals(previous, ctx.brandId),
    ]);

    const current = {
      orders: analytics.summary.orders,
      deliveredOrders: analytics.summary.deliveredOrders,
      cancelledOrders: analytics.summary.cancelledOrders,
      revenue: round(analytics.summary.revenue),
      customers: analytics.summary.customers,
      repeatCustomers: analytics.summary.repeatCustomers,
      units: analytics.summary.productsSold,
      averageOrderValue: round(analytics.summary.averageOrderValue),
    };

    return {
      window: { ...range.labels, days },
      comparedWith: previous.labels,
      currency: 'Pakistani rupees',
      current,
      previous: baseline,
      change: {
        orders: changePercent(current.orders, baseline.orders),
        revenue: changePercent(current.revenue, baseline.revenue),
        customers: changePercent(current.customers, baseline.customers),
        units: changePercent(current.units, baseline.units),
        averageOrderValue: changePercent(current.averageOrderValue, baseline.averageOrderValue),
      },
      salesTrend: (analytics.salesTrend || []).slice(-TREND_PREVIEW),
      topProducts: (analytics.topProducts || []).slice(0, TOP_PRODUCT_PREVIEW),
      stock: {
        lowStockProducts: analytics.summary.lowStockProducts,
        outOfStockProducts: analytics.summary.outOfStockProducts,
      },
    };
  },
};

const stockAlertsTool = {
  name: 'list_stock_alerts',
  argsHint: "{ status?: 'LOW_STOCK' | 'OUT_OF_STOCK', limit?: 1-20 }",
  description:
    'This shop’s products that are out of stock or running low, most urgent first, each with what is left, the threshold the shop set, how many sold in the window and the resulting days of cover. Optionally only one status; both by default.',
  argsSchema: z
    .object({
      status: z.enum(['LOW_STOCK', 'OUT_OF_STOCK']).optional(),
      limit: z.number().int().min(1).max(ALERT_LIMIT_MAX).optional(),
      days: daysSchema,
    })
    .strict(),
  async run(ctx, args) {
    const days = args.days || DEFAULT_DAYS;
    const limit = args.limit || ALERT_LIMIT_DEFAULT;
    const statuses = args.status ? [args.status] : ['OUT_OF_STOCK', 'LOW_STOCK'];
    const range = currentRange(days);

    const pages = await Promise.all(
      statuses.map((stockStatus) =>
        listInventory({ brandId: ctx.brandId, stockStatus, page: 1, limit: ALERT_SCAN }).then(
          ({ items }) => items.map((item) => serializeInventory(item)),
        ),
      ),
    );
    const inventories = pages.flat();

    const ids = [...new Set(inventories.map((item) => String(item.productId)))];
    const products = ids.length
      ? await Product.find({ _id: { $in: ids }, brandId: ctx.brandId })
          .select('name isActive')
          .lean()
      : [];
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const sold = await soldByProduct(range, ctx.brandId, ids);

    const rows = inventories
      .map((inventory) =>
        ctx.rememberStock(
          stockRow(inventory, productMap.get(String(inventory.productId)), sold.get(String(inventory.productId)), days),
        ),
      )
      .sort((a, b) => {
        if (a.stockStatus !== b.stockStatus) return a.stockStatus === 'OUT_OF_STOCK' ? -1 : 1;
        if (a.daysOfCover === null && b.daysOfCover !== null) return 1;
        if (b.daysOfCover === null && a.daysOfCover !== null) return -1;
        return (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0);
      })
      .slice(0, limit);

    return {
      window: { ...range.labels, days },
      counts: {
        outOfStock: inventories.filter((item) => item.stockStatus === 'OUT_OF_STOCK').length,
        lowStock: inventories.filter((item) => item.stockStatus === 'LOW_STOCK').length,
      },
      untrackedNote: 'Products with stock tracking switched off never appear here.',
      products: rows,
    };
  },
};

const productPerformanceTool = {
  name: 'get_product_performance',
  argsHint: '{ productId: string, days?: 7-90 }',
  description:
    'Everything known about one of this shop’s own products over the last N days: its price and compare-at price, current stock, units and revenue against the previous window, and its approved-review count and average rating. A product that is not this shop’s simply comes back as not found.',
  argsSchema: z.object({ productId: objectIdSchema, days: daysSchema }).strict(),
  async run(ctx, args) {
    const days = args.days || DEFAULT_DAYS;
    // Both halves of the tenant check are in the query: a product of another
    // brand is not read at all, so its price never reaches the prompt.
    const product = await Product.findOne({ _id: args.productId, brandId: ctx.brandId })
      .select('name slug price compareAtPrice isActive status')
      .lean();
    if (!product) return { found: false, productId: args.productId };

    const range = currentRange(days);
    const [inventory, currentSold, previousSold, reviewRow] = await Promise.all([
      getInventoryForProduct(product).then((record) => serializeInventory(record)),
      soldByProduct(range, ctx.brandId, [product._id]),
      soldByProduct(previousRange(days), ctx.brandId, [product._id]),
      Review.aggregate([
        // An aggregation pipeline is not cast by mongoose, so the brand id is
        // converted here — the same guard the query paths get for free.
        { $match: { productId: product._id, brandId: new mongoose.Types.ObjectId(String(ctx.brandId)), isApproved: true } },
        { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
      ]),
    ]);

    const current = currentSold.get(String(product._id)) || { units: 0, revenue: 0 };
    const previous = previousSold.get(String(product._id)) || { units: 0, revenue: 0 };
    const reviews = reviewRow[0] || {};

    return ctx.rememberPerformance({
      found: true,
      productId: String(product._id),
      productName: product.name,
      slug: product.slug,
      isActive: product.isActive !== false,
      status: product.status,
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      currency: 'Pakistani rupees',
      stock: {
        stockStatus: inventory.stockStatus,
        trackInventory: inventory.trackInventory !== false,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
        availableQuantity: inventory.availableQuantity,
        lowStockThreshold: inventory.lowStockThreshold,
      },
      window: { ...range.labels, days },
      sales: {
        current,
        previous,
        change: { units: changePercent(current.units, previous.units), revenue: changePercent(current.revenue, previous.revenue) },
      },
      reviews: {
        approvedCount: reviews.count || 0,
        // One decimal, computed here: the model is never asked to average ratings.
        averageRating: reviews.average ? Math.round(reviews.average * 10) / 10 : null,
      },
    });
  },
};

module.exports = {
  salesSummaryTool,
  stockAlertsTool,
  productPerformanceTool,
  currentRange,
  previousRange,
  changePercent,
  windowTotals,
  stockRow,
};
