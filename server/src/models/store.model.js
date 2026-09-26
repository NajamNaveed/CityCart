const mongoose = require('mongoose');

/**
 * Store model — a brand's primary online storefront.
 *
 * Source of truth: docs/04-database-design.md, §11 (Store Model).
 *
 * `address`, `contact`, and `businessHours` are loosely typed (Mixed) for
 * the same reason as Brand.contact/settings — the docs name these fields
 * without specifying a fixed sub-shape yet.
 */
const storeSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
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
    address: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    contact: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    businessHours: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    logo: {
      type: String,
      trim: true,
    },
    banner: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Store = mongoose.model('Store', storeSchema);

module.exports = Store;