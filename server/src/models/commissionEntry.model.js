const mongoose = require('mongoose');

const {
  SELLER_TYPES,
  COMMISSION_SOURCE_TYPES,
  COMMISSION_KINDS,
  COMMISSION_STATUSES,
} = require('../config/billing');

/**
 * One 1% charge on a completed sale (docs/15 §4, docs/24 §5.3).
 *
 * Entries are immutable: a correction is a REVERSAL entry pointing at the
 * original. Amounts are integer paisa and the rate is stored per entry, so a
 * later rate change never rewrites history.
 */
const commissionEntrySchema = new mongoose.Schema(
  {
    sellerType: { type: String, enum: SELLER_TYPES, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceType: { type: String, enum: COMMISSION_SOURCE_TYPES, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eligibleAmountPaisa: { type: Number, required: true, min: 0 },
    rateBps: { type: Number, required: true, min: 0 },
    // Negative on a REVERSAL.
    commissionPaisa: { type: Number, required: true },
    kind: { type: String, enum: COMMISSION_KINDS, default: 'SALE', index: true },
    status: { type: String, enum: COMMISSION_STATUSES, default: 'ACCRUED', index: true },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerInvoice', default: null },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionEntry', default: null },
    reason: { type: String, trim: true, maxlength: 300 },
    currency: { type: String, default: 'PKR' },
  },
  { timestamps: true }
);

// Exactly one SALE per order/booking. Reversals are deliberately outside this
// index: a source can be corrected more than once (partial refunds).
commissionEntrySchema.index(
  { sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { kind: 'SALE' } }
);
commissionEntrySchema.index({ sellerType: 1, sellerId: 1, status: 1, occurredAt: 1 });
commissionEntrySchema.index({ invoiceId: 1 });

module.exports = mongoose.model('CommissionEntry', commissionEntrySchema);
