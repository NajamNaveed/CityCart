/**
 * The deadstock read (docs/29 Phase 3d-7).
 *
 * A shop's question is "what is sitting on my shelf and what should it cost".
 * Two records answer it — `Inventory` says how many units are still there, the
 * shop's own delivered `Order` lines say whether any of them left — and this
 * file does the whole of the arithmetic between them. It is the one brand-AI
 * feature that is allowed to put a new price in front of a shop (3d-3 is told
 * not to, and points here), so every step of how that price is arrived at lives
 * in code and in tests rather than in a model's judgement.
 *
 * The ladder is deliberately small and deliberately not about profit. CityCart
 * stores no cost and no supplier price for a listing (docs/04 has none, and
 * docs/07 §454 keeps supplier costs out of what a shop can read at all), so
 * margin cannot be computed here even in principle. What *can* be stated from
 * stored fields is the money tied up in unsold units and the money the shop
 * gives up if every one of them sells at the suggested price — a difference
 * between two of the shop's own prices, never a claim about what an item cost.
 *
 * Nothing is written. A suggestion is a number on a screen; the listing keeps
 * its price until the shop edits it on the ordinary product form.
 */

const DAY_MS = 86400000;

// The window a shop asks about ("nothing has sold in the last N days"), and the
// wider, bounded look-back used to find when something last *did* sell.
const MIN_DAYS = 30;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
const LOOKBACK_DAYS = 365;

// How many stock positions one read walks, and how many rows a shop is shown.
const CANDIDATE_SCAN = 240;
const ROW_LIMIT = 8;

// Basis points taken off the listing's own price, deepest first by how long it
// has sat. The whole ladder is capped at 20%: past that a shop is not being
// advised, it is being told to give its stock away.
const MARKDOWN_LADDER = [
  { fromDays: 180, bps: 2000 },
  { fromDays: 90, bps: 1500 },
  { fromDays: 30, bps: 1000 },
];
const MAX_MARKDOWN_BPS = 2000;
// A listing with no sale anywhere in the look-back has certainly sat longer
// than the deepest rung, but CityCart cannot say how much longer — so it gets
// the deepest rung and the sentence that says why.
const BEYOND_LOOKBACK_LABEL = `no sale in ${LOOKBACK_DAYS} days`;

const MONEY_NOTE =
  'Prices and totals are Pakistani rupees, written exactly as CityCart stores them. Amounts come from a listing’s own price multiplied by units on the shelf — never from a cost, because CityCart does not store one.';

function paisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

/** A listing price is rupees with up to two decimals; everything after this is integer paisa. */
function rupeesToPaisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One amount in paisa, and the same amount in the words the panel and prompt print. */
function amount(value) {
  const raw = paisa(value);
  const abs = Math.abs(raw);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return {
    paisa: raw,
    text: `${raw < 0 ? '−' : ''}PKR ${groupDigits(String(whole))}.${fraction}`,
  };
}

/** A price is only ever compared when it is a real positive number. */
function pricePaisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100);
}

function plural(count, word) {
  const value = paisa(count);
  return `${value} ${Math.abs(value) === 1 ? word : `${word}s`}`;
}

function agree(count, singular, pluralForm) {
  return Math.abs(paisa(count)) === 1 ? singular : pluralForm;
}

function time(value) {
  if (!value) return null;
  const ms = Date.parse(value instanceof Date ? value : new Date(value));
  return Number.isFinite(ms) ? ms : null;
}

/** Whole 24-hour days between two moments, negative when `from` comes later. */
function daySpan(from, to) {
  const start = time(from);
  const end = time(to);
  if (start === null || end === null) return null;
  return Math.floor((end - start) / DAY_MS);
}

