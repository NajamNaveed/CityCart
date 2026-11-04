const mongoose = require('mongoose');
const { RETURN_SOURCES, RETURN_STATUSES, RETURN_REASONS } = require('../config/returns');

/**
 * A Return is the goods a customer refused at the door (docs/22 §F). It is
 * deliberately separate from OrderAdjustment (a change proposed before
 * delivery) and from the delivery status: the order lines stay a historical
 * snapshot, while the return records what came back and why.
 *
 * The rider creates it inside the delivery-completion transaction, so a
 * delivery can never be DELIVERED/RETURNED without its return record. The
 * store later marks it RECEIVED and decides, per line, whether the goods go
 * back into stock or are written off.
 */
const returnLineSchema = new mongoose.Schema(
  {
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: { type: String, required: true },
    // Snapshot at delivery time, like the order line.
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    // Optional private photo of the refused item, taken by the rider.
    photo: {
      publicId: { type: String, trim: true },
      fingerprint: { type: String, trim: true },
    },
    // The store's decision when it receives the goods. Write-off is the safe
    // default: damaged or missing goods must not re-enter stock by accident.
    restock: { type: Boolean, default: false },
    restockedAt: { type: Date, default: null },
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
      unique: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    source: { type: String, enum: RETURN_SOURCES, default: 'DOOR' },
    status: { type: String, enum: RETURN_STATUSES, default: 'IN_TRANSIT', index: true },
    lines: {
      type: [returnLineSchema],
      required: true,
      validate: {
        validator: (lines) => Array.isArray(lines) && lines.length > 0,
        message: 'A return must contain at least one line.',
      },
    },
    // Value of the refused goods, and the delivery fee when the whole order was
    // rejected for a store-fault reason. Kept as a record even when nothing is
    // refunded (cash was simply not collected).
    returnedSubtotal: { type: Number, required: true, min: 0 },
    feeRefunded: { type: Boolean, default: false },
    refundAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'PKR' },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

returnSchema.index({ brandId: 1, status: 1, createdAt: -1 });
returnSchema.index({ customerId: 1, createdAt: -1 });

const Return = mongoose.model('Return', returnSchema);

module.exports = Return;
