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
const { fallbackQueries } = require('./query');

const MAX_MESSAGE_CHARS = 500;

const INTENTS = Object.freeze({
  SHOP: 'shop',
  ORDER: 'order',
  SERVICE: 'service',
  RECIPE: 'recipe',
  COMPARE: 'compare',
  LOCATION: 'location',
  POLICY: 'policy',
  OFF_TOPIC: 'offTopic',
  HELP: 'help',
});

// Every mode the chat can answer with, including the three that the server
// answers from its own data. The client echoes the last one back so a short
// follow-up keeps its thread; only the five agent modes are ever routed by it.
const ROUTABLE_MODES = Object.freeze([
  INTENTS.SHOP,
  INTENTS.ORDER,
  INTENTS.SERVICE,
  INTENTS.RECIPE,
  INTENTS.COMPARE,
  INTENTS.LOCATION,
  INTENTS.POLICY,
  INTENTS.OFF_TOPIC,
]);

/** The modes that reach a model agent; the others are answered from data. */
const AGENT_MODES = Object.freeze([INTENTS.SHOP, INTENTS.ORDER, INTENTS.SERVICE, INTENTS.RECIPE, INTENTS.COMPARE]);

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

/**
 * Questions that are not about the marketplace at all (docs/29 Phase 2h). Left
 * unrouted these became product searches — "who made you" searched for "made",
 * which is how a helpful assistant starts answering with a shop card. They are
 * specific phrases, so a real request is never caught by them.
 */
