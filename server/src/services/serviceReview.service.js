const mongoose = require('mongoose');

const ServiceReview = require('../models/serviceReview.model');
const ServiceBooking = require('../models/serviceBooking.model');
const ServiceProvider = require('../models/serviceProvider.model');
const User = require('../models/user.model');
const { shortName } = require('./review.service');
const { refreshRanking } = require('./serviceRanking.service');
const {
  notifyProviderOfNewServiceReview,
  notifyCustomerOfServiceReviewReply,
} = require('./notification.service');

/**
 * Service reviews (docs/24 §4.6). Only the customer of a CONFIRMED booking
 * may review, once; the provider may reply once; the super admin can hide a
 * review that breaks the rules. Provider rating and ranking are recomputed
 * from approved reviews after every change.
 */
class ServiceReviewError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const DEFAULT_LIMIT = 10;

const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

async function nameMap(Model, ids, field = 'name') {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const docs = await Model.find({ _id: { $in: unique } }).select(field);
  return new Map(docs.map((d) => [String(d._id), d[field]]));
}

function serialiseReview(review, { reviewerName, serviceTitle, providerName } = {}) {
  return {
    _id: review._id,
    bookingId: review.bookingId,
    providerId: review.providerId,
    rating: review.rating,
    comment: review.comment,
    providerReply: review.providerReply || null,
    isApproved: review.isApproved,
    reviewerName: reviewerName || undefined,
    serviceTitle: serviceTitle || undefined,
    providerName: providerName || undefined,
    createdAt: review.createdAt,
  };
}

function summarise(groups = []) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const group of groups) {
    distribution[group._id] = group.count;
    count += group.count;
    total += group._id * group.count;
  }
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

async function createServiceReview(customerId, bookingId, { rating, comment }) {
  const booking = await ServiceBooking.findOne({ _id: bookingId, customerId });
  if (!booking) throw new ServiceReviewError(404, 'Booking not found.');
  if (booking.status !== 'CONFIRMED') {
    throw new ServiceReviewError(409, 'You can review a booking once it is confirmed.', {
      code: 'BOOKING_NOT_CONFIRMED',
    });
  }

  try {
    const review = await ServiceReview.create({
      bookingId: booking._id,
      customerId,
      providerId: booking.providerId,
      rating,
      ...(comment && { comment }),
      isApproved: true,
    });
    const provider = await ServiceProvider.findById(booking.providerId).select('userId');
    await notifyProviderOfNewServiceReview({
      providerUserId: provider ? provider.userId : null,
      booking,
      review,
    });
    await refreshRanking(booking.providerId);
    return serialiseReview(review, { serviceTitle: booking.offering.title });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ServiceReviewError(409, 'You have already reviewed this booking.', { code: 'ALREADY_REVIEWED' });
    }
    throw err;
  }
}

async function getBookingReview(customerId, bookingId) {
  const review = await ServiceReview.findOne({ bookingId, customerId });
  return review ? serialiseReview(review) : null;
}

async function replyToServiceReview(providerId, reviewId, { body }) {
  const review = await ServiceReview.findOne({ _id: reviewId, providerId });
  if (!review) throw new ServiceReviewError(404, 'Review not found.');
  if (review.providerReply) {
    throw new ServiceReviewError(409, 'You have already replied to this review.', { code: 'ALREADY_REPLIED' });
  }
  review.providerReply = { body, at: new Date() };
  await review.save();
  const booking = await ServiceBooking.findById(review.bookingId);
  await notifyCustomerOfServiceReviewReply({ booking, review });
  return serialiseReview(review, { serviceTitle: booking ? booking.offering.title : undefined });
}

async function listProviderReviews(providerId, { rating, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { providerId, isApproved: true, ...(rating && { rating }) };
  const [items, total, groups] = await Promise.all([
    ServiceReview.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ServiceReview.countDocuments(filter),
    ServiceReview.aggregate([
      { $match: { providerId: new mongoose.Types.ObjectId(String(providerId)), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);
  const [people, bookings] = await Promise.all([
    nameMap(User, items.map((r) => r.customerId)),
    ServiceBooking.find({ _id: { $in: items.map((r) => r.bookingId) } }).select('offering.title'),
  ]);
  const titleById = new Map(bookings.map((b) => [String(b._id), b.offering.title]));
  return {
    reviews: items.map((r) =>
      serialiseReview(r, {
        reviewerName: shortName(people.get(String(r.customerId))),
        serviceTitle: titleById.get(String(r.bookingId)),
      })
    ),
    summary: summarise(groups),
    pagination: paginate(page, limit, total),
  };
}

/** Public provider page: a short list of approved reviews, no customer identities. */
async function publicProviderReviews(providerId, limit = 6) {
  const items = await ServiceReview.find({ providerId, isApproved: true })
    .sort({ createdAt: -1 })
    .limit(limit);
  if (items.length === 0) return [];
  const people = await nameMap(User, items.map((r) => r.customerId));
  const bookings = await ServiceBooking.find({ _id: { $in: items.map((r) => r.bookingId) } }).select('offering.title');
  const titleById = new Map(bookings.map((b) => [String(b._id), b.offering.title]));
  return items.map((r) => ({
    ...serialiseReview(r, {
      reviewerName: shortName(people.get(String(r.customerId))),
      serviceTitle: titleById.get(String(r.bookingId)),
    }),
    isApproved: undefined,
  }));
}

async function providerReviewSummary(providerId) {
  const groups = await ServiceReview.aggregate([
    { $match: { providerId: new mongoose.Types.ObjectId(String(providerId)), isApproved: true } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  return summarise(groups);
}

async function listAdminServiceReviews({ approved, providerId, rating, page = 1, limit = 20 } = {}) {
  const filter = {
    ...(approved !== undefined && { isApproved: approved }),
    ...(providerId && { providerId }),
    ...(rating && { rating }),
  };
  const [items, total] = await Promise.all([
    ServiceReview.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ServiceReview.countDocuments(filter),
  ]);
  const [people, providers, bookings] = await Promise.all([
    nameMap(User, items.map((r) => r.customerId)),
    nameMap(ServiceProvider, items.map((r) => r.providerId), 'displayName'),
    ServiceBooking.find({ _id: { $in: items.map((r) => r.bookingId) } }).select('offering.title bookingNumber'),
  ]);
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));
  return {
    reviews: items.map((r) => {
      const booking = bookingById.get(String(r.bookingId));
      return {
        ...serialiseReview(r, {
          reviewerName: people.get(String(r.customerId)) || 'Unknown',
          serviceTitle: booking ? booking.offering.title : undefined,
          providerName: providers.get(String(r.providerId)) || 'Unknown provider',
        }),
        bookingNumber: booking ? booking.bookingNumber : undefined,
      };
    }),
    pagination: paginate(page, limit, total),
  };
}

async function setServiceReviewApproval(id, isApproved) {
  const review = await ServiceReview.findByIdAndUpdate(id, { $set: { isApproved } }, { new: true });
  if (!review) throw new ServiceReviewError(404, 'Review not found.');
  await refreshRanking(review.providerId);
  return serialiseReview(review);
}

module.exports = {
  ServiceReviewError,
  createServiceReview,
  getBookingReview,
  replyToServiceReview,
  listProviderReviews,
  publicProviderReviews,
  providerReviewSummary,
  listAdminServiceReviews,
  setServiceReviewApproval,
  summarise,
};
