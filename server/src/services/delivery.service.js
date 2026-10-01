const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const {
  DELIVERY_FINAL_STATUSES,
  ORDER_STATUS_FOR_DELIVERY,
  legalDeliverySourcesFor,
  nextDeliveryStatuses,
  legalOrderSourcesFor,
} = require('../config/deliveryTransitions');

const DEFAULT_LIMIT = 20;

async function listDeliveries(brandId, { status, page, limit } = {}) {
  const filter = { brandId };
  if (status) filter.status = status;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [items, total] = await Promise.all([
    Delivery.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Delivery.countDocuments(filter),
  ]);
  return {
    items,
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
async function updateDeliveryStatus({ brandId, deliveryId, status, failureReason, userId }) {
  return runInTransaction(async (session) => {
    const update = { $set: { status } };
    if (status === 'FAILED') {
      update.$set.failureReason = failureReason;
    } else {
      update.$unset = { failureReason: '' }; // moving on clears a stale failure reason
    }

    // new:false => `previous` is the delivery as it was BEFORE this change.
    const previous = await Delivery.findOneAndUpdate(
      { _id: deliveryId, brandId, status: { $in: legalDeliverySourcesFor(status) } },
      update,
      { new: false, session }
    );

    if (!previous) {
      const existing = await Delivery.findOne({ _id: deliveryId, brandId }).session(session);
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

      if (status === 'DELIVERED' && order.paymentMethod === 'COD') {
        // Cash collected on delivery (docs/10 §6, §11). Conditional on
        // PENDING so it can only ever flip once.
        await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'PAID' } }, { session });
        await Payment.updateOne(
          { orderId: order._id, status: 'PENDING' },
          { $set: { status: 'PAID', paidAt: new Date(), confirmedBy: userId } },
          { session }
        );
      }
    }

    return Delivery.findById(previous._id).session(session);
  });
}

// trackingReference / assignedAgent only; ownership + not-yet-final enforced
// in the update filter.
async function updateDelivery({ brandId, deliveryId, trackingReference, assignedAgent }) {
  const fields = {};
  if (trackingReference !== undefined) fields.trackingReference = trackingReference;
  if (assignedAgent !== undefined) fields.assignedAgent = assignedAgent;

  const updated = await Delivery.findOneAndUpdate(
    { _id: deliveryId, brandId, status: { $nin: DELIVERY_FINAL_STATUSES } },
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
  throw new OrderError(409, `A ${existing.status} delivery can no longer be edited.`, {
    code: 'DELIVERY_FINAL',
  });
}

module.exports = { listDeliveries, getDeliveryForUser, updateDeliveryStatus, updateDelivery };
