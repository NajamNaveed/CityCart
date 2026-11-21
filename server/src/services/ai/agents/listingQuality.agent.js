const mongoose = require('mongoose');
const { z } = require('zod');

const Inventory = require('../../../models/inventory.model');
const Product = require('../../../models/product.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { scoreListing, countAttributes, moneyText } = require('../listingQuality.rules');
const {
  buildListingQualityMessages,
  SUMMARY_LIMIT,
  FIX_LIMIT,
  FIX_ROWS,
  NAME_LIMIT,
  EXCERPT_LIMIT,
} = require('../prompts/listingQuality.prompt');

/**
 * The listing quality checker (docs/29 Phase 3d-3).
 *
 * Two reads, both locked to `ctx.brandId`: the one listing the shop named, and
 * its stock record. The score is worked out in `listingQuality.rules` from the
 * fields on those two rows, so the number a shop reads is a count of its own
 * data — not the model's impression of it — and a fix the model cannot place on
 * a gap the code found is dropped before anyone sees it.
 *
 * Nothing is written here. The listing keeps its old fields until the shop edits
 * it on the ordinary form and saves with `PATCH /products/:id`; this endpoint
 * only reads it.
 */

class ListingQualityError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ListingQualityError';
    this.status = status;
    this.code = code;
  }
}

const fixSchema = z.object({
  key: z.string().trim().toLowerCase().max(24),
  what: z.string().trim().min(1).max(FIX_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  fixes: z.array(fixSchema).max(FIX_ROWS * 2).optional(),
});

function text(value, limit) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

/**
 * Only the fields a score is made of, and nothing that could identify a
 * customer or move a price. The name and description are sanitized because a
 * shop writes its own copy and it reaches the prompt as data.
 */
function cleanProduct(row) {
  if (!row) return null;
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    productId: String(row._id),
    name: text(row.name, NAME_LIMIT),
    description: text(row.description, EXCERPT_LIMIT),
    images,
    attributes: row.attributes && typeof row.attributes === 'object' ? row.attributes : {},
    attributeCount: countAttributes(row.attributes),
    price: Number(row.price),
    compareAtPrice: row.compareAtPrice === null || row.compareAtPrice === undefined ? null : Number(row.compareAtPrice),
    sku: text(row.sku, 40),
    status: row.status,
    isActive: row.isActive !== false,
  };
}

function cleanInventory(row) {
  if (!row) return null;
  const quantity = Math.max(0, Math.round(Number(row.quantity) || 0));
  const reservedQuantity = Math.max(0, Math.round(Number(row.reservedQuantity) || 0));
  return {
    // The raw difference, the way analytics and the stock alerts read it, so a
    // shop never sees two availability figures for one listing.
    availableQuantity: quantity - reservedQuantity,
    quantity,
    reservedQuantity,
    lowStockThreshold: Math.max(0, Math.round(Number(row.lowStockThreshold) || 0)),
    trackInventory: row.trackInventory !== false,
  };
}

/** The shape the prompt prints, so the model reads words, not raw money floats. */
function scoredView(product, inventory) {
  return {
    product: {
      ...product,
      priceText: moneyText(product.price),
      compareAtText: product.compareAtPrice === null ? 'not set' : moneyText(product.compareAtPrice),
    },
    inventory,
  };
}

// Only gaps this listing actually has may be answered, and in the order the
// server ranked them.
function insightOf(parsed, stats) {
  const allowed = new Set(stats.fixes);
  const fixes = (parsed.fixes || [])
    .filter((fix) => allowed.has(fix.key))
    .filter((fix, index, all) => all.findIndex((item) => item.key === fix.key) === index)
    .sort((a, b) => stats.fixes.indexOf(a.key) - stats.fixes.indexOf(b.key))
    .slice(0, FIX_ROWS)
    .map((fix) => ({ ...fix, label: stats.checks.find((row) => row.key === fix.key).label }));
  return { summary: parsed.summary, fixes };
}

function payload({ product, stats, insight, degraded }) {
  return {
    product: { productId: product.productId, name: product.name, status: product.status, isActive: product.isActive },
    score: stats.score,
    checks: stats.checks,
    fixes: stats.fixes,
    weights: stats.weights,
    visibility: stats.visibility,
    insight,
    degraded,
  };
}

async function listingQuality({ productId, ctx }) {
  if (!ctx.brandId) {
    throw new ListingQualityError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ListingQualityError(404, 'Listing not found.');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const id = new mongoose.Types.ObjectId(String(productId));

  // Scoped by brandId in the same query, so another shop's listing cannot be
  // loaded, scored or named no matter what id arrives in the body.
  const found = await Product.findOne({ _id: id, brandId })
    .select('name description images attributes price compareAtPrice sku status isActive')
    .lean();
  if (!found) throw new ListingQualityError(404, 'Listing not found.');

  const product = cleanProduct(found);
  const inventoryRow = await Inventory.findOne({ brandId, productId: id })
    .select('quantity reservedQuantity lowStockThreshold trackInventory')
    .lean();
  const inventory = cleanInventory(inventoryRow);

  const stats = scoreListing({ product, inventory });
  const scored = scoredView(product, inventory);

  try {
    const result = await generate({
      task: 'listing-quality',
      messages: buildListingQualityMessages(stats, scored),
      json: true,
      temperature: 0.4,
      maxTokens: 700,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ product, stats, insight: insightOf(parsed, stats), degraded: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The score is the useful half, and it never needed a model.
      return payload({ product, stats, insight: null, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  listingQuality,
  ListingQualityError,
  insightOf,
  cleanProduct,
  cleanInventory,
  scoredView,
  FIX_ROWS,
};
