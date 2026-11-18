const crypto = require('crypto');
const { z } = require('zod');

const { generate } = require('../index');
const { getCached, setCached } = require('../cache');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildRecipeMessages } = require('../prompts/recipe.prompt');
const { createToolContext } = require('../tools');
const productTool = require('../tools/product.tool');
const { plainSearch } = require('./shopAssistant.agent');

/**
 * Recipe -> shopping list (docs/29 Phase 2d).
 *
 * The model only extracts the dish name and its ingredients. Matching each
 * ingredient to a real product is ordinary code running the same public
 * product search the Stores page uses, so the list can never contain a
 * product, price or shop the model invented. Nothing is written anywhere:
 * adding the list to the cart stays a customer action.
 */
const TEXT_LIMIT = 500;
const MAX_INGREDIENTS = 15;
const EXTRACT_TTL_SECONDS = 24 * 60 * 60;

const modelSchema = z.object({
  title: z.string().trim().min(2).max(80),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        quantity: z.string().trim().max(40).optional(),
      })
    )
    .min(1)
    .max(MAX_INGREDIENTS),
});

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// The extraction is cached by the recipe text; product matching always runs
// live, so a stock change shows on the very next request.
function cacheKeyOf(text) {
  const hash = crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 32);
  return `recipe-extract:${hash}`;
}

async function extractIngredients(text, ctx) {
  const key = cacheKeyOf(text);
  const cached = await getCached(key);
  if (cached) return cached;

  const result = await generate({
    task: 'recipe-list',
    messages: buildRecipeMessages(text),
    json: true,
    temperature: 0.2,
    maxTokens: 700,
    userId: ctx.userId,
    role: ctx.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  const seen = new Set();
  const ingredients = [];
  for (const ingredient of parsed.ingredients) {
    const name = ingredient.name.trim();
    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    ingredients.push({ name, quantity: ingredient.quantity || null });
  }

  const value = { title: parsed.title.trim(), ingredients };
  await setCached(key, value, EXTRACT_TTL_SECONDS);
  return value;
}

async function matchIngredient(toolCtx, ingredient) {
  // The tool drops out-of-stock listings and keeps the same city/coordinate
  // scope as every other shopper surface.
  const { items } = await productTool.run(toolCtx, { query: ingredient.name, limit: 3 });
  const product = items[0] || null;

  return {
    ingredient: ingredient.name,
    quantity: ingredient.quantity,
    product: product
      ? {
          _id: product._id,
          name: product.name,
          price: product.price,
          image: product.image,
          brandName: product.brandName,
          availability: product.availability,
        }
      : null,
  };
}

// Two ingredients can match the same pack ("oil" and "cooking oil"); showing
// it twice would also add it to the cart twice, so they become one row.
function mergeByProduct(rows) {
  const items = [];
  const byProduct = new Map();
  for (const row of rows) {
    if (!row.product) {
      items.push(row);
      continue;
    }
    const existing = byProduct.get(row.product._id);
    if (!existing) {
      byProduct.set(row.product._id, row);
      items.push(row);
      continue;
    }
    existing.ingredient = `${existing.ingredient} · ${row.ingredient}`;
    if (!existing.quantity && row.quantity) existing.quantity = row.quantity;
  }
  return items;
}

async function buildRecipeList({ message, ctx, cityId, lat, lng }) {
  const text = sanitizeUserText(message, TEXT_LIMIT);
  const toolCtx = createToolContext({ ...ctx, cityId, lat, lng });

  let extracted;
  try {
    extracted = await extractIngredients(text, ctx);
  } catch (err) {
    // Without the model there is no ingredient list; fall back to a plain
    // search over the shopper's own words, like the shop assistant does.
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      return {
        reply: null,
        title: null,
        items: [],
        products: await plainSearch(toolCtx, text),
        degraded: true,
      };
    }
    throw err;
  }

  const rows = await Promise.all(
    extracted.ingredients.map((ingredient) => matchIngredient(toolCtx, ingredient))
  );
  const items = mergeByProduct(rows);
  const matched = items.filter((item) => item.product).length;

  return {
    reply:
      matched === 0
        ? `I could not match any ingredient for ${extracted.title} to products nearby.`
        : `Found ${matched} of ${items.length} ingredients for ${extracted.title} nearby.`,
    title: extracted.title,
    items,
    products: [],
    degraded: false,
  };
}

module.exports = {
  buildRecipeList,
  cacheKeyOf,
  TEXT_LIMIT,
  MAX_INGREDIENTS,
};
