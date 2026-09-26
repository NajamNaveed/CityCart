const mongoose = require('mongoose');

/**
 * Delivery model — tracked separately from Order and Payment.
 *
 * Source of truth: docs/04-database-design.md, §25a (Delivery Model),
 * and docs/11-delivery-system.md §9 (delivery statuses). Address
 * snapshot shape from docs/08-order-management.md §10, since §25a says
 * Delivery.address is "captured the same way as Order.shippingAddress."
 *
 * Delivery status, order status, and payment status are three separate
 * fields (§25a) and must never be merged.
 */
const DELIVERY_STATUSES = [
  'PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'RETURNED',
];

// Kept in sync in shape with Order.shippingAddress (see order.model.js).
const addressSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String },
    postalCode: { type: String },
    additionalInstructions: { type: String },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    // §35 data integrity rule 6a: brandId must match the order's brandId.
    // Enforcing the cross-document match itself is checkout/service logic
    // (out of scope here); this field just stores it.
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
    status: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: 'PENDING',
      index: true,
    },
    address: {
      type: addressSnapshotSchema,
      required: true,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    trackingReference: {
      type: String,
      trim: true,
      index: true,
    },
    assignedAgent: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Delivery = mongoose.model('Delivery', deliverySchema);

module.exports = Delivery;