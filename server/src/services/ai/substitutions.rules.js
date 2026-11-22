const { sanitizeUserText } = require('./guard');

/**
 * Picker substitution arithmetic (docs/29 Phase 4a).
 *
 * A picker is standing in a shop aisle: the ordered item is not on the shelf and
 * they need two or three real alternatives from the SAME shop and the SAME
 * category, all of which can actually be packed. The ranking is done here, from
 * the rows the agent read, so the list a picker sees never depends on what a
 * model happened to remember.
 *
 * A picker never sees money in the Staff app, so neither the ranked rows nor the
 * reason written for each one may carry a rupee amount. Price is used only to
 * prefer a similar shelf price, and the model is given a band ("similar",
 * "lower", "higher"), never the amounts.
 */

const MAX_PRICE_GAP = 0.5;
const WHY_LIMIT = 120;
const NOTE_LIMIT = 200;

// A rupee sign, a currency word or a three-digit number in a suggestion reason
// is a leak of a price the picker must not see. The server's own wording is the
// fallback; the model is never trusted to keep money out.
const MONEY_PATTERN = /(?:\brs\.?\b|\bpkr\b|\brupees?\b|₨|\d{3,})/i;
const LINK_PATTERN = /(?:https?:\/\/|www\.)/i;

const STOP_WORDS = new Set([
  'and',
  'for',
  'the',
  'with',
  'from',
  'pack',
  'packet',
  'size',
  'fresh',
  'premium',
]);

function nameOf(value) {
  return sanitizeUserText(value || '', 120).replace(/\s+/g, ' ').trim();
}

function tokensOf(value) {
  return new Set(
    nameOf(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  );
}

/** How much two product names share, 0 to 1. Pack sizes and units count. */
function nameOverlap(left, right) {
  const a = tokensOf(left);
  const b = tokensOf(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

function priceGap(originalPrice, candidatePrice) {
  const base = Number(originalPrice);
  const value = Number(candidatePrice);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.abs(value - base) / base;
}

function priceBand(originalPrice, candidatePrice) {
  const gap = priceGap(originalPrice, candidatePrice);
  if (gap === null) return 'unknown';
  const lower = Number(candidatePrice) < Number(originalPrice);
  if (gap <= 0.15) return 'similar';
  if (gap <= MAX_PRICE_GAP) return lower ? 'lower' : 'higher';
  return 'far';
}

function reasonOf(candidate) {
  const band = candidate.priceBand;
  const priceLine =
    band === 'similar'
      ? 'Similar price band'
      : band === 'lower'
        ? 'Lower price band'
        : band === 'higher'
          ? 'Higher price band'
          : null;
  const stockLine =
    candidate.availableQuantity === null
      ? 'in stock'
      : `${candidate.availableQuantity} available`;
  return [priceLine, stockLine].filter(Boolean).join(' · ').slice(0, WHY_LIMIT);
}

/**
 * Keeps the model's reason only when it says something and contains no amount,
 * currency word or link. Anything else gets the server's own band-and-stock line.
 */
function cleanReason(value, fallback) {
  const text = sanitizeUserText(value || '', WHY_LIMIT).replace(/\s+/g, ' ').trim();
  if (!text || text.length < 3) return fallback;
  if (MONEY_PATTERN.test(text) || LINK_PATTERN.test(text)) return fallback;
  return text;
}

function candidateView(row, availableQuantity) {
  const productId = String(row._id || row.productId);
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    productId,
    name: nameOf(row.name),
    sku: nameOf(row.sku).slice(0, 40) || null,
    image: images[0] || null,
    availableQuantity,
  };
}

/**
 * Ranks the shop's own in-stock, same-category listings and cuts the list to
 * what a picker can scan in one look. Everything the picker reads is returned
 * here, so the response is useful even when the model is down.
 */
function rankSubstitutes(original, candidates, limit = 3) {
  const originalId = String(original.productId || '');
  const ranked = [];

  for (const candidate of candidates || []) {
    const id = String(candidate.productId || candidate._id || '');
    if (!id || id === originalId) continue;
    if (candidate.availableQuantity === 0) continue;
    const band = priceBand(original.price, candidate.price);
    if (band === 'far') continue;
    ranked.push({
      ...candidateView(candidate, candidate.availableQuantity ?? null),
      priceBand: band,
      overlap: nameOverlap(original.name, candidate.name),
      gap: priceGap(original.price, candidate.price) ?? Number.POSITIVE_INFINITY,
    });
  }

  ranked.sort((left, right) => {
    const bandOrder = { similar: 0, unknown: 1, lower: 2, higher: 3 };
    const bandDiff = (bandOrder[left.priceBand] ?? 4) - (bandOrder[right.priceBand] ?? 4);
    if (bandDiff !== 0) return bandDiff;
    if (right.overlap !== left.overlap) return right.overlap - left.overlap;
    if (left.gap !== right.gap) return left.gap - right.gap;
    return left.name.localeCompare(right.name);
  });

  return ranked.slice(0, limit).map((candidate) => ({
    productId: candidate.productId,
    name: candidate.name,
    sku: candidate.sku,
    image: candidate.image,
    availableQuantity: candidate.availableQuantity,
    why: reasonOf(candidate),
  }));
}

/**
 * Drops any pick the model invented, repeats or names in a form the picker must
 * not read, then puts the remaining picks back in the server's own rank order.
 */
function filterPicks(parsed, ranked) {
  const byId = new Map(ranked.map((candidate) => [candidate.productId, candidate]));
  const seen = new Set();
  const picks = [];

  for (const pick of parsed.picks || []) {
    const productId = String(pick.productId || '');
    const candidate = byId.get(productId);
    if (!candidate || seen.has(productId)) continue;
    seen.add(productId);
    picks.push({ ...candidate, why: cleanReason(pick.why, candidate.why) });
  }

  const order = new Map(ranked.map((candidate, index) => [candidate.productId, index]));
  picks.sort((left, right) => order.get(left.productId) - order.get(right.productId));
  return picks;
}

function cleanNote(value) {
  const text = sanitizeUserText(value || '', NOTE_LIMIT).replace(/\s+/g, ' ').trim();
  if (!text || MONEY_PATTERN.test(text) || LINK_PATTERN.test(text)) return null;
  return text;
}

module.exports = {
  rankSubstitutes,
  filterPicks,
  cleanReason,
  cleanNote,
  nameOverlap,
  priceBand,
  priceGap,
  reasonOf,
  MAX_PRICE_GAP,
  WHY_LIMIT,
  NOTE_LIMIT,
  MONEY_PATTERN,
};
