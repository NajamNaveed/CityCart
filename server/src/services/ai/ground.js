/**
 * Grounding the spoken half of an answer (docs/29 Phase 2h).
 *
 * Cards were already safe: an assistant may only return ids a tool really
 * found. The sentence around them was not — a model that mis-reads a price
 * field, or rounds a distance, produced a confident wrong number next to
 * correct cards, and customers act on the number.
 *
 * So every amount, distance, duration, rating and percentage the reply states is
 * checked against the numbers the tools actually returned. Anything unexplained
 * costs the sentence, not the answer: the cards stay and the words are replaced
 * by a line built from those cards, which cannot be wrong because the server
 * wrote every character of it.
 *
 * Phase 3c-2 widened what counts as a stated figure, because the drafter is now
 * handed counts, ratings and order numbers it used to be denied: a review count,
 * a star average written "4.5 out of 5", a number of pieces or photos, and the
 * digits inside an identifier, which are never evidence.
 */
const MONEY = /(?:rs\.?|rupees?|pkr|₨|pk\s?re)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:rupees?|pkr)\b/iu;
const PERCENT = /(\d+(?:\.\d+)?)\s*%/;
const UNIT =
  /(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|minutes?|mins?\b|hours?|★|stars?|ستارے|سٹار|rating|reviews?)/iu;
const RATING = /(\d(?:\.\d)?)\s*(?:\/\s*5|out\s+of\s*5|stars?|ستارے|سٹار|rating|★)/iu;

const numeric = (value) => Number(String(value).replace(/,/g, ''));

// Identifiers, image urls and slugs are full of digits that are not amounts.
// Reading them as evidence would let an invented price pass the check because
// two of its digits happened to appear in an ObjectId. `orderNumber` is the same
// trap in camel case — `CC-2026-000001` would otherwise hand the check a "2026"
// that no shop ever priced anything at.
const NOT_A_NUMBER_SOURCE = /(?:^|_)(?:id|ids|image|images|thumbnail|url|slug|logo|phone|email|coordinates|year)$|(?:number|code)$/i;
const HEX_ID = /^[0-9a-f]{24}$/i;

function collect(value, numbers, key = '') {
  if (value === null || value === undefined || NOT_A_NUMBER_SOURCE.test(key)) return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) numbers.add(value);
    return;
  }
  if (typeof value === 'string') {
    if (HEX_ID.test(value)) return;
    for (const match of value.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const parsed = numeric(match[0]);
      if (Number.isFinite(parsed)) numbers.add(parsed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, numbers, key);
    return;
  }
  if (typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collect(child, numbers, childKey);
  }
}

/** Every number a piece of evidence states, in any form. */
function evidenceNumbers(evidence) {
  const numbers = new Set();
  if (typeof evidence === 'string') {
    for (const match of evidence.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const parsed = numeric(match[0]);
      if (Number.isFinite(parsed)) numbers.add(parsed);
    }
    return numbers;
  }
  collect(evidence, numbers);
  return numbers;
}

/**
 * A quantity a shopper or a shop could act on. Only asked for where a count is
 * the thing being claimed (a drafted shop reply): since Phase 3c-2 the drafter
 * is handed a stock count, a review count and a photo count when the records
 * carry them, so each of those words has to be checked rather than assumed. The
 * customer chat still never states a quantity, so this stays switched off there
 * — turning it on would only make good sentences worse.
 */
const COUNT =
  /(\d+)\s*(?:pieces?|pcs|units?|bottles?|boxes?|packs?|cartons?|bags?|items?|days?|kilos?|kg|grams?|litres?|liters?|ml|photos?|pictures?|images?|baccha|bacche|bache|bachay|din|ghante)\b/iu;
const COUNT_BARE = /\b(?:only|have|has|left|remaining|bas|bacche|baccha)\s+(\d+)\b/iu;
// Urdu script writes the count and the currency after the number, and the
// rupee is the amount a shop could promise, so it belongs with the counts.
const COUNT_URDU =
  /(\d+)\s*(?:عدد|دن|یونٹ|پیس|کلو|گرم|لیٹر|ڈبے|تھیلے|بوتلیں|شے|تصاویر|فوٹو|پکچر|روپے|پیسہ)/u;

