/**
 * Intent routing for the single Ask CityCart chat (docs/29 Phase 2g).
 *
 * The chat used to make the customer pick a mode before typing. The router now
 * reads the message and sends it to the same server-side agents, so a shopper
 * can ask anything in one thread. Routing is deterministic on purpose: the
 * same text always reaches the same tool scope, which keeps it testable and
 * avoids spending a provider call just to decide.
 */
const { sanitizeUserText } = require('./guard');

const MAX_MESSAGE_CHARS = 500;

const INTENTS = Object.freeze({
  SHOP: 'shop',
  ORDER: 'order',
  SERVICE: 'service',
  RECIPE: 'recipe',
  COMPARE: 'compare',
  HELP: 'help',
});

const ROUTABLE_MODES = Object.freeze([
  INTENTS.SHOP,
  INTENTS.ORDER,
  INTENTS.SERVICE,
  INTENTS.RECIPE,
  INTENTS.COMPARE,
]);

const HELP_PHRASES = new Set([
  'help',
  'hi',
  'hey',
  'hello',
  'salam',
  'salaam',
  'assalamualaikum',
  'assalam o alaikum',
  'what can you do',
  'what do you do',
  'how can you help',
  'how does this work',
  'capabilities',
  'madad',
  'مدد',
  'کیا کر سکتے ہیں',
  'کیا کر سکتے',
]);

