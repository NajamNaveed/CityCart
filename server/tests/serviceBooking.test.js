jest.mock('../src/services/notification.service', () => ({
  notifyProviderOfServiceRequest: jest.fn(),
  notifyCustomerOfServiceProposal: jest.fn(),
  notifyProviderOfProposalAnswer: jest.fn(),
  notifyCustomerOfServiceAccepted: jest.fn(),
  notifyCustomerOfServiceDeclined: jest.fn(),
  notifyCustomerOfServiceStarted: jest.fn(),
  notifyCustomerOfServiceCompleted: jest.fn(),
  notifyProviderOfServiceConfirmed: jest.fn(),
  notifyProviderOfServiceDispute: jest.fn(),
  notifySuperAdminsOfServiceDispute: jest.fn(),
  notifyProviderOfServiceDeclined: jest.fn(),
  notifyPartiesOfDisputeResolved: jest.fn(),
  notifyServiceBookingCancelled: jest.fn(),
}));
jest.mock('../src/services/serviceRanking.service', () => ({ refreshRanking: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/services/serviceChat.service', () => ({ openBookingChat: jest.fn() }));
jest.mock('../src/services/serviceAvailability.service', () => ({
  rawAvailability: jest.fn(),
  assertSlotWithinAvailability: jest.fn(),
}));

const mongoose = require('mongoose');

const ServiceBooking = require('../src/models/serviceBooking.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const {
  serialiseBooking,
  expireProposals,
  autoConfirmCompleted,
  providerAcceptOffer,
  providerDeclineRequest,
} = require('../src/services/serviceBooking.service');
const { notifyCustomerOfServiceAccepted, notifyCustomerOfServiceDeclined } = require('../src/services/notification.service');

const oid = () => new mongoose.Types.ObjectId();

const bookingDoc = (over = {}) => ({
  _id: oid(),
  bookingNumber: 'SB-2026-000001',
  customerId: oid(),
  providerId: oid(),
  status: 'REQUESTED',
  offering: {
    offeringId: oid(),
    title: 'Deep clean',
    slug: 'deep-clean',
    durationMinutes: 60,
    startingAtPrice: 50000,
    image: null,
  },
  requestedStart: new Date('2026-11-20T05:00:00Z'),
  scheduledStart: null,
  scheduledEnd: null,
  note: '',
  proposals: [],
  agreedPricePaisa: null,
  finalAmountPaisa: null,
  events: [],
  address: {
    fullName: 'Ayesha Khan',
    phone: '+923001234567',
    addressLine: 'House 1, Street 2',
    city: 'Faisalabad',
    blockId: oid(),
    blockName: 'Madina Town',
    location: { type: 'Point', coordinates: [73.08, 31.42] },
  },
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

const provider = () => ({
  _id: oid(),
  displayName: 'Sparkle Home',
  slug: 'sparkle-home',
  avatar: null,
  phone: '+923009998888',
});

describe('serialiseBooking', () => {
  it('keeps the provider phone private until the request is accepted', () => {
    const result = serialiseBooking(bookingDoc(), { viewer: 'CUSTOMER', provider: provider() });
    expect(result.provider).not.toHaveProperty('phone');
    expect(result.canChat).toBe(false);
    expect(result.address.pin).toEqual({ lat: 31.42, lng: 73.08 });
  });

  it('reveals the provider phone and opens chat after acceptance', () => {
    const result = serialiseBooking(bookingDoc({ status: 'ACCEPTED' }), { viewer: 'CUSTOMER', provider: provider() });
    expect(result.provider.phone).toBe('+923009998888');
    expect(result.canChat).toBe(true);
  });

  it('never shows the provider its own phone, and passes unread/review through', () => {
    const review = { _id: oid(), rating: 5 };
    const result = serialiseBooking(bookingDoc({ status: 'CONFIRMED' }), {
      viewer: 'PROVIDER',
      provider: provider(),
      unread: 3,
      review,
    });
    expect(result.provider).not.toHaveProperty('phone');
    expect(result.unread).toBe(3);
    expect(result.review).toBe(review);
  });
});

describe('expireProposals', () => {
  it('expires only ACTIVE proposals that are due, in one conditional update', async () => {
    const spy = jest.spyOn(ServiceBooking, 'updateMany').mockResolvedValue({ modifiedCount: 2 });
    const now = new Date('2026-11-15T00:00:00Z');

    const result = await expireProposals({ now });

    expect(result).toBe(2);
    expect(spy).toHaveBeenCalledWith(
      { status: 'PROPOSED', proposals: { $elemMatch: { status: 'ACTIVE', expiresAt: { $lte: now } } } },
      expect.any(Array)
    );
    spy.mockRestore();
  });
});

describe('autoConfirmCompleted', () => {
  afterEach(() => jest.restoreAllMocks());

  it('confirms each due booking once and increments completedBookings', async () => {
    const booking = bookingDoc({ status: 'COMPLETED', confirmedBy: undefined });
    jest.spyOn(ServiceBooking, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ select: async () => [{ _id: booking._id }] }) }),
    });
    jest
      .spyOn(ServiceBooking, 'findOneAndUpdate')
      .mockResolvedValue({ ...booking, status: 'CONFIRMED', providerId: booking.providerId });
    jest.spyOn(ServiceProvider, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    jest.spyOn(ServiceProvider, 'findById').mockReturnValue({
      select: () => Promise.resolve({ userId: oid() }),
    });

    const result = await autoConfirmCompleted({ now: new Date('2026-11-20T00:00:00Z') });

    expect(result).toBe(1);
    expect(ServiceBooking.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: booking._id, status: 'COMPLETED' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'CONFIRMED', confirmedBy: 'AUTO' }) }),
      expect.any(Object)
    );
    expect(ServiceProvider.updateOne).toHaveBeenCalledWith(
      { _id: booking.providerId },
      { $inc: { completedBookings: 1 } }
    );
  });

  it('does not count a booking another request already confirmed', async () => {
    jest.spyOn(ServiceBooking, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ select: async () => [{ _id: oid() }] }) }),
    });
    jest.spyOn(ServiceBooking, 'findOneAndUpdate').mockResolvedValue(null);
    const inc = jest.spyOn(ServiceProvider, 'updateOne');

    const result = await autoConfirmCompleted({ now: new Date() });

    expect(result).toBe(0);
    expect(inc).not.toHaveBeenCalled();
  });
});

