const mongoose = require('mongoose');
const { z } = require('zod');

const Return = require('../../../models/return.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { clusterReturns } = require('../returnsStats.rules');
const {
  buildReturnsInsightMessages,
  SUMMARY_LIMIT,
  CAUSE_LIMIT,
  FIX_LIMIT,
  REPLY_LIMIT,
  THEME_LIMIT,
  PRODUCT_ROWS,
  NAME_LIMIT,
} = require('../prompts/returnsInsights.prompt');

/**
 * The returns clusterer (docs/29 Phase 3d-1).
 *
 * Two reads, both locked to `ctx.brandId`: the window's own returns and, when
 * the shop is answering one refusal, that single return. `clusterReturns` turns
 * them into counts, so the numbers a shop sees are arithmetic the server did,
 * not the model's recollection — and a theme naming a reason that is not in
 * those counts is dropped before it reaches anyone.
 *
 * Nothing is written here. The drafted reply is words the shop copies; the
 * shop's real actions stay `POST /returns/:id/receive` and the listing form.
 */
const DEFAULT_DAYS = 90;
const DAY_RANGE = { min: 7, max: 365 };
// A year of one shop's door refusals is small, but the cap keeps the prompt
// bounded no matter how long the window is.
const ROW_LIMIT = 400;

class ReturnsInsightsError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ReturnsInsightsError';
    this.status = status;
    this.code = code;
  }
}

const themeSchema = z.object({
  reason: z.string().trim().max(24),
  cause: z.string().trim().min(1).max(CAUSE_LIMIT),
  fix: z.string().trim().min(1).max(FIX_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  themes: z.array(themeSchema).max(THEME_LIMIT * 2).optional(),
  reply: z.string().trim().max(REPLY_LIMIT).optional(),
});

function text(value, limit) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

function clampDays(value) {
  const days = Number(value) || DEFAULT_DAYS;
  return Math.min(DAY_RANGE.max, Math.max(DAY_RANGE.min, Math.round(days)));
}

function cleanLine(line) {
  if (!line || typeof line !== 'object') return null;
  return {
    productId: line.productId,
    // A shop names its own products, so a name can carry markup or a stray
    // instruction; it is trimmed and marked as data before it is counted.
    productName: text(line.productName, NAME_LIMIT) || 'a product',
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    reason: line.reason,
    restock: line.restock === true,
  };
}

function cleanRow(row) {
  return {
    _id: row._id,
    status: row.status,
    feeRefunded: row.feeRefunded === true,
    // Read from the record, never re-added from the lines: this is the figure
    // the shop's own returns page shows, so both must agree.
    returnedSubtotal: row.returnedSubtotal,
    refundAmount: row.refundAmount,
    lines: (row.lines || []).map(cleanLine).filter(Boolean),
  };
}

function returnView(row) {
  const lines = (row.lines || []).map(cleanLine).filter(Boolean);
  const units = lines.reduce((sum, line) => sum + Math.max(0, Math.round(Number(line.quantity || 0))), 0);
  const value = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0) * 100) / 100;
  return { status: row.status, units, value, lines };
}

// Only reasons this shop's own counts actually contain may survive.
function allowedReasons(stats) {
  return new Set(stats.reasons.map((row) => row.reason));
}

function insightOf(parsed, stats, singleReturn) {
  const allowed = allowedReasons(stats);
  const themes = (parsed.themes || [])
    .filter((theme) => allowed.has(theme.reason))
    .filter((theme, index, all) => all.findIndex((t) => t.reason === theme.reason) === index)
    .slice(0, THEME_LIMIT);
  return {
    summary: parsed.summary,
    themes,
    ...(singleReturn && parsed.reply ? { reply: parsed.reply } : {}),
  };
}

function payload({ stats, window, insight, degraded, empty }) {
  return {
    window,
    empty,
    degraded,
    totals: stats.totals,
    status: stats.status,
    reasons: stats.reasons,
    products: stats.products.slice(0, PRODUCT_ROWS),
    productCount: stats.productCount,
    insight,
  };
}

async function returnsInsights({ days, returnId, ctx }) {
  if (!ctx.brandId) {
    throw new ReturnsInsightsError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const windowDays = clampDays(days);
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const window = { days: windowDays, from: from.toISOString(), to: to.toISOString() };

  let returnRow = null;
  if (returnId) {
    if (!mongoose.Types.ObjectId.isValid(returnId)) {
      throw new ReturnsInsightsError(404, 'Return not found.');
    }
    // Scoped by brandId in the same query, so another shop's return cannot be
    // loaded no matter what id arrives in the body.
    const found = await Return.findOne({ _id: new mongoose.Types.ObjectId(String(returnId)), brandId }).lean();
    if (!found) throw new ReturnsInsightsError(404, 'Return not found.');
    returnRow = returnView(found);
  }

  const rows = (
    await Return.find({ brandId, createdAt: { $gte: from } })
      .sort({ createdAt: -1 })
      .limit(ROW_LIMIT)
      .select('status lines returnedSubtotal refundAmount feeRefunded createdAt')
      .lean()
  ).map(cleanRow);

  const stats = clusterReturns(rows, window);
  const empty = stats.totals.returns === 0;

  if (empty) {
    // Nothing came back, so there is nothing to explain — and no reason to
    // spend one of the shop's AI requests saying so.
    return payload({ stats, window, insight: null, degraded: false, empty: true });
  }

  try {
    const result = await generate({
      task: 'returns-insights',
      messages: buildReturnsInsightMessages({ stats, returnRow }),
      json: true,
      temperature: 0.3,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ stats, window, insight: insightOf(parsed, stats, Boolean(returnRow)), degraded: false, empty: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The counts are the useful half, and they never needed a model.
      return payload({ stats, window, insight: null, degraded: true, empty: false });
    }
    throw err;
  }
}

module.exports = {
  returnsInsights,
  ReturnsInsightsError,
  insightOf,
  cleanRow,
  returnView,
  clampDays,
  DEFAULT_DAYS,
  DAY_RANGE,
  ROW_LIMIT,
  PRODUCT_ROWS,
};
