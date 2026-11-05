const mongoose = require('mongoose');
const { RETURN_REASONS } = require('../config/returns');

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

// The rider's answer at the door, held until a non-cash payment is checked
// (docs/10 §31). `itemId` is an Order item id, not an Order id.
const pendingCompletionLineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    acceptedQty: { type: Number, required: true, min: 0 },
    rejectedQty: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: RETURN_REASONS },
    photo: {
      publicId: { type: String, trim: true },
      fingerprint: { type: String, trim: true },
    },
  },
  { _id: false }
);

// Not every completion sends lines (omitting them means everything was
// accepted), so the array is absent rather than empty in that case.
const pendingCompletionSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    lines: { type: [pendingCompletionLineSchema], default: undefined },
    netTotal: { type: Number, min: 0 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    // The brand refused this proof; the rider is asked to collect again. The
    // door answer is kept so the retry does not have to be given again.
    rejectedAt: { type: Date },
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
    // The door return created when the customer refused goods (docs/22 §F).
    // Present only for a partial or fully refused delivery.
    returnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Return',
      default: null,
    },
    // A non-cash payment was taken and the delivery waits for the brand's
    // verification. Internal only: never selected by default, so no brand,
    // rider or customer view can leak the stored answer by accident.
    pendingCompletion: {
      type: pendingCompletionSchema,
      select: false,
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