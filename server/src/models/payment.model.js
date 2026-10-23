const mongoose = require('mongoose');

/**
 * Payment model.
 *
 * Source of truth: docs/04-database-design.md, §26 (Payment Model) and
 * §27 (Payment Status).
 *
 * Payment status is tracked independently of order status (§27) — e.g.
 * an order can be DELIVERED while its payment is separately PAID.
 */
const PAYMENT_METHODS = ['COD', 'CARD', 'BANK_TRANSFER', 'WALLET', 'ONLINE_GATEWAY'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      // Not documented as unique in §33 (unlike Delivery.orderId), so
      // left as a plain index rather than an invented uniqueness
      // constraint.
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    currency: {
      type: String,
      default: 'PKR',
    },
    transactionReference: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
    },
    // docs/10 §11: who confirmed collection (set when COD is marked PAID).
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paidAt: {
      type: Date,
    },
    // Cash handling (docs/10 §11a, docs/20 §8). Set when cash is collected on
    // delivery: the brand, who physically received the cash (a rider or a team
    // member) and when. brandId is stored here (payments are otherwise scoped
    // through their order) so cash can be summed per brand without a join.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
    },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    collectedAt: {
      type: Date,
    },
    // Set when the brand confirms the collector handed that cash over.
    settledAt: {
      type: Date,
    },
    settledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Refunds (docs/10 §13): cumulative total + an audit entry per refund.
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refunds: {
      type: [
        new mongoose.Schema(
          {
            amount: { type: Number, required: true, min: 0 },
            reason: { type: String, required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Cash still held by a collector, per brand.
paymentSchema.index({ brandId: 1, collectedBy: 1, settledAt: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;