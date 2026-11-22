const mongoose = require('mongoose');
const { z } = require('zod');

const Brand = require('../../../models/brand.model');
const Order = require('../../../models/order.model');
const { orderMatch } = require('../../analytics.service');
const { currentRange } = require('../tools/seller.tools');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildPromiseCheck, PROMISE_TEXT_LIMIT } = require('../promiseCheck.rules');
const {
  buildCheckMessages,
  SUMMARY_LIMIT,
  NOTE_LIMIT,
  NOTE_ROWS,
  ACTION_LIMIT,
} = require('../prompts/promiseCheck.prompt');

/**
 * The promise check (docs/29 Phase 3d-5).
 *
 * Two reads, and both are already on this shop's side of the tenant line: the
 * timeframe the shop wrote in its own settings, and the order records the
 * delivery screens it can already open. Every duration is a subtraction between
 * two timestamps the order itself carries, done in `promiseCheck.rules`, so the
 * paragraph a shop reads is its own log described back to it — and a settings
 * box that does not state a number is reported as unreadable instead of being
 * guessed at, because an invented promise would turn the shop's own words into
 * a breach it never agreed to.
 *
 * Nothing is written here, and nothing is sent. No customer is messaged, no
 * delivery is reassigned, no order status changes; the shop's real actions stay
 * the ordinary delivery screens.
 */

const DEFAULT_DAYS = 7;
const MIN_DAYS = 7;
const MAX_DAYS = 30;
// A shop with a very busy month is measured on the newest orders in the window
// and told so, rather than reading a whole quarter into memory for one panel.
const ORDER_LIMIT = 500;

class PromiseCheckError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'PromiseCheckError';
    this.status = status;
    this.code = code;
  }
}

const noteSchema = z.object({
  orderId: z.string().trim().regex(/^[0-9a-f]{24}$/i),
  note: z.string().trim().min(1).max(NOTE_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  notes: z.array(noteSchema).max(NOTE_ROWS * 2).optional(),
  actions: z.array(z.string().trim().min(1).max(NOTE_LIMIT)).max(ACTION_LIMIT * 2).optional(),
});

function clampDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(days)));
}

function text(value, limit) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

/**
 * The shop's own promise as writing, whatever type the settings document happens
 * to hold. `sanitizeUserText` refuses non-strings, and turning a settings box
 * that really says something into "nothing was written" would be its own lie.
 */
function promiseTextOf(brand) {
  const raw = brand && brand.settings ? brand.settings.estimatedDeliveryTime : null;
  const written =
    typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  return text(written, PROMISE_TEXT_LIMIT);
}

/**
 * The order row trimmed to the three fields this feature is allowed to look at.
 * `statusHistory` keeps only the status and its timestamp, so the id of whoever
 * moved an order never leaves the record it came from.
 */
function cleanOrder(row) {
  if (!row) return null;
  return {
    _id: String(row._id),
    createdAt: row.createdAt,
    orderStatus: row.orderStatus,
    statusHistory: (row.statusHistory || [])
      .filter((entry) => entry && entry.status && entry.at)
      .map((entry) => ({ status: String(entry.status), at: entry.at })),
  };
}

/**
 * A note may only talk about an order the panel actually printed, and only once
 * per order, so a shop is never pointed at a delivery it was not shown.
 */
function insightOf(parsed, check) {
  const printed = new Map(check.slowest.map((row) => [row.orderId, row]));
  const notes = (parsed.notes || [])
    .filter((note) => printed.has(note.orderId))
    .filter((note, index, all) => all.findIndex((item) => item.orderId === note.orderId) === index)
    .slice(0, NOTE_ROWS)
    .map((note) => ({ ...note, minutes: printed.get(note.orderId).minutes }));
  const actions = (parsed.actions || [])
    .map((action) => text(action, NOTE_LIMIT))
    .filter((action, index, all) => all.indexOf(action) === index)
    .slice(0, ACTION_LIMIT);
  return { summary: text(parsed.summary, SUMMARY_LIMIT), notes, actions };
}

function payload({ check, insight, degraded }) {
  return { ...check, insight, degraded };
}

async function promiseCheck({ days, ctx }) {
  if (!ctx.brandId) {
    throw new PromiseCheckError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const usedDays = clampDays(days);
  const now = new Date();
  const range = currentRange(usedDays, now);

  const [brand, found] = await Promise.all([
    // Only the shop's own settings document, and only the one field the promise
    // is written in; no commission rate, no payout, no brand name.
    Brand.findById(brandId).select('settings').lean(),
    Order.find(orderMatch(range, brandId))
      .sort({ createdAt: -1 })
      .limit(ORDER_LIMIT + 1)
      .select('createdAt orderStatus statusHistory')
      .lean(),
  ]);

  const rows = found || [];
  const sampled = rows.length > ORDER_LIMIT;
  const orders = rows.slice(0, ORDER_LIMIT).map(cleanOrder).filter(Boolean);

  const check = buildPromiseCheck({
    days: usedDays,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    now,
    // The shop's own words, sanitized before they are read for a number or
    // printed, so a settings box cannot smuggle markup into the prompt.
    promiseText: promiseTextOf(brand),
    orders,
    sampled,
  });

  // A window with no order at all has nothing to measure, so it costs the shop
  // none of its daily requests and the panel prints the empty state alone.
  if (check.empty) {
    return payload({ check, insight: null, degraded: false });
  }

  try {
    const result = await generate({
      task: 'promise-check',
      messages: buildCheckMessages(check),
      json: true,
      temperature: 0.4,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ check, insight: insightOf(parsed, check), degraded: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The minutes between two timestamps are CityCart's own arithmetic and
      // never needed a model; only the paragraph did.
      return payload({ check, insight: null, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  promiseCheck,
  PromiseCheckError,
  insightOf,
  cleanOrder,
  promiseTextOf,
  clampDays,
  payload,
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
  ORDER_LIMIT,
};
