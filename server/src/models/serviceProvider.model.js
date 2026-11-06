const mongoose = require('mongoose');

const geoPointSchema = require('./geoPoint.schema');
const {
  PROVIDER_STATUSES,
  PROVIDER_VERIFICATIONS,
  BILLING_STATUSES,
} = require('../config/serviceProviderStatuses');

/**
 * ServiceProvider model — a tenant of its own (docs/24 §4.1).
 *
 * A provider is brand-like for sessions and billing but is NOT a brand: it
 * never holds a brandId, has one owner (User with role SERVICE_PROVIDER) and
 * works in exactly one block at a time.
 */

const blockHistorySchema = new mongoose.Schema(
  {
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Block', required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const serviceProviderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    displayName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    // Public URL key; derived once from displayName and then immutable.
    slug: { type: String, required: true, lowercase: true, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      required: true,
      index: true,
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
      index: true,
    },
    // The provider's own pin, inside blockId. It may be a home address, so
    // the public page only shows the block until a booking is accepted.
    location: { type: geoPointSchema, required: true },
    addressLine: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true },
    bio: { type: String, trim: true },
    avatar: { type: String, trim: true },
    coverImage: { type: String, trim: true },
    // Display floor only, in paisa (PKR minor units). The binding price is
    // the proposal the customer accepts (docs/24 §4.2).
    startingAtPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: PROVIDER_STATUSES,
      default: 'PENDING',
      index: true,
    },
    verification: {
      type: String,
      enum: PROVIDER_VERIFICATIONS,
      default: 'UNVERIFIED',
    },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completedBookings: { type: Number, default: 0, min: 0 },
    rankScore: { type: Number, default: 0 },
    billingStatus: {
      type: String,
      enum: BILLING_STATUSES,
      default: 'ACTIVE',
    },
    // The calendar month of the last BLOCK change (not a pin move inside the
    // same block); the provider may change block once per month.
    blockChangedAt: { type: Date },
    blockHistory: { type: [blockHistorySchema], default: [] },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

serviceProviderSchema.index({ userId: 1 }, { unique: true });
serviceProviderSchema.index({ slug: 1 }, { unique: true });
serviceProviderSchema.index({ location: '2dsphere' });

const ServiceProvider = mongoose.model('ServiceProvider', serviceProviderSchema);

module.exports = ServiceProvider;
