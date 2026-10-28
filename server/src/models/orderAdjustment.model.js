const mongoose = require('mongoose');

/**
 * OrderAdjustment — a brand's offer to change an order it cannot fully
 * supply (docs/21 §H). At most one is PROPOSED per order at a time (partial
 * unique index below); the order carries activeAdjustmentId as the gate.
 *
 * Every line is a snapshot: the units the brand can supply of the original
 * product, plus optionally a same-brand substitute at the price that was
 * current when the proposal was sent. The customer's answer rewrites the
 * order from these snapshots; the original totals stay here as history.
 */
const ADJUSTMENT_STATUSES = [
  'PROPOSED',
  'ACCEPTED',
  'REMOVED',
  'ORDER_CANCELLED',
  'WITHDRAWN',
  'EXPIRED',
];

const RESPONSE_ACTIONS = [
  'ACCEPT',
  'REMOVE',
  'CANCEL_ORDER',
  'WITHDRAWN',
  'EXPIRED',
  'ORDER_CLOSED',
];

const totalsSchema = new mongoose.Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const substituteSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    image: { type: String },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const adjustmentLineSchema = new mongoose.Schema(
  {
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String },
    image: { type: String },
    orderedQuantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    supplyQuantity: { type: Number, required: true, min: 0 },
    substitute: { type: substituteSchema, default: null },
  },
  { _id: false }
);

const reservationSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const responseSchema = new mongoose.Schema(
  {
    action: { type: String, enum: RESPONSE_ACTIONS, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const orderAdjustmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ADJUSTMENT_STATUSES, default: 'PROPOSED', index: true },
    note: { type: String, required: true, trim: true, maxlength: 500 },
    lines: {
      type: [adjustmentLineSchema],
      required: true,
      validate: {
        validator: (lines) => Array.isArray(lines) && lines.length > 0,
        message: 'An adjustment must contain at least one line.',
      },
    },
    // Substitute stock actually reserved (tracked products only), released or
    // converted exactly once when the proposal is resolved.
    stockReservations: { type: [reservationSchema], default: [] },
    // Whether the units the brand cannot supply go back into stock. Default
    // off: units that are missing or damaged are not sellable.
    restockRemoved: { type: Boolean, default: false },
    totalsBefore: { type: totalsSchema, required: true },
    // The two totals the customer is choosing between, both computed server-side.
    totalsAfter: { type: totalsSchema, required: true },
    totalsAfterRemoval: { type: totalsSchema, required: true },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
    response: { type: responseSchema, default: null },
  },
  { timestamps: true }
);

// One waiting proposal per order, enforced by the database (a race between two
// proposals cannot create two). Resolved proposals stay as history.
orderAdjustmentSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: 'PROPOSED' } }
);
// The expiry sweep and the order-detail history.
orderAdjustmentSchema.index({ status: 1, expiresAt: 1 });
orderAdjustmentSchema.index({ orderId: 1, createdAt: -1 });

const OrderAdjustment = mongoose.model('OrderAdjustment', orderAdjustmentSchema);

module.exports = OrderAdjustment;
module.exports.ADJUSTMENT_STATUSES = ADJUSTMENT_STATUSES;
module.exports.RESPONSE_ACTIONS = RESPONSE_ACTIONS;
