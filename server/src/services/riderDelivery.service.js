const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const env = require('../config/env');
const { OrderError } = require('./order.service');
const { runInTransaction } = require('../utils/transaction');
const { applyDeliveryStatus, dispatchDeliveryEvents, updateDeliveryStatus } = require('./delivery.service');
const { duplicateFlags } = require('./payment.service');
const { proofBelongsToDelivery } = require('./paymentProof.service');
const { buildCompletion, returnPhotoBelongsToDelivery } = require('./return.service');
const { isConfigured } = require('./upload.service');
const { PAYMENT_METHOD_FOR_COLLECTION } = require('../config/paymentCollection');
const { DELIVERY_FINAL_STATUSES } = require('../config/deliveryTransitions');
const { MAX_CODE_ATTEMPTS, codesMatch } = require('../utils/deliveryCode');
const { latLngFromPoint } = require('../utils/geo');
const { notifyBrandOfProofSubmitted } = require('./notification.service');

/**
 * What a rider may see and do (docs/20 §4, docs/20 §5.1). Every query is pinned
 * to BOTH the rider's brand and the rider themself, so a rider only ever reaches
 * deliveries assigned to them; anything else is "not found".
 *
 * The rider sees what is needed to do the job and nothing more: the address and
 * phone of the customer (only while the delivery is open), the items to hand
 * over (names, quantities and the line total needed to settle a partial
 * delivery), and how much cash to collect. Never the customer's account, other
 * payments, the brand's revenue, or the delivery code.
 */
const ORDER_FIELDS =
  'orderNumber total deliveryFee fulfilment returnedAmount netTotal feeRefunded currency paymentMethod paymentStatus items._id items.productName items.quantity items.totalPrice deliveryLocation';

const pickAddress = (a) => ({
  name: a.name,
  phone: a.phone,
  address: a.address,
  city: a.city,
  postalCode: a.postalCode,
  additionalInstructions: a.additionalInstructions,
});

// A payment is loaded only to tell the rider how it was collected and (afterwards)
// whether its photo passed the brand's check, or why the brand refused it. The
// reference and photo never leave the brand's screens.
const PAYMENT_VIEW_FIELDS = 'orderId collection.method collection.verification collection.note';

async function paymentForOrder(orderId) {
  const query = Payment.findOne({ orderId });
  return query && typeof query.select === 'function' ? query.select(PAYMENT_VIEW_FIELDS) : null;
}

async function paymentsForOrders(orderIds) {
  if (!orderIds.length) return [];
  const query = Payment.find({ orderId: { $in: orderIds } });
  return query && typeof query.select === 'function' ? query.select(PAYMENT_VIEW_FIELDS) : [];
}

// A door answer held for the brand's payment check; a held answer the brand
// refused is no longer "waiting", it is waiting to be collected again.
const isWaiting = (d) => Boolean(d.pendingCompletion && !d.pendingCompletion.rejectedAt);

