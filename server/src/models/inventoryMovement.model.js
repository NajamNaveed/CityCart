const mongoose = require('mongoose');
const { ADJUSTMENT_STOCK_REASONS } = require('../config/inventoryReasons');

/**
 * InventoryMovement — the ledger of stock movements that belong to order
 * adjustments (docs/21 §H.4, docs/09 §6). Every reservation, release,
 * conversion into a sale and restock is one immutable row, so a brand can
 * always see why a product's stock changed.
 *
 * quantityChange is the physical stock change; reservedChange is the change
 * to the reserved amount. A reservation changes only reservedQuantity, a
 * fulfilment changes both (the reserved unit becomes a sale), and a restock
 * changes only quantity.
 */
const inventoryMovementSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    adjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderAdjustment' },
    reason: { type: String, enum: ADJUSTMENT_STOCK_REASONS, required: true },
    quantityChange: { type: Number, default: 0 },
    reservedChange: { type: Number, default: 0 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

inventoryMovementSchema.index({ productId: 1, createdAt: -1 });
inventoryMovementSchema.index({ orderId: 1, createdAt: -1 });
inventoryMovementSchema.index({ adjustmentId: 1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
