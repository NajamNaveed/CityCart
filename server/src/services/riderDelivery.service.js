const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const env = require('../config/env');
const { OrderError } = require('./order.service');
const { updateDeliveryStatus } = require('./delivery.service');
const { proofBelongsToDelivery } = require('./paymentProof.service');
const { isConfigured } = require('./upload.service');
const { DELIVERY_FINAL_STATUSES } = require('../config/deliveryTransitions');
const { MAX_CODE_ATTEMPTS, codesMatch } = require('../utils/deliveryCode');

/**
 * What a rider may see and do (docs/20 §4, docs/20 §5.1). Every query is pinned
 * to BOTH the rider's brand and the rider themself, so a rider only ever reaches
 * deliveries assigned to them; anything else is "not found".
 *
 * The rider sees what is needed to do the job and nothing more: the address and
 * phone of the customer (only while the delivery is open), the items to hand
 * over (names and quantities, no prices), and how much cash to collect. Never the
 * customer's account, other payments, the brand's revenue, or the delivery code.
 */
const ORDER_FIELDS = 'orderNumber total currency paymentMethod paymentStatus items.productName items.quantity';

const pickAddress = (a) => ({
  name: a.name,
  phone: a.phone,
  address: a.address,
  city: a.city,
  postalCode: a.postalCode,
  additionalInstructions: a.additionalInstructions,
});

// A payment is loaded only to tell the rider how it was collected and (afterwards)
// whether its photo passed the brand's check. The reference and photo never leave
// the brand's screens.
const PAYMENT_VIEW_FIELDS = 'orderId collection.method collection.verification';

async function paymentForOrder(orderId) {
  const query = Payment.findOne({ orderId });
  return query && typeof query.select === 'function' ? query.select(PAYMENT_VIEW_FIELDS) : null;
}

async function paymentsForOrders(orderIds) {
  if (!orderIds.length) return [];
  const query = Payment.find({ orderId: { $in: orderIds } });
  return query && typeof query.select === 'function' ? query.select(PAYMENT_VIEW_FIELDS) : [];
}

function toRiderView(delivery, order, payment) {
  const d = typeof delivery.toObject === 'function' ? delivery.toObject() : delivery;
  const closed = DELIVERY_FINAL_STATUSES.includes(d.status);
  const cod = Boolean(order) && order.paymentMethod === 'COD';
  const collection = payment && payment.collection;
  const nonCash = Boolean(collection && collection.method && collection.method !== 'CASH');
  const unpaid = cod && order.paymentStatus === 'PENDING';

  return {
    _id: d._id,
    orderNumber: order ? order.orderNumber : null,
    status: d.status,
    failureReason: d.failureReason,
    trackingReference: d.trackingReference,
    assignedAt: d.assignedAt,
    updatedAt: d.updatedAt,
    // Personal details leave the rider's screen once the delivery is closed.
    address: closed || !d.address ? null : pickAddress(d.address),
    items: closed || !order ? [] : (order.items || []).map((i) => ({ productName: i.productName, quantity: i.quantity })),
    paymentMethod: order ? order.paymentMethod : null,
    amountToCollect: unpaid ? order.total : 0,
    // A non-cash payment is never cash in the rider's pocket.
    cashCollected: cod && order.paymentStatus === 'PAID' && !nonCash,
    // What the app may offer at the door; without Cloudinary only cash is possible.
    paymentOptions: unpaid
      ? ['CASH', ...(isConfigured(env.cloudinary) ? ['BANK_TRANSFER', 'WALLET', 'CARD_MACHINE'] : [])]
      : [],
    // The rider sees only the state of their own proof, never its reference or photo.
    proofStatus: nonCash ? collection.verification || null : null,
    currency: order ? order.currency || 'PKR' : 'PKR',
  };
}

const DEFAULT_LIMIT = 20;

