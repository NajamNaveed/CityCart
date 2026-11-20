const { sanitizeUserText } = require('../guard');
const { classifyIntent, INTENTS, MAX_MESSAGE_CHARS } = require('../intent');
const { askShopAssistant } = require('./shopAssistant.agent');
const { askOrderHelper } = require('./orderHelper.agent');
const { askServiceHelper } = require('./serviceHelper.agent');
const { buildRecipeList } = require('./recipe.agent');
const { compareProducts } = require('./compare.agent');

/**
 * The single Ask CityCart chat (docs/29 Phase 2g). One message goes in, the
 * router chooses the same server-side agent that used to sit behind a mode
 * button, and the answer comes back with its `mode` so the UI can render the
 * right cards. No tool scope changes: each agent keeps its own read-only tools
 * and the caller's identity still comes from the authenticated request.
 */
const HINTS = Object.freeze({
  [INTENTS.SHOP]: ['Cheap rice nearby', 'Gift under 3000', 'Milk nearby'],
  [INTENTS.ORDER]: ['Where is my latest order?', 'How do returns work?', 'Can I cancel a pending order?'],
  [INTENTS.SERVICE]: ['AC repair tomorrow evening', 'Plumber near me', 'Salon for a haircut'],
  [INTENTS.RECIPE]: ['Chicken biryani for 6', 'Aloo gosht for 4', 'Vegetable pulao for 4'],
  [INTENTS.COMPARE]: ['Compare rice brands', 'Compare cooking oil 1L packs', 'Compare milk cartons'],
  [INTENTS.HELP]: [
    'Cheap rice nearby',
    'Where is my order?',
    'AC repair tomorrow evening',
    'Chicken biryani for 6',
    'Compare rice brands',
  ],
});

const HELP_REPLY = [
  'I can find products and shops, check your own orders, find a service provider and free times,',
  'turn a dish into a shopping list, or compare products side by side.',
  'Ask in English, Urdu or Roman Urdu — no need to pick a mode.',
].join(' ');

function emptyAnswer(mode) {
  return {
    mode,
    reply: null,
    products: [],
    orders: [],
    providers: [],
    title: null,
    items: [],
    degraded: false,
    steps: 0,
  };
}

function withHints(mode, result) {
  return { ...result, mode, hints: HINTS[mode] || [] };
}

function helpAnswer() {
  return withHints(INTENTS.HELP, {
    ...emptyAnswer(INTENTS.HELP),
    reply: HELP_REPLY,
  });
}

async function askCityCart({ message, ctx, cityId = null, lat = null, lng = null, lastMode = null }) {
  const text = sanitizeUserText(message, MAX_MESSAGE_CHARS);
  const mode = classifyIntent(text, { lastMode });

  if (mode === INTENTS.HELP) return helpAnswer();

  if (mode === INTENTS.ORDER) {
    return withHints(mode, await askOrderHelper({ message: text, ctx }));
  }
  if (mode === INTENTS.SERVICE) {
    return withHints(mode, await askServiceHelper({ message: text, ctx, cityId, lat, lng }));
  }
  if (mode === INTENTS.RECIPE) {
    return withHints(mode, await buildRecipeList({ message: text, ctx, cityId, lat, lng }));
  }
  if (mode === INTENTS.COMPARE) {
    return withHints(mode, await compareProducts({ message: text, ctx, cityId, lat, lng }));
  }
  return withHints(INTENTS.SHOP, await askShopAssistant({ message: text, ctx, cityId, lat, lng }));
}

module.exports = { askCityCart, HINTS, HELP_REPLY, MAX_MESSAGE_CHARS };