const ORDER_PATTERNS = [
  /\b(?:my|our|mera|meri|meray|apna|apni)\s+(?:\w+\s+){0,2}(?:orders?|parcels?|packages?)\b/iu,
  /\b(?:orders?|parcels?|packages?|delivery)\b[^.!?]{0,48}\b(?:status|track(?:ing)?|where|kahan|kab|when|arriv(?:e|ed|ing)|ayega|aayega|late|delayed|cancel(?:led|lation)?|return(?:ed|s)?|refund(?:ed|s)?|deliver(?:ed|y)?)\b/iu,
  /\b(?:status|track(?:ing)?|cancel(?:led|lation)?|return(?:ed|s)?|refund(?:ed|s)?)\b[^.!?]{0,48}\b(?:orders?|parcels?|packages?)\b/iu,
  /\bwhere(?:'s| is| are)\s+(?:my|our)\s+(?:\w+\s+){0,2}(?:orders?|parcels?|packages?|delivery)\b/iu,
  /\border\s*(?:number|no\.?|#|id)\b/iu,
  /\bmy\s+delivery\b/iu,
  /\brefunds?\b/iu,
  /\bcustomer\s+(?:service|support|care)\b/iu,
  /\breturns?\s+(?:policy|policies)\b/iu,
  /\bhow\s+do\s+(?:i\s+)?returns?\s+work\b/iu,
  /\b(?:want|need|wanna|like)\s+to\s+return\b/iu,
  /\breturn\s+(?:this|it|the|my|an?)\b/iu,
  /\bexchange\s+(?:this|it|the|my)\b/iu,
  /\b(?:wapsi|wapas|واپسی)\b/iu,
  /آرڈر[^۔!؟]{0,32}(?:کہاں|کب|منسوخ|واپسی|سٹیٹس|حالت)/u,
];

const ORDER_CANCEL_PATTERNS = [
  /\bcancel(?:led|lation)?\s+(?:it|that|this|my|the)\b/iu,
  /\bcancel\s+(?:my\s+)?(?:order|parcel|package)\b/iu,
  /\border\s+(?:ko\s+)?cancel\b/iu,
  /آرڈر[^۔!؟]{0,20}منسوخ/u,
  /منسوخ[^۔!؟]{0,20}آرڈر/u,
];

const COMPARE_PATTERNS = [
  /\bcompar(?:e|ing|ison)\b/iu,
  /\bversus\b/iu,
  /\bvs\.?\b/iu,
  /\bside[- ]by[- ]side\b/iu,
  /\bdifference\s+(?:between|among)\b/iu,
  /\bwhich\s+(?:one\s+)?(?:is\s+)?(?:better|cheaper|cheapest|best)\b/iu,
  /\bwhat(?:'s| is)\s+the\s+difference\b/iu,
  /\b(?:muqabla|farq)\b/iu,
  /(?:موازنہ|فرق|بہتر)/u,
];

const RECIPE_PATTERNS = [
  /\brecipe(?:s)?\b/iu,
  /\bingredients?\b/iu,
  /\bcook(?:ing)?\b/iu,
  /\bbak(?:e|ing)\b/iu,
  /\bfor\s+\d+\s+(?:people|persons?|servings?|guests?)\b/iu,
  /\b\d+\s+(?:people|persons?|servings?|guests?)\s+(?:ka|ki|ke)\b/iu,
  /\b(?:kaise|kaisay)\s+(?:banaye|banana|banta|banate)\b/iu,
  /\bbana(?:na|ne|o|kar)\s+(?:hai|hain|chahta|chahti)\b/iu,
  /(?:ترکیب|اجزاء|پکانا|بنانا)/u,
];

// A dish name alone stays a product search ("biryani masala"), but a dish plus
// a serving amount is a shopping-list request.
const DISH_PATTERN =
  /\b(?:biryani|pulao|pulav|karahi|nihari|haleem|qorma|korma|curry|roast|kebab|kabab|samosa|paratha|naan|roti|kheer|halwa|aloo\s+gosht|chicken\s+karahi)\b/iu;
const SERVING_PATTERN =
  /\b(?:for\s+\d+\b|\d+\s*(?:people|persons?|servings?|guests?|log|afrad|bandon)\b)/iu;

const SERVICE_PATTERNS = [
  /\b(?:plumber|electrician|carpenter|painter|mechanic|technician|salon|barber|haircut|hairdresser|masseur|masseuse|cleaner|cleaning|pest\s*control|fumigation|mover|movers|tutor|tailor|mistri|darzi|bijli|safai|marammat|tameer)\b/iu,
  /\bac\s*(?:repair|service|servicing|installation|install|technician|not\s+working)\b/iu,
  /\b(?:air\s*condition(?:er|ing)?)\b[^.!?]{0,24}\b(?:repair|service|fix|install|gas|not\s+working)\b/iu,
  /\b(?:repair|fix|install|servicing|maintenance|leak(?:ing)?|clogged|broken)\b/iu,
  /\b(?:book|booking|appointment|slot|availability)\b/iu,
  /\bservice\s+provider\b/iu,
  /(?:مرمت|پلمبر|الیکٹریشن|الیکٹریشین|بجلی|صفائی|درزی|مستری|بکنگ|اپائنٹمنٹ|سروس)/u,
];

const FOLLOW_UP_START = /^(?:and|what about|how about|why|when|where|which one|the (?:first|second|third|other|same) one|it|that|this|those|these|uska|uski|uske|wo|woh|aur|kya|kyun|kab|kahan|kaunsa|kaunsi)\b/iu;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueIntents(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function isHelp(text) {
  const stripped = text.replace(/[.!?,;:]+$/g, '').trim();
  return HELP_PHRASES.has(stripped);
}

/**
 * Returns one of the chat intents. `lastMode` is the mode of the previous
 * answer, used only to resolve short follow-ups such as "cancel it" or
 * "tomorrow evening"; a sentence with its own strong signal always wins.
 */
function classifyIntent(message, { lastMode = null } = {}) {
  const text = normalize(sanitizeUserText(message, MAX_MESSAGE_CHARS));
  if (!text) return INTENTS.SHOP;
  if (isHelp(text)) return INTENTS.HELP;

  if (uniqueIntents(ORDER_PATTERNS, text)) return INTENTS.ORDER;
  if (uniqueIntents(COMPARE_PATTERNS, text)) return INTENTS.COMPARE;
  if (uniqueIntents(RECIPE_PATTERNS, text) || (DISH_PATTERN.test(text) && SERVING_PATTERN.test(text))) {
    return INTENTS.RECIPE;
  }
  if (uniqueIntents(SERVICE_PATTERNS, text)) return INTENTS.SERVICE;

  const previous = ROUTABLE_MODES.includes(lastMode) ? lastMode : null;
  if (previous === INTENTS.ORDER && (uniqueIntents(ORDER_CANCEL_PATTERNS, text) || FOLLOW_UP_START.test(text))) {
    return INTENTS.ORDER;
  }
  if (previous === INTENTS.SERVICE && (FOLLOW_UP_START.test(text) || /\b(?:tomorrow|today|tonight|morning|afternoon|evening|slot|time|kal|aaj|subah|sham)\b/iu.test(text))) {
    return INTENTS.SERVICE;
  }
  if (previous === INTENTS.COMPARE && (FOLLOW_UP_START.test(text) || /\b(?:cheap(?:er|est)?|better|best|rating|stock|price)\b/iu.test(text))) {
    return INTENTS.COMPARE;
  }
  if (previous === INTENTS.RECIPE && (FOLLOW_UP_START.test(text) || /\b(?:add|cart|without|instead|substitute|more|less)\b/iu.test(text))) {
    return INTENTS.RECIPE;
  }
  if (previous === INTENTS.SHOP && (FOLLOW_UP_START.test(text) || /\b(?:cheap(?:er|est)?|more|another|other|size|bigger|smaller|stock)\b/iu.test(text))) {
    return INTENTS.SHOP;
  }

  return INTENTS.SHOP;
}

module.exports = {
  INTENTS,
  ROUTABLE_MODES,
  MAX_MESSAGE_CHARS,
  classifyIntent,
  normalize,
};
