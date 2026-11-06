const mongoose = require('mongoose');

const { SELLER_TYPES, CLAIM_STATUSES, CLAIM_METHODS } = require('../config/billing');

/**
 * A seller's statement that they paid a CityCart invoice (docs/15 §8).
 *
 * The amount is checked against the invoice on the server; the client never
 * supplies seller ids, invoice totals or the decision.
 */
const sellerPaymentClaimSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerInvoice', required: true, index: true },
    sellerType: { type: String, enum: SELLER_TYPES, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    method: { type: String, enum: CLAIM_METHODS, required: true },
    reference: { type: String, required: true, trim: true, maxlength: 120 },
    receipt: {
      publicId: { type: String, trim: true },
      fingerprint: { type: String, trim: true },
    },
    comment: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: CLAIM_STATUSES, default: 'SUBMITTED', index: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    // Overpayment above the outstanding balance becomes a credit on a later
    // invoice (docs/15 §8). Applied exactly once, tracked below.
    creditPaisa: { type: Number, default: 0, min: 0 },
    creditAppliedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerInvoice', default: null },
    currency: { type: String, default: 'PKR' },
  },
  { timestamps: true }
);

sellerPaymentClaimSchema.index({ invoiceId: 1, reference: 1, amountPaisa: 1 }, { unique: true });

module.exports = mongoose.model('SellerPaymentClaim', sellerPaymentClaimSchema);
