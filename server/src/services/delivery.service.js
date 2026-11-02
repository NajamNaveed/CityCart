const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const Return = require('../models/return.model');
const User = require('../models/user.model');
const env = require('../config/env');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const {
  notifyCustomerOfOrderStatus,
  notifyPaymentReceived,
  notifyRiderAssigned,
  notifyRefundIssued,
  notifyBrandOfReturn,
} = require('./notification.service');
const { generateDeliveryCode } = require('../utils/deliveryCode');
const { issueReceiptBestEffort } = require('./receipt.service');
const { duplicateFlags } = require('./paymentProof.service');
const { buildCompletion, returnPhotoBelongsToDelivery } = require('./return.service');
const { isConfigured } = require('./upload.service');
const { deliveryForCustomer } = require('../utils/deliveryView');
const { ROLES } = require('../config/roles');
const { PAYMENT_METHOD_FOR_COLLECTION } = require('../config/paymentCollection');
const {
  DELIVERY_FINAL_STATUSES,
  ORDER_STATUS_FOR_DELIVERY,
  legalDeliverySourcesFor,
  nextDeliveryStatuses,
  legalOrderSourcesFor,
} = require('../config/deliveryTransitions');

const DEFAULT_LIMIT = 20;
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

async function listDeliveries(brandId, { status, riderId, page, limit } = {}) {
  const filter = { brandId };
  if (status) filter.status = status;
  if (riderId) filter.riderId = riderId;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [items, total] = await Promise.all([
    Delivery.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Delivery.countDocuments(filter),
  ]);
    // The dashboard shows the human order number ("CC-2026-000001"), which lives on the order.
  const orders = items.length
    ? await Order.find({ _id: { $in: items.map((d) => d.orderId) } }).select('orderNumber')
    : [];
  const numberByOrder = new Map(orders.map((o) => [String(o._id), o.orderNumber]));

  return {
    items: items.map((d) => ({
      ...(typeof d.toObject === 'function' ? d.toObject() : d),
      orderNumber: numberByOrder.get(String(d.orderId)) || null,
    })),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

/**
 * Access (docs/05 §22a, docs/11 §27): the owning brand, the customer who
 * owns the order, or a platform admin (docs/21 §G). Anyone else gets a 404,
 * so another customer's address (or another brand's delivery) can't be probed.
 */
async function getDeliveryForUser(user, tenantBrandId, deliveryId) {
  const filter = { _id: deliveryId };
  if (user.role === 'CUSTOMER') {
    filter.customerId = user._id;
  } else if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.ADMIN_PARTNER) {
    filter.brandId = tenantBrandId;
  }
  const delivery = await Delivery.findOne(filter);
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  return user.role === 'CUSTOMER' ? deliveryForCustomer(delivery) : delivery;
}

/**
 * Moves a delivery along its lifecycle and keeps the ORDER, PAYMENT and RETURN
 * consistent with it — all in one transaction (docs/11 §10, §18, docs/22 §F):
 *
 *   PICKED_UP         -> order SHIPPED
 *   OUT_FOR_DELIVERY  -> order OUT_FOR_DELIVERY
 *   DELIVERED         -> order DELIVERED (or RETURNED when every line was
 *                        refused), completion totals, COD payment for the
 *                        accepted lines only, refund for a prepaid order,
 *                        and a Return for the refused goods
 *   IN_TRANSIT/FAILED -> order unchanged (a failed delivery is NOT a refund)
 *
 * `lines` is the rider's per-line answer (one entry per order item). Omitting
 * it means everything was accepted, which keeps older callers working.
 *
 * Legality and brand ownership are enforced by one atomic conditional update
 * on the delivery, so duplicate/concurrent requests can't double-apply (a
 * double DELIVERED can't mark payment PAID twice or create two returns). If
 * the order is not in a status the delivery step requires, everything is
 * rolled back.
 */
async function updateDeliveryStatus({ brandId, deliveryId, status, failureReason, userId, riderId, collection, lines }) {
  // riderId is set only when a rider makes the change: the delivery must then be
  // assigned to that rider, so a rider can never move someone else's delivery.
  const owner = { brandId, ...(riderId && { riderId }) };
  // Notifications collected inside the transaction, delivered after it commits —
  // a rollback then leaves nothing behind, and a withTransaction retry only
  // leaves the entries of the run that actually committed.
  const events = [];

  const delivery = await runInTransaction(async (session) => {
    // withTransaction may re-run this callback after a transient error;
    // entries from a rolled-back attempt must never survive.
    events.length = 0;
    const update = { $set: { status } };
    if (status === 'FAILED') {
      update.$set.failureReason = failureReason;
    } else {
      update.$unset = { failureReason: '' }; // moving on clears a stale failure reason
    }

    // new:false => `previous` is the delivery as it was BEFORE this change.
    const previous = await Delivery.findOneAndUpdate(
      { _id: deliveryId, ...owner, status: { $in: legalDeliverySourcesFor(status) } },
      update,
      { new: false, session }
    );

    if (!previous) {
      const existing = await Delivery.findOne({ _id: deliveryId, ...owner }).session(session);
      if (!existing) {
        throw new OrderError(404, 'Delivery not found.');
      }
      throw new OrderError(409, `Cannot change a delivery from ${existing.status} to ${status}.`, {
        code: 'INVALID_TRANSITION',
        from: existing.status,
        to: status,
        allowed: nextDeliveryStatuses(existing.status),
      });
    }

    // A completion is the one step that needs the order's lines before the
    // order update, so its final figures can be written at the same time.
    let completion = null;
    let orderTarget = ORDER_STATUS_FOR_DELIVERY[status];
    if (status === 'DELIVERED') {
      const current = await Order.findOne({ _id: previous.orderId, brandId }).session(session);
      if (!current) {
        throw new OrderError(409, 'The order is not in a state that allows this delivery step.', {
          code: 'ORDER_OUT_OF_SYNC',
        });
      }
      completion = buildCompletion(current, lines);
      // Everything refused ends the delivery as RETURNED (docs/22 §F); the
      // goods still travel back with this rider.
      orderTarget = completion.fulfilment === 'NONE' ? 'RETURNED' : 'DELIVERED';

      for (const line of completion.returnLines) {
        if (!line.photo) continue;
        // Photos are optional; when one is attached it must have gone into THIS
        // delivery's return folder, which needs a working Cloudinary setup.
        if (!isConfigured(env.cloudinary)) {
          throw new OrderError(503, 'Return photos are not set up on this server yet.', {
            code: 'RETURN_PHOTO_NOT_CONFIGURED',
          });
        }
        // Only a photo uploaded to THIS delivery's return folder is accepted.
        if (!returnPhotoBelongsToDelivery({ brandId, deliveryId: previous._id, publicId: line.photo.publicId })) {
          throw new OrderError(422, 'That return photo does not belong to this delivery.', {
            code: 'RETURN_PHOTO_NOT_YOURS',
          });
        }
      }
    }

    // A re-attempt (FAILED -> OUT_FOR_DELIVERY): the order is already there.
    if (orderTarget && previous.status !== 'FAILED') {
      const completionFields = completion
        ? {
            fulfilment: completion.fulfilment,
            returnedAmount: completion.returnedSubtotal,
            feeRefunded: completion.feeRefunded,
            netTotal: completion.netTotal,
          }
        : {};
      const order = await Order.findOneAndUpdate(
        { _id: previous.orderId, brandId, orderStatus: { $in: legalOrderSourcesFor(orderTarget) } },
        {
          $set: { orderStatus: orderTarget, ...completionFields },
          $push: { statusHistory: { status: orderTarget, by: userId, at: new Date() } },
        },
        { new: true, session }
      );
      if (!order) {
        // Aborts the transaction, undoing the delivery change above.
        throw new OrderError(409, 'The order is not in a state that allows this delivery step.', {
          code: 'ORDER_OUT_OF_SYNC',
        });
      }

      events.push({ kind: 'ORDER_STATUS', order, status: orderTarget });

      if (completion) {
        await settleCompletion({
          order,
          previous,
          completion,
          collection,
          userId,
          riderId,
          brandId,
          events,
          session,
        });
      }
    }

    const updated = await Delivery.findById(previous._id).session(session);
    return { updated, events };
  });

  for (const event of delivery.events) {
    if (event.kind === 'ORDER_STATUS') {
      await notifyCustomerOfOrderStatus(event.order, event.status);
    } else if (event.kind === 'PAYMENT_RECEIVED') {
      await notifyPaymentReceived(event.order, ...(event.nonCash ? [{ nonCash: true }] : []));
      await issueReceiptBestEffort(event.paymentId);
    } else if (event.kind === 'REFUND') {
      await notifyRefundIssued(event.order, { amount: event.amount, reason: event.reason });
    } else if (event.kind === 'RETURN_CREATED') {
      await notifyBrandOfReturn(event.ret, event.order);
    }
  }
  return delivery.updated;
}

/**
 * Writes the money and the Return for a completion, inside the caller's
 * transaction (docs/22 §F):
 *  - COD: the customer pays only the accepted total. Nothing collected on a
 *    fully refused order (status CANCELLED), so the payment is never marked PAID.
 *  - prepaid: the rejected goods (plus the fee when the whole order came back
 *    for a store-fault reason) are refunded on the existing Payment record,
 *    using the same cumulative-refund rules as a manual refund.
 *  - any refused line becomes an IN_TRANSIT door return for the store to receive.
 */
async function settleCompletion({ order, previous, completion, collection, userId, riderId, brandId, events, session }) {
  let refundAmount = 0;
  const now = new Date();

  if (order.paymentMethod === 'COD') {
    if (completion.netTotal > 0) {
      // Cash or another way at the door (docs/21 §I). Prepaid orders have
      // nothing to collect and never carry a collection.
      const isCash = !collection || collection.method === 'CASH';
      const paymentUpdate = {
        status: 'PAID',
        // The customer pays for the accepted units only.
        amount: completion.netTotal,
        paidAt: now,
        confirmedBy: userId,
        brandId: order.brandId,
        'collection.method': isCash ? 'CASH' : collection.method,
      };
      if (isCash) {
        // The collector (the rider, or the team member completing it) holds the
        // cash until the brand settles it (docs/10 §11a).
        paymentUpdate.collectedBy = userId;
        paymentUpdate.collectedAt = now;
      } else {
        // Non-cash: paid, but the brand must check the proof. Nobody holds cash,
        // so collectedBy is never set and it never enters a rider's cash balance.
        paymentUpdate.method = PAYMENT_METHOD_FOR_COLLECTION[collection.method];
        if (collection.wallet) paymentUpdate['collection.wallet'] = collection.wallet;
        paymentUpdate['collection.reference'] = collection.reference;
        paymentUpdate['collection.proof'] = collection.proof;
        paymentUpdate['collection.verification'] = 'SUBMITTED';
      }

      // Conditional on PENDING so it can only ever flip once.
      const cod = await Payment.findOneAndUpdate(
        { orderId: order._id, status: 'PENDING' },
        { $set: paymentUpdate },
        { session }
      );
      if (cod && !isCash) {
        // Duplicate use is flagged for the verifier, never blocked (docs/21 §I.4).
        const flags = await duplicateFlags(
          {
            brandId: order.brandId,
            paymentId: cod._id,
            reference: collection.reference,
            fingerprint: collection.proof.fingerprint,
          },
          session
        );
        if (flags.duplicateReference || flags.duplicateProof) {
          await Payment.updateOne(
            { _id: cod._id },
            { $set: { 'collection.duplicateReference': flags.duplicateReference, 'collection.duplicateProof': flags.duplicateProof } },
            { session }
          );
        }
      } else if (!cod && !isCash) {
        // The payment was already collected some other way; a new proof would
        // have nowhere to go. Undo this completion rather than lose it silently.
        throw new OrderError(409, 'This payment has already been collected.', { code: 'PAYMENT_ALREADY_COLLECTED' });
      }
      await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'PAID' } }, { session });
      // The notification only accompanies the request that actually won
      // the payment flip, so a duplicate DELIVERED can't double-announce.
      if (cod) {
        events.push({ kind: 'PAYMENT_RECEIVED', order, paymentId: cod._id, nonCash: !isCash });
      }
    } else {
      // Nothing was accepted and there is nothing to collect.
      await Payment.updateOne(
        { orderId: order._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
        { session }
      );
      await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'CANCELLED' } }, { session });
    }
  } else {
    // A prepaid order needs no collection; refuse a proof rather than store it.
    if (collection) {
      throw new OrderError(409, 'This order was paid up front; there is nothing to collect.', { code: 'PAYMENT_PREPAID' });
    }

    const due = roundMoney(
      completion.returnedSubtotal + (completion.feeRefunded ? Number(order.deliveryFee || 0) : 0)
    );
    const payment = await Payment.findOne({ orderId: order._id }).session(session);
    if (payment && due > 0 && ['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      const remaining = roundMoney(payment.amount - (payment.refundedAmount || 0));
      refundAmount = Math.min(due, remaining);
      if (refundAmount > 0) {
        const refundedAmount = roundMoney((payment.refundedAmount || 0) + refundAmount);
        const nextStatus = refundedAmount >= roundMoney(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        const updatedPayment = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: payment.status,
            refundedAmount: payment.refundedAmount || { $in: [0, null] },
          },
          {
            $set: { status: nextStatus, refundedAmount },
            $push: { refunds: { amount: refundAmount, reason: 'Items returned at the door', by: userId, at: now } },
          },
          { new: true, session }
        );
        if (!updatedPayment) {
          throw new OrderError(409, 'The payment was changed by another request. Please reload and retry.', {
            code: 'PAYMENT_CHANGED',
          });
        }
        await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: nextStatus } }, { session });
        events.push({ kind: 'REFUND', order, amount: refundAmount, reason: 'Items returned at the door' });
      }
    }
  }

  if (completion.returnLines.length === 0) return;

  const [ret] = await Return.create(
    [
      {
        orderId: order._id,
        deliveryId: previous._id,
        brandId,
        customerId: order.customerId,
        ...((previous.riderId || riderId) && { riderId: previous.riderId || riderId }),
        source: 'DOOR',
        status: 'IN_TRANSIT',
        lines: completion.returnLines,
        returnedSubtotal: completion.returnedSubtotal,
        feeRefunded: completion.feeRefunded,
        refundAmount,
        currency: order.currency || 'PKR',
      },
    ],
    { session }
  );

  // Everything refused: the delivery ends as RETURNED, with its return attached.
  const deliveryStatus = completion.fulfilment === 'NONE' ? 'RETURNED' : 'DELIVERED';
  await Delivery.updateOne({ _id: previous._id }, { $set: { status: deliveryStatus, returnId: ret._id } }, { session });
  events.push({ kind: 'RETURN_CREATED', ret, order });
}

