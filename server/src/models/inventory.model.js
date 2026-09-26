const mongoose = require('mongoose');

/**
 * Inventory model.
 *
 * Source of truth: docs/04-database-design.md, §18 (Inventory Model) and
 * §19 (Inventory Rules).
 *
 * `availableQuantity` is documented as conceptually `quantity -
 * reservedQuantity`, with the doc explicitly allowing either a stored or
 * calculated value ("the exact implementation may calculate rather than
 * permanently store derived values"). This schema stores it (matching
 * the explicit field list in §18) and derives it automatically via a
 * pre-validate hook, so it can never drift out of sync with
 * quantity/reservedQuantity. This is a data-consistency safeguard on the
 * model itself, not order/checkout business logic (which stays out of
 * scope here per §19 — "Inventory operations should be handled by
 * backend services rather than directly by controllers").
 */
const inventorySchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    availableQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Single authoritative flag for whether this product's stock is
    // tracked (§14, §18). When false, checkout should skip
    // quantity/availability checks for this product.
    trackInventory: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.pre('validate', function deriveAvailableQuantity(next) {
  this.availableQuantity = this.quantity - this.reservedQuantity;
  next();
});

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;