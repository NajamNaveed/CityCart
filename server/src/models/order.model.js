const mongoose = require('mongoose');

/**
 * Order model — one of the most important entities in CityCart.
 *
 * Source of truth: docs/04-database-design.md, §22 (Order Model), §23
 * (Order Items), §24 (Multi-Brand Order Splitting), §25 (Order Status).
 * Address snapshot shape from docs/08-order-management.md §10 (Customer
 * Address Snapshot).
 *
 * Every order belongs to exactly one brand (a multi-brand cart is split
 * into multiple Order documents by the checkout service — not
 * implemented here, see §24). Order items and the shipping address are
 * embedded historical snapshots (§23, §32) so a later product-price or
 * profile change never alters an existing order.
 */
const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
];

// Payment status is tracked independently of order status (§25, §27) —
// these must never be merged into a single field.
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'];

// COD is the only method implemented in the MVP; the others are
// documented future methods (docs/04-database-design.md §26).
const PAYMENT_METHODS = ['COD', 'CARD', 'BANK_TRANSFER', 'WALLET', 'ONLINE_GATEWAY'];

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  // Historical snapshot fields (§23) — must not be re-derived from the
  // current Product document.
  productName: {
    type: String,
    required: true,
  },
  sku: {
    type: String,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
  },
});

// Snapshot of delivery information used at checkout (docs/08 §10). Kept
// in sync in shape with Delivery.address, which is documented as
// "captured the same way."
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

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'An order must contain at least one item.',
      },
    },
    shippingAddress: {
      type: addressSnapshotSchema,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'PENDING',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index example from §34, for the common
// "a brand's orders by status" query pattern.
orderSchema.index({ brandId: 1, orderStatus: 1 });
// Compound index example from §34, for "a customer's orders, newest
// first" query pattern.
orderSchema.index({ customerId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;