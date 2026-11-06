const mongoose = require('mongoose');

const geoPointSchema = require('./geoPoint.schema');
const { SERVICE_BOOKING_STATUSES } = require('../config/serviceBookingStatuses');

/**
 * ServiceBooking — one full-service job between one customer and one provider
 * (docs/24 §4.4). Service bookings use their own collection, never Order (D11).
 *
 * Money is in paisa. The listing price is only a floor; `agreedPricePaisa` is
 * the binding price agreed with the customer, and `finalAmountPaisa` is what
 * the provider states at completion. No internal payment is recorded here.
 *
 * The address is a snapshot: editing a saved address later never changes a
 * booking that is already on the calendar.
 */
const offeringSnapshotSchema = new mongoose.Schema(
  {
    offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceOffering', required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 1440 },
    startingAtPrice: { type: Number, required: true, min: 0 },
    image: { type: String, trim: true },
  },
  { _id: false }
);

const bookingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    addressLine: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Block', required: true },
    blockName: { type: String, trim: true },
    location: { type: geoPointSchema, required: true },
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    pricePaisa: { type: Number, required: true, min: 1 },
    scope: { type: String, required: true, trim: true, maxlength: 1000 },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUPERSEDED', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const bookingEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 1000 },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const cancellationSchema = new mongoose.Schema(
  {
    by: { type: String, enum: ['CUSTOMER', 'PROVIDER', 'ADMIN'], required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    // True when a customer cancels after the provider accepted: it counts in
    // the provider's monthly late-cancellation counter (docs/24 §4.7).
    late: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    resolution: { type: String, enum: ['CONFIRMED', 'CANCELLED'] },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const serviceBookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider', required: true, index: true },
    offering: { type: offeringSnapshotSchema, required: true },
    status: { type: String, enum: SERVICE_BOOKING_STATUSES, default: 'REQUESTED', index: true },

    requestedStart: { type: Date, required: true },
    // Set when the job is accepted; the calendar uses these.
    scheduledStart: { type: Date },
    scheduledEnd: { type: Date },

    address: { type: bookingAddressSchema, required: true },
    note: { type: String, trim: true, maxlength: 1000 },

    proposals: { type: [proposalSchema], default: [] },
    agreedPricePaisa: { type: Number, min: 0 },
    finalAmountPaisa: { type: Number, min: 0 },
    completionNote: { type: String, trim: true, maxlength: 1000 },

    acceptedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    confirmedAt: { type: Date },
    autoConfirmAt: { type: Date },
    confirmedBy: { type: String, enum: ['CUSTOMER', 'AUTO', 'ADMIN'] },

    cancellation: { type: cancellationSchema },
    dispute: { type: disputeSchema },

    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceConversation' },
    events: { type: [bookingEventSchema], default: [] },
  },
  { timestamps: true }
);

serviceBookingSchema.index({ providerId: 1, status: 1, createdAt: -1 });
serviceBookingSchema.index({ customerId: 1, createdAt: -1 });
serviceBookingSchema.index({ providerId: 1, scheduledStart: 1, status: 1 });
serviceBookingSchema.index({ status: 1, autoConfirmAt: 1 });

const ServiceBooking = mongoose.model('ServiceBooking', serviceBookingSchema);

module.exports = ServiceBooking;
