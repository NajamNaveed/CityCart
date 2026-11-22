const mongoose = require('mongoose');
const { z } = require('zod');

const Inventory = require('../../../models/inventory.model');
const Product = require('../../../models/product.model');
const Order = require('../../../models/order.model');
const { orderMatch } = require('../../analytics.service');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildDeadstockPricing, windowOf, CANDIDATE_SCAN, DEFAULT_DAYS, MAX_DAYS, MIN_DAYS } = require('../deadstockPricing.rules');
const {
  buildDeadstockPricingMessages,
  SUMMARY_LIMIT,
  NOTE_LIMIT,
  NOTE_ROWS,
  ACTION_LIMIT,
  NAME_LIMIT,
} = require('../prompts/deadstockPricing.prompt');

/**
 * The deadstock read (docs/29 Phase 3d-7).
 *
 * Three reads, each one locked to `ctx.brandId` inside its own query: this
 * shop's stock positions with units on hand, the listings behind exactly those
 * positions, and one bounded pass over this shop's delivered order lines to find
 * which of them sold nothing. Every rupee, unit count, day count and suggested
 * price is then produced by `deadstockPricing.rules.js` — this file does no
 * arithmetic of its own, so the shop's page and the model's paragraph are always
 * describing the same figures.
 *
 * Nothing is written. A suggestion is a number on a screen; the shop applies it
 * by editing the listing on the ordinary product form, and this endpoint has no
 * path to `Product`'s write methods, to `Inventory`, or to any price field.
 */

class DeadstockPricingError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'DeadstockPricingError';
    this.status = status;
    this.code = code;
  }
}

const noteSchema = z.object({
  productId: z.string().trim().regex(/^[0-9a-f]{24}$/i),
  note: z.string().trim().min(1).max(NOTE_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  notes: z.array(noteSchema).max(NOTE_ROWS * 2).optional(),
  actions: z.array(z.string().trim().min(1).max(NOTE_LIMIT)).max(ACTION_LIMIT * 2).optional(),
});

/** A name is a shop's own string and can carry markup; it reaches a prompt as data. */
function cleanProduct(row) {
  if (!row || !row._id) return null;
  return {
    _id: String(row._id),
    name: sanitizeUserText(row.name || '', NAME_LIMIT).replace(/\s+/g, ' ').trim(),
    sku: sanitizeUserText(row.sku || '', 40).replace(/\s+/g, ' ').trim(),
    price: row.price,
    compareAtPrice: row.compareAtPrice ?? null,
    status: row.status || null,
    isActive: row.isActive !== false,
  };
}

function cleanInventory(row) {
  if (!row || !row.productId) return null;
  return {
    productId: String(row.productId),
    quantity: Number(row.quantity) || 0,
    reservedQuantity: Number(row.reservedQuantity) || 0,
    trackInventory: row.trackInventory !== false,
  };
}

function cleanSold(row) {
  if (!row || row._id == null) return null;
  return {
    productId: String(row._id),
    unitsInWindow: Number(row.unitsInWindow) || 0,
    unitsInLookback: Number(row.units) || 0,
    revenueInLookback: Math.round(Number(row.revenue) || 0),
    lastSoldAt: row.lastSoldAt || null,
  };
}

/**
 * One date-bounded pass over this shop's delivered orders, for exactly the
 * listings whose stock was read. Two figures come out of the same walk: units
 * inside the window the shop asked about, and the last day anything sold — so a
 * listing that sold nothing is measured against a real timestamp rather than an
 * assumed one, and a listing absent from the result is reported as a bound
 * ("nothing in the look-back") instead of a claim that it never sold.
 */
function salesPipeline(range, brandId, windowFrom, productIds) {
  return [
    { $match: { ...orderMatch(range, brandId), orderStatus: 'DELIVERED' } },
    { $unwind: '$items' },
    { $match: { 'items.productId': { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    {
      $group: {
        _id: '$items.productId',
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.totalPrice' },
        unitsInWindow: {
          $sum: { $cond: [{ $gte: ['$createdAt', new Date(windowFrom)] }, '$items.quantity', 0] },
        },
        lastSoldAt: { $max: { $ifNull: ['$deliveredAt', '$createdAt'] } },
      },
    },
  ];
}

function insightOf(parsed, stats) {
  const shown = new Set(stats.shown.map((row) => String(row.productId)));
  const notes = (parsed.notes || [])
    .filter((note) => shown.has(String(note.productId)))
    .filter((note, index, all) => all.findIndex((item) => String(item.productId) === String(note.productId)) === index)
    .slice(0, NOTE_ROWS);
  const actions = (parsed.actions || [])
    .map((action) => action.replace(/\s+/g, ' ').trim())
    .filter((action, index, all) => all.indexOf(action) === index)
    .slice(0, ACTION_LIMIT);
  return { summary: parsed.summary, notes, actions };
}

function payload({ stats, insight, degraded }) {
  return { ...stats, insight, degraded };
}

async function deadstockPricing({ days, ctx, now = new Date() }) {
  if (!ctx.brandId) {
    throw new DeadstockPricingError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const window = windowOf(days || DEFAULT_DAYS, now);

  // The widest set one read ever walks is the scan limit, so a shop with a large
  // catalogue is measured over the stock positions with the most units on hand
  // and told exactly that (`sampled`), rather than scanned without a bound.
  const inventoryRows = await Inventory.find({ brandId, quantity: { $gt: 0 } })
    .sort({ quantity: -1 })
    .limit(CANDIDATE_SCAN)
    .select('productId quantity reservedQuantity trackInventory')
    .lean();
  const inventories = inventoryRows.map(cleanInventory).filter(Boolean);
  const productIds = [...new Set(inventories.map((row) => row.productId))];

  const productRows = productIds.length
    ? await Product.find({ _id: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) }, brandId })
        .select('name sku price compareAtPrice status isActive')
        .lean()
    : [];
  const products = productRows.map(cleanProduct).filter(Boolean);

  const soldRows = productIds.length
    ? await Order.aggregate(
        salesPipeline(
          { from: new Date(window.lookbackFrom), to: new Date(window.to) },
          brandId,
          window.from,
          productIds,
        )
      )
    : [];
  const sold = soldRows.map(cleanSold).filter(Boolean);

  const stats = buildDeadstockPricing({ inventories, products, sold, days: window.days, now });

  if (stats.empty) {
    // Nothing is sitting, so there is no markdown to discuss and the shop spends
    // no AI request finding that out.
    return payload({ stats, insight: null, degraded: false });
  }

  try {
    const result = await generate({
      task: 'deadstock-pricing',
      messages: buildDeadstockPricingMessages(stats),
      json: true,
      temperature: 0.3,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ stats, insight: insightOf(parsed, stats), degraded: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The rows, the values and the suggested prices are CityCart's own and
      // never needed a model; only the paragraph did.
      return payload({ stats, insight: null, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  deadstockPricing,
  DeadstockPricingError,
  salesPipeline,
  insightOf,
  cleanProduct,
  cleanInventory,
  cleanSold,
  payload,
  CANDIDATE_SCAN,
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
};
