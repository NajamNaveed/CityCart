const Order = require('../models/order.model');
const OrderAdjustment = require('../models/orderAdjustment.model');
const InventoryMovement = require('../models/inventoryMovement.model');
const {
  reserveStock,
  releaseStock,
  convertReservedStock,
  restockStock,
} = require('./inventory.service');

/**
 * Stock side of an adjustment (docs/21 §H.4). Substitute stock is reserved
 * when the proposal is sent and then either converted into a sale (accepted),
 * released (declined, withdrawn, expired, or the order ended), while the
 * original units the brand cannot supply go back into stock only if the brand
 * ticked that option. Every movement is written to the InventoryMovement
 * ledger in the SAME transaction as the stock change.
 */

function substituteQuantities(adjustment) {
  const byProduct = new Map();
  for (const line of adjustment.lines || []) {
    if (!line.substitute) continue;
    const id = String(line.substitute.productId);
    byProduct.set(id, (byProduct.get(id) || 0) + line.substitute.quantity);
  }
  return [...byProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function removedQuantities(adjustment) {
  const byProduct = new Map();
  for (const line of adjustment.lines || []) {
    const removed = line.orderedQuantity - line.supplyQuantity;
    if (removed <= 0) continue;
    const id = String(line.productId);
    byProduct.set(id, (byProduct.get(id) || 0) + removed);
  }
  return [...byProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

async function recordMovements(adjustment, entries, { session, by }) {
  if (entries.length === 0) return;
  await InventoryMovement.create(
    entries.map((entry) => ({
      ...entry,
      brandId: adjustment.brandId,
      orderId: adjustment.orderId,
      adjustmentId: adjustment._id,
      by,
    })),
    { session, ordered: true }
  );
}

/** Reserves the substitutes and records what was actually reserved. */
async function reserveSubstitutes(adjustment, { session, by } = {}) {
  const reservations = [];
  const movements = [];
  for (const { productId, quantity } of substituteQuantities(adjustment)) {
    const result = await reserveStock(productId, quantity, { session });
    if (!result.reserved) continue; // untracked products need no reservation
    reservations.push({ productId, quantity });
    movements.push({ productId, reason: 'SUBSTITUTION_RESERVED', reservedChange: quantity });
  }

  adjustment.stockReservations = reservations;
  await adjustment.save({ session });
  await recordMovements(adjustment, movements, { session, by });
}

/** Returns reserved substitute stock (decline, withdrawal, expiry, closed order). */
async function releaseSubstitutes(adjustment, { session, by } = {}) {
  const movements = [];
  for (const { productId, quantity } of adjustment.stockReservations || []) {
    await releaseStock(productId, quantity, { session });
    movements.push({ productId, reason: 'SUBSTITUTION_RELEASED', reservedChange: -quantity });
  }
  await recordMovements(adjustment, movements, { session, by });
}

/** The customer accepted the substitute: reserved units become sold units. */
async function fulfilSubstitutes(adjustment, { session, by } = {}) {
  const movements = [];
  for (const { productId, quantity } of adjustment.stockReservations || []) {
    await convertReservedStock(productId, quantity, { session });
    movements.push({
      productId,
      reason: 'SUBSTITUTION_FULFILLED',
      quantityChange: -quantity,
      reservedChange: -quantity,
    });
  }
  await recordMovements(adjustment, movements, { session, by });
}

/** Units the brand could not supply go back into stock, only if it asked. */
async function restockRemovedUnits(adjustment, { session, by } = {}) {
  if (!adjustment.restockRemoved) return;
  const movements = [];
  for (const { productId, quantity } of removedQuantities(adjustment)) {
    await restockStock(productId, quantity, { session });
    movements.push({ productId, reason: 'ADJUSTMENT_RESTOCKED', quantityChange: quantity });
  }
  await recordMovements(adjustment, movements, { session, by });
}

/**
 * The order ended (customer cancellation, brand rejection) while a proposal
 * was waiting: the proposal becomes history and its reservation is released.
 * Called inside the transaction that changes the order status.
 */
async function closeActiveAdjustment(order, { session, by } = {}) {
  if (!order.activeAdjustmentId) return null;
  const now = new Date();
  const adjustment = await OrderAdjustment.findOneAndUpdate(
    { _id: order.activeAdjustmentId, status: 'PROPOSED' },
    {
      $set: {
        status: 'ORDER_CANCELLED',
        respondedAt: now,
        response: { action: 'ORDER_CLOSED', by, at: now },
      },
    },
    { new: true, session }
  );
  if (adjustment) {
    await releaseSubstitutes(adjustment, { session, by });
  }
  await Order.updateOne(
    { _id: order._id, activeAdjustmentId: order.activeAdjustmentId },
    { $set: { activeAdjustmentId: null } },
    { session }
  );
  return adjustment;
}

// History for the order detail screens (newest first). Access is decided by
// the caller: the order was already scoped to the user/brand before this.
function listAdjustmentsForOrder(orderId) {
  return OrderAdjustment.find({ orderId }).sort({ createdAt: -1 });
}

module.exports = {
  reserveSubstitutes,
  releaseSubstitutes,
  fulfilSubstitutes,
  restockRemovedUnits,
  closeActiveAdjustment,
  listAdjustmentsForOrder,
  substituteQuantities,
  removedQuantities,
};
