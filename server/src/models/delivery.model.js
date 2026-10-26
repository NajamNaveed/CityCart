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
const { DELIVERY_STATUSES } = require('../config/deliveryStatuses');

// Kept in sync in shape with Order.shippingAddress (see order.model.js).
const addressSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String },
    state: { type: String },
    country: { type: String },
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
    // The rider (User, role RIDER, same brand) who delivers this order
    // (docs/11 §12, docs/20). assignedAgent keeps the display name: it is set
    // to the rider's name on assignment, or typed by hand when no rider is used.
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: {
      type: Date,
    },
    // Six-digit proof-of-delivery code (docs/11 §19). Shown only to the
    // customer, never to the brand or rider, and never returned by default
    // (select: false): the rider types it in to complete the delivery.
    deliveryCode: {
      type: String,
      select: false,
    },
    // Wrong codes entered so far; the code locks at MAX_CODE_ATTEMPTS.
    codeAttempts: {
      type: Number,
      default: 0,
      min: 0,
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

// A rider's own deliveries, by progress.
deliverySchema.index({ riderId: 1, status: 1 });

const Delivery = mongoose.model('Delivery', deliverySchema);

module.exports = Delivery;