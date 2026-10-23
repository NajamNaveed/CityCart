const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const { notifyCustomerOfOrderStatus, notifyPaymentReceived, notifyRiderAssigned } = require('./notification.service');
const { generateDeliveryCode } = require('../utils/deliveryCode');
const { issueReceiptBestEffort } = require('./receipt.service');
const { ROLES } = require('../config/roles');
const {
  DELIVERY_FINAL_STATUSES,
  ORDER_STATUS_FOR_DELIVERY,
  legalDeliverySourcesFor,
  nextDeliveryStatuses,
  legalOrderSourcesFor,
} = require('../config/deliveryTransitions');

const DEFAULT_LIMIT = 20;

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
 * owns the order, or SUPER_ADMIN. Anyone else gets a 404, so another
 * customer's address (or another brand's delivery) can't be probed.
 */
async function getDeliveryForUser(user, tenantBrandId, deliveryId) {
  const filter = { _id: deliveryId };
  if (user.role === 'CUSTOMER') {
    filter.customerId = user._id;
  } else if (user.role !== 'SUPER_ADMIN') {
    filter.brandId = tenantBrandId;
  }
  const delivery = await Delivery.findOne(filter);
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  return delivery;
}

/**
 * Moves a delivery along its lifecycle and keeps the ORDER and COD PAYMENT
 * consistent with it — all in one transaction (docs/11 §10, §18):
 *
 *   PICKED_UP         -> order SHIPPED
 *   OUT_FOR_DELIVERY  -> order OUT_FOR_DELIVERY
 *   DELIVERED         -> order DELIVERED + COD payment PAID (cash collected)
 *   IN_TRANSIT/FAILED -> order unchanged (a failed delivery is NOT a refund)
 *
 * Legality and brand ownership are enforced by one atomic conditional update
 * on the delivery, so duplicate/concurrent requests can't double-apply (a
 * double DELIVERED can't mark payment PAID twice). If the order is not in a
 * status the delivery step requires, everything is rolled back.
 */
async function updateDeliveryStatus({ brandId, deliveryId, status, failureReason, userId, riderId }) {
  // riderId is set only when a rider makes the change: the delivery must then be
  // assigned to that rider, so a rider can never move someone else's delivery.
  const owner = { brandId, ...(riderId && { riderId }) };
  // Customer notifications collected inside the transaction, delivered after
  // it commits — a rollback then leaves nothing behind, and a withTransaction
  // retry only leaves the entries of the run that actually committed.
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

    const orderTarget = ORDER_STATUS_FOR_DELIVERY[status];
    // A re-attempt (FAILED -> OUT_FOR_DELIVERY): the order is already there.
    if (orderTarget && previous.status !== 'FAILED') {
      const order = await Order.findOneAndUpdate(
        { _id: previous.orderId, brandId, orderStatus: { $in: legalOrderSourcesFor(orderTarget) } },
        {
          $set: { orderStatus: orderTarget },
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

      if (status === 'DELIVERED' && order.paymentMethod === 'COD') {
        // Cash collected on delivery (docs/10 §6, §11). Conditional on
        // PENDING so it can only ever flip once.
        await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'PAID' } }, { session });
        // The collector (the rider, or the team member completing it) holds the
        // cash until the brand settles it (docs/10 §11a).
        const now = new Date();
        const cod = await Payment.findOneAndUpdate(
          { orderId: order._id, status: 'PENDING' },
          { $set: { status: 'PAID', paidAt: now, confirmedBy: userId, brandId: order.brandId, collectedBy: userId, collectedAt: now } },
          { session }
        );
        // The notification only accompanies the request that actually won
        // the payment flip, so a duplicate DELIVERED can't double-announce.
        if (cod) {
          events.push({ kind: 'PAYMENT_RECEIVED', order, paymentId: cod._id });
        }
      }
    }

    const updated = await Delivery.findById(previous._id).session(session);
    return { updated, events };
  });

  for (const event of delivery.events) {
    if (event.kind === 'ORDER_STATUS') {
      await notifyCustomerOfOrderStatus(event.order, event.status);
    } else if (event.kind === 'PAYMENT_RECEIVED') {
      await notifyPaymentReceived(event.order);
      await issueReceiptBestEffort(event.paymentId);
    }
  }
  return delivery.updated;
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

module.exports = {
  listDeliveries,
  getDeliveryForUser,
  updateDeliveryStatus,
  updateDelivery,
  assignRider,
  getDeliveryCodeForCustomer,
};
