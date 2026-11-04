const Order = require('../models/order.model');
const Product = require('../models/product.model');
const OrderAdjustment = require('../models/orderAdjustment.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const { proposeAdjustment } = require('./orderAdjustment.service');
const { createReadyForPickupDelivery, dispatchRiderForOrder } = require('./delivery.service');

/**
 * Picking an order inside one brand (docs/22 §E).
 *
 * The picker queue is the brand's accepted orders: CONFIRMED and not yet
 * claimed, plus the PROCESSING order this picker has taken. Every query is
 * pinned to the picker's own brand, so another brand's order is a 404 (ids
 * cannot be probed) and another picker's order is not theirs.
 *
 * The picker never sees money: the serializers below return names, quantities
 * and pick state only — no customer phone, address, prices, totals or payment.
 * The one place money changes is the adjustment proposal, computed by the
 * server from the order snapshots and current substitute prices.
 *
 * Order statuses are reused rather than added: picking runs in PROCESSING
 * ("the brand is preparing the order") and packing moves it to
 * READY_FOR_SHIPMENT, which already creates the rider's delivery.
 */

const DEFAULT_LIMIT = 20;
const QUEUE_STATUSES = ['CONFIRMED', 'PROCESSING'];

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Customer';

async function activeAdjustmentFor(orderId) {
  return OrderAdjustment.findOne({ orderId, status: 'PROPOSED' }).select(
    '_id status note expiresAt proposedByRole createdAt'
  );
}

function itemView(item) {
  return {
    _id: item._id,
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    image: item.image,
    quantity: item.quantity,
    pickStatus: item.pickStatus || null,
    pickedQty: item.pickedQty === undefined ? null : item.pickedQty,
  };
}

function orderView(order, adjustment) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
    pickStartedAt: order.pickStartedAt,
    packedAt: order.packedAt,
    claimedByMe: Boolean(order.pickerId),
    // The picker needs a first name to keep orders apart, nothing more.
    customerFirstName: firstName(order.shippingAddress && order.shippingAddress.name),
    items: order.items.map(itemView),
    activeAdjustment: adjustment
      ? {
          _id: adjustment._id,
          status: adjustment.status,
          note: adjustment.note,
          expiresAt: adjustment.expiresAt,
          proposedByRole: adjustment.proposedByRole || 'BRAND_EMPLOYEE',
        }
      : null,
  };
}

function queueView(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
    pickStartedAt: order.pickStartedAt,
    customerFirstName: firstName(order.shippingAddress && order.shippingAddress.name),
    itemCount: order.items.length,
    units: order.items.reduce((sum, item) => sum + item.quantity, 0),
    claimedByMe: Boolean(order.pickerId),
    waitingForCustomer: Boolean(order.activeAdjustmentId),
  };
}

