const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const { runInTransaction } = require('../utils/transaction');
const { restockStock } = require('./inventory.service');
const { OrderError } = require('./order.service');
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
  const payment = await Payment.findOne({ orderId: order._id });
  return { order, payment };
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
  return runInTransaction(async (session) => {
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
    return order;
  });
}

module.exports = { listBrandOrders, getBrandOrder, updateBrandOrderStatus };
