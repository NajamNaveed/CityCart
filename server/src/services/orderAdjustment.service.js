const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const Product = require('../models/product.model');
const Receipt = require('../models/receipt.model');
const OrderAdjustment = require('../models/orderAdjustment.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const { InventoryError, restockStock } = require('./inventory.service');
const {
  reserveSubstitutes,
  releaseSubstitutes,
  fulfilSubstitutes,
  restockRemovedUnits,
} = require('./orderAdjustmentStock.service');
const {
  notifyAdjustmentProposed,
  notifyAdjustmentAnswered,
  notifyAdjustmentExpired,
  notifyBrandOfCancelledOrder,
  notifyRefundIssued,
} = require('./notification.service');

/**
 * Adjustments for an order the brand cannot fully supply (docs/21 §H).
 *
 * Lifecycle:
 *   PROPOSED -> ACCEPTED        customer takes the supplies + substitutes
 *   PROPOSED -> REMOVED         customer keeps what is available, removes the rest
 *   PROPOSED -> ORDER_CANCELLED customer cancels the whole order (or the order
 *                               was rejected/cancelled while waiting)
 *   PROPOSED -> WITHDRAWN       the brand took the proposal back
 *   PROPOSED -> EXPIRED         no answer within the 24-hour window
 *
 * Everything that changes stock, money or the order happens in one MongoDB
 * transaction, and the PROPOSED -> resolved transition is one conditional
 * update, so two simultaneous answers can never both be applied.
 */

const ADJUSTABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'];
const WINDOW_MS = 24 * 60 * 60 * 1000;

const toCents = (amount) => Math.round(Number(amount || 0) * 100);
const fromCents = (cents) => cents / 100;

const RESPONSE_STATUS = {
  ACCEPT: 'ACCEPTED',
  REMOVE: 'REMOVED',
  CANCEL_ORDER: 'ORDER_CANCELLED',
};

function invalid(message, code) {
  return new OrderError(400, message, code ? { code } : {});
}

function notPending(adjustment) {
  if (adjustment && adjustment.status === 'EXPIRED') {
    return new OrderError(409, 'This proposal has expired.', { code: 'ADJUSTMENT_EXPIRED' });
  }
  return new OrderError(409, 'This proposal is no longer waiting for an answer.', {
    code: 'ADJUSTMENT_NOT_PENDING',
    status: adjustment ? adjustment.status : undefined,
  });
}

function totalsFrom(order) {
  return {
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee || 0,
    discount: order.discount || 0,
    tax: order.tax || 0,
    total: order.total,
  };
}

/**
 * The two totals the customer can choose between. Unaffected order lines keep
 * their snapshot price; a changed line contributes only the units the brand
 * can supply, and the substitute (if any) is added at today's price.
 * Delivery fee, discount and tax never change (docs/21 §H.4).
 */
function computeTotals(order, lines) {
  const changed = new Map(lines.map((line) => [String(line.orderItemId), line]));
  let baseCents = 0;
  for (const item of order.items) {
    if (changed.has(String(item._id))) continue;
    baseCents += toCents(item.unitPrice) * item.quantity;
  }

  let acceptCents = baseCents;
  let removeCents = baseCents;
  for (const line of lines) {
    const supplyCents = toCents(line.unitPrice) * line.supplyQuantity;
    acceptCents += supplyCents;
    removeCents += supplyCents;
    if (line.substitute) {
      acceptCents += toCents(line.substitute.unitPrice) * line.substitute.quantity;
    }
  }

  const feesCents = toCents(order.deliveryFee) + toCents(order.tax) - toCents(order.discount);
  const build = (subtotalCents) => ({
    subtotal: fromCents(subtotalCents),
    deliveryFee: order.deliveryFee || 0,
    discount: order.discount || 0,
    tax: order.tax || 0,
    total: fromCents(Math.max(0, subtotalCents + feesCents)),
  });

  return { after: build(acceptCents), afterRemoval: build(removeCents) };
}

/**
 * Validates the client's proposed lines against the order and snapshots the
 * substitute products at today's price. The client only chooses ids and
 * quantities; quantities, prices and brand ownership are checked here.
 */
async function buildLines(order, inputLines, { session }) {
  const itemById = new Map(order.items.map((item) => [String(item._id), item]));
  const seen = new Set();
  const substituteIds = new Set();

  for (const input of inputLines) {
    const key = String(input.orderItemId);
    if (seen.has(key)) throw invalid('The same order item is listed twice.', 'DUPLICATE_ORDER_ITEM');
    seen.add(key);
    const item = itemById.get(key);
    if (!item) throw invalid('One of the lines is not part of this order.', 'ORDER_ITEM_NOT_FOUND');

    const remaining = item.quantity - input.supplyQuantity;
    if (input.substitute) {
      if (remaining <= 0) throw invalid('A substitute needs units the brand cannot supply.', 'SUBSTITUTE_WITHOUT_SHORTAGE');
      if (input.substitute.quantity > remaining) {
        throw invalid('The substitute cannot replace more units than are missing.', 'SUBSTITUTE_TOO_MANY');
      }
      if (String(input.substitute.productId) === String(item.productId)) {
        throw invalid('A substitute must be a different product.', 'SUBSTITUTE_SAME_PRODUCT');
      }
      substituteIds.add(String(input.substitute.productId));
    } else if (remaining <= 0) {
      throw invalid('This line does not change anything.', 'NO_CHANGE');
    }
  }

  const products = substituteIds.size
    ? await Product.find({
        _id: { $in: [...substituteIds] },
        brandId: order.brandId,
        status: 'ACTIVE',
        isActive: true,
      }).session(session)
    : [];
  if (products.length !== substituteIds.size) {
    throw new OrderError(409, 'A substitute product is no longer available.', {
      code: 'SUBSTITUTE_UNAVAILABLE',
    });
  }
  const productById = new Map(products.map((product) => [String(product._id), product]));

  return inputLines.map((input) => {
    const item = itemById.get(String(input.orderItemId));
    const product = input.substitute ? productById.get(String(input.substitute.productId)) : null;
    return {
      orderItemId: item._id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      image: item.image,
      orderedQuantity: item.quantity,
      unitPrice: item.unitPrice,
      supplyQuantity: input.supplyQuantity,
      substitute: product
        ? {
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.price,
            image: product.images && product.images.length ? product.images[0] : undefined,
            quantity: input.substitute.quantity,
          }
        : null,
    };
  });
}

/**
 * Brand proposes a change (docs/21 §H.2). Substitutes are reserved in the
 * same transaction, so an oversold substitute aborts the whole proposal.
 */
async function proposeAdjustment({ brandId, orderId, userId, note, restockRemoved = false, lines }) {
  let order;
  let adjustment;
  try {
    ({ order, adjustment } = await runInTransaction(async (session) => {
      const order = await Order.findOne({ _id: orderId, brandId }).session(session);
      if (!order) throw new OrderError(404, 'Order not found.');

      if (!ADJUSTABLE_STATUSES.includes(order.orderStatus)) {
        throw new OrderError(409, 'This order can no longer be adjusted.', {
          code: 'NOT_ADJUSTABLE',
          orderStatus: order.orderStatus,
        });
      }
      if (order.activeAdjustmentId) {
        throw new OrderError(409, 'There is already a proposal waiting for this order.', {
          code: 'ADJUSTMENT_PENDING',
        });
      }
      // An online order must have been paid before its contents can change
      // (docs/21 §H.4): an unpaid one is on a stock hold and will expire.
      if (order.paymentMethod === 'ONLINE_GATEWAY' && order.paymentStatus !== 'PAID') {
        throw new OrderError(409, 'An online order can only be adjusted after it is paid.', {
          code: 'ONLINE_PAYMENT_NOT_COMPLETED',
        });
      }

      const built = await buildLines(order, lines, { session });
      const { after, afterRemoval } = computeTotals(order, built);
      const now = new Date();

      const [created] = await OrderAdjustment.create(
        [
          {
            orderId: order._id,
            brandId: order.brandId,
            customerId: order.customerId,
            status: 'PROPOSED',
            note,
            lines: built,
            restockRemoved: Boolean(restockRemoved),
            totalsBefore: totalsFrom(order),
            totalsAfter: after,
            totalsAfterRemoval: afterRemoval,
            proposedBy: userId,
            expiresAt: new Date(now.getTime() + WINDOW_MS),
          },
        ],
        { session }
      );

      // Atomic claim: only one proposal can attach to the order, even when two
      // requests race (the partial unique index is the database backstop).
      const claimed = await Order.findOneAndUpdate(
        {
          _id: order._id,
          brandId,
          activeAdjustmentId: null,
          orderStatus: { $in: ADJUSTABLE_STATUSES },
        },
        { $set: { activeAdjustmentId: created._id } },
        { new: false, session }
      );
      if (!claimed) {
        throw new OrderError(409, 'There is already a proposal waiting for this order.', {
          code: 'ADJUSTMENT_PENDING',
        });
      }

      await reserveSubstitutes(created, { session, by: userId });
      return { order, adjustment: created };
    }));
  } catch (err) {
    if (err instanceof InventoryError) {
      throw new OrderError(409, 'A substitute product does not have enough stock.', {
        code: 'SUBSTITUTE_UNAVAILABLE',
      });
    }
    if (err && err.code === 11000) {
      throw new OrderError(409, 'There is already a proposal waiting for this order.', {
        code: 'ADJUSTMENT_PENDING',
      });
    }
    throw err;
  }

  await notifyAdjustmentProposed(adjustment, order);
  return adjustment;
}

async function withdrawAdjustment({ brandId, orderId, adjustmentId, userId }) {
  return runInTransaction(async (session) => {
    const now = new Date();
    const adjustment = await OrderAdjustment.findOneAndUpdate(
      { _id: adjustmentId, orderId, brandId, status: 'PROPOSED' },
      {
        $set: {
          status: 'WITHDRAWN',
          respondedAt: now,
          response: { action: 'WITHDRAWN', by: userId, at: now },
        },
      },
      { new: true, session }
    );
    if (!adjustment) {
      const existing = await OrderAdjustment.findOne({ _id: adjustmentId, orderId, brandId }).session(session);
      if (!existing) throw new OrderError(404, 'Proposal not found.');
      throw notPending(existing);
    }

    await releaseSubstitutes(adjustment, { session, by: userId });
    await Order.updateOne(
      { _id: orderId, brandId, activeAdjustmentId: adjustment._id },
      { $set: { activeAdjustmentId: null } },
      { session }
    );
    return adjustment;
  });
}

// The order lines after the customer's choice: supply units of the original
// product, plus the substitute when the change was accepted. Items not
// mentioned in the proposal are kept untouched.
function rewriteItems(order, adjustment, { accept }) {
  const lineByItem = new Map(adjustment.lines.map((line) => [String(line.orderItemId), line]));
  const items = [];

  for (const item of order.items) {
    const line = lineByItem.get(String(item._id));
    if (!line) {
      items.push(typeof item.toObject === 'function' ? item.toObject() : item);
      continue;
    }

    if (line.supplyQuantity > 0) {
      items.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: line.supplyQuantity,
        unitPrice: line.unitPrice,
        totalPrice: fromCents(toCents(line.unitPrice) * line.supplyQuantity),
        image: item.image,
      });
    }

    if (accept && line.substitute) {
      const substitute = line.substitute;
      items.push({
        productId: substitute.productId,
        productName: substitute.productName,
        sku: substitute.sku,
        quantity: substitute.quantity,
        unitPrice: substitute.unitPrice,
        totalPrice: fromCents(toCents(substitute.unitPrice) * substitute.quantity),
        image: substitute.image,
      });
    }
  }

  const subtotalCents = items.reduce((sum, item) => sum + toCents(item.unitPrice) * item.quantity, 0);
  const feesCents = toCents(order.deliveryFee) + toCents(order.tax) - toCents(order.discount);
  return {
    items,
    subtotal: fromCents(subtotalCents),
    total: fromCents(Math.max(0, subtotalCents + feesCents)),
  };
}