function dayKey(value) {
  const ms = time(value);
  if (ms === null) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Percent of a price removed, written without float noise: 1000 bps -> "10%". */
function percentOff(bps) {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  if (fraction % 10 === 0) return `${whole}.${fraction / 10}%`;
  return `${whole}.${String(fraction).padStart(2, '0')}%`;
}

/**
 * The rung a listing gets, or `null` when it has not sat long enough to be
 * called sitting stock at all. `daysSinceSale === null` means "nothing sold it
 * inside the look-back", which is longer than every rung, so it takes the
 * deepest one.
 */
function markdownBpsFor(daysSinceSale, { beyondLookback = false } = {}) {
  if (beyondLookback) return MARKDOWN_LADDER[0].bps;
  if (daysSinceSale === null) return null;
  for (const rung of MARKDOWN_LADDER) {
    if (daysSinceSale >= rung.fromDays) return rung.bps;
  }
  return null;
}

/**
 * One listing's suggestion, from its own two price fields only.
 *
 * The floor is the shop's own lower figure, never an invented one: when a
 * listing already displays a compare-at price *below* what shoppers pay — the
 * same broken pair 3d-3 scores zero — CityCart will not push the price under
 * the only lower number the shop itself wrote down. When that floor leaves no
 * room at all the suggestion is refused rather than rounded into nothing.
 */
function suggestionFor({ price, compareAtPrice, availableQuantity, daysSinceSale, noSaleInLookback }) {
  const current = pricePaisa(price);
  const compare = pricePaisa(compareAtPrice);
  const compareAmount = compare === null ? null : amount(compare);
  if (current === null) {
    return {
      current: null,
      compare: compareAmount,
      bps: null,
      bpsText: null,
      clamped: false,
      clampNote: null,
      suggested: null,
      blocked: true,
      blockReason: 'This listing has no positive price to mark down, so CityCart suggests nothing.',
      value: null,
      released: null,
      atSuggested: null,
    };
  }

  const units = Math.max(0, paisa(availableQuantity));
  const value = amount(units * current);
  const bps = markdownBpsFor(daysSinceSale, { beyondLookback: noSaleInLookback });

  if (bps === null) {
    return {
      current: amount(current),
      compare: compareAmount,
      bps: null,
      bpsText: null,
      clamped: false,
      clampNote: null,
      suggested: null,
      blocked: false,
      blockReason: null,
      value,
      released: null,
      atSuggested: null,
    };
  }

  // A floor only ever exists when it is strictly under the price, and every rung
  // takes something off the price, so `suggested` is always a real markdown.
  const floor = compare !== null && compare < current ? compare : null;
  const asked = Math.floor((current * (10000 - bps)) / 10000);
  const suggested = floor !== null && asked < floor ? floor : asked;

  // What is printed is what the suggestion actually is. A listing held up by
  // its own compare-at price gets the smaller markdown stated, not the rung it
  // would have had.
  const applied = Math.floor(((current - suggested) * 10000) / current);
  const atSuggested = amount(units * suggested);
  return {
    current: amount(current),
    compare: compareAmount,
    bps: applied,
    bpsText: percentOff(applied),
    clamped: applied !== bps,
    clampNote:
      applied !== bps
        ? `The ladder reached ${percentOff(bps)}, but CityCart stopped at ${amount(floor).text}, the lowest figure this listing already shows.`
        : null,
    suggested: amount(suggested),
    blocked: false,
    blockReason: null,
    value,
    // Not a margin: the difference between two of this shop's own prices if
    // every unit on the shelf sold.
    released: amount(value.paisa - atSuggested.paisa),
    atSuggested,
  };
}

/** Order line money arrives in rupees, like every other amount on an order. */
function soldRow(sold) {
  if (!sold) {
    return { unitsInWindow: 0, unitsInLookback: 0, revenueInLookback: amount(0), lastSoldAt: null };
  }
  return {
    unitsInWindow: paisa(sold.unitsInWindow),
    unitsInLookback: paisa(sold.unitsInLookback),
    revenueInLookback: amount(rupeesToPaisa(sold.revenueInLookback)),
    lastSoldAt: sold.lastSoldAt || null,
  };
}

/** A row is "sitting" when a live, tracked listing has units left and sold none in the window. */
function rowOf({ inventory, product, sold, now }) {
  const available = paisa(inventory.quantity) - paisa(inventory.reservedQuantity);
  const sales = soldRow(sold);
  const noSaleInLookback = !sales.lastSoldAt;
  const measured = sales.lastSoldAt ? daySpan(sales.lastSoldAt, now) : null;
  // A whole number of days, or `null`: a timestamp that will not subtract is
  // reported as unmeasured rather than called zero days old.
  const daysSinceSale = measured !== null && measured > 0 ? measured : null;
  const status = product ? product.status : null;
  const live = Boolean(product) && status === 'ACTIVE' && product.isActive !== false;

  const skip = (() => {
    if (!product) return 'missing';
    if (inventory.trackInventory === false) return 'untracked';
    if (!live) return 'notLive';
    if (available <= 0) return 'noStock';
    if (sales.unitsInWindow > 0) return 'selling';
    return null;
  })();

  const suggestion = skip === null ? suggestionFor({
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    availableQuantity: available,
    daysSinceSale,
    noSaleInLookback,
  }) : null;

  return {
    productId: String(product ? product._id : inventory.productId),
    productName: product ? product.name : null,
    sku: product && product.sku ? product.sku : null,
    quantity: paisa(inventory.quantity),
    reservedQuantity: paisa(inventory.reservedQuantity),
    availableQuantity: Math.max(0, available),
    skip,
    // The raw timestamp is measured into `lastSoldOn` and `daysSinceSale` above
    // and then dropped: a shop reads a day and a count, not a clock value.
    sales: {
      unitsInWindow: sales.unitsInWindow,
      unitsInLookback: sales.unitsInLookback,
      revenueInLookback: sales.revenueInLookback,
    },
    lastSoldOn: dayKey(sales.lastSoldAt),
    // `null` beside `beyondLookback` is a bound, not a number: the shop reads
    // "no sale in 365 days", never a made-up day count.
    daysSinceSale,
    beyondLookback: noSaleInLookback,
    sittingText: noSaleInLookback
      ? BEYOND_LOOKBACK_LABEL
      : daysSinceSale === null
        ? 'its last sale has no date on it'
        : `${daysSinceSale} days since it last sold`,
    suggested: suggestion,
  };
}

function byValueTiedUp(a, b) {
  const left = a.suggested && a.suggested.value ? a.suggested.value.paisa : 0;
  const right = b.suggested && b.suggested.value ? b.suggested.value.paisa : 0;
  return right - left;
}

function skippedTally(rows) {
  const tally = { missing: 0, untracked: 0, notLive: 0, noStock: 0, selling: 0 };
  for (const row of rows) {
    if (row.skip && tally[row.skip] !== undefined) tally[row.skip] += 1;
  }
  return tally;
}

function totalsOf(rows) {
  const sitting = rows.filter((row) => row.skip === null);
  const priced = sitting.filter((row) => row.suggested && row.suggested.suggested !== null);
  const blocked = sitting.filter((row) => row.suggested && row.suggested.blocked);
  return {
    scanned: rows.length,
    sitting: sitting.length,
    priced: priced.length,
    blocked: blocked.length,
    units: sitting.reduce((sum, row) => sum + row.availableQuantity, 0),
    valueTiedUp: amount(sitting.reduce((sum, row) => sum + (row.suggested.value ? row.suggested.value.paisa : 0), 0)),
    // What the shop would give up if every unit suggested sold at the new
    // price. It is not profit and is never called that.
    released: amount(
      priced.reduce((sum, row) => sum + (row.suggested.released ? row.suggested.released.paisa : 0), 0),
    ),
  };
}

/** The rows both the panel and the prompt print, ranked by money sitting still. */
function printableRows(rows) {
  const sitting = rows.filter((row) => row.skip === null);
  const ordered = [...sitting].sort(byValueTiedUp);
  return ordered.slice(0, ROW_LIMIT);
}

function windowOf(days, now) {
  const windowDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(days) || DEFAULT_DAYS)));
  const end = time(now) || Date.now();
  return {
    days: windowDays,
    from: new Date(end - windowDays * DAY_MS).toISOString(),
    to: new Date(end).toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    lookbackFrom: new Date(end - LOOKBACK_DAYS * DAY_MS).toISOString(),
  };
}

