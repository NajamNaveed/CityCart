const Payment = require('../models/payment.model');
const Order = require('../models/order.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');

const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;

/**
 * Payment for an order. Access follows ORDER ownership (docs/05 §22): the
 * customer who owns the order, the brand that owns it, or SUPER_ADMIN.
 * Anyone else gets a 404 so order/payment ids can't be probed.
 */
async function getPaymentForOrder(user, tenantBrandId, orderId) {
  const filter = { _id: orderId };
  if (user.role === 'CUSTOMER') {
    filter.customerId = user._id;
  } else if (user.role !== 'SUPER_ADMIN') {
    filter.brandId = tenantBrandId;
  }
  const order = await Order.findOne(filter);
  if (!order) {
    throw new OrderError(404, 'Order not found.');
  }
  const payment = await Payment.findOne({ orderId: order._id });
  if (!payment) {
    throw new OrderError(404, 'Payment not found.');
  }
  return payment;
}

/**
 * Manual payment status change (docs/10 §19) — deliberately narrow:
 *   PENDING -> PAID                      only if the COD order is DELIVERED
 *                                         (normally automatic on delivery;
 *                                         this is only a safety net, so cash
 *                                         can never be "collected" early)
 *   PAID | PARTIALLY_REFUNDED -> refund  cumulative refunds can never exceed
 *                                         the amount paid
 * Everything else is rejected. The write is optimistic: it only applies if
 * the payment still has the status and refunded total that were validated,
 * so concurrent refunds can't over-refund. Order.paymentStatus is updated in
 * the same transaction. `tenantBrandId` is null for SUPER_ADMIN.
 */
async function updatePaymentStatus({ userId, tenantBrandId, paymentId, status, refundAmount, refundReason }) {
  return runInTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) {
      throw new OrderError(404, 'Payment not found.');
    }
    // A brand user only reaches payments of its own orders (else 404).
    const orderFilter = { _id: payment.orderId };
    if (tenantBrandId) orderFilter.brandId = tenantBrandId;
    const order = await Order.findOne(orderFilter).session(session);
    if (!order) {
      throw new OrderError(404, 'Payment not found.');
    }

    const refundedCents = toCents(payment.refundedAmount || 0);
    const guard = {
      _id: payment._id,
      status: payment.status,
      // Payments created before this field existed lack it entirely.
      refundedAmount: refundedCents === 0 ? { $in: [0, null] } : payment.refundedAmount,
    };
    let update;
    let finalStatus;

    if (status === 'PAID') {
      if (payment.status !== 'PENDING') {
        throw new OrderError(409, `A ${payment.status} payment cannot be marked PAID.`, { code: 'INVALID_TRANSITION', from: payment.status, to: status });
      }
      if (payment.method !== 'COD' || order.orderStatus !== 'DELIVERED') {
        throw new OrderError(409, 'A COD payment can only be marked PAID after the order is delivered.', { code: 'PAYMENT_NOT_COLLECTABLE' });
      }
      finalStatus = 'PAID';
      update = { $set: { status: 'PAID', paidAt: new Date(), confirmedBy: userId } };
    } else {
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
        throw new OrderError(409, `A ${payment.status} payment cannot be refunded.`, { code: 'INVALID_TRANSITION', from: payment.status, to: status });
      }
      const remainingCents = toCents(payment.amount) - refundedCents;
      let requestedCents;
      if (status === 'REFUNDED') {
        // Full refund = everything still refundable.
        requestedCents = refundAmount === undefined ? remainingCents : toCents(refundAmount);
        if (requestedCents !== remainingCents) {
          throw new OrderError(409, 'A full refund must cover the whole remaining amount.', { code: 'REFUND_AMOUNT_MISMATCH', remaining: fromCents(remainingCents) });
        }
      } else {
        requestedCents = toCents(refundAmount);
        if (requestedCents > remainingCents) {
          throw new OrderError(409, 'Refund exceeds the remaining refundable amount.', { code: 'REFUND_EXCEEDS_REMAINING', remaining: fromCents(remainingCents) });
        }
        if (requestedCents === remainingCents) {
          throw new OrderError(409, 'This refunds the entire remaining amount; use status REFUNDED.', { code: 'USE_FULL_REFUND', remaining: fromCents(remainingCents) });
        }
      }
      finalStatus = status;
      update = {
        $set: { status: status, refundedAmount: fromCents(refundedCents + requestedCents) },
        $push: { refunds: { amount: fromCents(requestedCents), reason: refundReason, by: userId, at: new Date() } },
      };
    }

    const updated = await Payment.findOneAndUpdate(guard, update, { new: true, session });
    if (!updated) {
      throw new OrderError(409, 'The payment was changed by another request. Please reload and retry.', { code: 'PAYMENT_CHANGED' });
    }
    await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: finalStatus } }, { session });
    return updated;
  });
}

module.exports = { getPaymentForOrder, updatePaymentStatus };