async function listQueue(brandId, pickerId, { page, limit } = {}) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const filter = {
    brandId,
    orderStatus: { $in: QUEUE_STATUSES },
    // Unclaimed work, plus the order already in this picker's hands. An
    // unclaimed order with a waiting proposal is hidden; the picker's own
    // order stays in the queue so they can check whether it was answered.
    $and: [
      { $or: [{ pickerId: null }, { pickerId }] },
      { $or: [{ activeAdjustmentId: null }, { pickerId }] },
    ],
  };

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select('_id orderNumber orderStatus createdAt pickStartedAt pickerId activeAdjustmentId shippingAddress.name items.quantity')
      .sort({ createdAt: 1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Order.countDocuments(filter),
  ]);
  return {
    items: items.map(queueView),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function findOwnOrder(brandId, orderId, pickerId) {
  const order = await Order.findOne({ _id: orderId, brandId });
  if (!order) throw new OrderError(404, 'Order not found.');
  // Another picker's work is not visible at all; neither is an order the
  // brand has not accepted yet.
  if (order.pickerId && String(order.pickerId) !== String(pickerId)) {
    throw new OrderError(404, 'Order not found.');
  }
  if (!order.pickerId && !QUEUE_STATUSES.includes(order.orderStatus)) {
    throw new OrderError(404, 'Order not found.');
  }
  return order;
}

async function getPickerOrder({ brandId, pickerId, orderId }) {
  const order = await findOwnOrder(brandId, orderId, pickerId);
  return orderView(order, await activeAdjustmentFor(order._id));
}

async function claimOrder({ brandId, pickerId, orderId }) {
  const now = new Date();

  // Only one picker can take an order: accepted work is claimed with an atomic
  // filter, and an already-PROCESSING order (the brand moved it by hand) is
  // claimed without writing a second history entry.
  let claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      brandId,
      pickerId: null,
      orderStatus: 'CONFIRMED',
      activeAdjustmentId: null,
    },
    {
      $set: { pickerId, pickStartedAt: now, orderStatus: 'PROCESSING' },
      $push: { statusHistory: { status: 'PROCESSING', by: pickerId, at: now } },
    },
    { new: true }
  );
  if (!claimed) {
    claimed = await Order.findOneAndUpdate(
      {
        _id: orderId,
        brandId,
        pickerId: null,
        orderStatus: 'PROCESSING',
        activeAdjustmentId: null,
      },
      { $set: { pickerId, pickStartedAt: now } },
      { new: true }
    );
  }

  if (!claimed) {
    const existing = await Order.findOne({ _id: orderId, brandId });
    if (!existing) throw new OrderError(404, 'Order not found.');
    if (existing.activeAdjustmentId) {
      throw new OrderError(409, 'A change proposal is waiting for the customer. Resolve it before picking.', {
        code: 'ADJUSTMENT_PENDING',
      });
    }
    if (existing.pickerId && String(existing.pickerId) === String(pickerId)) {
      return orderView(existing, await activeAdjustmentFor(existing._id));
    }
    if (existing.pickerId) {
      throw new OrderError(409, 'Another picker is already working on this order.', { code: 'PICK_TAKEN' });
    }
    throw new OrderError(409, 'This order cannot be picked now.', {
      code: 'NOT_PICKABLE',
      orderStatus: existing.orderStatus,
    });
  }

  return orderView(claimed, null);
}

/**
 * Marks one line. PICKED always means the whole ordered quantity; SHORT
 * requires the number actually found; UNAVAILABLE records zero.
 */
async function setLinePick({ brandId, pickerId, orderId, itemId, pickStatus, pickedQty }) {
  const order = await findOwnOrder(brandId, orderId, pickerId);
  if (!order.pickerId) {
    throw new OrderError(409, 'Claim this order before picking it.', { code: 'CLAIM_REQUIRED' });
  }
  if (order.orderStatus !== 'PROCESSING') {
    throw new OrderError(409, 'This order is not being picked.', {
      code: 'NOT_PICKING',
      orderStatus: order.orderStatus,
    });
  }
  if (order.activeAdjustmentId) {
    throw new OrderError(409, 'A change proposal is waiting for the customer. Resolve it first.', {
      code: 'ADJUSTMENT_PENDING',
    });
  }

  const item = order.items.id(itemId) || order.items.find((line) => String(line._id) === String(itemId));
  if (!item) throw new OrderError(404, 'Order line not found.');

  if (pickStatus === 'PICKED') {
    pickedQty = item.quantity;
  } else if (pickStatus === 'SHORT') {
    if (!Number.isInteger(pickedQty) || pickedQty < 1 || pickedQty >= item.quantity) {
      throw new OrderError(400, `Enter how many units were found (1 to ${item.quantity - 1}).`, {
        code: 'INVALID_PICKED_QUANTITY',
      });
    }
  } else {
    pickedQty = 0;
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      brandId,
      pickerId,
      orderStatus: 'PROCESSING',
      activeAdjustmentId: null,
      'items._id': itemId,
    },
    { $set: { 'items.$.pickStatus': pickStatus, 'items.$.pickedQty': pickedQty } },
    { new: true }
  );
  if (!updated) {
    throw new OrderError(409, 'The order was changed by another request. Please reload.', {
      code: 'ORDER_CHANGED',
    });
  }
  return orderView(updated, null);
}

/**
 * The short lines become an adjustment proposal: fewer units (or none) plus
 * optionally a same-brand substitute. The quantities come from the picker's
 * marks, not from the request, so what the customer sees is what was actually
 * found; the adjustment service still checks substitute stock and prices.
 */
