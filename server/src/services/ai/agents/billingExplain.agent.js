const mongoose = require('mongoose');
const { z } = require('zod');

const SellerInvoice = require('../../../models/sellerInvoice.model');
const CommissionEntry = require('../../../models/commissionEntry.model');
const SellerPaymentClaim = require('../../../models/sellerPaymentClaim.model');
const Order = require('../../../models/order.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { rupeesToPaisa, buildBillingExplain, printableEntries } = require('../billingExplain.rules');
const {
  buildExplainMessages,
  SUMMARY_LIMIT,
  NOTE_LIMIT,
  NOTE_ROWS,
} = require('../prompts/billingExplain.prompt');

/**
 * The bill explainer (docs/29 Phase 3d-6).
 *
 * A brand admin's money question is not "where is my payout" — CityCart never
 * holds a shop's money (docs/15 §1) — it is "why is this invoice this size".
 * Four records answer it and all four are already on file: the invoice with its
 * five paisa amounts, the commission lines that built it, the payments submitted
 * against it, and the orders the largest lines were charged on.
 *
 * This agent reads those records and hands the model figures CityCart added up.
 * It never works out what a charge should have been: `commissionForPaisa` is not
 * called, the 1% is not re-derived, and the only arithmetic here is the sum of
 * stored fields and the comparison of one stored field with another. Where the
 * records disagree the answer says so and sends the admin to the Help tab,
 * because deciding which record is right is the platform team's job (docs/15
 * §20.8).
 *
 * Nothing is written. No invoice is edited, no entry is reversed, no claim is
 * verified, no credit is applied and no help request is filed — an issued
 * invoice is immutable by design and this feature has no path to any of them.
 */

const SELLER_TYPE = 'BRAND';
const REASON_LIMIT = 300;

class BillingExplainError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'BillingExplainError';
    this.status = status;
    this.code = code;
  }
}

const noteSchema = z.object({
  entryId: z.string().trim().regex(/^[0-9a-f]{24}$/i),
  note: z.string().trim().min(1).max(NOTE_LIMIT),
});

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_LIMIT),
  notes: z.array(noteSchema).max(NOTE_ROWS * 2).optional(),
});

function text(value, limit) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

/**
 * A commission line, kept to the fields this feature reads. The line is
 * immutable history, so `status` and `reversalOf` are carried for nothing: they
 * change no figure and a bill answer must not grow a second ledger.
 */
function cleanEntry(row) {
  if (!row) return null;
  return {
    _id: row._id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    eligibleAmountPaisa: row.eligibleAmountPaisa,
    rateBps: row.rateBps,
    commissionPaisa: row.commissionPaisa,
    kind: row.kind,
    occurredAt: row.occurredAt,
    // Recorded text from a staff or refund flow: data, and markup-free before
    // it reaches a prompt.
    reason: text(row.reason, REASON_LIMIT),
  };
}

/** Only the three amounts a payment line is judged on — never its reference. */
function cleanClaim(row) {
  if (!row) return null;
  return {
    _id: row._id,
    amountPaisa: row.amountPaisa,
    status: row.status,
    creditPaisa: row.creditPaisa,
  };
}

/**
 * An order trimmed to its own money fields. Order amounts are rupees (docs/08
 * §6) and the ledger is paisa (docs/15 §13), so the conversion happens once,
 * here, at the edge — and `netTotal ?? total` is read exactly the way
 * `recordOrderCommission` read it, so this panel cannot invent a third version
 * of an order's value. Names, addresses, phones, items and customer ids are
 * dropped before anything is compared.
 */
function cleanOrder(row) {
  if (!row) return null;
  return {
    _id: String(row._id),
    orderNumber: row.orderNumber || null,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt || null,
    netPaisa: rupeesToPaisa(row.netTotal ?? row.total ?? 0),
    deliveryFeePaisa: rupeesToPaisa(row.deliveryFee ?? 0),
    taxPaisa: rupeesToPaisa(row.tax ?? 0),
    returnedAmountPaisa: rupeesToPaisa(row.returnedAmount ?? 0),
    feeRefunded: Boolean(row.feeRefunded),
    fulfilment: row.fulfilment || null,
  };
}