function buildDeadstockPricing({ inventories = [], products = [], sold = [], days, now = new Date() } = {}) {
  const byId = new Map();
  for (const product of products || []) {
    if (product && product._id) byId.set(String(product._id), product);
  }
  const soldById = new Map();
  for (const row of sold || []) {
    if (row && row.productId) soldById.set(String(row.productId), row);
  }

  const window = windowOf(days, now);
  const rows = (inventories || [])
    .filter((inventory) => inventory && inventory.productId)
    .map((inventory) =>
      rowOf({
        inventory,
        product: byId.get(String(inventory.productId)) || null,
        sold: soldById.get(String(inventory.productId)) || null,
        now,
      })
    );

  const skipped = skippedTally(rows);
  const totals = totalsOf(rows);
  const shown = printableRows(rows);

  return {
    window,
    totals,
    shown,
    // The read is bounded, so a shop with more stock than one pass walks is
    // told so instead of being handed a partial picture described as whole.
    scanned: rows.length,
    scanLimit: CANDIDATE_SCAN,
    sampled: rows.length >= CANDIDATE_SCAN,
    skipped,
    suggestedRows: shown.filter((row) => row.suggested && row.suggested.suggested !== null).length,
    ladder: MARKDOWN_LADDER.map((rung) => ({ fromDays: rung.fromDays, bps: rung.bps, text: percentOff(rung.bps) })),
    maxMarkdown: percentOff(MAX_MARKDOWN_BPS),
    margin: null,
    marginNote:
      'CityCart stores no cost or supplier price for a listing, so it cannot tell you what you still earn after a markdown. It never guesses one.',
    moneyNote: MONEY_NOTE,
    empty: totals.sitting === 0,
    currency: 'PKR',
  };
}

module.exports = {
  buildDeadstockPricing,
  printableRows,
  suggestionFor,
  markdownBpsFor,
  rowOf,
  soldRow,
  totalsOf,
  skippedTally,
  windowOf,
  byValueTiedUp,
  amount,
  pricePaisa,
  rupeesToPaisa,
  percentOff,
  daySpan,
  dayKey,
  plural,
  agree,
  MIN_DAYS,
  MAX_DAYS,
  DEFAULT_DAYS,
  LOOKBACK_DAYS,
  CANDIDATE_SCAN,
  ROW_LIMIT,
  MARKDOWN_LADDER,
  MAX_MARKDOWN_BPS,
  BEYOND_LOOKBACK_LABEL,
  MONEY_NOTE,
  DAY_MS,
};
