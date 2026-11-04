const mongoose = require('mongoose');

/**
 * Category model: ONE global tree owned by the platform (super admin), two
 * levels deep (category -> subcategory). Brands do not create categories; they
 * choose a leaf category for each product.
 *
 * Changed in Marketplace v2 Phase 1 (docs/22): categories used to belong to a
 * single brand (`brandId`).
 */
const categorySchema = new mongoose.Schema(
  {
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
    // null = top-level. A parent must itself be top-level (two levels only).
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    // Display order inside the same parent (lower first, then by name).
    order: {
      type: Number,
      default: 0,
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

// A slug is unique among SIBLINGS (same parent). Two different parents may each
// have a subcategory called "Other". Enforced here so concurrent requests can't
// slip past the service-layer check.
categorySchema.index({ parentId: 1, slug: 1 }, { unique: true });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
