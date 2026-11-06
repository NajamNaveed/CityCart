const Brand = require('../models/brand.model');
const ServiceProvider = require('../models/serviceProvider.model');
const CommissionEntry = require('../models/commissionEntry.model');
const SellerInvoice = require('../models/sellerInvoice.model');
const SellerPaymentClaim = require('../models/sellerPaymentClaim.model');
const BillingHelpRequest = require('../models/billingHelp.model');
const PlatformSettings = require('../models/platformSettings.model');

const { runInTransaction } = require('../utils/transaction');
const { escapeRegex } = require('../utils/escapeRegex');
const { karachiMonthKey, startOfKarachiMonth } = require('../utils/karachiTime');
const {
  UploadError,
  createBillingReceiptSignature,
  createProofDownloadUrl,
  billingReceiptFolder,
} = require('./upload.service');
const {
  notifySellerClaimDecided,
  notifySellerBillingHelpAnswered,
} = require('./notification.service');
const {
  BILLING_DEFAULTS,
  SELLING_BLOCKED_STATUSES,
} = require('../config/billing');

const DEFAULT_LIMIT = 20;

class BillingError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function sellerModel(type) {
  return type === 'BRAND' ? Brand : ServiceProvider;
}

function assertSellerType(type) {
  if (type !== 'BRAND' && type !== 'SERVICE_PROVIDER') {
    throw new BillingError(400, 'Unknown seller type.', 'INVALID_SELLER_TYPE');
  }
  return type;
}

/**
 * 1% of an integer paisa base, rounded half-up (docs/15 §3). Integer-only:
 * base × bps is far below Number.MAX_SAFE_INTEGER for marketplace amounts.
 */
function commissionForPaisa(basePaisa, rateBps) {
  if (!Number.isInteger(basePaisa) || basePaisa <= 0 || !Number.isInteger(rateBps) || rateBps <= 0) return 0;
  return Math.floor((basePaisa * rateBps + 5000) / 10000);
}

async function getBillingSettings() {
  const settings = await PlatformSettings.findOne({ key: 'platform' }).lean();
  const billing = (settings && settings.billing) || {};
  const d = BILLING_DEFAULTS;
  return {
    rateBps: Number.isInteger(billing.rateBps) ? billing.rateBps : d.rateBps,
    dueDays: Number.isInteger(billing.dueDays) ? billing.dueDays : d.dueDays,
    restrictAfterDays: Number.isInteger(billing.restrictAfterDays) ? billing.restrictAfterDays : d.restrictAfterDays,
    freezeAfterDays: Number.isInteger(billing.freezeAfterDays) ? billing.freezeAfterDays : d.freezeAfterDays,
    minimumInvoicePaisa: Number.isInteger(billing.minimumInvoicePaisa)
      ? billing.minimumInvoicePaisa
      : d.minimumInvoicePaisa,
    bank: {
      bankName: billing.bank?.bankName || '',
      accountTitle: billing.bank?.accountTitle || '',
      accountNumber: billing.bank?.accountNumber || '',
      iban: billing.bank?.iban || '',
      instructions: billing.bank?.instructions || '',
    },
  };
}

// ---- commission entries ---------------------------------------------------

async function insertAccruedOnce({ entry, session }) {
  try {
    await CommissionEntry.updateOne(
      { sourceType: entry.sourceType, sourceId: entry.sourceId, kind: 'SALE' },
      { $setOnInsert: entry },
      { upsert: true, session }
    );
  } catch (err) {
    // Two concurrent completions of the same sale: the unique index keeps one
    // entry, exactly as docs/15 §15 requires.
    if (err && err.code !== 11000) throw err;
  }
}

/** Order DELIVERED -> one 1% entry for the brand (docs/15 §6.1). */
async function recordOrderCommission(order, { session, now = new Date() } = {}) {
  if (!order || order.orderStatus !== 'DELIVERED') return null;
  // Order totals are stored in rupees (docs/08 §6); the ledger is integer
  // paisa, so the merchant base is converted before the 1% is taken.
  const netTotal = Number(order.netTotal ?? order.total ?? 0);
  const baseRupees = Math.max(0, netTotal - Number(order.deliveryFee || 0) - Number(order.tax || 0));
  const base = Math.round(baseRupees * 100);
  if (!Number.isInteger(base) || base <= 0) return null;
  const settings = await getBillingSettings();
  const commissionPaisa = commissionForPaisa(base, settings.rateBps);
  if (commissionPaisa <= 0) return null;

  await insertAccruedOnce({
    session,
    entry: {
      sellerType: 'BRAND',
      sellerId: order.brandId,
      sourceType: 'ORDER',
      sourceId: order._id,
      eligibleAmountPaisa: base,
      rateBps: settings.rateBps,
      commissionPaisa,
      kind: 'SALE',
      status: 'ACCRUED',
      occurredAt: order.deliveredAt || now,
      currency: 'PKR',
    },
  });
  return commissionPaisa;
}

