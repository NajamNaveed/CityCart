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
 * Marketplace v2 (docs/22): a Product is a store's LISTING of a shared
 * CatalogProduct. `name`, `description`, `images` and `categoryId` are copied
 * from the catalogue item when the listing is created and refreshed whenever the
 * catalogue item changes, so every reader (cart, orders, shop pages, search)
 * keeps working unchanged. The store only sets its own price, stock, SKU and
 * branches.
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
    catalogProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogProduct',
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
    // Which of the brand's branches carry this product. EMPTY means every
    // branch (the default), so a product keeps appearing at new branches until
    // the brand narrows it. Stock stays brand-wide (see Inventory); this only
    // decides where shoppers can find the product.
    branchIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Slugs are unique PER BRAND, not globally (docs/04 — two brands may each
// sell a product with the same name). This enforces it at the MongoDB level
// so concurrent requests can't slip past the service-layer findOne check in
// services/product.service.js.
productSchema.index({ brandId: 1, slug: 1 }, { unique: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
// Exposed so validators/product.validator.js can build its status enum
// from the same single source of truth instead of a second, drift-prone
// copy (same pattern as config/roles.js, config/brandStatuses.js).
// Nothing previously imported product.model.js (Phase 7 is the first
// consumer), so this is purely additive — `require('./product.model')`
// still returns the Mongoose model exactly as before.
module.exports.STATUSES = PRODUCT_STATUSES;