async function proposeFromPicking({ brandId, pickerId, orderId, note, restockRemoved, substitutes = [] }) {
  const order = await findOwnOrder(brandId, orderId, pickerId);
  if (!order.pickerId || String(order.pickerId) !== String(pickerId)) {
    throw new OrderError(409, 'Claim this order before proposing a change.', { code: 'CLAIM_REQUIRED' });
  }
  if (order.orderStatus !== 'PROCESSING') {
    throw new OrderError(409, 'This order is not being picked.', {
      code: 'NOT_PICKING',
      orderStatus: order.orderStatus,
    });
  }

  const shortItems = order.items.filter(
    (item) => item.pickStatus === 'SHORT' || item.pickStatus === 'UNAVAILABLE'
  );
  if (shortItems.length === 0) {
    throw new OrderError(409, 'Every line is picked in full, so there is nothing to propose.', {
      code: 'NOTHING_TO_PROPOSE',
    });
  }

  const byItem = new Map(substitutes.map((entry) => [String(entry.orderItemId), entry]));
  if (byItem.size !== substitutes.length) {
    throw new OrderError(400, 'The same line cannot have two substitutes.', { code: 'DUPLICATE_SUBSTITUTE' });
  }
  for (const entry of substitutes) {
    if (!shortItems.some((item) => String(item._id) === String(entry.orderItemId))) {
      throw new OrderError(400, 'A substitute can only replace a line that is short.', {
        code: 'SUBSTITUTE_NOT_SHORT',
      });
    }
  }

  const lines = shortItems.map((item) => {
    const substitute = byItem.get(String(item._id));
    return {
      orderItemId: item._id,
      supplyQuantity: item.pickStatus === 'UNAVAILABLE' ? 0 : item.pickedQty,
      ...(substitute && {
        substitute: { productId: substitute.productId, quantity: substitute.quantity },
      }),
    };
  });

  return proposeAdjustment({
    brandId,
    orderId,
    userId: pickerId,
    userRole: 'PICKER',
    note,
    restockRemoved: Boolean(restockRemoved),
    lines,
  });
}

async function packOrder({ brandId, pickerId, orderId }) {
  const now = new Date();
  const packed = await runInTransaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, brandId }).session(session);
    if (!order) throw new OrderError(404, 'Order not found.');
    if (!order.pickerId || String(order.pickerId) !== String(pickerId)) {
      throw new OrderError(409, 'This order is not yours to pack.', { code: 'NOT_YOUR_ORDER' });
    }
    if (order.orderStatus !== 'PROCESSING') {
      throw new OrderError(409, 'This order is not being picked.', {
        code: 'NOT_PICKING',
        orderStatus: order.orderStatus,
      });
    }
    if (order.activeAdjustmentId) {
      throw new OrderError(409, 'A change proposal is waiting for the customer. Resolve it before packing.', {
        code: 'ADJUSTMENT_PENDING',
      });
    }
    const unfinished = order.items.filter((item) => item.pickStatus !== 'PICKED');
    if (unfinished.length > 0) {
      throw new OrderError(409, 'Finish every line or send a change proposal for the short ones.', {
        code: 'PICKING_INCOMPLETE',
        lines: unfinished.length,
      });
    }

    const updated = await Order.findOneAndUpdate(
      {
        _id: orderId,
        brandId,
        pickerId,
        orderStatus: 'PROCESSING',
        activeAdjustmentId: null,
      },
      {
        $set: { orderStatus: 'READY_FOR_SHIPMENT', packedAt: now },
        $push: { statusHistory: { status: 'READY_FOR_SHIPMENT', by: pickerId, at: now } },
      },
      { new: true, session }
    );
    if (!updated) {
      throw new OrderError(409, 'The order was changed by another request. Please reload.', {
        code: 'ORDER_CHANGED',
      });
    }
    await createReadyForPickupDelivery(updated, { session });
    return updated;
  });

  // The delivery now exists; hand it to the least-busy rider (docs/11 §11a).
  await dispatchRiderForOrder({ brandId, orderId: packed._id });
  return orderView(packed, null);
}

// Same-brand listings a picker may offer as a substitute. No prices: that is
// the customer's business, not the picker's.
async function searchProducts(brandId, { q, page, limit } = {}) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const filter = { brandId, status: 'ACTIVE', isActive: true };
  if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('_id name sku images')
      .sort({ name: 1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Product.countDocuments(filter),
  ]);
  return {
    items: products.map((product) => ({
      _id: product._id,
      name: product.name,
      sku: product.sku,
      image: product.images && product.images.length ? product.images[0] : undefined,
    })),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

module.exports = {
  listQueue,
  getPickerOrder,
  claimOrder,
  setLinePick,
  proposeFromPicking,
  packOrder,
  searchProducts,
};
