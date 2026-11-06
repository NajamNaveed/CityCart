const mongoose = require('mongoose');

const { SELLER_TYPES, INVOICE_STATUSES } = require('../config/billing');

/**
 * A monthly bill for one seller tenant (docs/15 §7, docs/24 §5.3).
 *
 * An issued invoice is never edited: payments only move `paidPaisa` and
 * `amountDuePaisa`, and corrections arrive as REVERSAL commission entries in
 * the next period.
 */
const sellerInvoiceSchema = new mongoose.Schema(
  {
    sellerType: { type: String, enum: SELLER_TYPES, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    // 'YYYY-MM' in Asia/Karachi, for filters and display.
    periodKey: { type: String, required: true },
    salesPaisa: { type: Number, default: 0, min: 0 },
    commissionPaisa: { type: Number, default: 0, min: 0 },
    creditsPaisa: { type: Number, default: 0, min: 0 },
    paidPaisa: { type: Number, default: 0, min: 0 },
    amountDuePaisa: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: 'ISSUED', index: true },
    issuedAt: { type: Date, default: () => new Date() },
    dueAt: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null },
    // 'SYSTEM' or the super admin's user id.
    createdBy: { type: String, default: 'SYSTEM' },
    currency: { type: String, default: 'PKR' },
  },
  { timestamps: true }
);

sellerInvoiceSchema.index({ sellerType: 1, sellerId: 1, periodStart: 1 }, { unique: true });
sellerInvoiceSchema.index({ sellerType: 1, sellerId: 1, status: 1, dueAt: 1 });

module.exports = mongoose.model('SellerInvoice', sellerInvoiceSchema);
