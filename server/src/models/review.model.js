const mongoose = require('mongoose');

/**
 * Review model.
 *
 * Source of truth: docs/04-database-design.md, §28 (Review Model). Rating
 * scale (1-5, integer-only) confirmed against
 * docs/13-review-and-rating-system.md §4.
 *
 * NOTE — unresolved documentation conflict (flagged, not silently
 * resolved): docs/13-review-and-rating-system.md §7 describes a richer
 * moderation workflow (PENDING → PUBLISHED/REJECTED/HIDDEN) plus a
 * verifiedPurchase field, neither of which appears in doc04 §28's field
 * list (which has a simple `isApproved` boolean instead). This task's
 * instructions scoped reading to docs/04-database-design.md and
 * docs/18-development-roadmap.md, so this schema follows doc04 literally.
 * Reconciling the two review-moderation models is a human decision for
 * whichever phase implements the actual Review & Rating feature.
 *
 * "A review should be associated with a real customer purchase" and "the
 * customer should not be able to create unlimited reviews for the same
 * qualifying purchase" (§28) are business rules enforced by a future
 * service, not by this schema.
 */
const reviewSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'rating must be an integer between 1 and 5.',
      },
    },
    title: {
      type: String,
      trim: true,
    },
    comment: {
      type: String,
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;