/** Booking CONFIRMED -> one 1% entry for the provider (docs/15 §6.2). */
async function recordBookingCommission(booking, { session, now = new Date() } = {}) {
  if (!booking || booking.status !== 'CONFIRMED') return null;
  const base = Number(booking.finalAmountPaisa ?? booking.agreedPricePaisa ?? 0);
  if (!Number.isInteger(base) || base <= 0) return null;
  const settings = await getBillingSettings();
  const commissionPaisa = commissionForPaisa(base, settings.rateBps);
  if (commissionPaisa <= 0) return null;

  await insertAccruedOnce({
    session,
    entry: {
      sellerType: 'SERVICE_PROVIDER',
      sellerId: booking.providerId,
      sourceType: 'SERVICE_BOOKING',
      sourceId: booking._id,
      eligibleAmountPaisa: base,
      rateBps: settings.rateBps,
      commissionPaisa,
      kind: 'SALE',
      status: 'ACCRUED',
      occurredAt: booking.confirmedAt || now,
      currency: 'PKR',
    },
  });
  return commissionPaisa;
}

/**
 * A refund after delivery reduces the sale. The original entry is never
 * edited: a negative REVERSAL is accrued for the next invoice (docs/15 §6.3).
 */
async function recordRefundReversal({ order, refundPaisa, reason, session, now = new Date() } = {}) {
  if (!order || order.orderStatus !== 'DELIVERED') return null;
  const refund = Number(refundPaisa || 0);
  if (!Number.isInteger(refund) || refund <= 0) return null;

  const original = await CommissionEntry.findOne({
    sourceType: 'ORDER',
    sourceId: order._id,
    kind: 'SALE',
  }).session(session || null);
  if (!original) return null;

  const reversals = await CommissionEntry.aggregate([
    { $match: { reversalOf: original._id, kind: 'REVERSAL' } },
    { $group: { _id: null, total: { $sum: '$commissionPaisa' } } },
  ]).session(session || null);
  const alreadyReversed = (reversals[0]?.total || 0) * -1;
  const remaining = original.commissionPaisa - alreadyReversed;
  if (remaining <= 0) return null;

  const requested = commissionForPaisa(refund, original.rateBps);
  const commissionPaisa = -Math.min(requested, remaining);
  if (commissionPaisa === 0) return null;

  await CommissionEntry.create(
    [
      {
        sellerType: original.sellerType,
        sellerId: original.sellerId,
        sourceType: original.sourceType,
        sourceId: original.sourceId,
        eligibleAmountPaisa: Math.min(refund, original.eligibleAmountPaisa),
        rateBps: original.rateBps,
        commissionPaisa,
        kind: 'REVERSAL',
        status: 'ACCRUED',
        occurredAt: now,
        reversalOf: original._id,
        reason: (reason || 'Refund after delivery').slice(0, 300),
        currency: 'PKR',
      },
    ],
    { session }
  );
  return commissionPaisa;
}

// ---- invoices -------------------------------------------------------------

/**
 * Closes the previous Karachi calendar month (docs/15 §7). Safe to re-run:
 * only ACCRUED entries are picked and an existing seller/month invoice stops
 * a second one. Invoices below the configured minimum roll forward.
 */