async function listRiderDeliveries({ brandId, riderId, scope = 'active', page, limit }) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const history = scope === 'history';
  const filter = {
    brandId,
    riderId,
    status: history ? { $in: DELIVERY_FINAL_STATUSES } : { $nin: DELIVERY_FINAL_STATUSES },
  };

  const [items, total] = await Promise.all([
    Delivery.find(filter)
      .sort(history ? { updatedAt: -1 } : { createdAt: 1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Delivery.countDocuments(filter),
  ]);
  const orders = items.length ? await Order.find({ _id: { $in: items.map((d) => d.orderId) } }).select(ORDER_FIELDS) : [];
  const payments = await paymentsForOrders(items.map((d) => d.orderId));
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const paymentByOrder = new Map(payments.map((p) => [String(p.orderId), p]));

  return {
    items: items.map((d) => toRiderView(d, orderById.get(String(d.orderId)), paymentByOrder.get(String(d.orderId)))),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function viewFor(delivery, brandId) {
  const [order, payment] = await Promise.all([
    Order.findOne({ _id: delivery.orderId, brandId }).select(ORDER_FIELDS),
    paymentForOrder(delivery.orderId),
  ]);
  return toRiderView(delivery, order, payment);
}

async function getRiderDelivery({ brandId, riderId, id }) {
  const delivery = await Delivery.findOne({ _id: id, brandId, riderId });
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  return viewFor(delivery, brandId);
}

// Picked up / in transit / out for delivery / failed. All legality and the COD
// rules are the shared delivery logic; the rider scope is added to its filter.
async function riderUpdateStatus({ brandId, riderId, id, status, failureReason }) {
  const delivery = await updateDeliveryStatus({
    brandId,
    deliveryId: id,
    status,
    failureReason,
    userId: riderId,
    riderId,
  });
  return viewFor(delivery, brandId);
}

/**
 * Completes a delivery with the customer's proof-of-delivery code. Marking it
 * DELIVERED is the same transaction as for the brand: the order becomes
 * DELIVERED and a cash-on-delivery payment becomes PAID (confirmedBy = this
 * rider).
 *
 * Wrong guesses are limited: each try is counted by ONE atomic update that also
 * checks the limit, so concurrent requests cannot exceed it. After
 * MAX_CODE_ATTEMPTS the code locks; the brand can still complete the delivery
 * from the dashboard after speaking to the customer.
 */
async function completeWithCode({ brandId, riderId, id, code, collection }) {
  const attempt = await Delivery.findOneAndUpdate(
    { _id: id, brandId, riderId, status: 'OUT_FOR_DELIVERY', codeAttempts: { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { codeAttempts: 1 } },
    { new: true }
  ).select('+deliveryCode');

  if (!attempt) {
    const existing = await Delivery.findOne({ _id: id, brandId, riderId });
    if (!existing) {
      throw new OrderError(404, 'Delivery not found.');
    }
    if (existing.status !== 'OUT_FOR_DELIVERY') {
      throw new OrderError(409, `Only a delivery that is out for delivery can be completed (this one is ${existing.status}).`, {
        code: 'INVALID_TRANSITION',
        from: existing.status,
        to: 'DELIVERED',
      });
    }
    throw new OrderError(429, 'Too many wrong codes. Ask the brand to complete this delivery.', { code: 'CODE_LOCKED' });
  }

  if (!attempt.deliveryCode) {
    throw new OrderError(409, 'This delivery has no code. Ask the brand to complete it.', { code: 'NO_DELIVERY_CODE' });
  }
  if (!codesMatch(attempt.deliveryCode, code)) {
    throw new OrderError(422, 'That code is not correct.', {
      code: 'INVALID_CODE',
      attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - attempt.codeAttempts),
    });
  }

  if (collection && collection.method !== 'CASH') {
    if (!isConfigured(env.cloudinary)) {
      throw new OrderError(503, 'Payment proof photos are not set up on this server yet.', { code: 'PROOF_NOT_CONFIGURED' });
    }
    // Only a photo uploaded to THIS delivery's private folder is accepted: the
    // rider cannot pass off someone else's proof, another delivery's, or another brand's.
    if (!proofBelongsToDelivery({ brandId, deliveryId: id, publicId: collection.proof.publicId })) {
      throw new OrderError(422, 'That photo does not belong to this delivery.', { code: 'PROOF_NOT_YOURS' });
    }
  }

  const delivery = await updateDeliveryStatus({
    brandId,
    deliveryId: id,
    status: 'DELIVERED',
    userId: riderId,
    riderId,
    collection,
  });
  return viewFor(delivery, brandId);
}

/**
 * The cash this rider is holding: collected on delivery and not yet handed over
 * to the brand. Only their own, and only an amount and a count.
 */
async function riderCash({ brandId, riderId }) {
  const payments = await Payment.find({ brandId, collectedBy: riderId, settledAt: { $exists: false } }).select('amount');
  return { count: payments.length, total: payments.reduce((sum, p) => sum + p.amount, 0) };
}

module.exports = { listRiderDeliveries, getRiderDelivery, riderUpdateStatus, completeWithCode, riderCash, toRiderView };
