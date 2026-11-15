const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createToolContext, ORDER_TOOLS } = require('../tools');
const { listOrdersTool } = require('../tools/order.tools');
const { sanitizeUserText } = require('../guard');
const { ORDER_HELPER_SYSTEM, buildOrderHelperInput } = require('../prompts/orderHelper.prompt');

const MESSAGE_LIMIT = 500;
const CARD_LIMIT = 3;
const FALLBACK_LIMIT = 3;

/**
 * Phase 2b. The model may only return ids of orders a tool actually read for
 * this signed-in customer; anything else is dropped, so a card can never be
 * invented and another customer's order can never appear.
 */
async function askOrderHelper({ message, ctx }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const toolCtx = createToolContext(ctx);

  try {
    const { decision, trace } = await runAgent({
      task: 'order-helper',
      system: ORDER_HELPER_SYSTEM,
      user: buildOrderHelperInput(text),
      tools: ORDER_TOOLS,
      ctx: toolCtx,
      answerShape: { orderIds: z.array(z.string().max(64)).max(CARD_LIMIT).optional() },
    });

    const orders = (decision.orderIds || [])
      .map((id) => toolCtx.orders.get(String(id)))
      .filter(Boolean)
      .slice(0, CARD_LIMIT);

    return { reply: decision.answer, orders, degraded: false, steps: trace.length };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The same read-only tool, still scoped to this customer: newest orders only.
      const { orders } = await listOrdersTool.run(toolCtx, { limit: FALLBACK_LIMIT });
      return { reply: null, orders, degraded: true, steps: 0 };
    }
    throw err;
  }
}

module.exports = { askOrderHelper, MESSAGE_LIMIT };