async function generateMonthlyInvoices({ now = new Date(), createdBy = 'SYSTEM' } = {}) {
  const periodEnd = startOfKarachiMonth(now);
  const periodStart = startOfKarachiMonth(new Date(periodEnd.getTime() - 1));
  const periodKey = karachiMonthKey(periodStart);
  const settings = await getBillingSettings();

  const entries = await CommissionEntry.find({ status: 'ACCRUED', occurredAt: { $lt: periodEnd } }).sort({
    occurredAt: 1,
    _id: 1,
  });

  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.sellerType}:${entry.sellerId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const issued = [];
  const skipped = [];

  for (const group of groups.values()) {
    const first = group[0];
    const existing = await SellerInvoice.findOne({
      sellerType: first.sellerType,
      sellerId: first.sellerId,
      periodStart,
    });
    if (existing) {
      skipped.push({ sellerType: first.sellerType, sellerId: first.sellerId, reason: 'ALREADY_INVOICED' });
      continue;
    }

    const salesPaisa = group
      .filter((e) => e.kind === 'SALE')
      .reduce((sum, e) => sum + e.eligibleAmountPaisa, 0);
    const commissionPaisa = group
      .filter((e) => e.kind === 'SALE')
      .reduce((sum, e) => sum + e.commissionPaisa, 0);
    const reversalCredits = group
      .filter((e) => e.kind === 'REVERSAL')
      .reduce((sum, e) => sum + Math.abs(e.commissionPaisa), 0);
    if (commissionPaisa <= 0) {
      // Reversal-only months roll into the next month that has a sale.
      skipped.push({ sellerType: first.sellerType, sellerId: first.sellerId, reason: 'NOTHING_TO_INVOICE' });
      continue;
    }

    // Verified overpayments waiting for a later invoice (docs/15 §8).
    const creditClaims = await SellerPaymentClaim.find({
      sellerType: first.sellerType,
      sellerId: first.sellerId,
      status: 'VERIFIED',
      creditPaisa: { $gt: 0 },
      creditAppliedInvoiceId: null,
    }).sort({ verifiedAt: 1, _id: 1 });
    const appliedClaimIds = [];
    let claimCredits = 0;
    const creditRoom = Math.max(0, commissionPaisa - reversalCredits);
    for (const claim of creditClaims) {
      if (claim.creditPaisa > creditRoom - claimCredits) continue;
      claimCredits += claim.creditPaisa;
      appliedClaimIds.push(claim._id);
    }

    const creditsPaisa = reversalCredits + claimCredits;
    const amountDuePaisa = Math.max(0, commissionPaisa - creditsPaisa);

    if (amountDuePaisa > 0 && amountDuePaisa < settings.minimumInvoicePaisa) {
      skipped.push({ sellerType: first.sellerType, sellerId: first.sellerId, reason: 'BELOW_MINIMUM' });
      continue;
    }

    const issuedAt = now;
    const dueAt = new Date(issuedAt.getTime() + settings.dueDays * 24 * 60 * 60 * 1000);
    const paid = amountDuePaisa === 0;

    const invoice = await SellerInvoice.create({
      sellerType: first.sellerType,
      sellerId: first.sellerId,
      periodStart,
      periodEnd,
      periodKey,
      salesPaisa,
      commissionPaisa,
      creditsPaisa,
      paidPaisa: 0,
      amountDuePaisa,
      status: paid ? 'PAID' : 'ISSUED',
      issuedAt,
      dueAt,
      paidAt: paid ? issuedAt : null,
      createdBy,
      currency: 'PKR',
    });

    await CommissionEntry.updateMany(
      { _id: { $in: group.map((e) => e._id) }, status: 'ACCRUED' },
      { $set: { status: 'INVOICED', invoiceId: invoice._id } }
    );

    if (appliedClaimIds.length > 0) {
      await SellerPaymentClaim.updateMany(
        { _id: { $in: appliedClaimIds }, creditAppliedInvoiceId: null },
        { $set: { creditAppliedInvoiceId: invoice._id } }
      );
    }

    // A fully reversed original is marked only once its reversal is invoiced.
    const reversals = group.filter((e) => e.kind === 'REVERSAL' && e.reversalOf);
    for (const reversal of reversals) {
      const all = await CommissionEntry.aggregate([
        { $match: { reversalOf: reversal.reversalOf, kind: 'REVERSAL' } },
        { $group: { _id: null, total: { $sum: '$commissionPaisa' } } },
      ]);
      const original = await CommissionEntry.findById(reversal.reversalOf).select('commissionPaisa status');
      if (!original) continue;
      if (Math.abs(all[0]?.total || 0) >= original.commissionPaisa) {
        await CommissionEntry.updateOne({ _id: original._id }, { $set: { status: 'REVERSED' } });
      }
    }

    issued.push(serializeInvoice(invoice));
  }

  return { periodKey, periodStart, periodEnd, issued, skipped };
}

async function markOverdueInvoices({ now = new Date() } = {}) {
  const result = await SellerInvoice.updateMany(
    {
      status: { $in: ['ISSUED', 'PARTIALLY_PAID'] },
      amountDuePaisa: { $gt: 0 },
      dueAt: { $lt: now },
    },
    { $set: { status: 'OVERDUE' } }
  );
  return result.modifiedCount || 0;
}

// ---- freeze ladder --------------------------------------------------------

function statusFromOverdue(daysOverdue, settings) {
  if (daysOverdue < 0) return 'ACTIVE';
  if (daysOverdue >= settings.freezeAfterDays) return 'FROZEN';
  if (daysOverdue >= settings.restrictAfterDays) return 'RESTRICTED';
  return 'WARNING';
}

/**
 * Derives the seller's billing status from the oldest unpaid invoice
 * (docs/15 §9). Manual overrides and a grace period take precedence, and the
 * result is stored on the tenant so hot paths can read one field.
 */
async function refreshSellerBillingState(sellerType, sellerId, { now = new Date(), session, reason } = {}) {
  assertSellerType(sellerType);
  const Model = sellerModel(sellerType);
  const seller = await Model.findById(sellerId)
    .select('billingStatus billingGraceUntil billingOverride')
    .session(session || null);
  if (!seller) return null;

  let status = 'ACTIVE';
  const override = seller.billingOverride;
  const overrideActive = override && override.status && (!override.until || override.until > now);
  const graceActive = seller.billingGraceUntil && seller.billingGraceUntil > now;

  if (overrideActive) {
    status = override.status;
  } else if (!graceActive) {
    const invoice = await SellerInvoice.findOne({
      sellerType,
      sellerId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      amountDuePaisa: { $gt: 0 },
    })
      .sort({ dueAt: 1 })
      .session(session || null);
    if (invoice) {
      const daysOverdue = Math.floor((now.getTime() - new Date(invoice.dueAt).getTime()) / (24 * 60 * 60 * 1000));
      const settings = await getBillingSettings();
      status = statusFromOverdue(daysOverdue, settings);
    }
  }

  const previous = seller.billingStatus;
  await Model.updateOne(
    { _id: seller._id },
    { $set: { billingStatus: status, billingCheckedAt: now } },
    { session }
  );
  return { status, previous, changed: previous !== status, reason };
}

