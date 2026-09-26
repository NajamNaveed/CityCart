const mongoose = require('mongoose');

/**
 * Brand model — the primary tenant in CityCart.
 *
 * Source of truth: docs/04-database-design.md, §9 (Brand Model) and §10
 * (Brand Ownership).
 *
 * `contact` and `settings` are intentionally loosely typed (Mixed): the
 * docs list them as fields but do not yet specify a fixed sub-shape (see
 * docs/01-product-requirements.md §8 — contact info, opening hours,
 * delivery settings are mentioned at a feature level only). Enforcing an
 * invented sub-schema here would be a business-rule assumption beyond
 * what's documented.
 */
const BRAND_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'];

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    // A new brand starts PENDING until an authorized Super Admin approves
    // it (§9 — "Only an authorized Super Admin can perform platform-level
    // brand approval or suspension").
    status: {
      type: String,
      enum: BRAND_STATUSES,
      default: 'PENDING',
      index: true,
    },
    contact: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Brand = mongoose.model('Brand', brandSchema);

module.exports = Brand;