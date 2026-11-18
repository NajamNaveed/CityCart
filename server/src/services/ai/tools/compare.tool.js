const mongoose = require('mongoose');
const { z } = require('zod');

const Product = require('../../../models/product.model');
const { ratingsFor } = require('../../review.service');
const productTool = require('./product.tool');

/**
 * Product search for the comparison view (docs/29 Phase 2e).
 *
 * It runs the ordinary public product search first, so the comparison can only
 * contain listings a shopper could buy, then adds the two fields a side-by-side
 * needs and the search alone cannot give: the listing's own attributes and its
 * approved-review rating.
 */
const MAX_COMPARE = 6;
const MAX_ATTRIBUTES = 8;
const ATTRIBUTE_KEY_CHARS = 40;
const ATTRIBUTE_VALUE_CHARS = 60;

const argsSchema = z
  .object({
    query: z.string().trim().min(2).max(80),
    limit: z.number().int().min(2).max(MAX_COMPARE).optional(),
  })
  .strict();

function cleanAttributes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(clean).length >= MAX_ATTRIBUTES) break;
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    clean[String(key).slice(0, ATTRIBUTE_KEY_CHARS)] = text.slice(0, ATTRIBUTE_VALUE_CHARS);
  }
  return clean;
}

async function enrich(ctx, cards) {
  const ids = cards.map((card) => card._id).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (ids.length === 0) return cards;

  const [docs, ratings] = await Promise.all([
    Product.find({ _id: { $in: ids } }, 'attributes').lean(),
    ratingsFor(ids),
  ]);
  const attributesById = new Map(docs.map((doc) => [String(doc._id), cleanAttributes(doc.attributes)]));

  // Re-remembering replaces the plain card, so the agent's final pick already
  // carries everything the comparison card renders.
  return cards.map((card) =>
    ctx.rememberProduct({
      ...card,
      attributes: attributesById.get(card._id) || {},
      rating: ratings[card._id] || null,
    })
  );
}

const compareTool = {
  name: 'compare_products',
  argsHint: '{ query: string, limit?: 2-6 }',
  description:
    'Find products to compare side by side. Use short search words (for example "rice", "milk", "oil"). Returns real listings with id, price, stock state, shop name, rating and attributes.',
  argsSchema,
  async run(ctx, args) {
    const { items } = await productTool.run(ctx, {
      query: args.query,
      limit: args.limit || MAX_COMPARE,
    });
    const enriched = await enrich(ctx, items);
    return { count: enriched.length, items: enriched };
  },
};

module.exports = compareTool;
module.exports.MAX_COMPARE = MAX_COMPARE;
module.exports.cleanAttributes = cleanAttributes;
