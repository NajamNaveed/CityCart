const mongoose = require('mongoose');

const Block = require('../../models/block.model');
const Branch = require('../../models/branch.model');
const Brand = require('../../models/brand.model');
const CatalogProduct = require('../../models/catalogProduct.model');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');
const Return = require('../../models/return.model');
const { getInventoryForProduct, getStockStatus } = require('../inventory.service');
const { CANCELLABLE_BY_CUSTOMER } = require('../order.service');
const { ADJUSTABLE_STATUSES } = require('../orderAdjustment.service');
const { ratingsFor } = require('../review.service');
const { OPEN_STATUSES } = require('./promiseCheck.rules');
const { tokens, scoreMatch } = require('./tools/catalogue.tools');
const { areaNamedIn, languageOf } = require('./facts');

/**
 * What the shop can be told to say (docs/29 Phase 3c-1, widened by 3c-2).
 *
 * The reply drafter used to be handed no facts at all — no price, no stock, no
 * order state — on the reasoning that a model with no numbers cannot misquote
 * one. It could not answer either, so a customer asking "how much stock do you
 * have" got a polite nothing. The customer chat already proved the better shape
 * (2h): the server reads the fact, the model only words it, and the finished
 * sentence is checked against what was read.
 *
 * This file is the reading half. It decides which question a message is asking
 * and returns only the records that answer it, so the prompt carries one small
 * block of true data instead of the shop's whole database. Every read is keyed
 * by the session's own brand and by the customer named in the conversation row,
 * never by an id from the body.
 *
 * Two rules the owner set (2026-11-25), both still load-bearing:
 *  - a stock quantity is stated to the customer **only when the customer asks
 *    for the number and the listing is live** (active product in an active
 *    brand). Otherwise the reply states the state, which is what CityCart's own
 *    customer screens show (`getPublicAvailability`);
 *  - a shop's delivery fee, minimum order and opening hours are not read at
 *    all, because nothing in CityCart enforces them: checkout adds no fee
 *    (order.service.js) and no service reads those settings, so quoting them
 *    would have a shop promise money the platform does not handle.
 */
const FAMILIES = [
  'return',
  'complaint',
  'order',
  'detail',
  'opinion',
  'availability',
  'price',
  'coverage',
  'timing',
  'rule',
  'shopOnly',
];

const PRODUCT_SCAN = 200;
const NAME_MATCH = 60;
const DETAIL_LIMIT = 6;
const ZONE_LIMIT = 12;
const PROMISE_LIMIT = 120;
const CANDIDATE_LIMIT = 3;

// `CC-2026-000001` is how order.service.js writes an order number: the year and
// a zero-padded counter, uppercase, globally unique. A customer who types it may
// have typed it in lower case or without the padding, so both spellings are
// read; anything else (a bare "1234") is not treated as an order number at all,
// because guessing which order a digit refers to is exactly the invention this
// file exists to stop.
const ORDER_NUMBER = /\bcc[-\s]?(\d{4})[-\s]?(\d{1,6})\b/iu;

const orderNumberIn = (text) => {
  const match = ORDER_NUMBER.exec(String(text || ''));
  if (!match) return null;
  return `CC-${match[1]}-${match[2].padStart(6, '0')}`;
};

const asksReturn = (t) =>
  /\b(?:return|returned|returning|refund|refunded|exchange|exchanging|replacement|swap|wapas|waps|badal)\b/iu.test(
    t
  ) ||
  /واپس|ریٹرن|بدل/u.test(t);