async function assertSellerCanSell(sellerType, sellerId, { now = new Date(), session } = {}) {
  const state = await refreshSellerBillingState(sellerType, sellerId, { now, session });
  if (state && SELLING_BLOCKED_STATUSES.includes(state.status)) {
    throw new BillingError(
      409,
      `This seller cannot take new orders while billing is ${state.status.toLowerCase()}.`,
      'SELLER_BILLING_RESTRICTED',
      { billingStatus: state.status }
    );
  }
  return state;
}

// ---- seller-facing reads --------------------------------------------------

function serializeInvoice(row) {
  const invoice = row.toObject ? row.toObject() : row;
  return {
    _id: invoice._id,
    sellerType: invoice.sellerType,
    sellerId: invoice.sellerId,
    periodKey: invoice.periodKey,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    salesPaisa: invoice.salesPaisa,
    commissionPaisa: invoice.commissionPaisa,
    creditsPaisa: invoice.creditsPaisa,
    paidPaisa: invoice.paidPaisa,
    amountDuePaisa: invoice.amountDuePaisa,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    currency: invoice.currency,
    createdAt: invoice.createdAt,
  };
}

function serializeEntry(row) {
  const entry = row.toObject ? row.toObject() : row;
  return {
    _id: entry._id,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    eligibleAmountPaisa: entry.eligibleAmountPaisa,
    rateBps: entry.rateBps,
    commissionPaisa: entry.commissionPaisa,
    kind: entry.kind,
    status: entry.status,
    occurredAt: entry.occurredAt,
    reason: entry.reason || null,
  };
}

function serializeClaim(row) {
  const claim = row.toObject ? row.toObject() : row;
  return {
    _id: claim._id,
    invoiceId: claim.invoiceId,
    amountPaisa: claim.amountPaisa,
    method: claim.method,
    reference: claim.reference,
    comment: claim.comment || null,
    status: claim.status,
    verifiedAt: claim.verifiedAt,
    rejectionReason: claim.rejectionReason || null,
    creditPaisa: claim.creditPaisa,
    receiptAvailable: Boolean(claim.receipt && claim.receipt.publicId),
    createdAt: claim.createdAt,
    currency: claim.currency || 'PKR',
  };
}

function serializeHelp(row) {
  const help = row.toObject ? row.toObject() : row;
  return {
    _id: help._id,
    subject: help.subject,
    message: help.message,
    status: help.status,
    resolutionNote: help.resolutionNote || null,
    handledAt: help.handledAt,
    createdAt: help.createdAt,
  };
}

async function getSellerBillingSummary(sellerType, sellerId, { now = new Date() } = {}) {
  assertSellerType(sellerType);
  await refreshSellerBillingState(sellerType, sellerId, { now });
  const Model = sellerModel(sellerType);
  const [seller, invoices, pendingClaims, recentClaims] = await Promise.all([
    Model.findById(sellerId).select(
      'name displayName billingStatus billingGraceUntil billingGraceReason billingOverride'
    ),
    SellerInvoice.find({
      sellerType,
      sellerId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      amountDuePaisa: { $gt: 0 },
    }).sort({ dueAt: 1 }),
    SellerPaymentClaim.countDocuments({ sellerType, sellerId, status: 'SUBMITTED' }),
    SellerPaymentClaim.find({ sellerType, sellerId }).sort({ createdAt: -1 }).limit(5),
  ]);
  if (!seller) throw new BillingError(404, 'Seller not found.');

  const settings = await getBillingSettings();
  const balancePaisa = invoices.reduce((sum, invoice) => sum + invoice.amountDuePaisa, 0);
  const oldest = invoices[0] || null;

  return {
    seller: {
      type: sellerType,
      _id: seller._id,
      name: seller.name || seller.displayName,
      billingStatus: seller.billingStatus,
      graceUntil: seller.billingGraceUntil || null,
      graceReason: seller.billingGraceReason || null,
      override:
        seller.billingOverride && seller.billingOverride.status
          ? {
              status: seller.billingOverride.status,
              reason: seller.billingOverride.reason || null,
              until: seller.billingOverride.until || null,
            }
          : null,
    },
    balancePaisa,
    dueAt: oldest ? oldest.dueAt : null,
    unpaidInvoiceCount: invoices.length,
    pendingClaims,
    bank: settings.bank,
    settings: {
      rateBps: settings.rateBps,
      dueDays: settings.dueDays,
      restrictAfterDays: settings.restrictAfterDays,
      freezeAfterDays: settings.freezeAfterDays,
      minimumInvoicePaisa: settings.minimumInvoicePaisa,
    },
    invoices: invoices.map(serializeInvoice),
    recentClaims: recentClaims.map(serializeClaim),
  };
}

