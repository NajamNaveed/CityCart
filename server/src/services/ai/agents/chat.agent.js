const { sanitizeUserText } = require('../guard');
const { classifyIntent, INTENTS, MAX_MESSAGE_CHARS } = require('../intent');
const { resolveShopperScope } = require('../location');
const { answerLocation, answerPolicy, answerOffTopic, namedPlaceAsked, namedRulePlace } = require('../facts');
const { askShopAssistant } = require('./shopAssistant.agent');
const { askOrderHelper } = require('./orderHelper.agent');
const { askServiceHelper } = require('./serviceHelper.agent');
const { buildRecipeList } = require('./recipe.agent');
const { compareProducts } = require('./compare.agent');

/**
 * The single Ask CityCart chat (docs/29 Phase 2g, hardened in Phase 2h).
 *
 * One message goes in, the router chooses the agent, and the answer comes back
 * with its `mode` so the UI can render the right cards. Three question families
 * — where the shopper is, how the marketplace works and anything that is not
 * about CityCart — are answered here from the server's own data without a
 * provider call at all, because those are the questions a model can only guess
 * at. Everything else runs the same read-only agents, now measured from the
 * shopper's real location, resolved once and shared by all of them.
 */
const HINTS = Object.freeze({
  [INTENTS.SHOP]: ['Cheap rice nearby', 'Gift under 3000', 'Milk nearby'],
  [INTENTS.ORDER]: ['Where is my latest order?', 'How do returns work?', 'Can I cancel a pending order?'],
  [INTENTS.SERVICE]: ['AC repair tomorrow evening', 'Plumber near me', 'Salon for a haircut'],
  [INTENTS.RECIPE]: ['Chicken biryani for 6', 'Aloo gosht for 4', 'Vegetable pulao for 4'],
  [INTENTS.COMPARE]: ['Compare rice brands', 'Compare cooking oil 1L packs', 'Compare milk cartons'],
  [INTENTS.LOCATION]: ['Which block am I in?', 'Stores in my block', 'Do you deliver to my area?'],
  [INTENTS.POLICY]: ['What is the delivery fee?', 'How do I pay?', 'Till what time are shops open?'],
  [INTENTS.OFF_TOPIC]: ['Cheap rice nearby', 'Where is my order?', 'Stores in my block'],
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
    stores: [],
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

/** A reply the server wrote itself: no model, no provider call, nothing guessed. */
function factualAnswer(mode, reply, stores = []) {
  return withHints(mode, { ...emptyAnswer(mode), reply, stores });
}

async function askCityCart({
  message,
  ctx,
  cityId = null,
  lat = null,
  lng = null,
  blockIds = [],
  lastMode = null,
}) {
  const text = sanitizeUserText(message, MAX_MESSAGE_CHARS);
  const mode = classifyIntent(text, { lastMode });

  if (mode === INTENTS.HELP) return helpAnswer();
  if (mode === INTENTS.OFF_TOPIC) return factualAnswer(INTENTS.OFF_TOPIC, answerOffTopic(text));

  // One read of this shopper's own location — pin, then saved address, then the
  // blocks they picked — shared by every answer below so the chat and the
  // Stores page measure "near me" the same way.
  const scope = await resolveShopperScope({ userId: ctx.userId, cityId, lat, lng, blockIds });

  if (mode === INTENTS.LOCATION) {
    const { reply, stores } = await answerLocation({ text, scope });
    return factualAnswer(INTENTS.LOCATION, reply, stores);
  }
  // A message the router sent to the shop agent can still name a place rather
  // than an item ("shops in Karachi"). Only the database can tell the two
  // apart, so the place is read here and the answer is the shop list.
  let askedPlace = mode === INTENTS.SHOP ? await namedPlaceAsked(text, scope.cityId) : null;
  // The same is true of a question the router sent to the rules: "do you
  // deliver to DHA tonight" is about a zone, and only the rules that quote
  // money or hours are answered about the platform instead.
  if (!askedPlace && mode === INTENTS.POLICY) askedPlace = await namedRulePlace(text, scope.cityId);
  if (askedPlace) {
    const { reply, stores } = await answerLocation({ text, scope, place: askedPlace });
    return factualAnswer(INTENTS.LOCATION, reply, stores);
  }
  if (mode === INTENTS.POLICY) {
    return factualAnswer(INTENTS.POLICY, await answerPolicy({ text }));
  }

  const agent = {
    [INTENTS.ORDER]: askOrderHelper,
    [INTENTS.SERVICE]: askServiceHelper,
    [INTENTS.RECIPE]: buildRecipeList,
    [INTENTS.COMPARE]: compareProducts,
  }[mode];
  if (agent) return withHints(mode, await agent({ message: text, ctx, scope }));

  return withHints(INTENTS.SHOP, await askShopAssistant({ message: text, ctx, scope }));
}

module.exports = { askCityCart, HINTS, HELP_REPLY, MAX_MESSAGE_CHARS };
