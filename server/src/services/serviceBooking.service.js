const ServiceBooking = require('../models/serviceBooking.model');
const ServiceProvider = require('../models/serviceProvider.model');
const ServiceOffering = require('../models/serviceOffering.model');
const ServiceConversation = require('../models/serviceConversation.model');
const ServiceReview = require('../models/serviceReview.model');
const Block = require('../models/block.model');
const City = require('../models/city.model');
const Counter = require('../models/counter.model');
const { assertPinInBlock } = require('./branch.service');
const { rawAvailability, assertSlotWithinAvailability } = require('./serviceAvailability.service');
const { openBookingChat } = require('./serviceChat.service');
const { refreshRanking } = require('./serviceRanking.service');
const { runInTransaction } = require('../utils/transaction');
const { latLngFromPoint } = require('../utils/geo');
const { karachiMonthKey } = require('../utils/karachiTime');
const {
  CHAT_OPEN_STATUSES,
  SLOT_HOLDING_STATUSES,
  AUTO_CONFIRM_DAYS,
  PROPOSAL_EXPIRY_HOURS,
  MAX_ADVANCE_DAYS,
} = require('../config/serviceBookingStatuses');
const {
  notifyProviderOfServiceRequest,
  notifyCustomerOfServiceProposal,
  notifyProviderOfProposalAnswer,
  notifyCustomerOfServiceAccepted,
  notifyCustomerOfServiceStarted,
  notifyCustomerOfServiceCompleted,
  notifyProviderOfServiceConfirmed,
  notifyProviderOfServiceDispute,
  notifySuperAdminsOfServiceDispute,
  notifyProviderOfServiceDeclined,
  notifyPartiesOfDisputeResolved,
  notifyServiceBookingCancelled,
} = require('./notification.service');

/**
 * Service bookings (docs/24 §4.4). Every tenant-scoped lookup carries the
 * customer id or provider id from the session — never from the body — so a
 * booking id alone can never cross a tenant boundary.
 *
 * Status changes are one conditional findOneAndUpdate, so two simultaneous
 * taps (accept vs decline, confirm vs dispute) can never both apply. Proposal
 * revisions that rewrite the proposals array run in a transaction.
 */
class ServiceBookingError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const DEFAULT_LIMIT = 12;
const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

const ACTIVE = ['REQUESTED', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];

function statusError(booking) {
  return new ServiceBookingError(
    409,
    `This booking can no longer change from ${booking.status.toLowerCase().replaceAll('_', ' ')}.`,
    'INVALID_STATUS',
    { status: booking.status }
  );
}

/** The published price is the floor: the provider may not bind a lower one. */
function assertPriceAtLeast(pricePaisa, floorPaisa) {
  if (pricePaisa < floorPaisa) {
    throw new ServiceBookingError(
      400,
      `The price cannot be below the published starting price of PKR ${(floorPaisa / 100).toFixed(2)}.`,
      'PRICE_BELOW_STARTING'
    );
  }
}

async function nextBookingNumber() {
  const year = Number(karachiMonthKey(new Date()).slice(0, 4));
  const options = { upsert: true, new: true };
  let counter;
  try {
    counter = await Counter.findOneAndUpdate({ _id: `service-booking-${year}` }, { $inc: { seq: 1 } }, options);
  } catch (err) {
    if (err.code !== 11000) throw err;
    counter = await Counter.findOneAndUpdate({ _id: `service-booking-${year}` }, { $inc: { seq: 1 } }, options);
  }
  return `SB-${year}-${String(counter.seq).padStart(6, '0')}`;
}

function providerPublic(provider, { includePhone = false } = {}) {
  if (!provider) return null;
  return {
    _id: provider._id,
    displayName: provider.displayName,
    slug: provider.slug,
    avatar: provider.avatar,
    ...(includePhone && provider.phone && { phone: provider.phone }),
  };
}

