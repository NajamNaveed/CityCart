const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createToolContext, SHOP_TOOLS } = require('../tools');
const productTool = require('../tools/product.tool');
const { sanitizeUserText } = require('../guard');
const { SHOP_ASSISTANT_SYSTEM, buildShopAssistantInput } = require('../prompts/shopAssistant.prompt');

const MESSAGE_LIMIT = 500;
const FALLBACK_LIMIT = 6;
const FALLBACK_TOKENS = 6;

// Words that carry no product meaning in a plain fallback search.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'best', 'buy', 'can', 'cheap', 'cheapest', 'find', 'for', 'from', 'get', 'give',
  'good', 'have', 'how', 'i', 'in', 'is', 'it', 'less', 'me', 'my', 'near', 'need', 'of', 'on', 'or', 'please',
  'rs', 'rupees', 'show', 'some', 'than', 'the', 'to', 'under', 'want', 'what', 'where', 'which', 'with', 'you',
]);

/** The user text split into usable search words, longest first. */
function fallbackQueries(text) {
  const words = String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, FALLBACK_TOKENS);
}

/**
 * Plain search used when the model is down. It runs the same read-only product
 * tool word by word, so the shopper still sees real products with an honest
 * "no assistant" reply (docs/29 Phase 2a: fall back to plain search).
 */
async function plainSearch(toolCtx, message) {
  const found = new Map();
  for (const query of fallbackQueries(message)) {
    const { items } = await productTool.run(toolCtx, { query, limit: FALLBACK_LIMIT });
    for (const item of items) {
      if (!found.has(item._id)) found.set(item._id, item);
      if (found.size >= FALLBACK_LIMIT) return [...found.values()];
    }
  }
  return [...found.values()];
}

/**
 * Phase 2a. The model may only return ids of products a tool actually found;
 * anything else is dropped, so the cards can never be invented.
 */
async function askShopAssistant({ message, ctx, cityId, lat, lng }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const toolCtx = createToolContext({ ...ctx, cityId, lat, lng });

  try {
    const { decision, trace } = await runAgent({
      task: 'shop-assistant',
      system: SHOP_ASSISTANT_SYSTEM,
      user: buildShopAssistantInput(text),
      tools: SHOP_TOOLS,
      ctx: toolCtx,
      answerShape: { productIds: z.array(z.string().max(64)).max(4).optional() },
    });

    const products = (decision.productIds || [])
      .map((id) => toolCtx.products.get(String(id)))
      .filter(Boolean)
      .slice(0, 4);

    return { reply: decision.answer, products, degraded: false, steps: trace.length };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      return {
        reply: null,
        products: await plainSearch(toolCtx, text),
        degraded: true,
        steps: 0,
      };
    }
    throw err;
  }
}

module.exports = { askShopAssistant, fallbackQueries, plainSearch, MESSAGE_LIMIT };
