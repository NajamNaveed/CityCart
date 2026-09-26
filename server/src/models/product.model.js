const mongoose = require('mongoose');

/**
 * Product model.
 *
 * Source of truth: docs/04-database-design.md, §14 (Product Model), §15
 * (Product Ownership), §16 (Product Pricing), §17 (Product Attributes).
 *
 * Whether stock is tracked lives on Inventory.trackInventory, not here
 * (§14 explicitly calls this out to avoid two documents disagreeing).
 *
 * `attributes` is intentionally Mixed/flexible per §17 ("the exact
 * product-attribute architecture can be expanded when variants are
 * implemented").
 */
const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

const productSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    // The product's current selling price (§16). Historical order prices
    // are captured separately as a snapshot on the Order Item — this
    // field must never be treated as authoritative for past orders.
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      min: 0,
    },
    sku: {
      type: String,
      trim: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: PRODUCT_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;