// trackingReference / assignedAgent only; ownership + not-yet-final enforced
// in the update filter.
async function updateDelivery({ brandId, deliveryId, trackingReference, assignedAgent }) {
  const fields = {};
  if (trackingReference !== undefined) fields.trackingReference = trackingReference;
  if (assignedAgent !== undefined) fields.assignedAgent = assignedAgent;

  // A typed-in agent name cannot overwrite the name of an assigned rider: it
  // would leave the delivery showing one person and belonging to another.
  const updated = await Delivery.findOneAndUpdate(
    {
      _id: deliveryId,
      brandId,
      status: { $nin: DELIVERY_FINAL_STATUSES },
      ...(assignedAgent !== undefined && { riderId: { $exists: false } }),
    },
    { $set: fields },
    { new: true }
  );
  if (updated) {
    return updated;
  }
  const existing = await Delivery.findOne({ _id: deliveryId, brandId });
  if (!existing) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (!DELIVERY_FINAL_STATUSES.includes(existing.status) && existing.riderId) {
    throw new OrderError(409, 'A rider is assigned to this delivery. Change the rider instead of typing an agent name.', {
      code: 'USE_RIDER_ASSIGNMENT',
    });
  }
  throw new OrderError(409, `A ${existing.status} delivery can no longer be edited.`, {
    code: 'DELIVERY_FINAL',
  });
}