/**
 * Applies the money side of an accepted/removed change:
 *  - COD: the rider collects the new total.
 *  - paid online: the total may not go up; a reduction is recorded as a refund
 *    against the original payment. An unpaid online order can never get here
 *    (proposals on those are refused).
 */
async function applyPaymentChange({ order, newTotal, userId, session, now }) {
  const payment = await Payment.findOne({ orderId: order._id }).session(session);
  if (!payment) {
    throw new OrderError(409, 'This order has no payment record.', { code: 'PAYMENT_NOT_FOUND' });
  }

  let refund = 0;
  if (payment.method === 'ONLINE_GATEWAY') {
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new OrderError(409, 'An online order can only be adjusted after it is paid.', {
        code: 'ONLINE_PAYMENT_NOT_COMPLETED',
      });
    }
    const beforeCents = toCents(order.total);
    const newCents = toCents(newTotal);
    if (newCents > beforeCents) {
      throw new OrderError(409, 'An online order cannot be adjusted to a higher total.', {
        code: 'ADJUSTMENT_INCREASES_TOTAL',
      });
    }

    const difference = beforeCents - newCents;
    if (difference > 0) {
      const refundedCents = toCents(payment.refundedAmount);
      const remainingCents = toCents(payment.amount) - refundedCents;
      if (difference > remainingCents) {
        throw new OrderError(409, 'The refund for this change exceeds the amount paid.', {
          code: 'REFUND_EXCEEDS_PAID',
        });
      }
      const nextRefunded = refundedCents + difference;
      const finalStatus = nextRefunded >= toCents(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      const updated = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: payment.status,
          refundedAmount: refundedCents === 0 ? { $in: [0, null] } : payment.refundedAmount,
        },
        {
          $set: { refundedAmount: fromCents(nextRefunded), status: finalStatus },
          $push: {
            refunds: {
              amount: fromCents(difference),
              reason: 'Order adjusted: items could not be supplied',
              by: userId,
              at: now,
            },
          },
        },
        { new: true, session }
      );
      if (!updated) {
        throw new OrderError(409, 'The payment was changed by another request. Please reload and retry.', {
          code: 'PAYMENT_CHANGED',
        });
      }
      refund = fromCents(difference);
    }
  } else {
    await Payment.updateOne({ _id: payment._id }, { $set: { amount: newTotal } }, { session });
  }

  return refund;
}

