const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createShopperContext, ORDER_TOOLS } = require('../tools');
const { listOrdersTool } = require('../tools/order.tools');
const { sanitizeUserText } = require('../guard');
const { groundedReply } = require('../ground');
const { resolveShopperScope } = require('../location');
const { ORDER_HELPER_SYSTEM, buildOrderHelperInput } = require('../prompts/orderHelper.prompt');

const MESSAGE_LIMIT = 500;
const CARD_LIMIT = 3;
const FALLBACK_LIMIT = 3;

/**
 * Phase 2b. The model may only return ids of orders a tool actually read for
 * this signed-in customer; anything else is dropped, so a card can never be
 * invented and another customer's order can never appear. Phase 2h also checks
 * the sentence: a status or total the order tool did not return is replaced by
 * one the server wrote from the card.
 */
async function askOrderHelper({ message, ctx, cityId, lat, lng, scope: given }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const scope = given || (await resolveShopperScope({ userId: ctx.userId, cityId, lat, lng }));
  const toolCtx = createShopperContext(ctx, scope);

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

    const { reply, corrected } = groundedReply({
      answer: decision.answer,
      evidence: trace,
      mode: 'order',
      cards: orders,
      scope,
    });

    return { reply, orders, degraded: false, corrected, steps: trace.length };
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
