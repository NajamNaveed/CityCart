const mongoose = require('mongoose');
const geoPointSchema = require('./geoPoint.schema');

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
const { ORDER_STATUSES } = require('../config/orderStatuses');
const { PICK_STATUSES } = require('../config/pickStatuses');
const { FULFILMENTS } = require('../config/returns');

// Payment status is tracked independently of order status (§25, §27) —
// these must never be merged into a single field.
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];

// COD is the only method a customer chooses in v3; the door collection methods
// (docs/10 §4) are recorded on the payment, not here.
const PAYMENT_METHODS = ['COD', 'CARD', 'BANK_TRANSFER', 'WALLET'];

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
  // Filled in while the order is picked (docs/22 §E). A line without a status
  // has not been looked at yet; `pickedQty` is meaningful for SHORT.
  pickStatus: {
    type: String,
    enum: PICK_STATUSES,
  },
  pickedQty: {
    type: Number,
    min: 0,
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
    state: { type: String },
    country: { type: String },
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
    // Where it is delivered (the pin) and the blocks that held the pin when the
    // order was placed. `addressId` is the saved address it came from, if any; the
    // snapshot above is what the order keeps, so editing that address changes nothing here.
    deliveryLocation: { type: geoPointSchema },
    deliveryBlockIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Block' }],
      default: undefined,
    },
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address' },
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
    // Explicit currency (docs/08 §13) — never inferred from formatting.
    currency: {
      type: String,
      default: 'PKR',
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'PENDING',
      index: true,
    },
    // The waiting adjustment proposal (docs/21 §H), if any. Guarded by an
    // atomic compare-and-set when a proposal is sent and cleared when it is
    // resolved; also gates moving the order to READY_FOR_SHIPMENT.
    activeAdjustmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrderAdjustment',
      default: null,
    },
    // The picker who took the order and when; `packedAt` is set when the
    // packed order becomes READY_FOR_SHIPMENT (docs/22 §E).
    pickerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    pickStartedAt: { type: Date, default: null },
    packedAt: { type: Date, default: null },
    // Door returns (docs/22 §F). Set once when the delivery completes: how much
    // of the order actually arrived (FULL/PARTIAL/NONE), the value of the refused
    // goods, the fee when it was refunded, and the final amount the customer owes
    // (or, when prepaid, keeps). Older orders have no netTotal; readers fall back
    // to `total`.
    fulfilment: {
      type: String,
      enum: FULFILMENTS,
    },
    returnedAmount: { type: Number, default: 0, min: 0 },
    feeRefunded: { type: Boolean, default: false },
    netTotal: { type: Number, min: 0 },
    // Audit trail (docs/08 §36): who moved the order to which status, when.
    statusHistory: {
      type: [
        new mongoose.Schema(
          {
            status: { type: String, required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
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
orderSchema.index({ brandId: 1, orderStatus: 1, pickerId: 1 });
orderSchema.index({ brandId: 1, createdAt: 1 });
orderSchema.index({ createdAt: 1 });
// Compound index example from §34, for "a customer's orders, newest
// first" query pattern.
orderSchema.index({ customerId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;