const mongoose = require('mongoose');

const ServiceBooking = require('../models/serviceBooking.model');
const ServiceReview = require('../models/serviceReview.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { startOfKarachiMonth } = require('../utils/karachiTime');

/**
 * Provider ranking (docs/24 §4.7). Backend-computed from stored bookings and
 * approved reviews; nothing here accepts client input. Called after every
 * event that changes an input and once a night for providers that had no
 * event (time alone moves the 90-day window).
 *
 *   rankScore =
 *     0.45 × normalisedRating
 *   + 0.20 × completionRate
 *   + 0.15 × responseRate
 *   + 0.10 × repeatCustomerRate
 *   + 0.10 × volumeScore
 *   − 0.20 × providerCancellationRate
 *   − 0.10 × customerLateCancellationRate
 *   + newProviderBoost (until 10 confirmed bookings)
 */
const WEIGHTS = Object.freeze({
  rating: 0.45,
  completion: 0.2,
  response: 0.15,
  repeat: 0.1,
  volume: 0.1,
  providerCancel: -0.2,
  lateCustomerCancel: -0.1,
});
const WINDOW_DAYS = 90;
const NEW_PROVIDER_BOOKINGS = 10;
const NEW_PROVIDER_BOOST = 0.05;
const VOLUME_FULL_MARKS = 50;

const ratio = (part, whole) => (whole > 0 ? part / whole : 0);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round4 = (n) => Math.round(n * 10000) / 10000;

const CONFIRMED = 'CONFIRMED';
const COMPLETED = 'COMPLETED';

function acceptedBookings(bookings) {
  return bookings.filter((b) => b.acceptedAt);
}

/**
 * Computes and stores the score and its inputs. `provider` may be passed in
 * when the caller already loaded it (avoids a second read).
 */
async function recomputeRanking(providerId, { now = new Date(), provider = null } = {}) {
  const providerDoc =
    provider ||
    (await ServiceProvider.findById(providerId).select('completedBookings ratingAvg ratingCount'));
  if (!providerDoc) return null;

  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const monthStart = startOfKarachiMonth(now);

  const [bookings, reviewRow] = await Promise.all([
    ServiceBooking.find({ providerId: providerDoc._id, createdAt: { $gte: since } }).select(
      'status customerId acceptedAt cancellation createdAt confirmedAt'
    ),
    ServiceReview.aggregate([
      { $match: { providerId: new mongoose.Types.ObjectId(String(providerDoc._id)), isApproved: true } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$rating' } } },
    ]),
  ]);

  // Rating reflects the approved service reviews only.
  const reviewCount = reviewRow[0] ? reviewRow[0].count : 0;
  const ratingAvg = reviewCount ? round4(reviewRow[0].total / reviewCount) : 0;

  const accepted = acceptedBookings(bookings);
  const decisions = accepted.length;
  const completedCount = bookings.filter((b) => b.status === CONFIRMED || b.status === COMPLETED).length;
  const providerCancelled = bookings.filter(
    (b) => b.status === 'CANCELLED' && b.cancellation && b.cancellation.by === 'PROVIDER'
  ).length;
  const customerLateCancelled = bookings.filter(
    (b) => b.status === 'CANCELLED' && b.cancellation && b.cancellation.by === 'CUSTOMER' && b.cancellation.late
  ).length;

  const requests = bookings.length;
  const answered = bookings.filter((b) => b.status !== 'REQUESTED').length;

  const confirmedByCustomer = new Map();
  for (const b of bookings) {
    if (b.status !== CONFIRMED && b.status !== COMPLETED) continue;
    const key = String(b.customerId);
    confirmedByCustomer.set(key, (confirmedByCustomer.get(key) || 0) + 1);
  }
  const repeatCustomers = [...confirmedByCustomer.values()].filter((n) => n > 1).length;

  // The late-cancellation counter resets monthly; its rate uses this month's
  // accepted jobs so a stale count can never outlive the reset.
  const monthAccepted = accepted.filter((b) => b.createdAt >= monthStart).length;
  const monthLateCancelled = bookings.filter(
    (b) =>
      b.status === 'CANCELLED' &&
      b.cancellation &&
      b.cancellation.by === 'CUSTOMER' &&
      b.cancellation.late &&
      b.cancellation.at >= monthStart
  ).length;

  const input = {
    windowDays: WINDOW_DAYS,
    ratingAvg,
    reviewCount,
    normalisedRating: clamp01(ratingAvg > 0 ? (ratingAvg - 1) / 4 : 0),
    completionRate: ratio(completedCount, decisions),
    responseRate: ratio(answered, requests),
    repeatCustomerRate: ratio(repeatCustomers, confirmedByCustomer.size),
    volumeScore: clamp01(completedCount / VOLUME_FULL_MARKS),
    providerCancellationRate: ratio(providerCancelled, decisions),
    customerLateCancellationRate: ratio(monthLateCancelled, monthAccepted),
    completedCount,
    requests,
    decisions,
    providerCancelled,
    customerLateCancelled,
    monthLateCancelled,
    newProvider: providerDoc.completedBookings < NEW_PROVIDER_BOOKINGS,
  };

  const score =
    WEIGHTS.rating * input.normalisedRating +
    WEIGHTS.completion * input.completionRate +
    WEIGHTS.response * input.responseRate +
    WEIGHTS.repeat * input.repeatCustomerRate +
    WEIGHTS.volume * input.volumeScore +
    WEIGHTS.providerCancel * input.providerCancellationRate +
    WEIGHTS.lateCustomerCancel * input.customerLateCancellationRate +
    (input.newProvider ? NEW_PROVIDER_BOOST : 0);

  const rankInputs = {
    ...input,
    weights: WEIGHTS,
    newProviderBoost: input.newProvider ? NEW_PROVIDER_BOOST : 0,
    computationVersion: 1,
    computedAt: now,
  };
  const rankScore = round4(score);

  await ServiceProvider.updateOne(
    { _id: providerDoc._id },
    { $set: { rankScore, rankInputs, rankingUpdatedAt: now, ratingAvg, ratingCount: reviewCount } }
  );
  return { rankScore, rankInputs };
}

/** Recomputes but never fails the business action that triggered it. */
async function refreshRanking(providerId, options) {
  try {
    return await recomputeRanking(providerId, options);
  } catch (err) {
    console.error(`[services] ranking recompute failed for ${providerId}: ${err.message}`);
    return null;
  }
}

/** Nightly sweep: every approved provider, in small batches. */
async function recomputeAllRankings({ now = new Date(), batchSize = 50 } = {}) {
  const filter = { status: { $in: ['ACTIVE', 'SUSPENDED', 'PENDING'] } };
  let lastId = null;
  let updated = 0;
  for (;;) {
    const page = await ServiceProvider.find({ ...filter, ...(lastId && { _id: { $gt: lastId } }) })
      .sort({ _id: 1 })
      .limit(batchSize)
      .select('_id completedBookings');
    if (page.length === 0) break;
    for (const provider of page) {
      await recomputeRanking(provider._id, { now, provider });
      updated += 1;
    }
    lastId = page[page.length - 1]._id;
  }
  return updated;
}

module.exports = {
  WEIGHTS,
  WINDOW_DAYS,
  NEW_PROVIDER_BOOKINGS,
  NEW_PROVIDER_BOOST,
  recomputeRanking,
  refreshRanking,
  recomputeAllRankings,
};
