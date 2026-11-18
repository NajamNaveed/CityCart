const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createToolContext } = require('../tools');
const compareTool = require('../tools/compare.tool');
const { sanitizeUserText } = require('../guard');
const { COMPARE_SYSTEM, buildCompareInput } = require('../prompts/compare.prompt');
const { plainSearch } = require('./shopAssistant.agent');

/**
 * Product comparison (docs/29 Phase 2e).
 *
 * The model may only return ids of products the comparison tool actually
 * found, so the side-by-side cards can never be invented. A provider outage
 * falls back to the same plain search the shop assistant uses.
 */
const MESSAGE_LIMIT = 500;
const MAX_PRODUCTS = 3;
const COMPARE_TOOLS = [compareTool];

async function compareProducts({ message, ctx, cityId, lat, lng }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const toolCtx = createToolContext({ ...ctx, cityId, lat, lng });

  try {
    const { decision, trace } = await runAgent({
      task: 'compare',
      system: COMPARE_SYSTEM,
      user: buildCompareInput(text),
      tools: COMPARE_TOOLS,
      ctx: toolCtx,
      answerShape: { productIds: z.array(z.string().max(64)).max(MAX_PRODUCTS).optional() },
    });

    const products = [...new Set(decision.productIds || [])]
      .map((id) => toolCtx.products.get(String(id)))
      .filter(Boolean)
      .slice(0, MAX_PRODUCTS);

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

module.exports = { compareProducts, MESSAGE_LIMIT };
