const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createToolContext, SELLER_TOOLS } = require('../tools');
const { stockAlertsTool } = require('../tools/seller.tools');
const { sanitizeUserText } = require('../guard');
const {
  SELLER_ADVISOR_SYSTEM,
  buildSellerAdvisorInput,
  PRODUCT_CARD_LIMIT,
} = require('../prompts/sellerAdvisor.prompt');

/**
 * The seller advisor (docs/29 Phase 3a).
 *
 * One question, this shop's own numbers. Every figure in the prompt came out of
 * `seller.tools`, which reads `ctx.brandId` — the caller's brand, set by the
 * controller from the authenticated user and never from the body — so another
 * brand's data is unreachable rather than merely hidden.
 *
 * The product cards are the other half of that: the model may only name ids a
 * tool returned for this brand, so an invented or borrowed id is dropped before
 * anything reaches the client.
 */
const MESSAGE_LIMIT = 1200;
// A normal question reads the summary and the stock alerts, then answers; the
// third step is for the one product the advice points at.
const MAX_STEPS = 4;
const FALLBACK_ALERT_LIMIT = 5;

/**
 * The client-side shape for one advised product, assembled from whichever tool
 * found it. Nothing here comes from the model, so a card cannot claim a stock
 * level, price or rating that the database does not agree with.
 */
function productCard(row) {
  const performance = row.sales !== undefined;
  return {
    productId: row.productId,
    productName: row.productName,
    source: performance ? 'performance' : 'stock',
    price: row.price ?? null,
    stockStatus: performance ? row.stock?.stockStatus ?? null : row.stockStatus,
    availableQuantity: performance ? row.stock?.availableQuantity ?? null : row.availableQuantity,
    lowStockThreshold: performance ? row.stock?.lowStockThreshold ?? null : row.lowStockThreshold,
    daysOfCover: performance ? null : row.daysOfCover ?? null,
    unitsSold: performance ? row.sales?.current?.units ?? 0 : row.unitsSoldInWindow ?? null,
    revenue: performance ? row.sales?.current?.revenue ?? 0 : null,
    averageRating: performance ? row.reviews?.averageRating ?? null : null,
  };
}

async function askSellerAdvisor({ message, ctx }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const toolCtx = createToolContext(ctx);

  try {
    const { decision, trace } = await runAgent({
      task: 'seller-advisor',
      system: SELLER_ADVISOR_SYSTEM,
      user: buildSellerAdvisorInput(text),
      tools: SELLER_TOOLS,
      ctx: toolCtx,
      // The schema allows a little overflow so an over-eager answer still
      // arrives; the card list itself is capped below.
      answerShape: {
        productIds: z.array(z.string().max(64)).max(PRODUCT_CARD_LIMIT * 2).optional(),
      },
      maxSteps: MAX_STEPS,
      maxTokens: 900,
    });

    const products = [...new Set(decision.productIds || [])]
      .map((id) => toolCtx.performance.get(String(id)) || toolCtx.stock.get(String(id)))
      .filter(Boolean)
      .map(productCard)
      .slice(0, PRODUCT_CARD_LIMIT);

    return { reply: decision.answer, products, degraded: false, steps: trace.length };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // No model, no explanation — but the shop still gets its real, ranked
      // stock alerts, which is the part of the panel that needs a decision today.
      const { products } = await stockAlertsTool.run(toolCtx, { limit: FALLBACK_ALERT_LIMIT });
      return { reply: null, products: products.map(productCard), degraded: true, steps: 0 };
    }
    throw err;
  }
}

module.exports = { askSellerAdvisor, productCard, MESSAGE_LIMIT, MAX_STEPS };