// Keeps an already-issued online receipt describing the final order. For COD
// the receipt is issued at delivery, after any adjustment.
async function syncReceipt({ order, items, subtotal, total, session }) {
  await Receipt.updateOne(
    { orderId: order._id },
    {
      $set: {
        items: items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
        subtotal,
        deliveryFee: order.deliveryFee || 0,
        discount: order.discount || 0,
        tax: order.tax || 0,
        amount: total,
      },
    },
    { session }
  );
}

/**
 * Ends the order while a proposal waits (explicit "cancel the whole order", or
 * every line ending up removed). Restocking follows `restock`: an explicit
 * cancellation returns everything, while an all-removed adjustment respects
 * the brand's "units are not sellable" tick.
 */
async function cancelOrderWithAdjustment({ order, adjustment, userId, session, now, restock }) {
  const paid = order.paymentStatus === 'PAID';
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      customerId: order.customerId,
      activeAdjustmentId: adjustment._id,
      orderStatus: { $in: ADJUSTABLE_STATUSES },
    },
    {
      $set: {
        orderStatus: 'CANCELLED',
        paymentStatus: paid ? 'REFUNDED' : 'CANCELLED',
        activeAdjustmentId: null,
      },
      $push: { statusHistory: { status: 'CANCELLED', by: userId, at: now } },
    },
    { new: true, session }
  );
  if (!updatedOrder) {
    throw new OrderError(409, 'The order was changed by another request. Please reload.', {
      code: 'ORDER_CHANGED',
    });
  }

  if (restock) {
    const sorted = [...order.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
    for (const item of sorted) {
      await restockStock(item.productId, item.quantity, { session });
    }
  }
  await releaseSubstitutes(adjustment, { session, by: userId });

  let refund = 0;
  const payment = await Payment.findOne({ orderId: order._id }).session(session);
  if (payment && paid) {
    const refundedCents = toCents(payment.refundedAmount);
    const remainingCents = toCents(payment.amount) - refundedCents;
    if (remainingCents > 0) {
      const updated = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: payment.status,
          refundedAmount: refundedCents === 0 ? { $in: [0, null] } : payment.refundedAmount,
        },
        {
          $set: { status: 'REFUNDED', refundedAmount: payment.amount },
          $push: {
            refunds: {
              amount: fromCents(remainingCents),
              reason: 'Order cancelled after an adjustment proposal',
              by: userId,
              at: now,
            },
          },
        },
        { new: true, session }
      );
      if (!updated) {
        throw new OrderError(409, 'The payment was changed by another request. Please reload.', {
          code: 'PAYMENT_CHANGED',
        });
      }
      refund = fromCents(remainingCents);
    }
  } else if (payment && !paid) {
    await Payment.updateOne({ _id: payment._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { session });
  }

  return { order: updatedOrder, refund };
}

