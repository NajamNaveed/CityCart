const mongoose = require('mongoose');

const Block = require('../../models/block.model');
const Branch = require('../../models/branch.model');
const Brand = require('../../models/brand.model');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');
const Return = require('../../models/return.model');
const { getInventoryForProduct, getStockStatus } = require('../inventory.service');
const { OPEN_STATUSES } = require('./promiseCheck.rules');
const { tokens, scoreMatch } = require('./tools/catalogue.tools');
const { areaNamedIn, languageOf } = require('./facts');

/**
 * What the shop can be told to say (docs/29 Phase 2i).
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
 * Two limits kept on purpose, because they are existing rules rather than new
 * ones: an exact stock quantity is read but never handed to the model (see
 * `getPublicAvailability` in inventory.service.js — the count is not public,
 * only the state is), and a shop's delivery fee, minimum order and opening
 * hours are not read at all, because nothing in CityCart enforces them:
 * checkout adds no fee (order.service.js) and no code reads those settings, so
 * quoting them would have a shop promise money the platform does not charge.
 */
const FAMILIES = [
  'return',
  'complaint',
  'order',
  'detail',
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
  // address), so only a phone or an e-mail asks for a contact.
  contact: (t) =>
    /\b(?:phone|whatsapp|e-?mail|mobile\s+number|contact\s*number|call\s+(?:me|us))\b/iu.test(t) ||
    /فون|واٹس\s?ایپ|ای\s?میل|کال\s?کر/u.test(t),
  authenticity: (t) =>
    /\b(?:original|genuine|fake|counterfeit|authentic|branded)\b/iu.test(t) || /اصلی|نقلی|جعلی|اصالت/u.test(t),
};

const isRuleQuestion = (t) => Object.values(RULES).some((test) => test(t));

/**
 * Which family a message belongs to. The order is the whole design: a fault
 * word outranks a status word because the shop has to answer it; a product word
 * outranks a platform rule because the customer is holding the listing; a rule
 * word outranks an order word because "the minimum order" is CityCart's, not the
 * customer's parcel; a timing word only becomes `timing` when no zone was named;
 * and `shopOnly` is the honest remainder — CityCart has no record for it, so
 * nothing is drafted.
 */
function familyOf(text) {
  const t = String(text || '');
  if (asksFault(t) && !asksReturn(t)) return 'complaint';
  if (asksReturn(t)) return 'return';
  if (asksDetail(t)) return 'detail';
  if (isRuleQuestion(t)) return 'rule';
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
      .select('name price compareAtPrice attributes catalogProductId')
      .lean();
    if (pinned) return { product: pinned, candidates: [pinned] };
  }

  const rows = await Product.find({ brandId, isActive: true, status: 'ACTIVE' })
    .select('name price compareAtPrice attributes catalogProductId')
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

/** This customer's most recent order with this shop: an open one first. */
async function latestOrder(customerId, brandId) {
  const open = await Order.findOne({ customerId, brandId, orderStatus: { $in: OPEN_STATUSES } })
    .sort({ createdAt: -1 })
    .lean();
  if (open) return { order: open, isOpen: true };
  const last = await Order.findOne({ customerId, brandId }).sort({ createdAt: -1 }).lean();
  return { order: last, isOpen: false };
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
    out.facts = { productName: listing.product.name, stockState: status };
    out.private = { availableQuantity: inventory.availableQuantity, stockStatus: status };
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
    if (!details.length) {
      out.declined = 'NO_DETAIL_DATA';
      out.source = 'none';
      return out;
    }
    out.facts = { productName: listing.product.name, details };
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
    const read = await latestOrder(buyerId, tenant);
    if (!read.order) {
      // "You have no order with us" is a fact the server just read, so the
      // order question needs no model. A complaint is the shop's to answer in
      // its own words, so it goes out with no facts at all.
      if (out.family === 'order') out.source = 'server';
      return out;
    }
    out.facts = {
      orderState: read.order.orderStatus,
      isOpen: read.isOpen,
      itemCount: (read.order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    };
    return out;
  }

  if (out.family === 'return') {
    if (!buyerId) {
      out.declined = 'NO_ORDER';
      out.source = 'none';
      return out;
    }
    const { order } = await latestOrder(buyerId, tenant);
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
    };
    return out;
  }

  // rule: the platform's own answer, written by the server, costs no provider
  // call — the same win the customer chat got for these questions in 2h.
  const asked = Object.keys(RULES).find((key) => RULES[key](message)) || null;
  out.facts = { rule: asked };
  if (asked === 'hours') out.declined = 'NO_HOURS_DATA';
  if (asked === 'contact') out.declined = 'NO_CONTACT_DRAFT';
  if (asked === 'authenticity') out.declined = 'NO_AUTHENTICITY_PROOF';
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
  detailsOf,
  asksStock,
  asksPrice,
  asksDetail,
  asksOrder,
  asksReturn,
  asksFault,
  asksTiming,
  asksDeliveryPlace,
  isRuleQuestion,
  PRODUCT_SCAN,
  NAME_MATCH,
  DETAIL_LIMIT,
  ZONE_LIMIT,
  CANDIDATE_LIMIT,
};