/**
 * One shape for customer, provider and admin views. The address is visible to
 * the two parties (the provider needs it to do the job) and to admin; it is
 * never part of the public provider page.
 */
function serialiseBooking(
  booking,
  { viewer = 'CUSTOMER', provider = null, review = null, unread = 0 } = {}
) {
  const doc = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const { lat, lng } = latLngFromPoint(doc.address.location);
  const canChat = CHAT_OPEN_STATUSES.includes(doc.status);
  return {
    _id: doc._id,
    bookingNumber: doc.bookingNumber,
    status: doc.status,
    offering: {
      offeringId: doc.offering.offeringId,
      title: doc.offering.title,
      slug: doc.offering.slug,
      durationMinutes: doc.offering.durationMinutes,
      startingAtPrice: doc.offering.startingAtPrice,
      image: doc.offering.image,
    },
    requestedStart: doc.requestedStart,
    scheduledStart: doc.scheduledStart,
    scheduledEnd: doc.scheduledEnd,
    note: doc.note,
    proposals: (doc.proposals || []).map((p) => ({
      _id: p._id,
      pricePaisa: p.pricePaisa,
      scope: p.scope,
      scheduledStart: p.scheduledStart,
      scheduledEnd: p.scheduledEnd,
      expiresAt: p.expiresAt,
      status: p.status,
      createdAt: p.createdAt,
    })),
    activeProposal:
      (doc.proposals || []).find((p) => p.status === 'ACTIVE') || null,
    agreedPricePaisa: doc.agreedPricePaisa,
    finalAmountPaisa: doc.finalAmountPaisa,
    completionNote: doc.completionNote,
    acceptedAt: doc.acceptedAt,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    confirmedAt: doc.confirmedAt,
    autoConfirmAt: doc.autoConfirmAt,
    confirmedBy: doc.confirmedBy,
    cancellation: doc.cancellation,
    dispute: doc.dispute,
    events: doc.events || [],
    address: {
      fullName: doc.address.fullName,
      phone: doc.address.phone,
      addressLine: doc.address.addressLine,
      city: doc.address.city,
      blockId: doc.address.blockId,
      blockName: doc.address.blockName,
      pin: { lat, lng },
    },
    provider: viewer === 'PROVIDER' && provider ? providerPublic(provider) : providerPublic(provider, { includePhone: doc.status !== 'REQUESTED' && doc.status !== 'PROPOSED' }),
    customer: {
      _id: doc.customerId,
      name: doc.address.fullName,
      phone: doc.address.phone,
    },
    conversationId: doc.conversationId || null,
    canChat,
    unread,
    review,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function availabilityFor(providerId) {
  return rawAvailability(providerId);
}

async function assertSlot(providerId, start, durationMinutes, { excludeBookingId } = {}) {
  const availability = await availabilityFor(providerId);
  const { start: startDate, end: endDate } = assertSlotWithinAvailability(
    availability,
    start,
    durationMinutes,
    { maxAdvanceDays: MAX_ADVANCE_DAYS }
  );
  const overlap = await ServiceBooking.exists({
    providerId,
    status: { $in: SLOT_HOLDING_STATUSES },
    ...(excludeBookingId && { _id: { $ne: excludeBookingId } }),
    scheduledStart: { $lt: endDate },
    scheduledEnd: { $gt: startDate },
  });
  if (overlap) {
    throw new ServiceBookingError(409, 'That time is already booked. Choose another slot.', 'SLOT_TAKEN');
  }
  return { startDate, endDate };
}

/** Customer creates a request. The provider, block and price floor come from the database. */
async function createBooking(customerId, data) {
  const provider = await ServiceProvider.findOne({
    _id: data.providerId,
    status: 'ACTIVE',
    verification: 'VERIFIED',
  });
  if (!provider) throw new ServiceBookingError(404, 'Provider not found.');

  const offering = await ServiceOffering.findOne({
    _id: data.offeringId,
    providerId: provider._id,
    isActive: true,
  });
  if (!offering) throw new ServiceBookingError(404, 'Service not found.');

  const block = await Block.findOne({ _id: provider.blockId, isActive: true });
  if (!block) throw new ServiceBookingError(409, 'This provider is not taking bookings right now.', 'PROVIDER_UNAVAILABLE');

  try {
    assertPinInBlock(data.location.lat, data.location.lng, block);
  } catch {
    throw new ServiceBookingError(
      400,
      `That address is outside ${provider.displayName}’s service block (${block.name}).`,
      'OUTSIDE_SERVICE_BLOCK'
    );
  }

  const { startDate } = await assertSlot(provider._id, data.scheduledStart, offering.durationMinutes);
  const city = await City.findById(provider.cityId).select('name');

  let booking;
  for (let attempt = 0; attempt < 2 && !booking; attempt += 1) {
    try {
      booking = await ServiceBooking.create({
        bookingNumber: await nextBookingNumber(),
        customerId,
        providerId: provider._id,
        offering: {
          offeringId: offering._id,
          title: offering.title,
          slug: offering.slug,
          durationMinutes: offering.durationMinutes,
          startingAtPrice: offering.startingAtPrice,
          image: offering.images && offering.images[0],
        },
        status: 'REQUESTED',
        requestedStart: startDate,
        address: {
          fullName: data.address.fullName,
          phone: data.address.phone,
          addressLine: data.address.addressLine,
          city: city ? city.name : data.address.city || '',
          blockId: block._id,
          blockName: block.name,
          location: { type: 'Point', coordinates: [data.location.lng, data.location.lat] },
        },
        ...(data.note && { note: data.note }),
        events: [{ type: 'REQUESTED', by: customerId, byRole: 'CUSTOMER', at: new Date() }],
      });
    } catch (err) {
      if (err.code !== 11000 || attempt === 1) throw err;
    }
  }

  await notifyProviderOfServiceRequest({ providerUserId: provider.userId, booking });
  await refreshRanking(provider._id);
  return serialiseBooking(booking, { viewer: 'CUSTOMER', provider });
}

async function providerBookingForUpdate(providerId, bookingId) {
  const booking = await ServiceBooking.findOne({ _id: bookingId, providerId });
  if (!booking) throw new ServiceBookingError(404, 'Booking not found.');
  return booking;
}

/** Provider accepts a request with the price both sides will be bound to. */
async function providerAccept(providerId, bookingId, { pricePaisa }) {
  const booking = await providerBookingForUpdate(providerId, bookingId);
  if (booking.status !== 'REQUESTED') throw statusError(booking);
  assertPriceAtLeast(pricePaisa, booking.offering.startingAtPrice);

  const { startDate, endDate } = await assertSlot(
    providerId,
    booking.requestedStart,
    booking.offering.durationMinutes,
    { excludeBookingId: booking._id }
  );

  const updated = await ServiceBooking.findOneAndUpdate(
    { _id: booking._id, providerId, status: 'REQUESTED' },
    {
      $set: {
        status: 'ACCEPTED',
        agreedPricePaisa: pricePaisa,
        scheduledStart: startDate,
        scheduledEnd: endDate,
        acceptedAt: new Date(),
      },
      $push: {
        events: { type: 'ACCEPTED', by: providerId, byRole: 'PROVIDER', at: new Date(), meta: { pricePaisa } },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw statusError(await ServiceBooking.findById(booking._id));

  const conversation = await openBookingChat(updated);
  if (conversation && !updated.conversationId) updated.conversationId = conversation._id;
  const provider = await ServiceProvider.findById(providerId);
  await notifyCustomerOfServiceAccepted({ booking: updated });
  await refreshRanking(providerId, { provider });
  return serialiseBooking(updated, {
    viewer: 'PROVIDER',
    provider,
    unread: conversation ? conversation.providerUnread : 0,
  });
}

/** Provider sends or revises a proposal. A counter-proposal supersedes the old one. */
async function providerPropose(providerId, bookingId, { pricePaisa, scope, scheduledStart, expiresInHours }) {
  const existingBooking = await providerBookingForUpdate(providerId, bookingId);
  assertPriceAtLeast(pricePaisa, existingBooking.offering.startingAtPrice);
  const { startDate, endDate } = await assertSlot(
    providerId,
    scheduledStart,
    existingBooking.offering.durationMinutes,
    { excludeBookingId: bookingId }
  );

  const hours = expiresInHours || PROPOSAL_EXPIRY_HOURS;
  const now = new Date();
  const booking = await runInTransaction(async (session) => {
    const current = await ServiceBooking.findOne({
      _id: bookingId,
      providerId,
      status: { $in: ['REQUESTED', 'PROPOSED'] },
    }).session(session);
    if (!current) {
      const existing = await ServiceBooking.findOne({ _id: bookingId, providerId }).session(session);
      if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
      throw statusError(existing);
    }
    for (const proposal of current.proposals) {
      if (proposal.status === 'ACTIVE') proposal.status = 'SUPERSEDED';
    }
    current.proposals.push({
      pricePaisa,
      scope,
      scheduledStart: startDate,
      scheduledEnd: endDate,
      expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
      status: 'ACTIVE',
    });
    current.status = 'PROPOSED';
    current.events.push({
      type: 'PROPOSED',
      by: providerId,
      byRole: 'PROVIDER',
      at: now,
      meta: { pricePaisa, expiresInHours: hours },
    });
    await current.save({ session });
    return current;
  });

  await notifyCustomerOfServiceProposal({ booking, proposal: booking.proposals[booking.proposals.length - 1] });
  await refreshRanking(providerId);
  const provider = await ServiceProvider.findById(providerId);
  return serialiseBooking(booking, { viewer: 'PROVIDER', provider });
}

async function customerAcceptProposal(customerId, bookingId) {
  const now = new Date();
  const outcome = await runInTransaction(async (session) => {
    const current = await ServiceBooking.findOne({ _id: bookingId, customerId, status: 'PROPOSED' }).session(session);
    if (!current) {
      const existing = await ServiceBooking.findOne({ _id: bookingId, customerId }).session(session);
      if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
      throw statusError(existing);
    }
    const active = current.proposals.find((p) => p.status === 'ACTIVE');
    if (!active) {
      // Nothing to change: let the caller report it after the transaction.
      return { expired: true };
    }
    if (active.expiresAt.getTime() <= now.getTime()) {
      active.status = 'EXPIRED';
      current.status = 'REQUESTED';
      current.events.push({ type: 'PROPOSAL_EXPIRED', at: now });
      await current.save({ session });
      return { expired: true };
    }
    const { startDate, endDate } = await assertSlot(
      current.providerId,
      active.scheduledStart,
      current.offering.durationMinutes,
      { excludeBookingId: current._id }
    );
    active.status = 'ACCEPTED';
    current.status = 'ACCEPTED';
    current.agreedPricePaisa = active.pricePaisa;
    current.scheduledStart = startDate;
    current.scheduledEnd = endDate;
    current.acceptedAt = now;
    current.events.push({
      type: 'PROPOSAL_ACCEPTED',
      by: customerId,
      byRole: 'CUSTOMER',
      at: now,
      meta: { pricePaisa: active.pricePaisa },
    });
    await current.save({ session });
    return { booking: current };
  });
  if (outcome.expired) {
    throw new ServiceBookingError(
      409,
      'This proposal has expired. Ask the provider for another time.',
      'PROPOSAL_EXPIRED'
    );
  }
  const booking = outcome.booking;

  const conversation = await openBookingChat(booking);
  if (conversation && !booking.conversationId) booking.conversationId = conversation._id;
  const provider = await ServiceProvider.findById(booking.providerId);
  await notifyProviderOfProposalAnswer({ providerUserId: provider ? provider.userId : null, booking, accepted: true });
  await refreshRanking(booking.providerId, { provider });
  return serialiseBooking(booking, {
    viewer: 'CUSTOMER',
    provider,
    unread: conversation ? conversation.customerUnread : 0,
  });
}

async function customerDeclineProposal(customerId, bookingId) {
  const booking = await ServiceBooking.findOne({ _id: bookingId, customerId, status: 'PROPOSED' });
  if (!booking) {
    const existing = await ServiceBooking.findOne({ _id: bookingId, customerId });
    if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
    throw statusError(existing);
  }
  const active = booking.proposals.find((p) => p.status === 'ACTIVE');
  const now = new Date();
  if (active) active.status = 'DECLINED';
  booking.status = 'DECLINED';
  booking.events.push({ type: 'PROPOSAL_DECLINED', by: customerId, byRole: 'CUSTOMER', at: now });
  await booking.save();

  const provider = await ServiceProvider.findById(booking.providerId);
  await notifyProviderOfServiceDeclined({ providerUserId: provider ? provider.userId : null, booking });
  await refreshRanking(booking.providerId, { provider });
  return serialiseBooking(booking, { viewer: 'CUSTOMER', provider });
}

async function providerStart(providerId, bookingId) {
  const booking = await providerBookingForUpdate(providerId, bookingId);
  if (booking.status !== 'ACCEPTED') throw statusError(booking);
  const updated = await ServiceBooking.findOneAndUpdate(
    { _id: booking._id, providerId, status: 'ACCEPTED' },
    {
      $set: { status: 'IN_PROGRESS', startedAt: new Date() },
      $push: { events: { type: 'STARTED', by: providerId, byRole: 'PROVIDER', at: new Date() } },
    },
    { new: true }
  );
  if (!updated) throw statusError(await ServiceBooking.findById(booking._id));
  await notifyCustomerOfServiceStarted({ booking: updated });
  const provider = await ServiceProvider.findById(providerId);
  return serialiseBooking(updated, { viewer: 'PROVIDER', provider });
}

/** Completion is the provider's statement of the final amount; the customer confirms it. */
async function providerComplete(providerId, bookingId, { finalAmountPaisa, completionNote }) {
  const booking = await providerBookingForUpdate(providerId, bookingId);
  if (booking.status !== 'IN_PROGRESS') throw statusError(booking);
  const now = new Date();
  const updated = await ServiceBooking.findOneAndUpdate(
    { _id: booking._id, providerId, status: 'IN_PROGRESS' },
    {
      $set: {
        status: 'COMPLETED',
        finalAmountPaisa,
        ...(completionNote && { completionNote }),
        completedAt: now,
        autoConfirmAt: new Date(now.getTime() + AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000),
      },
      $push: {
        events: {
          type: 'COMPLETED',
          by: providerId,
          byRole: 'PROVIDER',
          at: now,
          meta: { finalAmountPaisa },
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw statusError(await ServiceBooking.findById(booking._id));
  await notifyCustomerOfServiceCompleted({ booking: updated });
  const provider = await ServiceProvider.findById(providerId);
  await refreshRanking(providerId, { provider });
  return serialiseBooking(updated, { viewer: 'PROVIDER', provider });
}

async function customerConfirm(customerId, bookingId) {
  const booking = await ServiceBooking.findOneAndUpdate(
    { _id: bookingId, customerId, status: 'COMPLETED' },
    {
      $set: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: 'CUSTOMER' },
      $push: { events: { type: 'CONFIRMED', by: customerId, byRole: 'CUSTOMER', at: new Date() } },
    },
    { new: true }
  );
  if (!booking) {
    const existing = await ServiceBooking.findOne({ _id: bookingId, customerId });
    if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
    throw statusError(existing);
  }
  await ServiceProvider.updateOne({ _id: booking.providerId }, { $inc: { completedBookings: 1 } });
  const provider = await ServiceProvider.findById(booking.providerId);
  await notifyProviderOfServiceConfirmed({ providerUserId: provider ? provider.userId : null, booking, by: 'CUSTOMER' });
  await refreshRanking(booking.providerId, { provider });
  return serialiseBooking(booking, { viewer: 'CUSTOMER', provider });
}

async function customerDispute(customerId, bookingId, { reason }) {
  const booking = await ServiceBooking.findOneAndUpdate(
    { _id: bookingId, customerId, status: 'COMPLETED' },
    {
      $set: {
        status: 'DISPUTED',
        dispute: { reason, at: new Date() },
      },
      $push: { events: { type: 'DISPUTED', by: customerId, byRole: 'CUSTOMER', at: new Date(), note: reason } },
    },
    { new: true }
  );
  if (!booking) {
    const existing = await ServiceBooking.findOne({ _id: bookingId, customerId });
    if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
    throw statusError(existing);
  }
  const provider = await ServiceProvider.findById(booking.providerId);
  await notifyProviderOfServiceDispute({ providerUserId: provider ? provider.userId : null, booking });
  await notifySuperAdminsOfServiceDispute({ booking });
  await refreshRanking(booking.providerId, { provider });
  return serialiseBooking(booking, { viewer: 'CUSTOMER', provider });
}

async function incrementLateCancellation(providerId, now) {
  const month = karachiMonthKey(now);
  const provider = await ServiceProvider.findById(providerId).select(
    'customerLateCancelMonth customerLateCancelCount'
  );
  if (!provider) return;
  const sameMonth = provider.customerLateCancelMonth === month;
  await ServiceProvider.updateOne(
    { _id: providerId },
    {
      $set: {
        customerLateCancelMonth: month,
        customerLateCancelCount: sameMonth ? (provider.customerLateCancelCount || 0) + 1 : 1,
      },
    }
  );
}

/**
 * Customer or provider cancellation. A customer cancel after acceptance is
 * "late" and counts in the provider's monthly counter (docs/24 §4.4, §4.7).
 */
async function cancelBooking({ actorId, role }, bookingId, { reason }) {
  const scope = role === 'PROVIDER' ? { providerId: actorId } : { customerId: actorId };
  const booking = await ServiceBooking.findOne({ _id: bookingId, ...scope });
  if (!booking) throw new ServiceBookingError(404, 'Booking not found.');
  if (!['REQUESTED', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS'].includes(booking.status)) {
    throw statusError(booking);
  }

  const by = role === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER';
  const late = by === 'CUSTOMER' && ['ACCEPTED', 'IN_PROGRESS'].includes(booking.status);
  const now = new Date();

  const updated = await ServiceBooking.findOneAndUpdate(
    { _id: booking._id, ...scope, status: booking.status },
    {
      $set: {
        status: 'CANCELLED',
        cancellation: { by, reason, late, at: now },
      },
      $push: {
        events: { type: 'CANCELLED', by: actorId, byRole: by, at: now, note: reason, meta: { late } },
      },
    },
    { new: true }
  );
  if (!updated) throw statusError(await ServiceBooking.findById(booking._id));

  if (late) await incrementLateCancellation(booking.providerId, now);
  await notifyServiceBookingCancelled({ booking: updated, by });
  const provider = await ServiceProvider.findById(booking.providerId);
  await refreshRanking(booking.providerId, { provider });
  return serialiseBooking(updated, { viewer: by, provider });
}

/** Super admin decides a dispute. The audit log is written by the controller. */
async function resolveDispute(adminId, bookingId, { resolution, note }) {
  const booking = await ServiceBooking.findOne({ _id: bookingId, status: 'DISPUTED' });
  if (!booking) {
    const existing = await ServiceBooking.findById(bookingId);
    if (!existing) throw new ServiceBookingError(404, 'Booking not found.');
    throw statusError(existing);
  }
  const now = new Date();
  const confirmed = resolution === 'CONFIRMED';
  const dispute = {
    ...(booking.dispute ? booking.dispute.toObject() : {}),
    resolvedAt: now,
    resolution,
    resolvedBy: adminId,
    ...(note && { resolutionNote: note }),
  };

  const updated = await ServiceBooking.findOneAndUpdate(
    { _id: booking._id, status: 'DISPUTED' },
    {
      $set: {
        status: confirmed ? 'CONFIRMED' : 'CANCELLED',
        dispute,
        ...(confirmed && { confirmedAt: now, confirmedBy: 'ADMIN' }),
        ...(!confirmed && {
          cancellation: {
            by: 'ADMIN',
            reason: note || 'Dispute resolved in the customer’s favour.',
            late: false,
            at: now,
          },
        }),
      },
      $push: {
        events: {
          type: 'DISPUTE_RESOLVED',
          by: adminId,
          byRole: 'ADMIN',
          at: now,
          note,
          meta: { resolution },
        },
      },
    },
    { new: true }
  );
  if (!updated) throw statusError(await ServiceBooking.findById(booking._id));

  if (confirmed) {
    await ServiceProvider.updateOne({ _id: updated.providerId }, { $inc: { completedBookings: 1 } });
  }
  const provider = await ServiceProvider.findById(updated.providerId);
  await notifyPartiesOfDisputeResolved({ booking: updated, resolution, note });
  await refreshRanking(updated.providerId, { provider });
  return serialiseBooking(updated, { viewer: 'ADMIN', provider });
}

async function expireProposals({ now = new Date() } = {}) {
  const result = await ServiceBooking.updateMany(
    {
      status: 'PROPOSED',
      proposals: { $elemMatch: { status: 'ACTIVE', expiresAt: { $lte: now } } },
    },
    [
      {
        $set: {
          proposals: {
            $map: {
              input: '$proposals',
              as: 'p',
              in: {
                $cond: [
                  { $and: [{ $eq: ['$$p.status', 'ACTIVE'] }, { $lte: ['$$p.expiresAt', now] }] },
                  { $mergeObjects: ['$$p', { status: 'EXPIRED' }] },
                  '$$p',
                ],
              },
            },
          },
          status: 'REQUESTED',
          events: {
            $concatArrays: [
              { $ifNull: ['$events', []] },
              [{ type: 'PROPOSAL_EXPIRED', at: now }],
            ],
          },
        },
      },
    ]
  );
  return result.modifiedCount || 0;
}

async function autoConfirmCompleted({ now = new Date(), limit = 200 } = {}) {
  const due = await ServiceBooking.find({
    status: 'COMPLETED',
    autoConfirmAt: { $lte: now },
  })
    .sort({ autoConfirmAt: 1 })
    .limit(limit)
    .select('_id');

  let confirmed = 0;
  for (const row of due) {
    const booking = await ServiceBooking.findOneAndUpdate(
      { _id: row._id, status: 'COMPLETED', autoConfirmAt: { $lte: now } },
      {
        $set: { status: 'CONFIRMED', confirmedAt: now, confirmedBy: 'AUTO' },
        $push: { events: { type: 'AUTO_CONFIRMED', byRole: 'SYSTEM', at: now } },
      },
      { new: true }
    );
    if (!booking) continue;
    confirmed += 1;
    await ServiceProvider.updateOne({ _id: booking.providerId }, { $inc: { completedBookings: 1 } });
    const provider = await ServiceProvider.findById(booking.providerId).select('userId');
    await notifyProviderOfServiceConfirmed({
      providerUserId: provider ? provider.userId : null,
      booking,
      by: 'AUTO',
    });
    await refreshRanking(booking.providerId);
  }
  return confirmed;
}

// ---- reads ---------------------------------------------------------------

async function listForCustomer(customerId, { status, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { customerId, ...(status && { status }) };
  const [rows, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ServiceBooking.countDocuments(filter),
  ]);
  const providers = rows.length
    ? await ServiceProvider.find({ _id: { $in: rows.map((b) => b.providerId) } }).select(
        'displayName slug avatar phone'
      )
    : [];
  const providerById = new Map(providers.map((p) => [String(p._id), p]));
  return {
    bookings: rows.map((b) =>
      serialiseBooking(b, { viewer: 'CUSTOMER', provider: providerById.get(String(b.providerId)) })
    ),
    pagination: paginate(page, limit, total),
  };
}

async function listForProvider(providerId, { status, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { providerId, ...(status && { status }) };
  const [rows, total, unreadRows] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ServiceBooking.countDocuments(filter),
    ServiceConversation.find({ providerId }).select('bookingId providerUnread'),
  ]);
  const provider = await ServiceProvider.findById(providerId);
  const unreadByBooking = new Map(unreadRows.map((c) => [String(c.bookingId), c.providerUnread]));
  return {
    bookings: rows.map((b) =>
      serialiseBooking(b, {
        viewer: 'PROVIDER',
        provider,
        unread: unreadByBooking.get(String(b._id)) || 0,
      })
    ),
    pagination: paginate(page, limit, total),
  };
}

async function getBookingForActor(actor, bookingId) {
  if (actor.role === 'SERVICE_PROVIDER') {
    const booking = await ServiceBooking.findOne({ _id: bookingId, providerId: actor.providerId });
    if (!booking) throw new ServiceBookingError(404, 'Booking not found.');
    const provider = await ServiceProvider.findById(actor.providerId);
    const conversation = await ServiceConversation.findOne({ bookingId: booking._id });
    return serialiseBooking(booking, {
      viewer: 'PROVIDER',
      provider,
      unread: conversation ? conversation.providerUnread : 0,
    });
  }

  const booking = await ServiceBooking.findOne({ _id: bookingId, customerId: actor._id });
  if (!booking) throw new ServiceBookingError(404, 'Booking not found.');
  const provider = await ServiceProvider.findById(booking.providerId);
  const [conversation, review] = await Promise.all([
    ServiceConversation.findOne({ bookingId: booking._id }),
    ServiceReview.findOne({ bookingId: booking._id, customerId: actor._id }),
  ]);
  return serialiseBooking(booking, {
    viewer: 'CUSTOMER',
    provider,
    unread: conversation ? conversation.customerUnread : 0,
    review: review
      ? {
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          providerReply: review.providerReply,
          createdAt: review.createdAt,
        }
      : null,
  });
}

async function listForAdmin({ status, disputed, providerId, page = 1, limit = 20 } = {}) {
  const filter = {
    ...(status && { status }),
    ...(disputed === 'true' && { status: 'DISPUTED' }),
    ...(providerId && { providerId }),
  };
  const [rows, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ServiceBooking.countDocuments(filter),
  ]);
  const providers = rows.length
    ? await ServiceProvider.find({ _id: { $in: rows.map((b) => b.providerId) } }).select('displayName slug')
    : [];
  const providerById = new Map(providers.map((p) => [String(p._id), p]));
  return {
    bookings: rows.map((b) =>
      serialiseBooking(b, { viewer: 'ADMIN', provider: providerById.get(String(b.providerId)) })
    ),
    pagination: paginate(page, limit, total),
  };
}

async function getBookingForAdmin(bookingId) {
  const booking = await ServiceBooking.findById(bookingId);
  if (!booking) throw new ServiceBookingError(404, 'Booking not found.');
  const provider = await ServiceProvider.findById(booking.providerId);
  return serialiseBooking(booking, { viewer: 'ADMIN', provider });
}

module.exports = {
  ServiceBookingError,
  ACTIVE,
  createBooking,
  providerAccept,
  providerPropose,
  customerAcceptProposal,
  customerDeclineProposal,
  providerStart,
  providerComplete,
  customerConfirm,
  customerDispute,
  cancelBooking,
  resolveDispute,
  expireProposals,
  autoConfirmCompleted,
  listForCustomer,
  listForProvider,
  getBookingForActor,
  listForAdmin,
  getBookingForAdmin,
  serialiseBooking,
};
