const mongoose = require('mongoose');

/**
 * ServiceOffering model — one full-service item a provider sells (docs/24 §4.2).
 *
 * The provider tenant owns every offering. `categoryId` is copied from the
 * provider at creation and is never accepted from the client, so an offering
 * cannot be moved into another category behind the super admin's back.
 *
 * The listed price is a display floor ("starting at"); the binding price is
 * the proposal the customer accepts in Phase 2c.
 */
const serviceOfferingSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProvider',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    // Derived from the title once; stable afterwards so links do not move.
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    images: { type: [String], default: [] },
    // Paisa (PKR minor units), like every other price in v3.
    startingAtPrice: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 15, max: 1440 },
    // Flexible per-service details (e.g. rooms, area size), docs/24 §4.2.
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Slugs are unique per provider, not globally: two providers may each offer
// "Deep cleaning".
serviceOfferingSchema.index({ providerId: 1, slug: 1 }, { unique: true });
serviceOfferingSchema.index({ providerId: 1, isActive: 1, createdAt: -1 });

const ServiceOffering = mongoose.model('ServiceOffering', serviceOfferingSchema);

module.exports = ServiceOffering;