/**
 * Assigns the delivery to one of the brand's active riders, or takes the rider
 * off it (riderId null). Brand isolation is enforced twice: the rider must belong
 * to the caller's brand, and so must the delivery. Final deliveries cannot be
 * reassigned. The proof-of-delivery code is created here for any delivery that
 * does not have one yet, and the rider is told about their new job.
 */
async function assignRider({ brandId, deliveryId, riderId }) {
  let rider = null;
  if (riderId) {
    rider = await User.findOne({ _id: riderId, brandId, role: ROLES.RIDER, isActive: true });
    if (!rider) {
      throw new OrderError(404, 'Rider not found.');
    }
  }

  const change = rider
    ? { $set: { riderId: rider._id, assignedAgent: rider.name, assignedAt: new Date() } }
    : { $unset: { riderId: '', assignedAgent: '', assignedAt: '' } };
  // Unassigning only makes sense when a rider is assigned; a hand-typed agent
  // name is not touched by it.
  const filter = {
    _id: deliveryId,
    brandId,
    status: { $nin: DELIVERY_FINAL_STATUSES },
    ...(!rider && { riderId: { $exists: true } }),
  };

  const previous = await Delivery.findOneAndUpdate(filter, change, { new: false });
  if (!previous) {
    const existing = await Delivery.findOne({ _id: deliveryId, brandId });
    if (!existing) {
      throw new OrderError(404, 'Delivery not found.');
    }
    if (DELIVERY_FINAL_STATUSES.includes(existing.status)) {
      throw new OrderError(409, `A ${existing.status} delivery can no longer be edited.`, { code: 'DELIVERY_FINAL' });
    }
    throw new OrderError(409, 'No rider is assigned to this delivery.', { code: 'NO_RIDER_ASSIGNED' });
  }

  if (rider) {
    // Older deliveries (created before delivery codes existed) get theirs now.
    // Conditional on the code being absent, so it can never be replaced.
    await Delivery.updateOne({ _id: previous._id, deliveryCode: { $exists: false } }, { $set: { deliveryCode: generateDeliveryCode() } });
    if (!previous.riderId || String(previous.riderId) !== String(rider._id)) {
      const order = await Order.findById(previous.orderId).select('orderNumber');
      await notifyRiderAssigned({
        userId: rider._id,
        brandId,
        orderNumber: order ? order.orderNumber : '',
        deliveryId: previous._id,
      });
    }
  }
  return Delivery.findById(previous._id);
}