// "it came broken" and "refund kab aayega" name the same parcel from two sides:
// one is a fault the shop must answer, the other is a return already raised.
// A Roman negative only counts as a fault when it is attached to the thing that
// did not arrive — "samjh nahi aaya" (I did not understand) says nothing about
// rice, and "half" is a word in three quarters of the shop's own product names.
const asksFault = (t) =>
  /\b(?:damaged|broken|wrong|missing|empty|spoilt|spilt|leaked|rotten|stale|expired|defective|rude|cheated|complain\w*|faulty|leaking)\b/iu.test(t) ||
  /\bdid\s*(?:not|n'?t)\s+(?:arrive|come|came|deliver\w*|reach|receiv\w*)\b/iu.test(t) ||
  // The passive and the Roman order both say the same: "was not delivered",
  // "deliver nahi hui". A shopper rarely writes it the way a form does.
  /\b(?:was|were|is|are|has|have|had)\s+(?:not|never|n'?t)\s+(?:delivered|received|arrived|sent|bheji|bheja)\b/iu.test(t) ||
  /\b(?:nahi|nahin|ni|never)\s+(?:deliver\w*|bheji|bheja|mili|mila|hui|hua)\b/iu.test(t) ||
  /\b(?:deliver\w*|bheja|bheji|mila|mili)\s+(?:nahi|nahin|ni)\b/iu.test(t) ||
  /\b(?:delivery|parcel|order|goods|rider|saman|stuff|cheez|item)\b[^.!?]{0,18}\b(?:nahi\s+(?:aaya|aayi|aaye|mile|milya|milona|hui|hua|ho\w*)|nahi\s+bheja|der\s+se)\b/iu.test(t) ||
  /\b(?:kharab|kharaab|toota|tooti|ghalat|ghallat)\b/iu.test(t) ||
  /خراب|ٹوٹ|غلط|آلودہ|بدمعاش|شکایت|نقصان|خالی|آدھا|پھٹ|کٹی/u.test(t);

// A delivery verb with "my" is a question about that order, not about the
// neighbourhood: "meri delivery ka rider kahan hai" names one parcel.
const asksOrder = (t) =>
  /\b(?:my|this|the)\b[^.!?]{0,12}\border\b/iu.test(t) ||
  /\b(?:my|meri|mera|meray|hamari)\b[^.!?]{0,14}\b(?:delivery|parcel|order|saman|rider)\b/iu.test(t) ||
  /\border\b[^.!?]{0,14}\b(?:status|state|track|tracking|when|kab|kahan|halat)\b/iu.test(t) ||
  /\brider\b[^.!?]{0,14}\b(?:kahan|where|kab|aaya|aayi)\b/iu.test(t) ||
  /\b(?:i|we)\b[^.!?]{0,16}\bordered\b/iu.test(t) ||
  /میرا\s?آرڈر|آرڈر\s?کی\s?سٹیس|آرڈر\s?کب|میری\s?ڈیلیوری|رائیڈر/u.test(t);

const asksDetail = (t) =>
  /\b(?:size|sizes|colour|colors?|weight|expiry|exp\s?date|batch|material|fabric|contents|what\s+(?:is|are)\s+in\s+(?:the|it)|includes?|included|specs?|specifications?|model\s+number|how\s+much\s+(?:does|do)\s+(?:it|one)\s+(?:weigh|contain))\b/iu.test(t) ||
  /سائز|رنگ|وزن|میعاد|تفصیل|کتنے\s?کلو|ڈبے\s?میں/u.test(t);

const asksStock = (t) =>
  /\b(?:stock|availability|available|in\s+stock|sold\s+out|out\s+of\s+stock|remaining|left)\b/iu.test(t) ||
  /\bhow\s+many\b/iu.test(t) ||
  /\bdo\s+you\s+have\b/iu.test(t) ||
  /\b(?:baccha|bacche|bacha|khatam|khtm|moujood|majood|dustyab)\b/iu.test(t) ||
  /دستیاب|اسٹاک|ختم|بچے|باقی/u.test(t);

// The customer wants the number itself, not whether the shelf is empty. Only a
// message that says so may carry a quantity, because the platform's own screens
// show a state and never a count.
const COUNT_UNITS = 'pieces?|pcs|units?|items?|boxes?|cartons?|dane|danna|bacche|bache|baccha|stock|quantity';
const asksCount = (t) =>
  new RegExp(`\\bhow\\s+many\\b(?:[^.!?]{0,24}(?:${COUNT_UNITS})|\\s+(?:do\\s+you\\s+have|are\\s+there|left|remaining)\\b)`, 'iu').test(
    t
  ) ||
  new RegExp(`\\b(?:kitne|kitni|کتنے|کتنی)\\b[^.!?]{0,18}(?:${COUNT_UNITS}|عدد|تعداد|پیسی|پیس|یونٹ|دانه)`, 'iu').test(t) ||
  /\b(?:kitna|کتنا)\s+(?:stock|quantity)\b/iu.test(t) ||
  /\b(?:count|quantity|number)\s+of\s+(?:pieces?|units?|items?|stock)\b/iu.test(t) ||
  /\b(?:pieces?|units?|items?)\s+(?:left|remaining|in\s+stock|available|bacche|bache|reh\s*gaye)\b/iu.test(t) ||
  /\bstock\s+(?:ka\s+)?(?:count|kitna|quantity)\b/iu.test(t) ||
  /کتن[ےا]\s?(?:اسٹاک|تعداد)|کتنے\s?(?:پیسی|پیس|عدد|بچے|دانه)/u.test(t);

// "how many days" is a timeframe, not a quantity. Routing it to stock made the
// drafter answer a delivery question with a shelf state.
const asksDuration = (t) =>
  /\bhow\s+(?:many|much)\b[^.!?]{0,22}\b(?:days?|weeks?|hours?|din|ghante|time)\b/iu.test(t) ||
  /\bkitne\s+(?:din|days|ghante|hours)\b/iu.test(t) ||
  /کتنے\s?(?:دن|گھنٹے|ہفتے)/u.test(t);

const asksCancel = (t) =>
  /\b(?:cancel|cancels|cancelled|canceled|cancellation|cancelation)\b/iu.test(t) ||
  /\b(?:order|delivery|parcel|booking)\b[^.!?]{0,18}\b(?:mat\s+bhejo|roko|rok\s+do|rehne\s+din)\b/iu.test(t) ||
  /منسوخ|کینسل|رد\s?کرو/u.test(t);

// "cancel my order" asks CityCart to allow something; "why was my order
// cancelled" reports what already happened. Only the first is a rule question:
// answering the second with "it cannot be cancelled from your side any more"
// would talk past it, so a past framing stays an ordinary order question and is
// answered from the order's own state.
const reportsAlreadyDone = (t) =>
  /\b(?:was|were|is|are|has|have|had|got)\s+(?:it\s+|my\s+|the\s+|your\s+)?(?:order\s+)?(?:cancelled|canceled|changed|updated|edited)\b/iu.test(
    t
  ) ||
  /\b(?:cancel|cancelled|canceled|change|changed)\s+(?:ho\s*(?:gaya|gayi|gya|hoga|hogi|raha|rahi)|hua|hui|hogaya)\b/iu.test(t) ||
  /\b(?:why|kyu|kyon|kyun|reason)\b[^.!?]{0,14}\b(?:cancel\w*|change\w*|cancelation|cancellation)\b/iu.test(t) ||
  /منسوخ\s?ہو|کینسل\s?ہو|رد\s?ہو|بدل\s?ہو\s?گیا|تبدیل\s?ہو\s?گیا/u.test(t);

// "change the address / swap one item" is a question about the parcel, not a
// return: it is answered by the adjustment rule the backend really enforces.
const asksChange = (t) =>
  /\b(?:change|changes|changing|update|modify|edit|switch|replace|badal|badalna)\b[^.!?]{0,22}\b(?:address|item|items|order|quantity|product|size|colour|color|color\s+of|saman|cheez|pata|thikana)\b/iu.test(t) ||
  /\b(?:add|remove)\b[^.!?]{0,18}\b(?:one\s+more|another|one|ek\s+(?:aur|ar)|item|piece|product|quantity)\b/iu.test(t) ||
  /\b(?:address|item|quantity|pata|saman)\b[^.!?]{0,18}\b(?:change|badal|update|add|remove)\b/iu.test(t) ||
  /پتہ\s?بدل|آرڈر\s?بدل|اشیاء\s?بدل|quantity\s?بدل/u.test(t);

// A rider is a person the platform never introduces: the customer sees a
// display name and a live pin, and no number for either.
const asksRider = (t) =>
  /\b(?:rider|driver|delivery\s+(?:boy|boy’s|man|person|guy|uncle)|courier|sahib)\b/iu.test(t) ||
  /رائیڈر|ڈرائیور|ڈیلیوری\s?بائے|کوریئر/u.test(t);

const asksOpinion = (t) =>
  /\b(?:reviews?|ratings?|rating|feedback|testimonials?)\b/iu.test(t) ||
  /\b(?:is|are|hai|hain|how)\b[^.!?]{0,16}\b(?:it|this|that|yeh|item|cheez|product)\b[^.!?]{0,16}\b(?:good|achha|acha|accha|theek|sahi|fine|worth)\b/iu.test(t) ||
  /\bquality\b[^.!?]{0,16}\b(?:kaisi|kaisa|how|good|achhi|acha)\b/iu.test(t) ||
  /\bkais[ao]n?[ao]?\s+(?:achha|acha|achhi|quality|theek)\b/iu.test(t) ||
  /\b(?:log|customers?|people)\b[^.!?]{0,20}\b(?:say|kehte|review)\b/iu.test(t) ||
  /ریٹنگ|جائزے|اچھا\s?ہے|کیسا\s?ہے|معیار/u.test(t);

// A rate for volume is a price the platform cannot store: `price` is the only
// price a listing has, and there is no wholesale tier anywhere in the schema.
const asksBulk = (t) =>
  /\b(?:bulk|wholesale|trade\s+price|dealers?|resellers?|distributor)\b/iu.test(t) ||
  /\b(?:for\s+(?:a\s+)?(?:resale|re-sale|shop\s+opening|dukaan))\b/iu.test(t) ||
  /تھوک|ڈیلر/u.test(t);

// The platform has no collection point, so both spellings of the request — the
// English phrasal verb with the object inside it, and the Roman one with the
// shop named — have to reach the same rule.
const asksPickup = (t) =>
  /\bpick\s*(?:it\s*)?-?\s*up\b|\bpickup\b/iu.test(t) ||
  /\b(?:self\s*collect\w*|collect\s+(?:it\s+)?myself|store\s+collection)\b/iu.test(t) ||
  /\bcome\s+(?:up\s+)?to\s+(?:your|the)\s+(?:shop|store|branch)\b/iu.test(t) ||
  /\b(?:main|mein|hum|apni|apna)\b[^.!?]{0,18}\b(?:dukaan|dukan|dokaan|shop|store|branch)\b[^.!?]{0,18}\b(?:aa|ana|aana|le|ler|lenge|lunga|loonga|collect)\b/iu.test(
    t
  ) ||
  /دکان\s?سے\s?ل[ئی]وان|خود\s?ل[ئی]وان|پک\s?اپ/u.test(t);

const asksPhotos = (t) =>
  /\b(?:photos?|pictures?|images?|real\s+(?:one|pic))\b/iu.test(t) ||
  /تصویر|فوٹو|پکچر/u.test(t);

// "kitna" on its own is not a price: "kitne din me delivery hogi" asks for a
// number of days, so the money word or a money unit has to be in the sentence.
const asksPrice = (t) =>
  /\b(?:price|prices|rate|rates|cost|kimat|qeemat|sasta|cheaper|discounted)\b/iu.test(t) ||
  /\b(?:kitna|kitni|kitne)\b[^.!?]{0,14}\b(?:hai|hain|hay|paise|paisa|rupees|rupee|rs|₨)\b/iu.test(t) ||
  /کتن[ےہی]\s?(?:روپے|قیمت)/u.test(t) ||
  /قیمت|ریٹ|سستا/u.test(t);

const asksDeliveryPlace = (t) =>
  /\b(?:deliver|delivers|delivery|delivering|ship|shipping|courier|cover|covers|covered|area|areas|zone|zones|blocks?\b|locality)\b/iu.test(t) ||
  /ڈیلیوری|علاقے|علاقہ|coverage/u.test(t);

const asksTiming = (t) =>
  /\b(?:how\s+long|when\s+(?:will|does|do|can)|kitne\s+(?:din|days|ghante|hours)|delivery\s+time|time\s+of\s+delivery|eta|in\s+how\s+many\s+days?)\b/iu.test(t) ||
  /\bkab\b[^.!?]{0,14}\b(?:tak|aaye|aayega|ayega|hogi|hoga|hay|deliver|bhej|aa|punch|reach)\b/iu.test(t) ||
  /\b(?:din|days|ghante|hours)\b[^.!?]{0,12}\b(?:lage|lagte|take|kya)\b/iu.test(t) ||
  /کتنے\s?دن|کب\s?تک|ڈیلیوری\s?کا\s?وقت/u.test(t);

/**
 * Platform rules a shop may state, each one already verified against the code
 * that enforces it. A rule with no data behind it (a shop's own hours, whether
 * an item is "original") is declined instead of answered.
 */
const RULES = {
  fee: (t) =>
    /\b(?:delivery|shipping)\b[^.!?]{0,16}\b(?:charge|charges|fee|fees|cost|price|kitna|kitni|paisa|paise)\b/iu.test(
      t
    ) ||
    /\b(?:charge|charges|fee|fees|cost|price|prices)\b[^.!?]{0,16}\b(?:for\s+|ka|ki|ke\s+)?(?:delivery|shipping)\b/iu.test(
      t
    ) ||
    // "is delivery free" and "delivery free hai" ask the same thing from the
    // other end, and a shopper rarely writes the word order a form uses.
    /\bdelivery\b[^.!?]{0,12}\b(?:free|chargeable|paid|cash)\b/iu.test(t) ||
    /\bfree\s+delivery\b/iu.test(t) ||
    /مفت\s?ڈیلیوری|ڈیلیوری\s?(?:چارج|فیس|کتنی|کتنے)|ڈیلیوری\s?کا\s?چارج/u.test(t),
  minimum: (t) => /\bminimum\b[^.!?]{0,16}\b(?:order|amount|purchase|bill)\b/iu.test(t) || /کم\s?از\s?کم/u.test(t),
  payment: (t) =>
    /\b(?:jazzcash|jazz\s+cash|easypaisa|easy\s+paisa|bank\s+transfer|upi|paypal|online\s+payment|payment\s+(?:method|option|mode|gateway)s?)\b/iu.test(t) ||
    /\b(?:how|can\s+i)\b[^.!?]{0,16}\b(?:pay|payment)\b/iu.test(t) ||
    /\b(?:pay|payment)\b[^.!?]{0,16}\b(?:cash|card|online|visa|master)\b/iu.test(t) ||
    /ادائیگی|کیش|کارڈ|پیمنٹ/u.test(t),
  receipt: (t) =>
    /\b(?:invoice|receipt|bill\s+(?:copy|receipt|proof|chahiye))\b/iu.test(t) || /بل[^۔!؟]{0,10}چاہیے|رسید|انوائس/u.test(t),
  coupon: (t) =>
    /\b(?:coupon|promo(?:\s+code)?|discount\s+code|voucher)\b/iu.test(t) || /کوپن|واؤچر|ڈسکاؤنٹ\s?کوڈ/u.test(t),
  // The platform has no collection point: every order needs a delivery pin
  // inside a published zone (order.service.js), so this is a rule CityCart can
  // state rather than something only the shop knows.
  pickup: (t) => asksPickup(t),
  // One price per listing is all CityCart stores, so a wholesale rate is the
  // shop's own to quote — declined, never stated.
  bulk: (t) => asksBulk(t),
  hours: (t) =>
    // "delivery timing" is the shop's published timeframe, not its opening
    // hours, so a bare timing or hours word only means opening when no delivery
    // was named in the same sentence.
    /\b(?:open|opens|opening|closing|close|closed)\b/iu.test(t) ||
    (/\b(?:timings?|hours)\b/iu.test(t) && !/\bdeliver/iu.test(t)) ||
    /\b(?:kab\s+(?:khulta|khulti|band)|kitne\s+baje)\b/iu.test(t) ||
    // A named day is the same unstored schedule asked without the word "open".
    // CityCart stores no opening days, so this is declined rather than timed.
    /\b(?:on|by|upto|up\s+to)\s+(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekends?|eid|ramadan|chutti|holida?ys?)\b/iu.test(t) ||
    /کھلتا|کھلی|بند\s?ہے|ٹائمز|کتنے\s?بجے|جمعرات|جمعہ|ہفتہ|اتوار|پیر|منگل|بدھ|عید|رمضان|چھٹی/u.test(t),
  // "number" and "address" belong to other families (a model number, a delivery
  // address), so only a phone or an e-mail asks for a contact — plus a rider's
  // number, which is a contact CityCart never hands out.
  contact: (t) =>
    /\b(?:phone|whatsapp|e-?mail|mobile\s+number|contact\s*number|call\s+(?:me|us))\b/iu.test(t) ||
    /\b(?:rider|driver|delivery\s+(?:boy|guy|man|person))\b[^.!?]{0,18}\b(?:number|phone|mobile|contact)\b/iu.test(t) ||
    /فون|واٹس\s?ایپ|ای\s?میل|کال\s?کر/u.test(t),
  authenticity: (t) =>
    /\b(?:original|genuine|fake|counterfeit|authentic|branded)\b/iu.test(t) || /اصلی|نقلی|جعلی|اصالت/u.test(t),
};

const isRuleQuestion = (t) => Object.values(RULES).some((test) => test(t));

/**
 * Which family a message belongs to. The order is the whole design: asking to
 * cancel or change *this customer's own* parcel comes first, because CityCart
 * holds the rule that answers it and an apology answers nothing; a fault word
 * outranks a status word because the shop has to answer it; a return word
 * outranks a product word because money may be involved; a product word
 * outranks a platform rule because the customer is holding the listing; a rule
 * word outranks an order word because "the minimum order" is CityCart's, not the
 * customer's parcel; a number of **days** outranks the quantity words, because
 * "how many days" is a timeframe and answering it with a shelf state was a real
 * mis-route; and `shopOnly` is the honest remainder — CityCart has no record for
 * it, so nothing is drafted.
 */
function familyOf(text) {
  const t = String(text || '');
  // The parcel the customer is talking about, in whichever script: `\b` is an
  // ASCII class, so a Roman test never matches Urdu script and "میرا پتہ بدلنا
  // ہے" (I want to change my address) used to fall through to `return` because
  // the only word it shared with a return was "بدل".
  const aboutThisParcel =
    asksOrder(t) ||
    /\b(?:my|meri|mera|hamara)\b/iu.test(t) ||
    /\b(?:order|parcel|delivery|address|pata|thikana)\b/iu.test(t) ||
    /آرڈر|پتہ|ٹھیکانا|ڈیلیوری|سامان|رائیڈر|میرا|میری/u.test(t);
  if (!reportsAlreadyDone(t) && aboutThisParcel && (asksChange(t) || asksCancel(t))) return 'order';
  if (asksFault(t) && !asksReturn(t)) return 'complaint';
  if (asksReturn(t)) return 'return';
  // "are those the real pictures" is answered by the listing's own gallery, so a
  // photo question is a detail question — otherwise it fell through to `shopOnly`
  // and the shop was told CityCart had read nothing about its own listing.
  if (asksDetail(t) || asksPhotos(t)) return 'detail';
  if (isRuleQuestion(t)) return 'rule';
  if (asksOpinion(t)) return 'opinion';
  if (asksDuration(t)) return 'timing';
  if (asksOrder(t)) return 'order';
  if (asksStock(t)) return 'availability';
  if (asksTiming(t)) return 'timing';
  if (asksDeliveryPlace(t)) return 'coverage';
  if (asksPrice(t)) return 'price';
  return 'shopOnly';
}

/**
 * The listing the customer means: the one their message was sent from, or, when
 * it was not sent from a listing, the shop's own product whose name appears in
 * the sentence. Several listings scoring equally is reported as several and the
 * draft asks which one — never resolved by picking.
 */
async function listingAsked({ brandId, productId, text }) {
  if (productId) {
    const pinned = await Product.findOne({ _id: productId, brandId })
      .select('name price compareAtPrice attributes catalogProductId status isActive images')
      .lean();
    if (pinned) return { product: pinned, candidates: [pinned] };
  }

  const rows = await Product.find({ brandId, isActive: true, status: 'ACTIVE' })
    .select('name price compareAtPrice attributes catalogProductId status isActive images')
    .limit(PRODUCT_SCAN)
    .lean();

  const question = tokens(text);
  if (!question.length) return { product: null, candidates: [] };

  const scored = rows
    .map((row) => {
      const name = tokens(row.name);
      // Scored both ways on purpose. A shopper writes three words about a
      // seven-word listing ("basmati rice?"), and the name holds words the
      // question never uses — so "how much of the question is this name" alone
      // finds nothing, while "how much of the name is in the question" answers
      // a sentence that only repeats part of it. The better overlap wins.
      const score = Math.max(scoreMatch(question, name).score, scoreMatch(name, question).score);
      return { row, score };
    })
    .filter((hit) => hit.score >= NAME_MATCH)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { product: null, candidates: [] };
  const best = scored[0].score;
  const tied = scored.filter((hit) => hit.score === best).slice(0, CANDIDATE_LIMIT);
  return { product: tied[0].row, candidates: tied.map((hit) => hit.row) };
}

/** Only plain scalar attributes reach the draft: the field itself is untyped. */
function detailsOf(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return [];
  return Object.entries(attributes)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => ({ key: String(key).trim().slice(0, 40), value: String(value).trim().slice(0, 40) }))
    .filter((entry) => entry.key && entry.value)
    .slice(0, DETAIL_LIMIT);
}

/** The blocks this shop can be found in, from its own branches — the one
 *  delivery fact discovery itself enforces (branch.blockIds scopes every search). */
async function shopZones(brandId) {
  const branches = await Branch.find({ brandId, isActive: true }).select('blockIds').lean();
  const wanted = Array.from(
    new Set(branches.flatMap((branch) => (Array.isArray(branch.blockIds) ? branch.blockIds : []).map(String)))
  );
  if (!wanted.length) return [];
  const found = await Block.find({ _id: { $in: wanted }, isActive: true }).select('name').lean();
  return found.map((block) => block.name).slice(0, ZONE_LIMIT);
}

/**
 * Whether the shop may be quoted a quantity at all. cart.service.js refuses an
 * order on exactly these three fields — the listing active and live, and the
 * brand active — so a count read from a shelf nobody can buy from would be the
 * drafter promising stock the customer cannot get.
 */
const listingIsLive = (product) =>
  Boolean(product) && product.status === 'ACTIVE' && product.isActive === true;

async function shopIsLive(tenant) {
  const brand = await Brand.findById(tenant).select('status').lean();
  return Boolean(brand) && brand.status === 'ACTIVE';
}

/** This customer's most recent order with this shop: an open one first. */
async function latestOrder(customerId, brandId) {
  const open = await Order.findOne({ customerId, brandId, orderStatus: { $in: OPEN_STATUSES } })
    .sort({ createdAt: -1 })
    .lean();
  if (open) return { order: open, isOpen: true };
  const last = await Order.findOne({ customerId, brandId }).sort({ createdAt: -1 }).lean();
  return { order: last, isOpen: false };
}

/**
 * The order a customer identified by number. The number is only ever trusted
 * as a *question* — the read is still keyed by the conversation's own customer
 * and the session's own brand, so a number that belongs to somebody else (or
 * to another shop, or does not exist) is the same "not found" as the platform's
 * own order route answers: 404, never 403, and never a hint about whose it is.
 */
async function orderByNumber(customerId, brandId, orderNumber) {
  const escaped = String(orderNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const order = await Order.findOne({
    customerId,
    brandId,
    orderNumber: { $regex: `^${escaped}$`, $options: 'i' },
  }).lean();
  return order ? { order, isOpen: OPEN_STATUSES.includes(order.orderStatus) } : null;
}

const noListing = (out, listing) => {
  if (listing.candidates.length === 1) return false;
  if (listing.candidates.length > 1) {
    out.facts = { candidates: listing.candidates.map((row) => row.name) };
    out.source = 'server';
  } else {
    out.declined = 'NO_LISTING_MATCH';
    out.source = 'none';
  }
  return true;
};

/**
 * The facts a drafted reply may state.
 *   `facts`    — what the model is given, and what the guard checks against.
 *   `private`  — shown to the shop beside the draft, never sent to a provider.
 *   `source`   — 'model' words the facts, 'server' needs no model at all
 *                (a platform rule, or asking which listing), 'none' has nothing
 *                to say and `declined` says why.
 */
async function readChatFacts({ brandId, customerId, productId, message }) {
  const out = { family: 'shopOnly', language: languageOf(message), facts: {}, private: {}, source: 'none', declined: null };
  if (!mongoose.Types.ObjectId.isValid(brandId)) return out;

  const tenant = new mongoose.Types.ObjectId(String(brandId));
  const buyerId = customerId ? new mongoose.Types.ObjectId(String(customerId)) : null;
  out.family = familyOf(message);
  if (out.family === 'shopOnly') return out;

  const listing = await listingAsked({ brandId: tenant, productId, text: message });
  out.source = 'model';

  if (out.family === 'availability') {
    if (noListing(out, listing)) return out;
    const inventory = await getInventoryForProduct({ _id: listing.product._id, brandId: tenant });
    const status = getStockStatus(inventory);
    out.private = { availableQuantity: inventory.availableQuantity, stockStatus: status, countStated: false };
    const wantsCount = asksCount(message);
    const showCount =
      wantsCount &&
      inventory.trackInventory !== false &&
      Number(inventory.availableQuantity) > 0;
    // Owner decision (2026-11-25): a customer who asks for the number gets it, as
    // long as the listing is one they could actually order — cart.service.js
    // refuses an inactive listing or an inactive brand, so a count quoted from
    // either would promise stock nobody can buy. The state is still true, so the
    // shop is handed that sentence rather than a note saying CityCart knows
    // nothing.
    if (wantsCount && !(listingIsLive(listing.product) && (await shopIsLive(tenant)))) {
      out.facts = { productName: listing.product.name, stockState: status, activeListing: false };
      out.source = 'server';
      return out;
    }
    out.facts = {
      productName: listing.product.name,
      stockState: status,
      ...(showCount ? { availableQuantity: Number(inventory.availableQuantity) } : {}),
    };
    // The shop's own screen says why the reply did or did not carry a number.
    out.private.countStated = Object.prototype.hasOwnProperty.call(out.facts, 'availableQuantity');
    return out;
  }

  if (out.family === 'price') {
    if (noListing(out, listing)) return out;
    out.facts = {
      productName: listing.product.name,
      price: listing.product.price,
      ...(listing.product.compareAtPrice ? { compareAtPrice: listing.product.compareAtPrice } : {}),
    };
    return out;
  }

  if (out.family === 'detail') {
    if (noListing(out, listing)) return out;
    const details = detailsOf(listing.product.attributes);
    // A weight or a pack size is usually on the shared catalogue row rather
    // than in the shop's own attributes, and "are those real pictures" is
    // answered by the listing's own gallery — both are records, so the shop is
    // not asked to remember what CityCart already stores.
    if (!details.length && listing.product.catalogProductId) {
      const row = await CatalogProduct.findById(listing.product.catalogProductId).select('size').lean();
      const size = row && row.size;
      if (size && (size.value || size.unit)) {
        details.push({
          key: 'size',
          value: `${size.value ?? ''}${size.unit ? ` ${size.unit}` : ''}`.trim(),
        });
      }
    }
    if (asksPhotos(message) && Array.isArray(listing.product.images) && listing.product.images.length) {
      details.push({ key: 'photos on this listing', value: String(listing.product.images.length) });
    }
    if (!details.length) {
      out.declined = 'NO_DETAIL_DATA';
      out.source = 'none';
      return out;
    }
    out.facts = { productName: listing.product.name, details };
    return out;
  }

  if (out.family === 'opinion') {
    if (noListing(out, listing)) return out;
    // Approved reviews of this listing only — the same rows the product page
    // counts, read through the service that already aggregates them.
    const seen = (await ratingsFor([listing.product._id]))[String(listing.product._id)];
    out.facts = {
      productName: listing.product.name,
      ratingCount: seen ? seen.count : 0,
      ...(seen ? { averageRating: seen.average } : {}),
    };
    // "Nobody has reviewed it yet" is a fact CityCart just read, so the shop is
    // not asked to pay a model to say it.
    if (!seen) out.source = 'server';
    return out;
  }

  if (out.family === 'coverage') {
    const zones = await shopZones(tenant);
    if (!zones.length) {
      out.declined = 'NO_BRANCH_ZONES';
      out.source = 'none';
      return out;
    }
    const brand = await Brand.findById(tenant).select('cityId').lean();
    const zone = await areaNamedIn(message, brand ? brand.cityId : null);
    out.facts = { zones };
    if (zone) {
      const matched = zones.find((name) => name.toLowerCase() === String(zone.name).toLowerCase());
      out.facts.zoneAsked = zone.name;
      out.facts.coversZone = Boolean(matched);
    }
    return out;
  }

  if (out.family === 'timing') {
    const brand = await Brand.findById(tenant).select('settings').lean();
    const promise = String((brand && brand.settings && brand.settings.estimatedDeliveryTime) || '')
      .slice(0, PROMISE_LIMIT)
      .trim();
    if (!promise) {
      out.declined = 'NO_PUBLISHED_PROMISE';
      out.source = 'none';
      return out;
    }
    out.facts = { promise };
    return out;
  }

  if (out.family === 'order' || out.family === 'complaint') {
    if (!buyerId) {
      out.declined = 'NO_ORDER';
      out.source = 'none';
      return out;
    }
    const wanted = orderNumberIn(message);
    let read = null;
    if (wanted) {
      read = await orderByNumber(buyerId, tenant, wanted);
      if (!read) {
        // The number did not verify. CityCart says only that it cannot find it:
        // the same sentence whether the digits are mistyped, the order is
        // another customer's, or it belongs to another shop — which is how the
        // platform's own order route answers, and it names no quantity either.
        out.facts = { numberAsked: true };
        out.source = 'server';
        return out;
      }
    } else {
      read = await latestOrder(buyerId, tenant);
    }
    if (!read.order) {
      // "You have no order with us" is a fact the server just read, so the
      // order question needs no model. A complaint is the shop's to answer in
      // its own words, so it goes out with no facts at all.
      if (out.family === 'order') out.source = 'server';
      return out;
    }
    const order = read.order;
    out.facts = {
      orderState: order.orderStatus,
      isOpen: read.isOpen,
      itemCount: (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      // The customer typed this number, so repeating it back confirms the match
      // rather than revealing anything. An order they did not name is never
      // identified by number in a reply.
      ...(wanted ? { orderNumber: wanted } : {}),
    };
    // Cancellation and change are the platform's two real rules about this
    // parcel, read from the services that enforce them — not from a guess about
    // what a shop usually allows. Both answers are a state plus a rule the
    // server just verified, so the server writes the sentence: it costs no
    // provider call, and a model that warmed it up would only get refused by
    // its own guard ("we will cancel it for you" is a promise CityCart cannot
    // back, since no AI here has a write path).
    const wantsCancel = asksCancel(message) && !reportsAlreadyDone(message);
    const wantsChange = asksChange(message) && !reportsAlreadyDone(message);
    if (wantsChange) {
      out.facts.canProposeChange = ADJUSTABLE_STATUSES.includes(order.orderStatus);
      out.facts.openProposal = Boolean(order.activeAdjustmentId);
      out.source = 'server';
    }
    if (wantsCancel) {
      out.facts.canSelfCancel =
        CANCELLABLE_BY_CUSTOMER.includes(order.orderStatus) && order.paymentStatus !== 'PAID';
      out.source = 'server';
    }
    if (asksRider(message) && order.orderStatus === 'OUT_FOR_DELIVERY') {
      // The one thing the platform does show about a rider is a live position,
      // and only while the parcel is actually out for delivery
      // (riderLocation.service.js). A phone number is never shown to anyone.
      out.facts.riderTrackable = true;
      out.source = 'server';
    }
    return out;
  }

  if (out.family === 'return') {
    if (!buyerId) {
      out.declined = 'NO_ORDER';
      out.source = 'none';
      return out;
    }
    // A return raised against the order the customer just named is the one to
    // read; without a number it is their most recent order, as before.
    const wanted = orderNumberIn(message);
    const named = wanted ? await orderByNumber(buyerId, tenant, wanted) : null;
    // A number that is not theirs must not be answered with whatever return
    // happens to stand on their newest order: that replies to a question nobody
    // asked and shows a state for an order they did not name.
    if (wanted && !named) {
      out.facts = { numberAsked: true };
      out.source = 'server';
      return out;
    }
    const { order } = named || (await latestOrder(buyerId, tenant));
    const row = await Return.findOne(
      order ? { orderId: order._id, customerId: buyerId, brandId: tenant } : { customerId: buyerId, brandId: tenant }
    )
      .sort({ createdAt: -1 })
      .lean();
    // Finding nothing is the answer CityCart can give: no return stands against
    // this customer's order with this shop.
    if (!row) {
      out.source = 'server';
      return out;
    }
    out.facts = {
      returnState: row.status,
      lineCount: (row.lines || []).length,
      refundAmount: Number(row.refundAmount) || 0,
      ...(wanted ? { orderNumber: wanted } : {}),
    };
    return out;
  }

  // rule: the platform's own answer, written by the server, costs no provider
  // call — the same win the customer chat got for these questions in 2h.
  const asked = Object.keys(RULES).find((key) => RULES[key](message)) || null;
  out.facts = { rule: asked };
  if (asked === 'hours') out.declined = 'NO_HOURS_DATA';
  // A rider is not a contact the platform hands out, and that is the honest
  // answer rather than a generic "we do not draft contact details".
  if (asked === 'contact') out.declined = asksRider(message) ? 'NO_RIDER_CONTACT' : 'NO_CONTACT_DRAFT';
  if (asked === 'authenticity') out.declined = 'NO_AUTHENTICITY_PROOF';
  if (asked === 'bulk') out.declined = 'NO_BULK_RATE';
  out.source = out.declined ? 'none' : 'server';
  return out;
}

module.exports = {
  FAMILIES,
  RULES,
  familyOf,
  readChatFacts,
  listingAsked,
  shopZones,
  latestOrder,
  orderByNumber,
  orderNumberIn,
  detailsOf,
  listingIsLive,
  shopIsLive,
  asksStock,
  asksCount,
  asksDuration,
  asksCancel,
  asksChange,
  asksRider,
  asksOpinion,
  asksBulk,
  asksPickup,
  asksPhotos,
  asksPrice,
  asksDetail,
  asksOrder,
  asksReturn,
  asksFault,
  asksTiming,
  asksDeliveryPlace,
  isRuleQuestion,
  ORDER_NUMBER,
  PRODUCT_SCAN,
  NAME_MATCH,
  DETAIL_LIMIT,
  ZONE_LIMIT,
  CANDIDATE_LIMIT,
};
