const { z } = require('zod');

const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { createToolContext } = require('../tools');
const {
  searchCatalogueTool,
  listShopListingsTool,
  MATCH_LIMIT_DEFAULT,
  OWN_LIMIT_DEFAULT,
  DUPLICATE_SCORE,
} = require('../tools/catalogue.tools');
const {
  CATALOGUE_MATCH_SYSTEM,
  MATCH_CARD_LIMIT,
  DUPLICATE_CARD_LIMIT,
  buildCatalogueMatchInput,
} = require('../prompts/catalogueMatch.prompt');

/**
 * The catalogue matcher (docs/29 Phase 3b, part 1).
 *
 * Unlike the advisor, this one does not let the model choose its steps: a shop
 * about to add a product always needs both reads, so the search runs first and
 * the model only explains what came back. That also means the answer cannot be
 * talked into skipping the duplicate check.
 *
 * Every row shown to the client comes from the two tool results, addressed by an
 * id the model saw there — an invented or borrowed id is dropped before it
 * reaches the browser, and a shop can never be shown another shop's private
 * catalogue item, because `listForBrand` never read one.
 */
const QUERY_LIMIT = 200;
const CATEGORY_LIMIT = 80;

class CatalogueMatchError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const responseSchema = z.object({
  answer: z.string().trim().min(1).max(1200),
  // A little overflow is allowed so an eager answer still arrives; the cards
  // themselves are capped below.
  matchIds: z.array(z.string().max(64)).max(MATCH_CARD_LIMIT * 2).optional(),
  duplicateProductIds: z.array(z.string().max(64)).max(DUPLICATE_CARD_LIMIT * 2).optional(),
});

/**
 * The rows the shop gets with no model at all: what the server's own match rule
 * already called a duplicate. Same ranking the tool used, same rows, minus any
 * explanation.
 */
function fallbackCards(catalogue, listings) {
  const matches = catalogue.items
    .filter((item) => item.likelyDuplicate || item.listedByYou)
    .slice(0, MATCH_CARD_LIMIT);
  const duplicates = listings.products
    .filter((row) => row.score >= DUPLICATE_SCORE)
    .slice(0, DUPLICATE_CARD_LIMIT);
  return { matches, duplicates };
}

async function matchCatalogue({ query, barcode = null, categoryName = null, ctx }) {
  if (!ctx || !ctx.brandId) {
    throw new CatalogueMatchError(403, 'This needs a brand account.', 'NO_BRAND');
  }

  const text = sanitizeUserText(query, QUERY_LIMIT);
  if (!text) {
    throw new CatalogueMatchError(400, 'Say what the product is.');
  }
  // The chosen category is only context for the answer, and it arrives from the
  // browser, so it is stripped the same way the product words are.
  const category = sanitizeUserText(categoryName || '', CATEGORY_LIMIT) || null;

  const toolCtx = createToolContext(ctx);
  const [catalogue, listings] = await Promise.all([
    searchCatalogueTool.run(toolCtx, { query: text, ...(barcode && { barcode }), limit: MATCH_LIMIT_DEFAULT }),
    listShopListingsTool.run(toolCtx, { query: text, limit: OWN_LIMIT_DEFAULT }),
  ]);

  const cards = fallbackCards(catalogue, listings);

  try {
    const result = await generate({
      task: 'catalogue-match',
      messages: [
        { role: 'system', content: CATALOGUE_MATCH_SYSTEM },
        { role: 'user', content: buildCatalogueMatchInput({ query: text, barcode, categoryName: category, catalogue, listings }) },
      ],
      json: true,
      temperature: 0.2,
      maxTokens: 600,
      userId: ctx.userId,
      role: ctx.role,
    });

    const decision = parseModelJson(result.text, responseSchema);
    const matches = [...new Set(decision.matchIds || [])]
      .map((id) => toolCtx.catalogue.get(String(id)))
      .filter(Boolean)
      .slice(0, MATCH_CARD_LIMIT);
    const duplicates = [...new Set(decision.duplicateProductIds || [])]
      .map((id) => toolCtx.ownListings.get(String(id)))
      .filter(Boolean)
      .slice(0, DUPLICATE_CARD_LIMIT);

    return {
      reply: decision.answer,
      matches,
      duplicates,
      searched: { catalogue: catalogue.count, listings: listings.count, words: catalogue.asked.words },
      degraded: false,
    };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // No model, no explanation — but the duplicate check the shop came here
      // for is server-side arithmetic and still stands on its own.
      return {
        reply: null,
        matches: cards.matches,
        duplicates: cards.duplicates,
        searched: { catalogue: catalogue.count, listings: listings.count, words: catalogue.asked.words },
        degraded: true,
      };
    }
    throw err;
  }
}

module.exports = { matchCatalogue, CatalogueMatchError, fallbackCards, QUERY_LIMIT, responseSchema };
