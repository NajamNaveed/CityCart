const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createShopperContext, SHOP_TOOLS } = require('../tools');
const productTool = require('../tools/product.tool');
const { sanitizeUserText } = require('../guard');
const { groundedReply } = require('../ground');
const { resolveShopperScope } = require('../location');
const { askForDetails } = require('../facts');
const { fallbackQueries } = require('../query');
const { SHOP_ASSISTANT_SYSTEM, buildShopAssistantInput } = require('../prompts/shopAssistant.prompt');

const MESSAGE_LIMIT = 500;
const FALLBACK_LIMIT = 6;

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
 * Phase 2a, located in Phase 2h. The model may only return ids of products a
 * tool actually found, and the sentence around them is checked against the same
 * tool results, so neither a card nor a price can be invented.
 */
async function askShopAssistant({ message, ctx, cityId, lat, lng, scope: given }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const scope = given || (await resolveShopperScope({ userId: ctx.userId, cityId, lat, lng }));
  const toolCtx = createShopperContext(ctx, scope);

  // Nothing searchable in the message: ask instead of showing random shops.
  if (!fallbackQueries(text).length) {
    return { reply: askForDetails(text), products: [], degraded: false, steps: 0 };
  }

  try {
    const { decision, trace } = await runAgent({
      task: 'shop-assistant',
      system: SHOP_ASSISTANT_SYSTEM,
      user: buildShopAssistantInput(text, scope),
      tools: SHOP_TOOLS,
      ctx: toolCtx,
      answerShape: { productIds: z.array(z.string().max(64)).max(4).optional() },
    });

    const products = [...new Set(decision.productIds || [])]
      .map((id) => toolCtx.products.get(String(id)))
      .filter(Boolean)
      .slice(0, 4);

    const { reply, corrected } = groundedReply({
      answer: decision.answer,
      evidence: trace,
      mode: 'shop',
      cards: products,
      scope,
      note: toolCtx.scopeNote,
    });

    return { reply, products, degraded: false, corrected, steps: trace.length };
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

module.exports = { askShopAssistant, plainSearch, MESSAGE_LIMIT };