/**
 * A note may only describe a line the panel actually printed, and only one note
 * per line, so an admin is never pointed at a commission record they were not
 * shown.
 */
function insightOf(parsed, bill) {
  const printed = new Map(
    [...bill.sales.lines, ...bill.credits.lines].map((line) => [line.entryId, line])
  );
  const notes = (parsed.notes || [])
    .filter((note) => printed.has(note.entryId))
    .filter((note, index, all) => all.findIndex((item) => item.entryId === note.entryId) === index)
    .slice(0, NOTE_ROWS)
    .map((note) => ({ ...note, kind: printed.get(note.entryId).kind }));
  return { summary: text(parsed.summary, SUMMARY_LIMIT), notes };
}

function payload({ bill, insight, degraded }) {
  return { ...bill, insight, degraded };
}

async function billingExplain({ invoiceId, ctx }) {
  if (!ctx.brandId) {
    throw new BillingExplainError(403, 'This needs a brand account.', 'NO_BRAND');
  }
  if (!mongoose.isValidObjectId(invoiceId)) {
    throw new BillingExplainError(404, 'Invoice not found.', 'INVOICE_NOT_FOUND');
  }
  const brandId = String(ctx.brandId);

  // The invoice is found by tenant as well as by id, so another shop's invoice
  // 404s exactly like a missing one and never reveals that it exists.
  const invoice = await SellerInvoice.findOne({ _id: invoiceId, sellerType: SELLER_TYPE, sellerId: brandId }).lean();
  if (!invoice) {
    throw new BillingExplainError(404, 'Invoice not found.', 'INVOICE_NOT_FOUND');
  }

  const [entryRows, claimRows, carriedRows] = await Promise.all([
    // The same query the invoice screen itself runs (billing.service.js
    // getSellerInvoice), so the two can never disagree about which lines exist.
    CommissionEntry.find({ invoiceId: invoice._id }).sort({ occurredAt: 1 }).lean(),
    SellerPaymentClaim.find({ invoiceId: invoice._id, sellerType: SELLER_TYPE, sellerId: brandId })
      .sort({ createdAt: -1 })
      .lean(),
    // A verified overpayment on an *earlier* invoice lands on this one as a
    // credit, and without it the credits line can never be added up.
    SellerPaymentClaim.find({ creditAppliedInvoiceId: invoice._id, sellerType: SELLER_TYPE, sellerId: brandId }).lean(),
  ]);

  const entries = (entryRows || []).map(cleanEntry).filter(Boolean);
  const claims = (claimRows || []).map(cleanClaim).filter(Boolean);
  const carriedClaims = (carriedRows || []).map(cleanClaim).filter(Boolean);

  // Only the lines the panel prints need an order read, and that read is pinned
  // to this brand in the query itself.
  const { orderIds } = printableEntries(entries);
  const orderRows = orderIds.length
    ? await Order.find({ _id: { $in: orderIds.map((id) => new mongoose.Types.ObjectId(id)) }, brandId })
        .select('orderNumber createdAt deliveredAt netTotal total deliveryFee tax returnedAmount feeRefunded fulfilment')
        .lean()
    : [];
  const orders = (orderRows || []).map(cleanOrder).filter(Boolean);

  const bill = buildBillingExplain({ invoice, entries, claims, carriedClaims, orders, now: new Date() });

  // An invoice with no lines has nothing to explain beyond its own five
  // numbers, so it costs the shop no AI request.
  if (bill.empty) {
    return payload({ bill, insight: null, degraded: false });
  }

  try {
    const result = await generate({
      task: 'billing-explain',
      messages: buildExplainMessages(bill),
      json: true,
      temperature: 0.3,
      maxTokens: 900,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    return payload({ bill, insight: insightOf(parsed, bill), degraded: false });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      // The amounts are CityCart's own records and never needed a model; only
      // the paragraph did.
      return payload({ bill, insight: null, degraded: true });
    }
    throw err;
  }
}

module.exports = {
  billingExplain,
  BillingExplainError,
  insightOf,
  cleanEntry,
  cleanClaim,
  cleanOrder,
  payload,
  SELLER_TYPE,
  REASON_LIMIT,
};