/**
 * The customer answers a proposal (docs/21 §H.3). Only one of the three
 * actions can ever be applied: the PROPOSED -> resolved update is the gate.
 */
async function respondToAdjustment({ customerId, orderId, adjustmentId, action, userId }) {
  const now = new Date();
  const existing = await OrderAdjustment.findOne({ _id: adjustmentId, orderId, customerId });
  if (!existing) throw new OrderError(404, 'Proposal not found.');
  if (existing.status !== 'PROPOSED') throw notPending(existing);
  if (existing.expiresAt.getTime() <= now.getTime()) {
    await expireAdjustmentById(existing._id, now);
    throw new OrderError(409, 'This proposal has expired.', { code: 'ADJUSTMENT_EXPIRED' });
  }

  const outcome = await runInTransaction(async (session) => {
    const adjustment = await OrderAdjustment.findOneAndUpdate(
      { _id: adjustmentId, orderId, customerId, status: 'PROPOSED', expiresAt: { $gt: now } },
      {
        $set: {
          status: RESPONSE_STATUS[action],
          respondedAt: now,
          response: { action, by: userId, at: now },
        },
      },
      { new: true, session }
    );
    if (!adjustment) {
      const current = await OrderAdjustment.findOne({ _id: adjustmentId, orderId, customerId }).session(session);
      throw notPending(current);
    }

    const order = await Order.findOne({ _id: orderId, customerId }).session(session);
    if (!order) throw new OrderError(404, 'Order not found.');

    if (action === 'CANCEL_ORDER') {
      const { order: cancelled, refund } = await cancelOrderWithAdjustment({
        order,
        adjustment,
        userId,
        session,
        now,
        restock: true,
      });
      return { adjustment, order: cancelled, refund, cancelled: true };
    }

    const { items, subtotal, total } = rewriteItems(order, adjustment, {
      accept: action === 'ACCEPT',
    });

    // Everything removed: there is no order left to fulfil.
    if (items.length === 0) {
      const { order: cancelled, refund } = await cancelOrderWithAdjustment({
        order,
        adjustment,
        userId,
        session,
        now,
        restock: adjustment.restockRemoved,
      });
      return { adjustment, order: cancelled, refund, cancelled: true };
    }

    const refund = await applyPaymentChange({
      order,
      newTotal: total,
      userId,
      session,
      now,
    });

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        customerId,
        activeAdjustmentId: adjustment._id,
        orderStatus: { $in: ADJUSTABLE_STATUSES },
      },
      { $set: { items, subtotal, total, activeAdjustmentId: null } },
      { new: true, session }
    );
    if (!updatedOrder) {
      throw new OrderError(409, 'The order was changed by another request. Please reload.', {
        code: 'ORDER_CHANGED',
      });
    }

    if (action === 'ACCEPT') {
      await fulfilSubstitutes(adjustment, { session, by: userId });
    } else {
      await releaseSubstitutes(adjustment, { session, by: userId });
    }
    await restockRemovedUnits(adjustment, { session, by: userId });
    await syncReceipt({ order: updatedOrder, items, subtotal, total, session });

    return { adjustment, order: updatedOrder, refund, cancelled: false };
  });

  if (outcome.cancelled) {
    if (action === 'CANCEL_ORDER') await notifyBrandOfCancelledOrder(outcome.order);
  } else {
    await notifyAdjustmentAnswered(outcome.adjustment, outcome.order);
  }
  if (outcome.refund > 0) {
    await notifyRefundIssued(outcome.order, {
      amount: outcome.refund,
      reason: action === 'CANCEL_ORDER' ? 'Order cancelled after an adjustment proposal' : 'Order adjusted: items could not be supplied',
    });
  }
  return outcome;
}