function toRiderView(delivery, order, payment) {
  const d = typeof delivery.toObject === 'function' ? delivery.toObject() : delivery;
  const closed = DELIVERY_FINAL_STATUSES.includes(d.status);
  const cod = Boolean(order) && order.paymentMethod === 'COD';
  const collection = payment && payment.collection;
  const nonCash = Boolean(collection && collection.method && collection.method !== 'CASH');
  const unpaid = cod && order.paymentStatus === 'PENDING';
  const paymentPending = unpaid && isWaiting(d);
  const paymentRejected = unpaid && Boolean(d.pendingCompletion && d.pendingCompletion.rejectedAt);
  // The pin the customer chose at checkout, shown on the rider's map.
  const pin = !closed && order && order.deliveryLocation ? latLngFromPoint(order.deliveryLocation) : null;
  // What the rider must collect: the accepted total once a door answer exists.
  const heldTotal = d.pendingCompletion && d.pendingCompletion.netTotal !== undefined
    ? d.pendingCompletion.netTotal
    : null;

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
    // Where to deliver, as the customer pinned it at checkout; null once closed.
    deliveryLocation: pin ? { latitude: pin.lat, longitude: pin.lng } : null,
    // `lineTotal` lets the app show the amount for the accepted units without
    // exposing the unit price; the server still computes the final figures.
    items:
      closed || !order
        ? []
        : (order.items || []).map((i) => ({
            itemId: i._id,
            productName: i.productName,
            quantity: i.quantity,
            lineTotal: i.totalPrice !== undefined ? i.totalPrice : 0,
          })),
    paymentMethod: order ? order.paymentMethod : null,
    // While a non-cash payment is waiting, there is nothing for the rider to
    // collect: the brand checks it first.
    amountToCollect: unpaid && !paymentPending ? (heldTotal !== null ? heldTotal : order.total) : 0,
    deliveryFee: order ? order.deliveryFee || 0 : 0,
    // What actually happened at the door (docs/22 §F); null before completion.
    fulfilment: order ? order.fulfilment || null : null,
    returnedAmount: order ? order.returnedAmount || 0 : 0,
    netTotal: order && order.netTotal !== undefined ? order.netTotal : null,
    feeRefunded: Boolean(order && order.feeRefunded),
    // A non-cash payment is never cash in the rider's pocket.
    cashCollected: cod && order.paymentStatus === 'PAID' && !nonCash,
    // A non-cash payment held for the brand's check, or refused by it. While
    // held the app shows a waiting card; after a refusal it asks for the
    // payment again (the same way, or another one).
    paymentPending,
    paymentRejected,
    paymentNote: paymentRejected && collection ? collection.note || null : null,
    // What the app may offer at the door; without Cloudinary only cash is possible.
    paymentOptions: unpaid && !paymentPending
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

  // The held door answer decides the card's payment state on the list.
  const query = Delivery.find(filter);
  if (query && typeof query.select === 'function') query.select('+pendingCompletion');
  const [items, total] = await Promise.all([
    query
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

// The held answer is internal; only the rider's own view needs it.
async function riderDeliveryDoc({ brandId, riderId, id }) {
  const query = Delivery.findOne({ _id: id, brandId, riderId });
  return query && typeof query.select === 'function' ? query.select('+pendingCompletion') : query;
}

async function getRiderDelivery({ brandId, riderId, id }) {
  const delivery = await riderDeliveryDoc({ brandId, riderId, id });
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
  const freshQuery = Delivery.findById(delivery._id);
  const fresh =
    freshQuery && typeof freshQuery.select === 'function'
      ? await freshQuery.select('+pendingCompletion')
      : await freshQuery;
  return viewFor(fresh, brandId);
}

// A non-cash payment must come from THIS delivery's private folder: the rider
// cannot pass off someone else's proof, another delivery's, or another brand's.
function assertCollectionProof({ brandId, deliveryId, collection }) {
  if (!collection || collection.method === 'CASH') return;
  if (!isConfigured(env.cloudinary)) {
    throw new OrderError(503, 'Payment proof photos are not set up on this server yet.', { code: 'PROOF_NOT_CONFIGURED' });
  }
  if (!proofBelongsToDelivery({ brandId, deliveryId, publicId: collection.proof.publicId })) {
    throw new OrderError(422, 'That photo does not belong to this delivery.', { code: 'PROOF_NOT_YOURS' });
  }
}

function assertReturnPhotos({ brandId, deliveryId, lines }) {
  const photoLines = (lines || []).filter((line) => line.rejectedQty > 0 && line.photo);
  if (photoLines.length === 0) return;
  if (!isConfigured(env.cloudinary)) {
    throw new OrderError(503, 'Return photos are not set up on this server yet.', { code: 'RETURN_PHOTO_NOT_CONFIGURED' });
  }
  for (const line of photoLines) {
    if (!returnPhotoBelongsToDelivery({ brandId, deliveryId, publicId: line.photo.publicId })) {
      throw new OrderError(422, 'That return photo does not belong to this delivery.', { code: 'RETURN_PHOTO_NOT_YOURS' });
    }
  }
}

/**
 * Holds the rider's door answer until the brand checks a non-cash payment
 * (docs/10 §31). The payment stays PENDING and the delivery stays out for
 * delivery: verification is the only thing that completes it. A rejected
 * earlier attempt is moved to the payment's private history first, so the
 * brand keeps the audit trail without the rider's word being overwritten.
 */
async function stagePendingPayment({ brandId, riderId, deliveryId, collection, lines, netTotal }) {
  const now = new Date();
  const staged = await runInTransaction(async (session) => {
    const scopedQuery = Delivery.findOne({ _id: deliveryId, brandId, riderId, status: 'OUT_FOR_DELIVERY' });
    const delivery =
      scopedQuery && typeof scopedQuery.select === 'function'
        ? await scopedQuery.select('+pendingCompletion').session(session)
        : await scopedQuery;
    if (!delivery) {
      throw new OrderError(404, 'Delivery not found.');
    }
    if (isWaiting(delivery)) {
      throw new OrderError(409, 'This delivery is waiting for its payment to be verified.', {
        code: 'PAYMENT_VERIFICATION_PENDING',
      });
    }
    const order = await Order.findOne({ _id: delivery.orderId, brandId }).session(session);
    if (!order) {
      throw new OrderError(409, 'The order is not in a state that allows this delivery step.', { code: 'ORDER_OUT_OF_SYNC' });
    }
    const payment = await Payment.findOne({ orderId: order._id, status: 'PENDING' }).session(session);
    if (!payment) {
      // Already collected some other way; a new proof would have nowhere to go.
      throw new OrderError(409, 'This payment has already been collected.', { code: 'PAYMENT_ALREADY_COLLECTED' });
    }

    const set = {
      brandId: order.brandId,
      amount: netTotal,
      method: PAYMENT_METHOD_FOR_COLLECTION[collection.method],
      'collection.method': collection.method,
      'collection.reference': collection.reference,
      'collection.proof': collection.proof,
      'collection.submittedAt': now,
      'collection.verification': 'SUBMITTED',
      'collection.duplicateReference': false,
      'collection.duplicateProof': false,
    };
    if (collection.wallet) set['collection.wallet'] = collection.wallet;

    const unset = {
      'collection.note': '',
      'collection.verifiedBy': '',
      'collection.verifiedAt': '',
      'collection.proofDeletedAt': '',
    };
    if (!collection.wallet) unset['collection.wallet'] = '';

    const update = { $set: set, $unset: unset };
    if (payment.collection) {
      update.$push = { collectionHistory: payment.collection };
    }

    const saved = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'PENDING' },
      update,
      { new: true, session }
    );
    if (!saved) {
      throw new OrderError(409, 'The payment was changed by another request. Please reload and retry.', {
        code: 'PAYMENT_CHANGED',
      });
    }

    // Duplicate use is flagged for the verifier, never blocked (docs/21 §I.4).
    const flags = await duplicateFlags(
      {
        brandId: order.brandId,
        paymentId: saved._id,
        reference: collection.reference,
        fingerprint: collection.proof && collection.proof.fingerprint,
      },
      session
    );
    if (flags.duplicateReference || flags.duplicateProof) {
      await Payment.updateOne(
        { _id: saved._id },
        {
          $set: {
            'collection.duplicateReference': flags.duplicateReference,
            'collection.duplicateProof': flags.duplicateProof,
          },
        },
        { session }
      );
    }

    const held = await Delivery.findOneAndUpdate(
      { _id: deliveryId, brandId, riderId, status: 'OUT_FOR_DELIVERY' },
      {
        $set: {
          pendingCompletion: {
            paymentId: saved._id,
            lines,
            netTotal,
            submittedBy: riderId,
            submittedAt: now,
          },
        },
      },
      { new: true, session }
    );
    if (!held) {
      throw new OrderError(409, 'The delivery was changed by another request. Please reload and retry.', {
        code: 'DELIVERY_CHANGED',
      });
    }

    return { order, paymentId: saved._id };
  });

  await notifyBrandOfProofSubmitted({
    brandId: staged.order.brandId,
    orderId: staged.order._id,
    orderNumber: staged.order.orderNumber,
    paymentId: staged.paymentId,
    amount: netTotal,
    method: collection.method,
  });
}

/**
 * Completes a delivery with the customer's proof-of-delivery code. Marking it
 * DELIVERED is the same transaction as for the brand, except for a non-cash
 * payment: that one is only HELD here and completed once the brand verifies it
 * (docs/10 §31). Cash still completes immediately.
 *
 * Wrong guesses are limited: each try is counted by ONE atomic update that also
 * checks the limit, so concurrent requests cannot exceed it. After
 * MAX_CODE_ATTEMPTS the code locks; the brand can still complete the delivery
 * from the dashboard after speaking to the customer.
 */
async function completeWithCode({ brandId, riderId, id, code, collection, lines }) {
  // Read the delivery once: the waiting gate and the held answer decide what
  // this request may do, before any code attempt is used up.
  const scoped = await riderDeliveryDoc({ brandId, riderId, id });
  if (!scoped) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (scoped.status !== 'OUT_FOR_DELIVERY') {
    throw new OrderError(409, `Only a delivery that is out for delivery can be completed (this one is ${scoped.status}).`, {
      code: 'INVALID_TRANSITION',
      from: scoped.status,
      to: 'DELIVERED',
    });
  }
  if (isWaiting(scoped)) {
    throw new OrderError(409, 'This delivery is waiting for its payment to be verified.', {
      code: 'PAYMENT_VERIFICATION_PENDING',
    });
  }

  const order = await Order.findOne({ _id: scoped.orderId, brandId });
  if (!order) {
    throw new OrderError(409, 'The order is not in a state that allows this delivery step.', { code: 'ORDER_OUT_OF_SYNC' });
  }
  // Validate the per-line answer BEFORE counting this as a code attempt: a
  // correct code with a bad line must not use up the rider's tries.
  const completion = buildCompletion(order, lines);

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

  assertCollectionProof({ brandId, deliveryId: id, collection });
  assertReturnPhotos({ brandId, deliveryId: id, lines });

  // A non-cash payment for money actually accepted waits for the brand. A
  // fully refused order has nothing to collect, so it completes directly.
  if (order.paymentStatus === 'PENDING' && collection && collection.method !== 'CASH' && completion.netTotal > 0) {
    await stagePendingPayment({
      brandId,
      riderId,
      deliveryId: id,
      collection,
      lines,
      netTotal: completion.netTotal,
    });
    return getRiderDelivery({ brandId, riderId, id });
  }

  const delivery = await updateDeliveryStatus({
    brandId,
    deliveryId: id,
    status: 'DELIVERED',
    userId: riderId,
    riderId,
    collection,
    lines,
  });
  return viewFor(delivery, brandId);
}

/**
 * The brand refused the payment the rider sent: the delivery stays open and the
 * rider is asked to collect again (docs/10 §31). Cash completes immediately;
 * another non-cash attempt is held for a fresh check. The customer's code is
 * not asked again: the door answer is already recorded.
 */
async function retryDoorPayment({ brandId, riderId, id, collection }) {
  const delivery = await riderDeliveryDoc({ brandId, riderId, id });
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (delivery.status !== 'OUT_FOR_DELIVERY') {
    throw new OrderError(409, `Only a delivery that is out for delivery can be completed (this one is ${delivery.status}).`, {
      code: 'INVALID_TRANSITION',
      from: delivery.status,
      to: 'DELIVERED',
    });
  }
  const held = delivery.pendingCompletion;
  if (!held || !held.rejectedAt) {
    throw new OrderError(409, 'This delivery has no refused payment to collect again.', {
      code: 'NO_REFUSED_PAYMENT',
    });
  }

  assertCollectionProof({ brandId, deliveryId: id, collection });

  if (collection.method === 'CASH') {
    // The shared completion archives the refused attempt, clears the hold and
    // collects the same amount for the same accepted lines.
    const { events } = await runInTransaction((session) =>
      applyDeliveryStatus({
        brandId,
        deliveryId: id,
        status: 'DELIVERED',
        userId: riderId,
        riderId,
        collection,
        lines: held.lines,
        session,
      })
    );
    await dispatchDeliveryEvents(events);
    return getRiderDelivery({ brandId, riderId, id });
  }

  await stagePendingPayment({
    brandId,
    riderId,
    deliveryId: id,
    collection,
    lines: held.lines,
    netTotal: held.netTotal,
  });
  return getRiderDelivery({ brandId, riderId, id });
}

/**
 * The cash this rider is holding: collected on delivery and not yet handed over
 * to the brand. Only their own, and only an amount and a count.
 */
async function riderCash({ brandId, riderId }) {
  const payments = await Payment.find({ brandId, collectedBy: riderId, settledAt: { $exists: false } }).select('amount');
  return { count: payments.length, total: payments.reduce((sum, p) => sum + p.amount, 0) };
}

module.exports = {
  listRiderDeliveries,
  getRiderDelivery,
  riderUpdateStatus,
  completeWithCode,
  retryDoorPayment,
  riderCash,
  toRiderView,
};