describe('customer offer decisions', () => {
  const { rawAvailability, assertSlotWithinAvailability } = require('../src/services/serviceAvailability.service');

  beforeEach(() => {
    rawAvailability.mockResolvedValue({});
    assertSlotWithinAvailability.mockReturnValue({
      start: new Date('2026-11-20T05:00:00Z'),
      end: new Date('2026-11-20T06:00:00Z'),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts the amount already stored on the booking, not anything sent by the client', async () => {
    const booking = bookingDoc({ customerOfferPaisa: 45000 });
    jest.spyOn(ServiceBooking, 'findOne').mockResolvedValue(booking);
    jest.spyOn(ServiceBooking, 'exists').mockResolvedValue(null);
    jest.spyOn(ServiceProvider, 'findById').mockResolvedValue(provider());
    const accepted = bookingDoc({ status: 'ACCEPTED', customerOfferPaisa: 45000, agreedPricePaisa: 45000 });
    const update = jest.spyOn(ServiceBooking, 'findOneAndUpdate').mockResolvedValue(accepted);

    await providerAcceptOffer(booking.providerId, booking._id);

    const [filter, patch] = update.mock.calls[0];
    // The conditional filter pins the offer that was on the document, so a
    // concurrent edit cannot swap the price being accepted.
    expect(filter).toMatchObject({ status: 'REQUESTED', customerOfferPaisa: 45000 });
    expect(patch.$set.agreedPricePaisa).toBe(45000);
    expect(patch.$set.scheduledStart).toEqual(new Date('2026-11-20T05:00:00Z'));
    expect(notifyCustomerOfServiceAccepted).toHaveBeenCalledWith({ booking: accepted });
  });

  it('refuses to accept when the customer proposed no price', async () => {
    const booking = bookingDoc();
    jest.spyOn(ServiceBooking, 'findOne').mockResolvedValue(booking);

    await expect(providerAcceptOffer(booking.providerId, booking._id)).rejects.toMatchObject({
      code: 'NO_CUSTOMER_OFFER',
    });
  });

  it('declines a request with the provider cancellation and reason recorded', async () => {
    const booking = bookingDoc({ customerOfferPaisa: 45000 });
    jest.spyOn(ServiceBooking, 'findOne').mockResolvedValue(booking);
    jest.spyOn(ServiceProvider, 'findById').mockResolvedValue(provider());
    const declined = bookingDoc({
      status: 'DECLINED',
      cancellation: { by: 'PROVIDER', reason: 'Fully booked', late: false },
    });
    const update = jest.spyOn(ServiceBooking, 'findOneAndUpdate').mockResolvedValue(declined);

    await providerDeclineRequest(booking.providerId, booking._id, { reason: 'Fully booked' });

    const [, patch] = update.mock.calls[0];
    expect(patch.$set.cancellation).toMatchObject({ by: 'PROVIDER', reason: 'Fully booked' });
    expect(patch.$push.events.type).toBe('OFFER_DECLINED');
    expect(notifyCustomerOfServiceDeclined).toHaveBeenCalled();
  });
});
