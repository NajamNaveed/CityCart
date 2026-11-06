jest.mock('../src/models/serviceBooking.model');
jest.mock('../src/models/serviceReview.model');
jest.mock('../src/models/serviceProvider.model');

const mongoose = require('mongoose');

const ServiceBooking = require('../src/models/serviceBooking.model');
const ServiceReview = require('../src/models/serviceReview.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const {
  recomputeRanking,
  refreshRanking,
  recomputeAllRankings,
} = require('../src/services/serviceRanking.service');

const oid = () => new mongoose.Types.ObjectId();
const now = new Date('2026-11-15T00:00:00Z');

const chain = (value) => ({ select: jest.fn().mockResolvedValue(value) });

describe('recomputeRanking', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ServiceProvider.updateOne.mockResolvedValue({ modifiedCount: 1 });
    ServiceReview.aggregate.mockResolvedValue([{ _id: null, count: 2, total: 9 }]);
  });

  it('computes the documented weighted score from approved reviews and bookings', async () => {
    const providerId = oid();
    const customerId = oid();
    const provider = { _id: providerId, completedBookings: 20 };

    ServiceBooking.find.mockReturnValue(
      chain([
        { status: 'CONFIRMED', customerId, acceptedAt: now, createdAt: now },
        {
          status: 'CANCELLED',
          customerId: oid(),
          acceptedAt: now,
          createdAt: now,
          cancellation: { by: 'PROVIDER', at: now },
        },
        {
          status: 'CANCELLED',
          customerId: oid(),
          acceptedAt: now,
          createdAt: now,
          cancellation: { by: 'CUSTOMER', late: true, at: now },
        },
        { status: 'REQUESTED', customerId: oid(), createdAt: now },
      ])
    );

    const result = await recomputeRanking(providerId, { now, provider });

    // rating 4.5 -> 0.875 normalised; completion 1/3; response 3/4;
    // repeat 0; volume 1/50; provider-cancel 1/3; late-cancel 1/3; no boost.
    const expected =
      0.45 * 0.875 +
      0.2 * (1 / 3) +
      0.15 * 0.75 +
      0.1 * 0 +
      0.1 * (1 / 50) -
      0.2 * (1 / 3) -
      0.1 * (1 / 3);
    expect(result.rankScore).toBe(Math.round(expected * 10000) / 10000);
    expect(result.rankInputs).toMatchObject({
      windowDays: 90,
      ratingAvg: 4.5,
      reviewCount: 2,
      completionRate: 1 / 3,
      responseRate: 0.75,
      providerCancellationRate: 1 / 3,
      customerLateCancellationRate: 1 / 3,
      newProvider: false,
    });
    expect(ServiceProvider.updateOne).toHaveBeenCalledWith(
      { _id: providerId },
      expect.objectContaining({
        $set: expect.objectContaining({ ratingAvg: 4.5, ratingCount: 2, rankingUpdatedAt: now }),
      })
    );
  });

  it('gives a new provider the documented small boost', async () => {
    const provider = { _id: oid(), completedBookings: 2 };
    ServiceBooking.find.mockReturnValue(chain([]));
    ServiceReview.aggregate.mockResolvedValue([]);

    const result = await recomputeRanking(provider._id, { now, provider });

    expect(result.rankInputs.newProvider).toBe(true);
    expect(result.rankInputs.newProviderBoost).toBe(0.05);
    expect(result.rankScore).toBe(0.05);
  });

  it('returns null when the provider does not exist', async () => {
    ServiceProvider.findById.mockReturnValue(chain(null));
    expect(await recomputeRanking(oid(), { now })).toBeNull();
  });
});

describe('refreshRanking', () => {
  it('never throws back into the business action', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ServiceProvider.findById.mockReturnValue(chain(null));
    ServiceProvider.findById.mockImplementation(() => {
      throw new Error('db down');
    });

    await expect(refreshRanking(oid())).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('recomputeAllRankings', () => {
  it('sweeps every provider in batches', async () => {
    const p1 = { _id: oid(), completedBookings: 1 };
    const p2 = { _id: oid(), completedBookings: 3 };
    ServiceProvider.find
      .mockReturnValueOnce({ sort: () => ({ limit: () => ({ select: async () => [p1, p2] }) }) })
      .mockReturnValueOnce({ sort: () => ({ limit: () => ({ select: async () => [] }) }) });
    ServiceProvider.updateOne.mockResolvedValue({});
    ServiceBooking.find.mockReturnValue(chain([]));
    ServiceReview.aggregate.mockResolvedValue([{ _id: null, count: 0, total: 0 }]);

    const result = await recomputeAllRankings({ now, batchSize: 2 });

    expect(result).toBe(2);
  });
});