const OFF_TOPIC_PATTERNS = [
  /\b(?:who|what)\s+(?:made|created|built|owns|own)\s+(?:you|this|citycart|city\s*cart)\b/iu,
  /\b(?:are you|you are)\s+(?:a\s+)?(?:human|real|person|bot|robot|ai|chatgpt|gpt|gemini|model)\b/iu,
  /\b(?:your|what(?:'s| is) your)\s+(?:name|system prompt|instructions|password|secret)\b/iu,
  /\b(?:show|reveal|print|repeat)\b[^.!?]{0,24}\b(?:system prompt|instructions|other (?:customer|user|shop)|everyone'?s)\b/iu,
  /\b(?:weather|rain today|temperature outside|cricket|match score|job vacancy|give me a job|horoscope|lucky draw)\b/iu,
  /\b(?:write|make|compose|tell me)\b[^.!?]{0,24}\b(?:poem|story|joke|song|essay|homework|assignment|python|program|code)\b/iu,
  /\b(?:free fire|pubg|tiktok|youtube video|viral video|movie|actress|girlfriend|boyfriend)\b/iu,
  /\b(?:politics|political|prime minister|president|election)\b/iu,
  /\b(?:medical advice|medicine ka naam|dawai|diabetes|blood pressure|cancer|legal advice|fatwa)\b/iu,
  // Arithmetic and credential requests are neither of the chat's jobs. Left
  // alone, "what is 2 plus 2" became a product search for "2".
  /\b(?:calculate|solve this|what\s+is\s+\d+\s*(?:plus|minus|times|divided|multiplied|\+|-|\*|\/)|\d+\s*(?:plus|minus|times|divided\s+by|multiplied\s+by)\s*\d+)\b/iu,
  // Only the leak of a secret is off-limits. Forgetting a password is a normal
  // account question with a real page, so it is routed to the rules instead of
  // being refused here.
  /\b(?:give|send|show|tell|what(?:'s| is))\b[^.!?]{0,16}\b(?:your\s+|my\s+|the\s+)?(?:password|otp|pin\s*code|token)\b/iu,
  // Places CityCart has no listing for. An assistant that answers "nearest ATM"
  // with a shop card is worse than one that says it only knows the marketplace —
  // but "Airport Housing Society" and "Police Lines" are real delivery zones, so a
  // sentence that asks about delivery, coverage or reaching it stays in the chat.
  /^(?!.*\b(?:deliver\w*|delivery|reach\w*|cover\w*|coverage|pohanch\w*|ponch\w*|bhej\w*)\b).*\b(?:atm|bank\s*(?:branch|office|loan)|petrol\s*(?:pump|station)|fuel\s+station|hospital|mosque|temple|church|gurdwara|airport|bus\s+stand|railway\s+station|train\s+station|school|college|university|nadra|fia|police\s+station)\b/iu,
  /(?:موسم|کرکٹ|نوکری|شعر|افسانہ|پولیس|انتخابات|طبی مشورہ|دوا|ای ٹی ایم|بینک|ہسپتال|مدرسہ)/u,
];

/**
 * Questions about where this shopper is, and whether CityCart reaches them
 * (docs/29 Phase 2h). The customer's own saved location is a fact the server
 * has; it is not something a model may guess.
 */
const LOCATION_PATTERNS = [
  /\b(?:which|what)\s+(?:block|area|locality|zone|address|location)\b[^.!?]{0,24}\b(?:is|are|did|have|i|my|meri|mera)\b/iu,
  /\bin\s+which\s+(?:block|area|locality|zone)\b/iu,
  /\bi\s+(?:set|saved|selected|am\s+in)\b[^.!?]{0,20}\b(?:block|area|location|address)\b/iu,
  /\b(?:where|kahan|kahaa)\b[^.!?]{0,20}\b(?:location|address|block|area)\b/iu,
  /\b(?:stores?|shops?|markets?)\b[^.!?]{0,20}\b(?:in|near|from)\s+(?:my|the|this)\s+(?:block|area|locality|zone|location)\b/iu,
  // "any stores near me" is about the area, not an item; a sentence that names
  // a product ("which shop sells cream near me") stays a product search.
  /\b(?:any|which|what|all|the)?\s*(?:stores?|shops?|markets?)\s+(?:in|near|to|around|of)\s+(?:me|my)\b/iu,
  /\b(?:do|does|can)\s+(?:you|citycart)\b[^.!?]{0,24}\b(?:deliver|delivery|reach|come\s+to)\b/iu,
  // "kya aap DHA mein deliver karte hain" puts the zone before the verb, so the
  // English "do you deliver to" word order never appears in it. Biasing these
  // toward coverage is the lesser error: a location answer still tells the
  // shopper whether CityCart reaches them, a product search for "DHA" tells
  // them nothing.
  /\b(?:kya|kiya)\b[^.!?]{0,28}\b(?:deliver|delivery|pohanch|ponch|bhej)\w*\b/iu,
  /\bdeliver\w*\s+(?:karte|karti|karta)\b[^.!?]{0,8}\b(?:hain|hai)\b/iu,
  /\bdeliver(?:y|ing)?\s+(?:to|in|area|zone|availability|coverage|range)\b/iu,
  // "is delivery available here / in my area" asks about coverage, not money.
  /\b(?:delivery|deliver)\b[^.!?]{0,20}\b(?:available|availability|cover(?:ed|age)?|possible|open|start)\b/iu,
  /\b(?:is|am)\b[^.!?]{0,16}\b(?:covered|deliverable|serviceable)\b/iu,
  /\b(?:areas?|locality|localities|zones?|blocks?)\b[^.!?]{0,20}\b(?:cover|covering|deliver|reach|service)\b/iu,
  /\b(?:delivery|kahan)\s+(?:ka|ki|of)\s*(?:area|block|zone|ilaka|elaka)\b/iu,
  /(میرے?\s?(علاقہ|علاوہ|پتہ|بلاک|لوکیشن)|کس\s?بلاک|کیا\s?آپ[^۔!؟]{0,20}(ڈیلیور|پہنچ)|ڈیلیوری[^۔!؟]{0,16}(دستیاب|میسر|شروع))/iu,
];

/**
 * The weakest location signals, checked only when the message has nothing left
 * to search for. "cheapest milk in my area" is a request for milk that happens
 * to mention where the shopper lives, while "what is my area" and "which store
 * is closest to me" name no item at all and are only answerable from the
 * address on file.
 */
const LOCATION_MENTION = [
  /\b(?:my|mera|meri|meray|apna|apni)\s+(?:block|area|locality|zone|location|address|ilaka|elaka|set\s+location)\b/iu,
  /\b(?:stores?|shops?|markets?)\b[^.!?]{0,24}\b(?:me|my position|my location|my area|here)\b/iu,
];

/**
 * How the marketplace works, including money. Answered from the platform's own
 * settings and the real checkout rule rather than by the model, because an
 * invented delivery fee is the most expensive kind of wrong answer
 * (docs/29 Phase 2h, AGENTS.md §17). Questions that also name an order keep
 * going to the order helper, which runs first.
 */
const POLICY_PATTERNS = [
  /\b(?:delivery|shipping)\b[^.!?]{0,16}\b(?:fee|charge|charges|cost|rate)\b/iu,
  /\b(?:fee|charge|charges|cost)\b[^.!?]{0,20}\bdelivery\b/iu,
  // "delivery kitni hai" and "delivery charge kitna" ask about money without
  // the word "fee", which is how most shoppers in Pakistan phrase it.
  /\b(?:delivery|delivering|shipping)\b[^.!?]{0,16}\b(?:kitna|kitni|kya|how\s+much|free|charges?)\b/iu,
  /\b(?:how\s+much|kitna|kitni|kitne|price|cost)\b[^.!?]{0,16}\bdeliver/iu,
  // "free delivery?" is a question about the rule. "rice under 3000 with free
  // delivery" is a product request that merely names the rule as a filter, and
  // answering it with a fee would ignore the item the shopper asked for.
  /(?:^|(?:how|what|is|are|do|does|can|could|get|getting|want|need|milti|milla|mile)\b[^.!?]{0,18})\bfree\s+delivery\b/iu,
  /\b(?:cash\s+on\s+delivery|cod)\b/iu,
  /\bminimum\b[^.!?]{0,16}\b(?:order|amount|purchase)\b/iu,
  /\b(?:how|can)\b[^.!?]{0,16}\b(?:i\s+)?(?:pay|payment)\b/iu,
  /\bpayment\s+(?:method|methods|options|type|mein)\b/iu,
  /\b(?:online\s+payment|credit\s+card|debit\s+card|bank\s+transfer|easypay|jf\s*khalti)\b[^.!?]{0,20}\b(?:accept|available|use|kar)\b/iu,
  /\b(?:shop|store|market|dukaan)s?\b[^.!?]{0,20}\b(?:open|opens|closing|close|closes|timing|timings|time|khuli|khulta|band)\b/iu,
  /\b(?:are|is)\s+(?:they|this\s+shop|the\s+shop|stores?)\s+open\b/iu,
  /\b(?:till\s+what\s+time|closing\s+time|kab\s+(?:khulta|khuli|band))\b/iu,
  // "what is the delivery time" is a how-long question. CityCart stores no ETA,
  // so it must be answered plainly instead of becoming a product search.
  /\bdelivery\b[^.!?]{0,16}\b(?:time|timing|how\s+long|take|late)\b/iu,
  /\bhow\s+long\b[^.!?]{0,20}\b(?:delivery|deliver|arrive|take)\b/iu,
  // "do you deliver in the evening / today / after 8" asks when the platform
  // reaches the shopper. The coverage patterns read "do you deliver" in the same
  // sentence and would answer with the shopper's own block, ignoring the time.
  /\bdeliver\w*\b[^.!?]{0,24}\b(?:today|tonight|tomorrow|morning|afternoon|evening|night|midnight|\d{1,2}\s*(?:am|pm)|after\s+\d|before\s+\d|till\s+\d|sham|subah|raat|dopehar)\b/iu,
  // The same schedule question without the word “shop”: “what are your
  // timings”, “open 24 hours?”, “kab tak khule rehte ho”. Unrouted they became
  // searches for the words “your” and “khule”.
  /\b(?:your|apna|apni|citycart(?:'?s)?)\s+(?:timing|timings|schedule|hours|opening)\b/iu,
  // “timing belt” is a car part, so the word alone is not a schedule question:
  // it has to say whose timings or be asked as one.
  /\b(?:opening|closing|shop|shops|store|stores|market|office|delivery|service)\s*timings?\b/iu,
  /\btimings?\b[^.!?]{0,16}\b(?:kya|kiya|hai|hen|what|when|kab|kitne)\b/iu,
  /\b(?:open|opens|opening|work|works|operate|delivers?|deliver|delivery)\b[^.!?]{0,16}\b(?:24\s*(?:hours|hrs|x\s*7|\/\s*7)|7\s*days?|seven\s+days?|all\s+day|round\s+the\s+clock)\b/iu,
  /\b(?:24\s*\/\s*7|24\s*x\s*7|round\s+the\s+clock)\b/iu,
  /\bkab\s+tak\b/iu,
  // A named day or a holiday is the same unstored schedule; left to the shop
  // agent, “do you deliver on eid” searched the listings for a product called
  // “eid”. Only when nothing is being bought: “deliver rice on friday” wants
  // rice, and the chat cannot schedule it either way.
  /\b(?:do|does|can|will)\s+(?:you|citycart)\s+(?:deliver\w*|delivering|reach|work|operate|open)\b(?:(?:\s+(?:to|in|at|my|the|your|a|here|there|now|please|kindly))*\s+)(?:on|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|eid|ramadan|chutti|holiday|vacation)\b/iu,
  // How to pay, said the way a shopper says it, and the methods that do not
  // exist here yet.
  /\b(?:kaise|kaisay|kesa|kesay)\b[^.!?]{0,16}\b(?:pay|payment|ada|adai|karu|karoon)\b/iu,
  /\bpayment\b/iu,
  /\b(?:installments?|instalments?|emi|part\s+payment|advance\s+payment)\b/iu,
  /\b(?:coupons?|promo\s*code|promocode|voucher|discount\s+code|discount\s+coupon)\b/iu,
  // The shopper’s own account: where the cart and the saved addresses are and
  // what nobody here can change. These are the questions that used to answer
  // with a bag of rice because “account”, “cart” and “address” were searchable.
  /\b(?:where(?:'s| is)?|show|find)\b[^.!?]{0,16}\b(?:my\s+|the\s+)?(?:cart|basket|wishlist|addresses?)\b/iu,
  /\b(?:save|change|update|edit|delete|remove|reset|make\s+default)\w*\b[^.!?]{0,20}\b(?:my\s+|the\s+|apna\s+|apni\s+|mera\s+|meri\s+)?(?:saved\s+)?(?:address|addresses|profile|account|phone\s*number|mobile\s*number|email)\b/iu,
  /\badd\b[^.!?]{0,12}\b(?:a\s+|new\s+|apna\s+)?(?:saved\s+)?(?:address|addresses)\b/iu,
  /\b(?:without|need|needs|want|have)\s+(?:an?\s+)?(?:account|login|log\s*in|sign\s*[-\s]?up|registration)\b/iu,
  /\b(?:do|does|can)\s+i\s+need\s+(?:an?|to|any)\b/iu,
  // Signing in is the one thing the shopper has to do alone: the reset link is
  // a real page, and the chat must never be asked to carry a password.
  /\b(?:forgot|reset|change|update|create|set)\w*\b[^.!?]{0,16}\b(?:my\s+|apna\s+|mera\s+)?password\b/iu,
  /\bpassword\b[^.!?]{0,20}\b(?:forgot|reset|kaise|kaisay|how|link|change|badal)\b/iu,
  /\b(?:password|log\s*in|login)\s+(?:nahi|nahi|not)\s+(?:ho\s+raha|raha|chalu|kaam)\b/iu,
  /(?:پاس\s?ورڈ|پاسورڈ)[^۔!؟]{0,16}(?:بھول|ری\s?سیٹ|بدل|کیسے)/u,
  // A payment method that only has a name in the sentence: “jazzcash”, “upi”.
  // Left alone these became product searches for a word no shop stocks.
  // “wallet” is also a thing a shopper buys, so it only counts as a method when
  // it is the payment that is named.
  /\b(?:jazzcash|jazz\s+cash|easypaisa|easy\s*paisa|bank\s+transfer|direct\s+deposit|upi|paypal|wallet\s*(?:payment|app)|online\s+payment|payment\s+(?:method|option|mode|gateway)s?)\b/iu,
  /\b(?:accept|take|support|allow|have|can\s+i\s+pay)\b[^.!?]{0,16}\b(?:cash|card|visa|master|payla?nd?|online|bank)\b/iu,
  // The paper the order leaves behind. CityCart issues a receipt, not an
  // invoice on request, and “bill chahiye” is the way a shopper asks for it.
  /\b(?:invoice|receipt|payment\s+proof|sale\s+slip|bill\s+(?:copy|receipt|proof|chahiye)|copy\s+(?:of\s+)?(?:the\s+)?bill|bill\s+do|bill\s+mila)\b/iu,
  /\bbill\b[^.!?]{0,16}\b(?:chahiye|chaiye|nahi\s+(?:aaya|mile|aayi)|copy|proof|do)\b/iu,
  // “مجھے بل چاہیے” — the same ask in Urdu. \b is ASCII only, so these words
  // are read as neighbours instead.
  /بل[^۔!؟]{0,10}چاہیے|رسید|انوائس/u,
  // Whose number: a rider's phone is not in this chat, a shop's is on its page.
  /\b(?:rider|delivery\s+boy|shop|store|dukaan|seller|provider|market)(?:'s|s| ki| ka)?\b[^.!?]{0,18}\b(?:number|no\.?|phone|mobile|whatsapp|contact|call|na?mber)\b/iu,
  /\b(?:number|phone|mobile|whatsapp|contact)\b[^.!?]{0,18}\b(?:of\s+|for\s+|ka|ki)\s*(?:the\s+|a\s+|my\s+)?(?:rider|shop|store|seller|provider|dukaan)\b/iu,
  /\b(?:call|phone\s+(?:kar|lag|karna))\b[^.!?]{0,16}\b(?:the\s+|a\s+|meri\s+|myna\s+)?(?:rider|shop|store|dukaan)\b/iu,
  /(رائیڈر|دکان)[^۔!؟]{0,14}(?:نمبر|فون|کال)/u,
  // Working on CityCart rather than buying from it: the shop and provider
  // portals have their own pages, and a product search answered these.
  /\b(?:how\s+(?:do\s+i|can\s+i|to)|i\s+want\s+to|want\s+to|i\s+need\s+to)\b[^.!?]{0,20}\b(?:sell|become|open\s+(?:a|my)\s+(?:shop|store|market|dukaan)|start\s+(?:a|my)\s+(?:shop|store|business)|list\s+my)\b/iu,
  /\b(?:become|work\s+as|join)\s+(?:a\s+|an\s+|the\s+)?(?:seller|shopkeeper|rider|delivery\s+(?:boy|person|guy|partner)|service\s+provider|electrician|plumber|partner)\b/iu,
  /\b(?:apply|application)\b[^.!?]{0,24}\b(?:as|for|to)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:seller|shop|store|rider|provider|service|partner|business)\b/iu,
  /\b(?:sell|store|shop|product)s?\b[^.!?]{0,16}\bon\s+citycart\b/iu,
  /\b(?:seller|rider|provider|shop|store)\s*(?:apply|application|registration|portal|sign\s*[-\s]?up)\b/iu,
  /\b(?:register|registration)\b[^.!?]{0,20}\b(?:as|on|with)\b[^.!?]{0,16}\b(?:seller|shop|store|rider|provider|partner|citycart)\b/iu,
  /\b(?:dukaan|shop|store)\b[^.!?]{0,16}\b(?:kaise\s+khol|kholna|kholni|kahan\s+se\s+khol)\b/iu,
  /(دکان[^۔!؟]{0,12}(?:کھول|رجسٹر|اپلائی)|فروخت[^۔!؟]{0,12}(?:کرن|شروع)|رائیڈر[^۔!؟]{0,12}(?:بن|کام\s?مل|نوکری))|((?:سیلر|پرووائڈر|رائیڈر)[^۔!؟]{0,12}(?:اپلائی|رجسٹر|کیلے|کیلئے))/u,
  // Why the money at checkout is not the money on the shelf: the server adds
  // the numbers, so the answer is the rule, not a search.
  /\b(?:why|kyun|kyu|kis\s+liye)\b[^.!?]{0,24}\b(?:total|amount|bill|price|cost|checkout)\b[^.!?]{0,24}\b(?:more|less|different|high|zyada|barh|change[d]?)\b/iu,
  /\b(?:total|amount|checkout)\b[^.!?]{0,20}\b(?:more|zyada|different|high)\b[^.!?]{0,16}\b(?:than|from|of|to)\b/iu,
  // Who to ask, rather than what to order: the settings hold the real channel.
  /\b(?:speak|talk|chat)\b[^.!?]{0,18}\b(?:to\s+)?(?:a\s+|the\s+)?(?:human|person|agent|representative|support|customer\s+(?:service|care|support))\b/iu,
  /\b(?:human|real)\s+(?:agent|support|person|being)\b/iu,
  /\b(?:how\s+(?:do\s+i|to)\s+(?:order|shop|buy)|kaise\s+order)\b[?.!\s]*$/iu,
  /\b(?:how|what)\b[^.!?]{0,20}\b(?:place|put|make)\s+(?:an?\s+)?order\b/iu,
  // “place an order for me” asks the chat to do something it cannot: the answer
  // is the checkout steps, not a product search. A sentence that names an item
  // (“order rice for me”) still wants that item, so the verb needs “order” as a
  // noun right behind it.
  /\b(?:place|placed|put|make|created|submit)\w*\b[^.!?]{0,12}\b(?:an?\s+|the\s+|my\s+|apna\s+)?order\b/iu,
  /\b(?:support\s+(?:number|email|contact)|complaint\s+(?:kahan|how))\b/iu,
  /(ڈیلیوری\s?(?:فی|چارج|کتنی|مفت|وقت|لگ)|کم\s?از\s?کم\s?آرڈر|طریقہ\s?ادائیگی|دکان[^۔!؟]{0,12}(?:کھل|بند|اوقات))/u,
  // The same account, holiday and instalment families in Urdu. “میرا پتہ کہاں
  // ہے” deliberately stays a location question, so کہاں is only read for the
  // cart and the account, never for the address.
  /(?:پتہ|ایڈریس)[^۔!؟]{0,16}(?:بدل|تبدیل|محفوظ|حذف|مٹا|نیا|شامل)/u,
  /(?:ٹوکری|اکاؤنٹ|اکاونٹ|پروفائل|سائن\s?اپ)[^۔!؟]{0,16}(?:کہاں|بدل|تبدیل|محفوظ|حذف|ختم|نیا|لازمی)/u,
  /(?:عید|رمضان|چھٹی|جمعرات|جمعہ|ہفتہ|اتوار|پیر|منگل|بدھ)[^۔!؟]{0,20}(?:ڈیلیور|پہنچ|کھل|آرڈر|ختم)/u,
  /(?:ڈیلیور|پہنچ|کھل|آرڈر)\w*[^۔!؟]{0,20}(?:عید|رمضان|چھٹی|جمعرات|جمعہ|ہفتہ|اتوار|پیر|منگل|بدھ)/u,
  /(?:ٹائمز|ٹائمنگز|شیدول)/u,
  /(?:کوپن|واؤچر|قسط|ایم\s?آئی)/u,
];

const ORDER_PATTERNS = [
  /\b(?:my|our|mera|meri|meray|apna|apni)\s+(?:\w+\s+){0,2}(?:orders?|parcels?|packages?|riders?)\b/iu,
  // The second half must say something about the order's fate. A bare "for
  // delivery" or "with delivery" is a filter on a purchase, not a status
  // question, and answering those with the order list is how the shopper gets
  // a reply about an order they never mentioned.
  /\b(?:orders?|parcels?|packages?|delivery|riders?)\b[^.!?]{0,48}\b(?:status|track(?:ing)?|where|kahan|kab|when|arriv(?:e|ed|ing)|ayega|aayega|late|delayed|cancel(?:led|lation)?|return(?:ed|s)?|refund(?:ed|s)?|delivered)\b/iu,
  /\b(?:status|track(?:ing)?|cancel(?:led|lation)?|return(?:ed|s)?|refund(?:ed|s)?)\b[^.!?]{0,48}\b(?:orders?|parcels?|packages?)\b/iu,
  /\bwhere(?:'s| is| are)\s+(?:my|our)\s+(?:\w+\s+){0,2}(?:orders?|parcels?|packages?|delivery|riders?)\b/iu,
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
  // "kab tak ayega" (when will it come) names no order, but nothing else in the
  // chat arrives, so a product search would be the wrong answer.
  /\bkab\s+(?:tak\s+)?(?:aayega|ayega|aaega|aayegi|ayegi|aaogi|milega|milegi|milenga|milengi|pohanchega|ponchega|pohanchegi)\b/iu,
  // Whether returns are accepted at all is the order helper's rule question, and
  // it has to be caught here: the coverage patterns read the "delivery" in
  // "do you accept returns after delivery" and would answer with the shopper's
  // own block instead of the rule.
  /\b(?:accept|allow|offer|give|get|make|send|process)\w*\b[^.!?]{0,20}\b(?:a\s+)?returns?\b/iu,
  /\b(?:returns?|exchange)\b[^.!?]{0,24}\b(?:policy|possible|allowed|accepted|after\s+delivery|how\s+long|kaise|kitne\s+din)\b/iu,
  // What went wrong is about the shopper’s own order. Both halves have to be in
  // the sentence, so “broken rice” stays the grocery it is and “order cold
  // drinks” stays a purchase — while “my parcel came empty” reaches the agent
  // that can actually read the order instead of a product search.
  /\b(?:wrong|damaged|defective|expired|empty|missing|stolen|spoilt|spoiled|short|partial|rude|dirty|cold|open(?:ed)?|half|broken(?!\s+(?:rice|wheat|masoor|chana|gram))|kharab|kharaab|toota|tuta|aadha)\s+(?:of\s+|the\s+|a\s+|an\s+|my\s+|mere\s+|mera\s+|meri\s+)?(?:items?|order|parcel|package|packet|products?|goods|deliver(?:y|ies)|box|carton|saman|raider|riders?)\b/iu,
  /\b(?:items?|order|parcel|package|packet|products?|goods|deliver(?:y|ies)|box|carton|saman|raider|riders?)\s+(?:was|were|is|are|got|came|reached|became|looks?\s+like|not|never|koi\s+nahi)\s+(?:too|very|so)?\s*(?:wrong|damaged|defective|expired|empty|missing|stolen|spoilt|spoiled|short|rude|dirty|cold|half|open|broken|kharab|kharaab|toota|tuta)\b/iu,
  /\b(?:no|never)\s+(?:rider|delivery|parcel|package)\b/iu,
  // Roman Urdu puts the adjective after the noun with nothing between, and the
  // English compound risk (“cold drinks”, “broken rice”) does not exist for
  // these words, so this order is read only for them.
  /\b(?:saman|saaman|order|order\s?ka|parcel|package|item|items|delivery|raider|riders?)\s+(?:kharab|kharaab|toota|tuta|aadha|adha|khali|khalee|galat|ghalat|der)\b/iu,
  // “meri delivery nahi aayi” names the same never-arrived parcel in Roman
  // Urdu, where the negative sits between the noun and the arriving verb.
  /\b(?:rider|delivery|order|parcel|package|goods|saman)\b[^.!?]{0,20}\b(?:did\s+not|didn'?t|never|not|nahi|nahin|ni)\s+(?:come|came|arriv\w*|reach\w*|deliver\w*|mila|milya|milion|aay\w+|aay[ei]|gayi|gaya)\b/iu,
  /\bcomplain(?:s|t)?\b[^.!?]{0,20}\b(?:about|regarding|of)\b[^.!?]{0,20}\b(?:rider|delivery|shop|staff|order|item|goods|saman)\b/iu,
  /(?:سامان|آرڈر|پیکج|پارسل|ڈیلیوری|رائیڈر)[^۔!؟]{0,20}(?:خراب|ٹوٹ|آدھا|خالی|غلط|نہیں\s?آئی|نہیں\s?آیا|دیر)/u,
  // A bare "cancel it" with no thread to remember is still about an order:
  // the order helper reads the customer's real orders, while a product search
  // would answer it with rice.
  /^(?:please\s+)?(?:cancel|refund|return|replace)(?:\s+(?:it|this|that|my\s+order|the\s+order))?[!.?\s]*$/iu,
  /^(?:میرا|میرے|میری)\s*(?:آرڈر|ڈیلیوری|پارسل|پیکج|رائیڈر|سامن)/u,
  /آرڈر[^۔!؟]{0,32}(?:کہاں|کب|منسوخ|واپسی|سٹیٹس|حالت|کد|کتھاں)/u,
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
  // A book or a class about cooking is a product, not a shopping list.
  /\brecipes?\b(?!\s+(?:book|books|class|classes))/iu,
  /\bingredients?\b/iu,
  // “cooking oil”, “baking soda” and “baking pan” are products on a shelf, so
  // the verb has to be asked as an instruction before this is a shopping list.
  /\b(?:how|want|need|like|steps)\b[^.!?]{0,16}\b(?:to\s+|i\s+|do\s+i\s+|you\s+)?(?:cook|bake|prepare)\b/iu,
  /\b(?:cook|cooking|bake|baking)\b[^.!?]{0,20}\b(?:how|kaise|biryani|karahi|chicken|fish|daal|aloo|paneer|egg|roti|for\s+\d+)\b/iu,
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
  /\b(?:repair|fix|install|servicing|maintenance|leak(?:ing)?|clogged)\b/iu,
  // “broken” is on the shelf as often as it is on a workbench — broken rice,
  // broken wheat — so it only means a repair next to a thing that gets mended.
  /\b(?:tap|pipe|wall|roof|ceiling|floor|door|window|sink|toilet|flush|geyser|washer|fridge|cooler|fan|motor|machine|phone|laptop|tablet|watch|bicycle|bike|car|water\s*pump|pump|shower|AC|a\/c)\b[^.!?]{0,20}\b(?:broken|not\s+working|kharab|kharaab|band\s+ho\s+gaya|chal\s+nahi)\b/iu,
  // “book” is also a noun in the catalogue — an address book, a colouring book,
  // an account book — so it only routes to the service agent when something
  // bookable is named next to it.
  /\b(?:book|booking|booked|reserve)\b[^.!?]{0,20}\b(?:plumber|electrician|carpenter|painter|mechanic|technician|salon|barber|haircut|hairdresser|cleaner|cleaning|movers?|tutor|tailor|mistri|darzi|services?|appointment|slot|rider|ac|a\/c)\b/iu,
  /\b(?:appointment|slot|availability)\b/iu,
  // A booked visit the shopper wants to move or drop. The service agent says
  // plainly that it cannot change a booking and where to do it.
  /\b(?:cancel|change|reschedule|postpone|shift|move|confirm)\w*\b[^.!?]{0,16}\b(?:my\s+|the\s+|meri\s+|mera\s+)?(?:bookings?|appointments?|slot)\b/iu,
  /\b(?:my|mere|mera|meri)\s+(?:bookings?|appointments?)\b/iu,
  // A booked visit asked about without a verb in front of it: “booking ka
  // status”, “when is my booking”. Nothing in the catalogue is called a
  // booking, so the word beside a when-or-status question is the service thread.
  /\bbookings?\b[^.!?]{0,20}\b(?:status|track\w*|kab|when|time|timing|slot|pending|confirm\w*|number|detail\w*|history|hai|hen|how)\b/iu,
  /\b(?:made|make|makes|did|done|have|has|need|want|create[ds]?|kar\w*)\b[^.!?]{0,16}\b(?:my\s+|a\s+|the\s+|meri\s+|mera\s+)?bookings?\b/iu,
  // The other word order: “AC booking”, “salon booking”.
  /\b(?:plumber|electrician|carpenter|painter|mechanic|technician|salon|barber|haircut|hairdresser|cleaner|cleaning|movers?|tutor|tailor|mistri|darzi|rider|services?|ac|a\/c)\b[^.!?]{0,16}\b(?:book|booking|booked)\b/iu,
  /\bservice\s+provider\b/iu,
  /(?:مرمت|پلمبر|الیکٹریشن|الیکٹریشین|بجلی|صفائی|درزی|مستری|بکنگ|اپائنٹمنٹ|سروس)/u,
];

const FOLLOW_UP_START = /^(?:and|then|what about|how about|why|when|where|which one|the (?:first|second|third|other|same) one|it|that|this|those|these|uska|uski|uske|wo|woh|aur|kya|kyun|kab|kahan|kaunsa|kaunsi)\b/iu;

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
  if (uniqueIntents(OFF_TOPIC_PATTERNS, text)) return INTENTS.OFF_TOPIC;

  if (uniqueIntents(ORDER_PATTERNS, text)) return INTENTS.ORDER;
  // Order first: "where is my delivery" is an order question even though it
  // says "delivery", which the location patterns also read.
  // Money and rules next, because "is delivery free" is a pricing question
  // about the same word the coverage patterns read.
  if (uniqueIntents(POLICY_PATTERNS, text)) return INTENTS.POLICY;
  if (uniqueIntents(LOCATION_PATTERNS, text)) return INTENTS.LOCATION;
  // Only a bare "in my area" with nothing left to look for is a question about
  // the area itself; otherwise the shopper named an item and wants the item.
  if (LOCATION_MENTION.some((pattern) => pattern.test(text)) && !fallbackQueries(text).length) {
    return INTENTS.LOCATION;
  }
  if (uniqueIntents(COMPARE_PATTERNS, text)) return INTENTS.COMPARE;
  if (uniqueIntents(RECIPE_PATTERNS, text) || (DISH_PATTERN.test(text) && SERVING_PATTERN.test(text))) {
    return INTENTS.RECIPE;
  }
  if (uniqueIntents(SERVICE_PATTERNS, text)) return INTENTS.SERVICE;

  const previous = AGENT_MODES.includes(lastMode) || lastMode === INTENTS.LOCATION ? lastMode : null;
  if (previous === INTENTS.ORDER && (uniqueIntents(ORDER_CANCEL_PATTERNS, text) || FOLLOW_UP_START.test(text))) {
    return INTENTS.ORDER;
  }
  // "then show me the shops" after a location answer stays a location answer.
  if (previous === INTENTS.LOCATION && (FOLLOW_UP_START.test(text) || /\b(?:there|it|this|nearby)\b/iu.test(text))) {
    return INTENTS.LOCATION;
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
  AGENT_MODES,
  MAX_MESSAGE_CHARS,
  classifyIntent,
  normalize,
};