async function listSellerInvoices(sellerType, sellerId, { status, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { sellerType, sellerId, ...(status && { status }) };
  const [rows, total] = await Promise.all([
    SellerInvoice.find(filter)
      .sort({ periodStart: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SellerInvoice.countDocuments(filter),
  ]);
  return { items: rows.map(serializeInvoice), pagination: paginate(page, limit, total) };
}

async function getSellerInvoice(sellerType, sellerId, invoiceId) {
  const invoice = await SellerInvoice.findOne({ _id: invoiceId, sellerType, sellerId });
  if (!invoice) throw new BillingError(404, 'Invoice not found.');
  const [entries, claims] = await Promise.all([
    CommissionEntry.find({ invoiceId: invoice._id }).sort({ occurredAt: 1 }),
    SellerPaymentClaim.find({ invoiceId: invoice._id }).sort({ createdAt: -1 }),
  ]);
  return {
    invoice: serializeInvoice(invoice),
    entries: entries.map(serializeEntry),
    claims: claims.map(serializeClaim),
  };
}

async function listSellerClaims(sellerType, sellerId, { status, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { sellerType, sellerId, ...(status && { status }) };
  const [rows, total] = await Promise.all([
    SellerPaymentClaim.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SellerPaymentClaim.countDocuments(filter),
  ]);
  return { items: rows.map(serializeClaim), pagination: paginate(page, limit, total) };
}

// ---- claims ---------------------------------------------------------------

function receiptBelongsToSeller({ sellerType, sellerId, publicId }) {
  if (typeof publicId !== 'string') return false;
  const folder = billingReceiptFolder(sellerType, sellerId);
  return publicId.startsWith(`${folder}/`) && publicId.length > folder.length + 1 && !publicId.includes('..');
}

function receiptSignature(sellerType, sellerId) {
  try {
    return createBillingReceiptSignature(sellerType, sellerId);
  } catch (err) {
    if (err instanceof UploadError) {
      throw new BillingError(err.status, err.message, 'RECEIPT_UPLOAD_NOT_CONFIGURED');
    }
    throw err;
  }
}

async function createPaymentClaim({ sellerType, sellerId, invoiceId, data }) {
  const invoice = await SellerInvoice.findOne({ _id: invoiceId, sellerType, sellerId });
  if (!invoice) throw new BillingError(404, 'Invoice not found.');
  if (['PAID', 'VOID', 'DRAFT'].includes(invoice.status) || invoice.amountDuePaisa <= 0) {
    throw new BillingError(409, 'This invoice has nothing left to pay.', 'INVOICE_NOT_PAYABLE');
  }
  if (data.amountPaisa > invoice.amountDuePaisa) {
    throw new BillingError(400, 'The amount cannot be more than the outstanding balance.', 'CLAIM_EXCEEDS_BALANCE', {
      amountDuePaisa: invoice.amountDuePaisa,
    });
  }
  if (data.receipt && !receiptBelongsToSeller({ sellerType, sellerId, publicId: data.receipt.publicId })) {
    throw new BillingError(422, 'That receipt does not belong to your billing account.', 'RECEIPT_NOT_YOURS');
  }

  try {
    const claim = await SellerPaymentClaim.create({
      invoiceId: invoice._id,
      sellerType,
      sellerId,
      amountPaisa: data.amountPaisa,
      method: data.method,
      reference: data.reference,
      receipt: data.receipt || undefined,
      comment: data.comment,
      currency: invoice.currency || 'PKR',
    });
    return serializeClaim(claim);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new BillingError(409, 'You already submitted this payment reference for this amount.', 'CLAIM_EXISTS');
    }
    throw err;
  }
}

async function getSellerClaimReceipt({ sellerType, sellerId, claimId }) {
  const claim = await SellerPaymentClaim.findOne({ _id: claimId, sellerType, sellerId });
  if (!claim) throw new BillingError(404, 'Claim not found.');
  if (!claim.receipt || !claim.receipt.publicId) {
    throw new BillingError(404, 'There is no receipt on this claim.', 'RECEIPT_NOT_FOUND');
  }
  try {
    return createProofDownloadUrl(claim.receipt.publicId);
  } catch (err) {
    if (err instanceof UploadError) throw new BillingError(err.status, err.message, 'RECEIPT_NOT_CONFIGURED');
    throw err;
  }
}

// ---- help -----------------------------------------------------------------

async function submitBillingHelp({ sellerType, sellerId, subject, message }) {
  const help = await BillingHelpRequest.create({ sellerType, sellerId, subject, message });
  return serializeHelp(help);
}

async function listSellerBillingHelp(sellerType, sellerId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { sellerType, sellerId };
  const [rows, total] = await Promise.all([
    BillingHelpRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BillingHelpRequest.countDocuments(filter),
  ]);
  return { items: rows.map(serializeHelp), pagination: paginate(page, limit, total) };
}

// ---- admin ----------------------------------------------------------------

async function adminListInvoices({ status, sellerType, sellerId, periodKey, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = {
    ...(status && { status }),
    ...(sellerType && { sellerType }),
    ...(sellerId && { sellerId }),
    ...(periodKey && { periodKey }),
  };
  const [rows, total] = await Promise.all([
    SellerInvoice.find(filter)
      .sort({ periodStart: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SellerInvoice.countDocuments(filter),
  ]);
  const items = await Promise.all(
    rows.map(async (row) => ({ ...serializeInvoice(row), seller: await sellerLabel(row.sellerType, row.sellerId) }))
  );
  return { items, pagination: paginate(page, limit, total) };
}

async function sellerLabel(sellerType, sellerId) {
  const Model = sellerModel(sellerType);
  const doc = await Model.findById(sellerId).select('name displayName slug phone');
  if (!doc) return { _id: sellerId, name: 'Unknown seller' };
  return { _id: doc._id, name: doc.name || doc.displayName, slug: doc.slug, phone: doc.phone || null };
}

async function adminGetInvoice(invoiceId) {
  const invoice = await SellerInvoice.findById(invoiceId);
  if (!invoice) throw new BillingError(404, 'Invoice not found.');
  const [entries, claims] = await Promise.all([
    CommissionEntry.find({ invoiceId: invoice._id }).sort({ occurredAt: 1 }),
    SellerPaymentClaim.find({ invoiceId: invoice._id }).sort({ createdAt: -1 }),
  ]);
  return {
    invoice: { ...serializeInvoice(invoice), seller: await sellerLabel(invoice.sellerType, invoice.sellerId) },
    entries: entries.map(serializeEntry),
    claims: claims.map((claim) => ({
      ...serializeClaim(claim),
      verifiedBy: claim.verifiedBy || null,
    })),
  };
}

async function adminListClaims({ status, sellerType, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { ...(status && { status }), ...(sellerType && { sellerType }) };
  const [rows, total] = await Promise.all([
    SellerPaymentClaim.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SellerPaymentClaim.countDocuments(filter),
  ]);
  const invoices = rows.length
    ? await SellerInvoice.find({ _id: { $in: rows.map((r) => r.invoiceId) } }).select('periodKey amountDuePaisa status')
    : [];
  const invoiceById = new Map(invoices.map((i) => [String(i._id), i]));
  const items = await Promise.all(
    rows.map(async (row) => {
      const invoice = invoiceById.get(String(row.invoiceId));
      return {
        ...serializeClaim(row),
        seller: await sellerLabel(row.sellerType, row.sellerId),
        invoice: invoice
          ? {
              _id: invoice._id,
              periodKey: invoice.periodKey,
              amountDuePaisa: invoice.amountDuePaisa,
              status: invoice.status,
            }
          : null,
      };
    })
  );
  return { items, pagination: paginate(page, limit, total) };
}

async function adminGetClaimReceipt(claimId) {
  const claim = await SellerPaymentClaim.findById(claimId);
  if (!claim) throw new BillingError(404, 'Claim not found.');
  if (!claim.receipt || !claim.receipt.publicId) {
    throw new BillingError(404, 'There is no receipt on this claim.', 'RECEIPT_NOT_FOUND');
  }
  try {
    return createProofDownloadUrl(claim.receipt.publicId);
  } catch (err) {
    if (err instanceof UploadError) throw new BillingError(err.status, err.message, 'RECEIPT_NOT_CONFIGURED');
    throw err;
  }
}

/**
 * Verifies or rejects one claim (docs/15 §8). The invoice update is
 * conditional on the values read inside the transaction, so two admins can
 * never pay the same balance twice; a concurrent change rolls everything back.
 */
async function adminDecideClaim({ admin, claimId, decision, note }) {
  const now = new Date();
  let outcome;

  await runInTransaction(async (session) => {
    const claim = await SellerPaymentClaim.findOneAndUpdate(
      { _id: claimId, status: 'SUBMITTED' },
      {
        $set: {
          status: decision,
          verifiedBy: admin._id,
          verifiedAt: now,
          ...(decision === 'REJECTED' && { rejectionReason: note || 'Rejected by the platform team.' }),
        },
      },
      { new: true, session }
    );
    if (!claim) {
      const existing = await SellerPaymentClaim.findById(claimId).session(session);
      if (!existing) throw new BillingError(404, 'Claim not found.');
      throw new BillingError(409, 'This claim has already been decided.', 'CLAIM_ALREADY_DECIDED');
    }

    if (decision === 'REJECTED') {
      outcome = { claim, invoice: null };
      return;
    }

    const invoice = await SellerInvoice.findOne({
      _id: claim.invoiceId,
      sellerType: claim.sellerType,
      sellerId: claim.sellerId,
    }).session(session);
    if (!invoice) throw new BillingError(404, 'Invoice not found.');
    if (['PAID', 'VOID', 'DRAFT'].includes(invoice.status)) {
      throw new BillingError(409, 'This invoice is no longer payable.', 'INVOICE_NOT_PAYABLE');
    }

    const applied = Math.min(claim.amountPaisa, invoice.amountDuePaisa);
    const credit = claim.amountPaisa - applied;
    const nextDue = invoice.amountDuePaisa - applied;
    const updated = await SellerInvoice.findOneAndUpdate(
      {
        _id: invoice._id,
        paidPaisa: invoice.paidPaisa,
        amountDuePaisa: invoice.amountDuePaisa,
        status: invoice.status,
      },
      {
        $set: {
          paidPaisa: invoice.paidPaisa + applied,
          amountDuePaisa: nextDue,
          status: nextDue === 0 ? 'PAID' : 'PARTIALLY_PAID',
          ...(nextDue === 0 && { paidAt: now }),
        },
      },
      { new: true, session }
    );
    if (!updated) {
      throw new BillingError(409, 'The invoice changed while this claim was being checked.', 'INVOICE_CHANGED');
    }
    if (credit > 0) {
      await SellerPaymentClaim.updateOne({ _id: claim._id }, { $set: { creditPaisa: credit } }, { session });
      claim.creditPaisa = credit;
    }
    outcome = { claim, invoice: updated };
  });

  const state = await refreshSellerBillingState(outcome.claim.sellerType, outcome.claim.sellerId, { now });

  await notifySellerClaimDecided({
    sellerType: outcome.claim.sellerType,
    sellerId: outcome.claim.sellerId,
    decision,
    amountPaisa: outcome.claim.amountPaisa,
    note,
    invoice: outcome.invoice,
    billingStatus: state ? state.status : null,
  });

  return {
    claim: serializeClaim(outcome.claim),
    invoice: outcome.invoice ? serializeInvoice(outcome.invoice) : null,
    billingStatus: state ? state.status : null,
  };
}

async function adminListSellers({ billingStatus, type, q, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const models = [];
  if (!type || type === 'BRAND') models.push(['BRAND', Brand, 'name']);
  if (!type || type === 'SERVICE_PROVIDER') models.push(['SERVICE_PROVIDER', ServiceProvider, 'displayName']);

  const sellers = [];
  for (const [sellerType, Model, nameField] of models) {
    const filter = {
      ...(billingStatus && { billingStatus }),
      ...(q && { [nameField]: { $regex: escapeRegex(q), $options: 'i' } }),
    };
    const rows = await Model.find(filter).select(`${nameField} slug billingStatus billingGraceUntil phone`);
    sellers.push(...rows.map((row) => ({ sellerType, row, name: row[nameField] })));
  }

  const ids = sellers.map((s) => s.row._id);
  const balances = ids.length
    ? await SellerInvoice.aggregate([
        {
          $match: {
            sellerId: { $in: ids },
            status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
            amountDuePaisa: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: { sellerType: '$sellerType', sellerId: '$sellerId' },
            balancePaisa: { $sum: '$amountDuePaisa' },
            oldestDueAt: { $min: '$dueAt' },
            unpaidCount: { $sum: 1 },
          },
        },
      ])
    : [];
  const balanceBySeller = new Map(
    balances.map((b) => [`${b._id.sellerType}:${b._id.sellerId}`, b])
  );

  const items = sellers
    .map(({ sellerType, row, name }) => {
      const balance = balanceBySeller.get(`${sellerType}:${row._id}`);
      return {
        sellerType,
        sellerId: row._id,
        name,
        slug: row.slug,
        phone: row.phone || null,
        billingStatus: row.billingStatus,
        graceUntil: row.billingGraceUntil || null,
        balancePaisa: balance?.balancePaisa || 0,
        oldestDueAt: balance?.oldestDueAt || null,
        unpaidInvoiceCount: balance?.unpaidCount || 0,
      };
    })
    .sort((a, b) => b.balancePaisa - a.balancePaisa || a.name.localeCompare(b.name));

  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), pagination: paginate(page, limit, items.length) };
}

async function adminOverrideFreeze({ admin, sellerType, sellerId, status, reason, until, now = new Date() }) {
  assertSellerType(sellerType);
  const Model = sellerModel(sellerType);
  const seller = await Model.findById(sellerId);
  if (!seller) throw new BillingError(404, 'Seller not found.');
  const at = now;
  await Model.updateOne(
    { _id: seller._id },
    {
      $set: {
        billingOverride: { status, reason, until: until || null, by: admin._id, at },
        billingStatus: status,
        billingCheckedAt: at,
      },
    }
  );
  return { sellerType, sellerId, billingStatus: status, override: { status, reason, until: until || null } };
}

async function adminClearFreeze({ sellerType, sellerId, now = new Date() }) {
  assertSellerType(sellerType);
  const Model = sellerModel(sellerType);
  const seller = await Model.findById(sellerId);
  if (!seller) throw new BillingError(404, 'Seller not found.');
  await Model.updateOne(
    { _id: seller._id },
    { $set: { billingOverride: null, billingCheckedAt: now } }
  );
  return refreshSellerBillingState(sellerType, sellerId, { now });
}

async function adminGrantGrace({ admin, sellerType, sellerId, until, reason, now = new Date() }) {
  assertSellerType(sellerType);
  const Model = sellerModel(sellerType);
  const seller = await Model.findById(sellerId);
  if (!seller) throw new BillingError(404, 'Seller not found.');
  await Model.updateOne(
    { _id: seller._id },
    {
      $set: {
        billingGraceUntil: until,
        billingGraceReason: reason,
        billingGraceBy: admin._id,
        billingCheckedAt: now,
      },
    }
  );
  return refreshSellerBillingState(sellerType, sellerId, { now });
}

async function adminRevokeGrace({ sellerType, sellerId, now = new Date() }) {
  assertSellerType(sellerType);
  const Model = sellerModel(sellerType);
  await Model.updateOne(
    { _id: sellerId },
    { $set: { billingGraceUntil: null, billingGraceReason: '', billingGraceBy: null } }
  );
  return refreshSellerBillingState(sellerType, sellerId, { now });
}

async function adminListHelp({ status, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { ...(status && { status }) };
  const [rows, total] = await Promise.all([
    BillingHelpRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BillingHelpRequest.countDocuments(filter),
  ]);
  const items = await Promise.all(
    rows.map(async (row) => ({
      ...serializeHelp(row),
      seller: await sellerLabel(row.sellerType, row.sellerId),
      sellerType: row.sellerType,
    }))
  );
  return { items, pagination: paginate(page, limit, total) };
}

async function adminResolveHelp({ admin, helpId, note }) {
  const help = await BillingHelpRequest.findOneAndUpdate(
    { _id: helpId, status: 'OPEN' },
    { $set: { status: 'RESOLVED', resolutionNote: note, handledBy: admin._id, handledAt: new Date() } },
    { new: true }
  );
  if (!help) {
    const existing = await BillingHelpRequest.findById(helpId);
    if (!existing) throw new BillingError(404, 'Request not found.');
    throw new BillingError(409, 'This request has already been resolved.', 'HELP_ALREADY_RESOLVED');
  }
  await notifySellerBillingHelpAnswered({
    sellerType: help.sellerType,
    sellerId: help.sellerId,
    subject: help.subject,
    note,
  });
  return serializeHelp(help);
}

async function adminGetBillingSettings() {
  return getBillingSettings();
}

async function adminUpdateBillingSettings(changes) {
  const fields = {};
  for (const key of ['rateBps', 'dueDays', 'restrictAfterDays', 'freezeAfterDays', 'minimumInvoicePaisa']) {
    if (changes[key] !== undefined) fields[`billing.${key}`] = changes[key];
  }
  if (changes.bank) {
    for (const key of ['bankName', 'accountTitle', 'accountNumber', 'iban', 'instructions']) {
      if (changes.bank[key] !== undefined) fields[`billing.bank.${key}`] = changes.bank[key];
    }
  }
  if (Object.keys(fields).length > 0) {
    await PlatformSettings.findOneAndUpdate(
      { key: 'platform' },
      { $set: fields, $setOnInsert: { key: 'platform' } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
  return getBillingSettings();
}

async function adminBillingReports({ now = new Date() } = {}) {
  const monthStart = startOfKarachiMonth(now);
  const unpaidMatch = {
    status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    amountDuePaisa: { $gt: 0 },
  };
  const [outstanding, collected, accrued, ageing] = await Promise.all([
    SellerInvoice.aggregate([
      { $match: unpaidMatch },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountDuePaisa' },
          invoices: { $sum: 1 },
          overdue: {
            $sum: { $cond: [{ $eq: ['$status', 'OVERDUE'] }, '$amountDuePaisa', 0] },
          },
          oldestDueAt: { $min: '$dueAt' },
        },
      },
    ]),
    SellerPaymentClaim.aggregate([
      { $match: { status: 'VERIFIED', verifiedAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' }, claims: { $sum: 1 } } },
    ]),
    CommissionEntry.aggregate([
      { $match: { kind: 'SALE', status: { $ne: 'REVERSED' } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionPaisa' },
          salesBase: { $sum: '$eligibleAmountPaisa' },
        },
      },
    ]),
    SellerInvoice.aggregate([
      { $match: unpaidMatch },
      {
        $project: {
          amountDuePaisa: 1,
          daysOverdue: {
            $floor: { $divide: [{ $subtract: [now, '$dueAt'] }, 24 * 60 * 60 * 1000] },
          },
        },
      },
      {
        $bucket: {
          groupBy: '$daysOverdue',
          boundaries: [-100000, 0, 7, 14, 100000],
          default: 'OTHER',
          output: { amountPaisa: { $sum: '$amountDuePaisa' }, count: { $sum: 1 } },
        },
      },
    ]),
  ]);

  return {
    outstandingPaisa: outstanding[0]?.total || 0,
    outstandingInvoices: outstanding[0]?.invoices || 0,
    overduePaisa: outstanding[0]?.overdue || 0,
    oldestDueAt: outstanding[0]?.oldestDueAt || null,
    collectedThisMonthPaisa: collected[0]?.total || 0,
    claimsThisMonth: collected[0]?.claims || 0,
    accruedCommissionPaisa: accrued[0]?.total || 0,
    accruedSalesPaisa: accrued[0]?.salesBase || 0,
    ageing: ageing.map((bucket) => ({
      daysOverdueFrom: bucket._id === 'OTHER' ? null : bucket._id,
      amountPaisa: bucket.amountPaisa,
      invoices: bucket.count,
    })),
  };
}

module.exports = {
  BillingError,
  commissionForPaisa,
  getBillingSettings,
  recordOrderCommission,
  recordBookingCommission,
  recordRefundReversal,
  generateMonthlyInvoices,
  markOverdueInvoices,
  refreshSellerBillingState,
  assertSellerCanSell,
  getSellerBillingSummary,
  listSellerInvoices,
  getSellerInvoice,
  listSellerClaims,
  receiptSignature,
  createPaymentClaim,
  getSellerClaimReceipt,
  submitBillingHelp,
  listSellerBillingHelp,
  adminListInvoices,
  adminGetInvoice,
  adminListClaims,
  adminGetClaimReceipt,
  adminDecideClaim,
  adminListSellers,
  adminOverrideFreeze,
  adminClearFreeze,
  adminGrantGrace,
  adminRevokeGrace,
  adminListHelp,
  adminResolveHelp,
  adminGetBillingSettings,
  adminUpdateBillingSettings,
  adminBillingReports,
  serializeInvoice,
  serializeClaim,
  serializeEntry,
  sellerLabel,
};
