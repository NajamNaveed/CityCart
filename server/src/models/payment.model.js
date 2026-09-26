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
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'];

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
    transactionReference: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;