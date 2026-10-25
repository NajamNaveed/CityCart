const mongoose = require('mongoose');

/**
 * One row per gateway notification already processed (docs/10 §17-18). The unique
 * (provider, eventId) index is what makes a notification that arrives twice harmless:
 * the second insert fails, so nothing is applied again. It is also the reconciliation
 * trail: late payments and mismatches are kept here for the super admin to review.
 * Only identifiers and amounts are kept, never the raw body.
 */
const OUTCOMES = [
  'PAID', // the payment was marked paid
  'FAILED_ATTEMPT', // the customer's attempt failed; they may try again until the hold ends
  'LATE_PAYMENT', // money arrived for a payment that had already expired or been cancelled: needs a refund
  'DUPLICATE_PAYMENT', // money arrived again for a payment that was already paid: needs a refund
  'AMOUNT_MISMATCH', // the amount or currency did not match: nothing was applied
  'UNKNOWN_PAYMENT', // no payment has this reference: nothing was applied
];

const paymentEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    reference: { type: String },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String },
    amount: { type: Number },
    currency: { type: String },
    outcome: { type: String, enum: OUTCOMES, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentEventSchema.index({ outcome: 1, receivedAt: -1 });

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);
PaymentEvent.OUTCOMES = OUTCOMES;
module.exports = PaymentEvent;
