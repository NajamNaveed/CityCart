const mongoose = require('mongoose');

/**
 * Category model — brand-scoped product categories, optionally
 * hierarchical via parentId.
 *
 * Source of truth: docs/04-database-design.md, §13 (Category Model).
 */
const categorySchema = new mongoose.Schema(
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
    image: {
      type: String,
      trim: true,
    },
    // Allows hierarchical categories (§13 example: Electronics > Phones).
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
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

// Slugs are unique PER BRAND, not globally (docs/04 — two brands may each
// have a category named "Phones"). This enforces it at the MongoDB level so
// concurrent requests can't slip past the service-layer findOne check in
// services/category.service.js.
categorySchema.index({ brandId: 1, slug: 1 }, { unique: true });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;