/**
 * Expires one proposal (the timer or a late answer). The conditional update
 * makes it safe against a simultaneous answer or withdrawal.
 */
async function expireAdjustmentById(adjustmentId, now = new Date()) {
  let order = null;
  const adjustment = await runInTransaction(async (session) => {
    const expired = await OrderAdjustment.findOneAndUpdate(
      { _id: adjustmentId, status: 'PROPOSED', expiresAt: { $lte: now } },
      {
        $set: {
          status: 'EXPIRED',
          respondedAt: now,
          response: { action: 'EXPIRED', at: now },
        },
      },
      { new: true, session }
    );
    if (!expired) return null;

    await releaseSubstitutes(expired, { session });
    order = await Order.findOneAndUpdate(
      { _id: expired.orderId, activeAdjustmentId: expired._id },
      { $set: { activeAdjustmentId: null } },
      { new: true, session }
    );
    return expired;
  });

  if (adjustment) {
    await notifyAdjustmentExpired(adjustment, order);
  }
  return adjustment;
}

// Called by the server timer (jobs/adjustmentExpiry.js). Safe to run twice and
// on several servers: each proposal is expired by one conditional update.
async function expireAdjustments(now = new Date()) {
  const due = await OrderAdjustment.find({ status: 'PROPOSED', expiresAt: { $lte: now } })
    .select('_id')
    .limit(50);
  let expired = 0;
  for (const { _id } of due) {
    const result = await expireAdjustmentById(_id, now);
    if (result) expired += 1;
  }
  return expired;
}

module.exports = {
  proposeAdjustment,
  withdrawAdjustment,
  respondToAdjustment,
  expireAdjustmentById,
  expireAdjustments,
  ADJUSTABLE_STATUSES,
  WINDOW_MS,
};