// Statuses in which the customer may see the code: the order is on the road.
const CODE_VISIBLE_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'];

/**
 * The proof-of-delivery code, for the customer who owns the order and only
 * while the order is on its way. This is the one place the code leaves the
 * server: it is never part of a delivery returned to a brand, rider or admin.
 */
async function getDeliveryCodeForCustomer(customerId, deliveryId) {
  const delivery = await Delivery.findOne({ _id: deliveryId, customerId }).select('+deliveryCode status');
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (!CODE_VISIBLE_STATUSES.includes(delivery.status) || !delivery.deliveryCode) {
    throw new OrderError(409, 'The delivery code is available once your order is on its way.', {
      code: 'CODE_NOT_AVAILABLE',
    });
  }
  return delivery.deliveryCode;
}

/**
 * The delivery record that appears when a packed order is ready for a rider
 * (docs/11 §11). Its unique orderId means a duplicate pack can never create a
 * second one; callers run this inside the status-change transaction.
 */
async function createReadyForPickupDelivery(order, { session } = {}) {
  const address =
    typeof order.shippingAddress.toObject === 'function'
      ? order.shippingAddress.toObject()
      : order.shippingAddress;
  const [delivery] = await Delivery.create(
    [
      {
        orderId: order._id,
        brandId: order.brandId,
        customerId: order.customerId,
        status: 'READY_FOR_PICKUP',
        address,
        deliveryFee: order.deliveryFee,
        deliveryCode: generateDeliveryCode(),
      },
    ],
    { session }
  );
  return delivery;
}

module.exports = {
  listDeliveries,
  getDeliveryForUser,
  updateDeliveryStatus,
  updateDelivery,
  assignRider,
  getDeliveryCodeForCustomer,
  createReadyForPickupDelivery,
};
