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
 * permanently store derived values").
 *
 * PHASE 8 REVIEW CORRECTION: this used to be a stored field, kept in sync
 * by a `pre('validate')` hook. That hook only runs on `.save()` /
 * `.create()` — NEVER on `findOneAndUpdate`, which is how every write in
 * services/inventory.service.js mutates stock (required for atomicity;
 * see that file's header comment). So the stored value could only ever
 * be trusted immediately after `ensureInventory`'s upsert, and would
 * silently go stale the moment any $inc-based update ran — exactly the
 * class of drift the doc's "may calculate rather than store" escape
 * hatch exists to avoid. It is now a virtual (computed, never persisted)
 * so `quantity` and `reservedQuantity` are the only authoritative,
 * stored numbers, and availableQuantity can never disagree with them.
 *
 * Concurrency guards that used to compare the stored `availableQuantity`
 * in an update's filter now use MongoDB's `$expr` to compare
 * `quantity - reservedQuantity` directly, still evaluated atomically by
 * the database as part of the same findOneAndUpdate — this does not
 * change the atomicity guarantees described in
 * services/inventory.service.js.
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
    // So `.toObject()` / `.toJSON()` (used by
    // services/inventory.service.js#serializeInventory for API responses)
    // include the virtual below, the same shape the field used to have.
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Computed, never persisted — see the model-level comment above.
inventorySchema.virtual('availableQuantity').get(function getAvailableQuantity() {
  return this.quantity - this.reservedQuantity;
});

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;