const { z } = require('zod');

const { runAgent } = require('../agentLoop');
const { createToolContext, SERVICE_TOOLS } = require('../tools');
const { findProvidersTool } = require('../tools/service.tool');
const { sanitizeUserText } = require('../guard');
const { fallbackQueries } = require('./shopAssistant.agent');
const { SERVICE_HELPER_SYSTEM, buildServiceHelperInput } = require('../prompts/serviceHelper.prompt');

const MESSAGE_LIMIT = 500;
const MAX_PROVIDERS = 3;

/**
 * The final card for one provider. Slot groups come only from
 * get_provider_slots; without them the card lists the services from the search
 * with no times, so a card can never show an appointment the server did not
 * generate.
 */
function finalCard(provider, slotGroups) {
  return {
    providerId: provider.providerId,
    displayName: provider.displayName,
    slug: provider.slug,
    categoryName: provider.categoryName,
    blockName: provider.blockName,
    distanceKm: provider.distanceKm,
    startingAtPrice: provider.startingAtPrice,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    isNew: provider.isNew,
    offerings: slotGroups || (provider.topOfferings || []).map((offering) => ({ ...offering, slots: [] })),
  };
}

/**
 * Plain provider search used when the model is down. It runs the same read-only
 * search the Services page uses, so the shopper still gets real providers with
 * an honest "no assistant" answer (docs/29 Phase 2c).
 */
async function plainSearch(toolCtx, message) {
  for (const query of fallbackQueries(message)) {
    const { items } = await findProvidersTool.run(toolCtx, { query, limit: MAX_PROVIDERS });
    if (items.length > 0) return items;
  }
  const { items } = await findProvidersTool.run(toolCtx, { limit: MAX_PROVIDERS });
  return items;
}

/**
 * Phase 2c. Providers and times come from the tools; the model only chooses
 * which providers to show. It never books: the shopper opens the provider page
 * and uses the normal booking flow.
 */
async function askServiceHelper({ message, ctx, cityId, lat, lng }) {
  const text = sanitizeUserText(message, MESSAGE_LIMIT);
  const toolCtx = createToolContext({ ...ctx, cityId, lat, lng });

  try {
    const { decision, trace } = await runAgent({
      task: 'service-helper',
      system: SERVICE_HELPER_SYSTEM,
      user: buildServiceHelperInput(text),
      tools: SERVICE_TOOLS,
      ctx: toolCtx,
      answerShape: { providerIds: z.array(z.string().max(64)).max(MAX_PROVIDERS).optional() },
    });

    const providers = (decision.providerIds || [])
      .map((id) => {
        const card = toolCtx.providers.get(String(id));
        return card ? finalCard(card, toolCtx.slots.get(String(id))) : null;
      })
      .filter(Boolean)
      .slice(0, MAX_PROVIDERS);

    return { reply: decision.answer, providers, degraded: false, steps: trace.length };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      const found = await plainSearch(toolCtx, text);
      const providers = found
        .map((item) => {
          const card = toolCtx.providers.get(String(item.providerId));
          return card ? finalCard(card, null) : null;
        })
        .filter(Boolean)
        .slice(0, MAX_PROVIDERS);
      return { reply: null, providers, degraded: true, steps: 0 };
    }
    throw err;
  }
}

module.exports = { askServiceHelper, MESSAGE_LIMIT };
