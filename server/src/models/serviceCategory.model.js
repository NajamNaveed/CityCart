const mongoose = require('mongoose');

/**
 * ServiceCategory model — the catalogue tree service providers choose from
 * (docs/24 §4.2). Same shape as product Category so the admin conventions
 * (slug, parent, order, image, active flag) stay consistent.
 */
const serviceCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Derived from the name once; used in public URLs and never accepted
    // from a client on update.
    slug: { type: String, required: true, lowercase: true, trim: true },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      default: null,
      index: true,
    },
    order: { type: Number, default: 0, min: 0 },
    image: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceCategorySchema.index({ slug: 1 }, { unique: true });
serviceCategorySchema.index({ parentId: 1, order: 1 });

const ServiceCategory = mongoose.model('ServiceCategory', serviceCategorySchema);

module.exports = ServiceCategory;
