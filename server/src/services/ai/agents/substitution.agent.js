const mongoose = require('mongoose');
const { z } = require('zod');

const Order = require('../../../models/order.model');
const Product = require('../../../models/product.model');
const Inventory = require('../../../models/inventory.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { rankSubstitutes, filterPicks, cleanNote } = require('../substitutions.rules');
const {
  buildSubstitutionMessages,
  WHY_LIMIT,
  NOTE_LIMIT,
  MAX_PICKS,
} = require('../prompts/substitution.prompt');

/**
 * Picker substitution suggestions (docs/29 Phase 4a).
 *
 * A picker can already browse the shop's catalogue by hand. This answers the
 * question that hand search cannot: which of THIS shop's listings, in the same
 * category as the missing item and actually on the shelf, are the closest
 * replacements? The candidate list, the stock filter and the price band are all
 * worked out in `substitutions.rules` from rows scoped to the picker's own brand.
 *
 * The model only chooses from those rows and words a reason. It never receives a
 * price amount, a customer or another shop, and its answer is filtered back to
 * the server's own list before it is returned. Nothing moves: the picker still
 * sends the ordinary change request, and the customer still decides.
 */

class SubstitutionsError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'SubstitutionsError';
    this.status = status;
    this.code = code;
  }
}

const modelSchema = z.object({
  picks: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        why: z.string().trim().min(1).max(WHY_LIMIT),
      })
    )
    .max(MAX_PICKS * 2)
    .optional(),
  note: z.string().trim().max(NOTE_LIMIT).optional(),
});

function availableOf(row) {
  if (!row) return 0;
  // A listing whose stock is not tracked is never "out of stock".
  if (row.trackInventory === false) return null;
  const quantity = Math.max(0, Math.round(Number(row.quantity) || 0));
  const reserved = Math.max(0, Math.round(Number(row.reservedQuantity) || 0));
  return Math.max(0, quantity - reserved);
}

function needQuantityOf(item) {
  if (item.pickStatus === 'SHORT') {
    return Math.max(1, Number(item.quantity) - Number(item.pickedQty || 0));
  }
  return Math.max(1, Number(item.quantity) || 0);
}

function itemOf(order, itemId) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.find((item) => String(item._id) === String(itemId)) || null;
}

function payload({ item, needQuantity, suggestions, note = null, degraded = false }) {
  return {
    item: {
      itemId: String(item._id),
      productId: String(item.productId),
      name: sanitizeUserText(item.productName || '', 120).replace(/\s+/g, ' ').trim(),
      quantity: Number(item.quantity) || 0,
      needQuantity,
    },
    suggestions,
    note,
    degraded,
  };
}

async function suggestSubstitutes({ brandId, pickerId, orderId, itemId, ctx }) {
  if (!brandId) {
    throw new SubstitutionsError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new SubstitutionsError(404, 'Item not found on this order.');
  }

  const brand = new mongoose.Types.ObjectId(String(brandId));
  // The order is read inside the picker's own brand and their own claimed work,
  // so another brand's order and another picker's order 404 the same way.
  const order = await Order.findOne({ _id: orderId, brandId: brand })
    .select('items orderStatus pickerId packedAt')
    .lean();
  if (!order) throw new SubstitutionsError(404, 'Order not found.');
  if (order.pickerId && String(order.pickerId) !== String(pickerId)) {
    throw new SubstitutionsError(404, 'Order not found.');
  }
  if (order.packedAt || !['CONFIRMED', 'PROCESSING'].includes(order.orderStatus)) {
    throw new SubstitutionsError(409, 'This order is not being picked any more.', 'NOT_PICKING');
  }

  const item = itemOf(order, itemId);
  if (!item) throw new SubstitutionsError(404, 'Item not found on this order.');
  if (item.pickStatus === 'PICKED') {
    throw new SubstitutionsError(409, 'This line is already picked.', 'LINE_ALREADY_PICKED');
  }
  const needQuantity = needQuantityOf(item);

  // The category can only come from the listing itself, read in this brand.
  const original = await Product.findOne({ _id: item.productId, brandId: brand })
    .select('_id name price categoryId')
    .lean();
  if (!original) {
    return payload({
      item,
      needQuantity,
      suggestions: [],
      note: "That item is no longer in this shop's catalogue, so there is no category to match.",
    });
  }

  const candidates = await Product.find({
    brandId: brand,
    categoryId: original.categoryId,
    _id: { $ne: original._id },
    status: 'ACTIVE',
    isActive: true,
  })
    .select('_id name sku images price categoryId')
    .limit(40)
    .lean();

  const ids = candidates.map((candidate) => candidate._id);
  const stockRows = ids.length
    ? await Inventory.find({ brandId: brand, productId: { $in: ids } })
        .select('productId quantity reservedQuantity trackInventory')
        .lean()
    : [];
  const stockByProduct = new Map(stockRows.map((row) => [String(row.productId), row]));

  const inStock = candidates.map((candidate) => ({
    ...candidate,
    availableQuantity: availableOf(stockByProduct.get(String(candidate._id))),
  }));
  const ranked = rankSubstitutes(
    { productId: original._id, name: original.name, price: original.price },
    inStock,
    MAX_PICKS
  );

  if (ranked.length === 0) {
    return payload({
      item,
      needQuantity,
      suggestions: [],
      note: 'Nothing else in this category is on the shelf right now.',
    });
  }

  const messages = buildSubstitutionMessages({
    original: { name: original.name },
    needQuantity,
    candidates: ranked,
  });

  try {
    const result = await generate({
      task: 'substitutions',
      messages,
      json: true,
      temperature: 0.2,
      maxTokens: 500,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    const picks = filterPicks(parsed, ranked);
    return payload({
      item,
      needQuantity,
      // A model that picks nothing useful leaves the server's ranked list in
      // place: the picker still gets an honest answer in the aisle.
      suggestions: picks.length ? picks : ranked,
      note: cleanNote(parsed.note),
    });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      return payload({ item, needQuantity, suggestions: ranked, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  suggestSubstitutes,
  SubstitutionsError,
  availableOf,
  needQuantityOf,
  itemOf,
};
