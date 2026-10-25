const Payment = require('../models/payment.model');
const PaymentEvent = require('../models/paymentEvent.model');
const Order = require('../models/order.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const { restockStock } = require('./inventory.service');
const { notifyPaymentReceived, notifyPaymentExpired, notifyBrandOfCancelledOrder } = require('./notification.service');
const { issueReceiptBestEffort } = require('./receipt.service');
const { activeProvider } = require('../payments');
const env = require('../config/env');

/**
 * Online payments (docs/10 §29). Three rules run through everything here:
 *  1. Only a verified gateway notification can mark an online payment PAID: never the app,
 *     never the customer, never a redirect back from the gateway.
 *  2. Every notification is applied at most once (unique provider + eventId), together with
 *     the change it causes, so retries and duplicates are harmless.
 *  3. Money that arrives when nothing can accept it (a cancelled or expired order, a second
 *     payment, a wrong amount) is NEVER applied silently: it is recorded for review.
 */
const toCents = (amount) => Math.round(Number(amount) * 100);
const EXPIRY_BATCH = 50;

const unavailable = () => new OrderError(503, 'Online payment is not available right now.', { code: 'ONLINE_PAYMENTS_UNAVAILABLE' });

// What the customer can choose at checkout.
function listPaymentMethods() {
  const methods = [{ method: 'COD', label: 'Cash on delivery' }];
  const provider = activeProvider();
  if (provider) {
    methods.push({ method: 'ONLINE_GATEWAY', label: provider.label, holdMinutes: env.payments.holdMinutes });
  }
  return methods;
}

/**
 * Starts (or resumes) the customer's payment of one online order and returns the
 * gateway page to send them to. Only the owner of the order, only while the payment
 * is still pending and its hold has not ended.
 */
async function startOnlineCheckout({ userId, orderId }) {
  const provider = activeProvider();
  if (!provider) throw unavailable();

  const order = await Order.findOne({ _id: orderId, customerId: userId });
  if (!order) throw new OrderError(404, 'Order not found.');
  const payment = await Payment.findOne({ orderId: order._id, method: 'ONLINE_GATEWAY' });
  if (!payment) throw new OrderError(409, 'This order is not paid online.', { code: 'NOT_ONLINE' });
  if (payment.status === 'PAID') throw new OrderError(409, 'This order is already paid.', { code: 'ALREADY_PAID' });
  if (payment.status !== 'PENDING' || order.orderStatus !== 'PENDING') {
    throw new OrderError(409, 'This order can no longer be paid.', { code: 'NOT_PAYABLE' });
  }
  if (payment.expiresAt && payment.expiresAt.getTime() <= Date.now()) {
    throw new OrderError(409, 'The time to pay for this order has ended.', { code: 'PAYMENT_EXPIRED' });
  }

  const session = provider.createCheckout({ payment, order });
  // Only a payment that is still pending takes the reference, so a payment that was
  // paid or cancelled in the meantime is never touched.
  const saved = await Payment.updateOne(
    { _id: payment._id, status: 'PENDING' },
    { $set: { provider: provider.name, transactionReference: session.reference } }
  );
  if (saved.matchedCount === 0) throw new OrderError(409, 'This order can no longer be paid.', { code: 'NOT_PAYABLE' });
  return { checkoutUrl: session.checkoutUrl, expiresAt: payment.expiresAt, provider: provider.label };
}

/**
 * A notification from the gateway. The signature is checked first, on the raw bytes,
 * before anything touches the database. Anything that is not a clean "this payment
 * is now paid" is recorded with its outcome and changes nothing else.
 * Returns { outcome }; the HTTP layer answers 200 for all of them so the gateway stops retrying.
 */
async function processWebhook(providerName, rawBody, headers) {
  const provider = activeProvider();
  if (!provider || provider.name !== providerName) throw new OrderError(404, 'Unknown payment provider.');
  const event = provider.verifyWebhook(rawBody, headers); // throws 400 / 401

  const done = {};
  try {
    await runInTransaction(async (session) => {
      // The transaction may run more than once; start clean each time.
      done.outcome = null;
      done.order = null;
      done.paymentId = null;

      const payment = await Payment.findOne({ provider: provider.name, transactionReference: event.reference }).session(session);
      let outcome;
      if (!payment) {
        outcome = 'UNKNOWN_PAYMENT';
      } else if (toCents(payment.amount) !== toCents(event.amount) || (payment.currency || 'PKR') !== event.currency) {
        outcome = 'AMOUNT_MISMATCH';
      } else if (event.status === 'FAILED') {
        // The customer's attempt failed. The payment stays pending: they may try again until the hold ends.
        outcome = 'FAILED_ATTEMPT';
      } else {
        const paid = await Payment.findOneAndUpdate(
          { _id: payment._id, status: 'PENDING' },
          { $set: { status: 'PAID', paidAt: new Date() } },
          { new: true, session }
        );
        if (paid) {
          done.order = await Order.findOneAndUpdate({ _id: payment.orderId }, { $set: { paymentStatus: 'PAID' } }, { new: true, session });
          outcome = 'PAID';
        } else {
          // Money arrived but the payment is not waiting for it any more.
          outcome = payment.status === 'PAID' ? 'DUPLICATE_PAYMENT' : 'LATE_PAYMENT';
        }
      }

      await PaymentEvent.create(
        [{ provider: provider.name, eventId: event.eventId, reference: event.reference, paymentId: payment ? payment._id : undefined, status: event.status, amount: event.amount, currency: event.currency, outcome }],
        { session }
      );
      done.outcome = outcome;
      done.paymentId = payment ? payment._id : null;
    });
  } catch (err) {
    // The same notification again: nothing was applied the second time (the whole transaction rolled back).
    if (err && err.code === 11000) return { outcome: 'DUPLICATE_EVENT' };
    throw err;
  }

  if (done.outcome === 'PAID') {
    await notifyPaymentReceived(done.order);
    await issueReceiptBestEffort(done.paymentId);
  }
  return { outcome: done.outcome };
}

/**
 * Test gateway only: the customer's choice on the checkout page becomes a SIGNED
 * notification that goes through processWebhook like a real gateway's.
 */
async function completeMockCheckout(reference, choice) {
  const provider = activeProvider();
  if (!provider || provider.name !== 'mock') throw new OrderError(404, 'Not found.');
  const payment = await Payment.findOne({ provider: 'mock', transactionReference: reference });
  if (!payment) throw new OrderError(404, 'Payment not found.');
  const { rawBody, headers } = provider.buildSignedEvent({
    reference,
    status: choice === 'pay' ? 'PAID' : 'FAILED',
    amount: payment.amount,
    currency: payment.currency || 'PKR',
  });
  const result = await processWebhook('mock', rawBody, headers);
  return { ...result, orderId: payment.orderId };
}

async function getMockCheckoutDetails(reference) {
  const provider = activeProvider();
  if (!provider || provider.name !== 'mock') throw new OrderError(404, 'Not found.');
  const payment = await Payment.findOne({ provider: 'mock', transactionReference: reference });
  if (!payment) throw new OrderError(404, 'Payment not found.');
  const order = await Order.findById(payment.orderId).select('orderNumber');
  return { payment, orderNumber: order ? order.orderNumber : '' };
}

/**
 * Cancels online orders that were not paid within their hold and gives their stock back.
 * Each order is handled by one atomic conditional update (still pending, still unpaid), so
 * running this twice, on two servers, or against a customer's own cancel can never restock twice.
 * Returns how many orders were cancelled.
 */
async function expireUnpaidOnlinePayments(now = new Date()) {
  const due = await Payment.find({ method: 'ONLINE_GATEWAY', status: 'PENDING', expiresAt: { $lte: now } }).limit(EXPIRY_BATCH);
  let cancelled = 0;

  for (const payment of due) {
    const order = await runInTransaction(async (session) => {
      const updated = await Order.findOneAndUpdate(
        { _id: payment.orderId, orderStatus: 'PENDING', paymentStatus: 'PENDING' },
        { $set: { orderStatus: 'CANCELLED', paymentStatus: 'CANCELLED' }, $push: { statusHistory: { status: 'CANCELLED', at: now } } },
        { new: true, session }
      );
      if (!updated) return null; // already cancelled, rejected or paid: nothing to do here
      const sorted = [...updated.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
      for (const item of sorted) {
        await restockStock(item.productId, item.quantity, { session });
      }
      await Payment.updateOne({ _id: payment._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { session });
      return updated;
    });
    if (order) {
      cancelled += 1;
      await notifyPaymentExpired(order);
      await notifyBrandOfCancelledOrder(order, { expired: true });
    }
  }
  return cancelled;
}

// For the super admin: what the gateway told us, newest first, with the cases that need a human.
async function listPaymentEvents({ outcome, page, limit } = {}) {
  const filter = outcome ? { outcome } : {};
  const pageNumber = page || 1;
  const limitNumber = limit || 20;
  const [items, total] = await Promise.all([
    PaymentEvent.find(filter).sort({ receivedAt: -1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber),
    PaymentEvent.countDocuments(filter),
  ]);
  return { items, pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) } };
}

module.exports = {
  listPaymentMethods,
  startOnlineCheckout,
  processWebhook,
  completeMockCheckout,
  getMockCheckoutDetails,
  expireUnpaidOnlinePayments,
  listPaymentEvents,
};