/** The claims a reply makes that a customer could act on. */
function claimsOf(answer, { counts = false } = {}) {
  const text = String(answer || '');
  const patterns = counts ? [MONEY, PERCENT, RATING, UNIT, COUNT, COUNT_BARE, COUNT_URDU] : [MONEY, PERCENT, RATING, UNIT];
  const claims = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(re)) {
      const raw = match[1] ?? match[2] ?? match[1] ?? match[3];
      const value = numeric(raw);
      if (Number.isFinite(value) && value > 0) claims.push({ value, unit: (match[2] || match[3] || '').toLowerCase(), text: match[0] });
    }
  }
  return claims;
}

/**
 * Are all the reply's numbers in the evidence? A number is allowed to appear
 * anywhere in it — a price inside a product name counts, since the shopper
 * reads the same string — so this refuses only what the tools never said.
 */
function isGrounded(answer, evidence, options) {
  const numbers = evidenceNumbers(evidence);
  const missing = claimsOf(answer, options).filter((claim) => !numbers.has(claim.value));
  return { ok: missing.length === 0, missing: missing.map((claim) => claim.text) };
}

const statusWords = {
  PENDING: 'is waiting for the shop to confirm',
  CONFIRMED: 'is confirmed by the shop',
  PROCESSING: 'is being packed',
  READY_FOR_SHIPMENT: 'is packed and waiting for a rider',
  SHIPPED: 'has left the shop',
  OUT_FOR_DELIVERY: 'is on its way with a rider',
  DELIVERED: 'was delivered',
  CANCELLED: 'was cancelled',
  REJECTED: 'was rejected by the shop',
  RETURN_REQUESTED: 'has a return requested',
  RETURNED: 'came back',
  REFUNDED: 'was refunded',
};

/**
 * A sentence built only from server-read cards. It states no number the card
 * does not carry, and says plainly when there is nothing to show.
 */
function serverSentence(mode, cards, scope) {
  const where = scope && scope.blockNames && scope.blockNames.length ? scope.blockNames.join(' or ') : null;
  const inCity = scope && scope.cityName ? scope.cityName : null;
  // Only name a place when one was actually resolved; "near you" without a
  // location would be the kind of claim this file exists to stop.
  const place = where ? `in ${where}` : inCity ? `in ${inCity}` : null;
  const somewhere = place ? ` ${place}` : '';

  if (mode === 'order') {
    if (!cards.length) return 'I could not find that in your orders.';
    const order = cards[0];
    const meaning = statusWords[order.orderStatus] || `is ${String(order.orderStatus || '').toLowerCase()}`;
    return `Order ${order.orderNumber} ${meaning}${
      order.brandName ? ` from ${order.brandName}` : ''
    }. The card shows the exact total.`;
  }

  if (mode === 'service') {
    if (!cards.length) return `I did not find a service provider${somewhere || ' listed'}.`;
    const provider = cards[0];
    const from = provider.startingAtPrice ? ` From Rs ${Math.round(provider.startingAtPrice / 100)}.` : '';
    return `${provider.displayName}${provider.blockName ? ` in ${provider.blockName}` : ''} is listed${from}`;
  }

  if (mode === 'compare') {
    if (cards.length < 2) return `I could not find two listings to compare${somewhere || ''}.`;
    const named = cards.map((product) => `${product.name} (Rs ${product.price})`).join(' vs ');
    return `Compared: ${named}. The cards show each one's rating, stock and shop.`;
  }

  if (!cards.length) return `I did not find a listing${somewhere || ' in this city'}. Try a simpler word, or a wider price.`;
  const product = cards[0];
  const second = cards.length > 1 ? ` ${cards.length - 1} more ${cards.length - 1 === 1 ? 'is' : 'are'} in the cards.` : '';
  return `${product.name} at ${product.brandName || 'a shop'} is Rs ${product.price}${somewhere}.${second}`.replace(
    '  ',
    ' '
  );
}

/**
 * The reply a shopper sees: the model's words when they hold up, the server's
 * own sentence when they do not. `note` is the block warning the search itself
 * produced, and it travels with either half — a sentence that never mentions
 * the warning is still free to call far-away listings "nearby", so the server
 * says it out loud rather than hoping the model did.
 */
function groundedReply({ answer, evidence, mode, cards, scope, note = null }) {
  const verdict = isGrounded(answer, evidence);
  const kept = verdict.ok && String(answer || '').trim();
  const reply = kept ? String(answer) : serverSentence(mode, cards || [], scope);
  if (!note || reply.includes(note)) return { reply, corrected: !kept };
  return { reply: `${reply.trim()} ${note}`, corrected: !kept };
}

module.exports = { isGrounded, claimsOf, evidenceNumbers, serverSentence, groundedReply, statusWords };
