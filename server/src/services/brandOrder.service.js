const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const Delivery = require('../models/delivery.model');
const { runInTransaction } = require('../utils/transaction');
const { restockStock } = require('./inventory.service');
const { OrderError } = require('./order.service');
const { notifyCustomerOfOrderStatus } = require('./notification.service');
const { legalSourcesFor, brandNextStatuses } = require('../config/orderTransitions');

const DEFAULT_LIMIT = 20;

// Every query is scoped by brandId, which the controller takes from the
// authenticated user's tenant (docs/08 §19) — never from the request.
async function listBrandOrders(brandId, { status, page, limit } = {}) {
  const filter = { brandId };
  if (status) filter.orderStatus = status;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Order.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

// Another brand's order is a 404 (not 403) so ids can't be probed.
async function getBrandOrder(brandId, orderId) {
  const order = await Order.findOne({ _id: orderId, brandId });
  if (!order) {
    throw new OrderError(404, 'Order not found.');
  }
  const [payment, delivery] = await Promise.all([
    Payment.findOne({ orderId: order._id }),
    Delivery.findOne({ orderId: order._id }),
  ]);
  return { order, payment, delivery };
}

/**
 * Moves an order to `status` (docs/08 §16-17). Legality AND ownership are
 * enforced by ONE atomic conditional update: the order only matches while it
 * belongs to this brand and sits in a status from which `status` is a legal
 * next step. So concurrent/duplicate requests, or a race with the customer's
 * own cancel, can never double-apply a transition.
 *
 * REJECTED restocks every item exactly once (only the request that wins the
 * status change reaches the restock) and cancels the pending payment, all in
 * the same transaction (docs/09 §14).
 */
async function updateBrandOrderStatus({ brandId, orderId, status, userId }) {
  const order = await runInTransaction(async (session) => {
    const update = {
      $set: { orderStatus: status },
      $push: { statusHistory: { status, by: userId, at: new Date() } },
    };
    if (status === 'REJECTED') {
      update.$set.paymentStatus = 'CANCELLED';
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId, brandId, orderStatus: { $in: legalSourcesFor(status) } },
      update,
      { new: true, session }
    );

    if (!order) {
      const existing = await Order.findOne({ _id: orderId, brandId }).session(session);
      if (!existing) {
        throw new OrderError(404, 'Order not found.');
      }
      throw new OrderError(409, `Cannot change an order from ${existing.orderStatus} to ${status}.`, {
        code: 'INVALID_TRANSITION',
        from: existing.orderStatus,
        to: status,
        allowed: brandNextStatuses(existing.orderStatus),
      });
    }

    if (status === 'REJECTED') {
      const sorted = [...order.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
      for (const item of sorted) {
        await restockStock(item.productId, item.quantity, { session });
      }
      await Payment.updateMany(
        { orderId: order._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
        { session }
      );
    }
    // Delivery is created when the order reaches the fulfillment stage
    // (docs/11 §11). Only the request that won the atomic status change gets
    // here, and Delivery.orderId is unique, so there is never a duplicate.
    if (status === 'READY_FOR_SHIPMENT') {
      const address =
        typeof order.shippingAddress.toObject === 'function'
          ? order.shippingAddress.toObject()
          : order.shippingAddress;
      await Delivery.create(
        [
          {
            orderId: order._id,
            brandId: order.brandId,
            customerId: order.customerId,
            status: 'READY_FOR_PICKUP',
            address,
            deliveryFee: order.deliveryFee,
          },
        ],
        { session }
      );
    }
    return order;
  });

  // CONFIRMED/PROCESSING/REJECTED reach the buyer (docs/12 §5);
  // READY_FOR_SHIPMENT is internal brand workflow and announces nothing.
  if (status !== 'READY_FOR_SHIPMENT') {
    await notifyCustomerOfOrderStatus(order, status);
  }
  return order;
}

module.exports = { listBrandOrders, getBrandOrder, updateBrandOrderStatus };
