const mongoose = require('mongoose');
const { z } = require('zod');

const { getBrandAnalytics } = require('../../analytics.service');
const { currentRange, previousRange, soldByProduct } = require('../tools/seller.tools');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildShopReport, PRODUCT_ROWS, ALERT_ROWS } = require('../shopReport.rules');
const {
  buildReportMessages,
  SUMMARY_LIMIT,
  NOTE_LIMIT,
  NOTE_ROWS,
  ACTION_LIMIT,
} = require('../prompts/shopReport.prompt');

/**
 * The weekly shop report (docs/29 Phase 3d-4).
 *
 * Three reads and all of them are the dashboard's own: `getBrandAnalytics` over
 * this shop's current window, the same call over the equal window before it,
 * and one units-per-product aggregate for the previous window limited to the
 * listings that actually sold now. `shopReport.rules` does every comparison, so
 * the paragraph and the chart a shop reads above it are the same figures, and
 * the model only ever re-words what it is shown.
 *
 * Nothing is written. No report is stored, mailed, scheduled or sent — the shop
 * asks, reads, and closes the page.
 */

class ShopReportError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ShopReportError';
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_DAYS = 7;
const MIN_DAYS = 7;
const MAX_DAYS = 30;
const NAME_LIMIT = 80;

const noteSchema = z.object({
  productId: z.string().trim().regex(/^[0-9a-f]{24}$/i),
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

/**
 * The dashboard payload, trimmed to what a report is made of and with every
 * product name sanitized: a shop's own listing titles reach the prompt as data,
 * never as markup or instructions.
 */
function cleanAnalytics(analytics) {
  const source = analytics || {};
  return {
    summary: source.summary || {},
    salesTrend: source.salesTrend || [],
    topProducts: (source.topProducts || []).map((row) => ({
      productId: String(row.productId),
      productName: sanitizeUserText(row.productName || '', NAME_LIMIT).replace(/\s+/g, ' ').trim(),
      unitsSold: Math.max(0, Math.round(Number(row.unitsSold) || 0)),
      revenue: Math.round(Number(row.revenue) || 0),
    })),
    inventoryAlerts: (source.inventoryAlerts || []).slice(0, ALERT_ROWS * 2).map((row) => ({
      productId: row.productId === undefined || row.productId === null ? null : String(row.productId),
      productName: sanitizeUserText(row.productName || '', NAME_LIMIT).replace(/\s+/g, ' ').trim(),
      availableQuantity: Math.round(Number(row.availableQuantity) || 0),
      lowStockThreshold: Math.round(Number(row.lowStockThreshold) || 0),
      status: row.status,
    })),
  };
}

/**
 * A note may only talk about a product the panel actually printed, and only
 * once per product, so the shop is never pointed at a listing it was not shown.
 */
function insightOf(parsed, report) {
  const printed = new Map(report.products.map((row) => [row.productId, row]));
  const notes = (parsed.notes || [])
    .filter((note) => printed.has(note.productId))
    .filter((note, index, all) => all.findIndex((item) => item.productId === note.productId) === index)
    .slice(0, NOTE_ROWS)
    .map((note) => ({ ...note, productName: printed.get(note.productId).productName }));
  const actions = (parsed.actions || [])
    .map((action) => sanitizeUserText(action, NOTE_LIMIT).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, ACTION_LIMIT);
  return {
    summary: sanitizeUserText(parsed.summary, SUMMARY_LIMIT).replace(/\s+/g, ' ').trim(),
    notes,
    actions,
  };
}

function payload({ report, insight, degraded }) {
  return { ...report, insight, degraded };
}

async function shopReport({ days, ctx }) {
  if (!ctx.brandId) {
    throw new ShopReportError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  const brandId = new mongoose.Types.ObjectId(String(ctx.brandId));
  const usedDays = clampDays(days);
  const range = currentRange(usedDays);
  const compare = previousRange(usedDays);

  // Both windows go through the dashboard's own service with the session's
  // brand, so a report cannot contain a number the charts do not show — and
  // cannot contain another shop's number at all.
  const [currentRaw, previousRaw] = await Promise.all([
    getBrandAnalytics({ brandId, range }),
    getBrandAnalytics({ brandId, range: compare }),
  ]);
  const current = cleanAnalytics(currentRaw);
  const previous = cleanAnalytics(previousRaw);

  const topIds = current.topProducts.map((row) => row.productId);
  const previousUnitsMap = await soldByProduct(compare, brandId, topIds);
  const previousUnits = new Map(
    [...previousUnitsMap.entries()].map(([id, row]) => [id, Math.max(0, Math.round(row.units || 0))]),
  );

  const report = buildShopReport({ days: usedDays, range, compare, current, previous, previousUnitsByProduct: previousUnits });

  // A week with no orders at all has nothing to compare, so it costs the shop
  // none of its daily requests and the panel prints the counts alone.
  if (report.empty) {
    return payload({ report, insight: null, degraded: false });
  }

  try {
    const result = await generate({
      task: 'shop-report',
      messages: buildReportMessages(report),
      json: true,
      temperature: 0.5,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ report, insight: insightOf(parsed, report), degraded: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The week is already counted; only the paragraph needed a model.
      return payload({ report, insight: null, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  shopReport,
  ShopReportError,
  insightOf,
  cleanAnalytics,
  clampDays,
  payload,
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
  PRODUCT_ROWS,
};
