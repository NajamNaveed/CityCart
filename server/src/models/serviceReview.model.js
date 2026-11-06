const mongoose = require('mongoose');

/**
 * ServiceReview — a review of one confirmed booking (docs/24 §4.6).
 *
 * Separate from product Review: the customer of a CONFIRMED booking may write
 * one review, and the provider may reply once. Moderation is the same simple
 * `isApproved` flag the product reviews use.
 */
const replySchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MAX_COMMENT_LENGTH = 2000;

const serviceReviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceBooking',
      required: true,
      unique: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider', required: true, index: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'rating must be an integer between 1 and 5.' },
    },
    comment: { type: String, trim: true, maxlength: MAX_COMMENT_LENGTH },
    providerReply: { type: replySchema, default: null },
    isApproved: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceReviewSchema.index({ providerId: 1, isApproved: 1, createdAt: -1 });

const ServiceReview = mongoose.model('ServiceReview', serviceReviewSchema);
ServiceReview.MAX_COMMENT_LENGTH = MAX_COMMENT_LENGTH;

module.exports = ServiceReview;
