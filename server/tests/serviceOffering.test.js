jest.mock('../src/models/serviceOffering.model');
jest.mock('../src/models/serviceProvider.model');
jest.mock('../src/services/serviceAvailability.service');
jest.mock('../src/services/serviceReview.service');

const mongoose = require('mongoose');

const ServiceOffering = require('../src/models/serviceOffering.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const { getAvailability } = require('../src/services/serviceAvailability.service');
const { publicProviderReviews } = require('../src/services/serviceReview.service');
const {
  listOwnOfferings,
  createOffering,
  updateOffering,
  deactivateOffering,
  ServiceOfferingError,
} = require('../src/services/serviceOffering.service');
const { getPublicProvider } = require('../src/services/serviceDiscovery.service');

const oid = () => new mongoose.Types.ObjectId();

const offeringDoc = (over = {}) => ({
  _id: oid(),
  providerId: oid(),
  categoryId: oid(),
  title: 'Deep cleaning',
  slug: 'deep-cleaning',
  description: 'Whole home',
  images: [],
  startingAtPrice: 500000,
  durationMinutes: 120,
  attributes: {},
  isActive: true,
  save: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  getAvailability.mockResolvedValue({ windows: [], blackoutDates: [], isPublished: false });
  publicProviderReviews.mockResolvedValue([]);
});

describe('provider offerings', () => {
  it('lists only the signed-in provider offerings', async () => {
    const providerId = oid();
    const items = [offeringDoc({ providerId })];
    ServiceOffering.find.mockReturnValue({ sort: () => Promise.resolve(items) });

    const result = await listOwnOfferings(providerId);

    expect(ServiceOffering.find).toHaveBeenCalledWith({ providerId });
    expect(result.map((o) => o._id)).toEqual([items[0]._id]);
  });

  it('creates an offering with the tenant and category from the provider, not the body', async () => {
    const provider = { _id: oid(), categoryId: oid() };
    ServiceProvider.findById.mockResolvedValue(provider);
    ServiceOffering.exists.mockResolvedValue(null);
    ServiceOffering.create.mockImplementation(async (data) => ({ _id: oid(), ...data }));

    await createOffering(provider._id, {
      title: 'Deep Cleaning',
      startingAtPrice: 500000,
      durationMinutes: 120,
      // A malicious client cannot choose these:
      providerId: oid(),
      categoryId: oid(),
    });

    expect(ServiceOffering.create).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: provider._id,
        categoryId: provider.categoryId,
        slug: 'deep-cleaning',
      })
    );
  });

  it('refuses a second offering with the same title', async () => {
    const provider = { _id: oid(), categoryId: oid() };
    ServiceProvider.findById.mockResolvedValue(provider);
    ServiceOffering.exists.mockResolvedValue({ _id: oid() });

    await expect(
      createOffering(provider._id, { title: 'Deep cleaning', startingAtPrice: 1, durationMinutes: 60 })
    ).rejects.toMatchObject({ status: 409, code: 'OFFERING_EXISTS' });
    expect(ServiceOffering.create).not.toHaveBeenCalled();
  });

  it('answers 404 when the provider tenant does not exist', async () => {
    ServiceProvider.findById.mockResolvedValue(null);
    await expect(
      createOffering(oid(), { title: 'Cleaning', startingAtPrice: 1, durationMinutes: 60 })
    ).rejects.toBeInstanceOf(ServiceOfferingError);
  });

  it('updates only an offering owned by the provider', async () => {
    const providerId = oid();
    const offering = offeringDoc({ providerId });
    ServiceOffering.findOne.mockResolvedValue(offering);

    await updateOffering(providerId, offering._id, { startingAtPrice: 700000 });

    expect(ServiceOffering.findOne).toHaveBeenCalledWith({ _id: offering._id, providerId });
    expect(offering.startingAtPrice).toBe(700000);
    expect(offering.save).toHaveBeenCalled();
  });

  it('cannot update another provider offering', async () => {
    ServiceOffering.findOne.mockResolvedValue(null);
    await expect(updateOffering(oid(), oid(), { startingAtPrice: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it('deactivates instead of deleting', async () => {
    const offering = offeringDoc();
    ServiceOffering.findOne.mockResolvedValue(offering);

    const result = await deactivateOffering(offering.providerId, offering._id);

    expect(offering.isActive).toBe(false);
    expect(offering.save).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });
});

describe('public provider page', () => {
  it('publishes only an active, verified provider and hides its pin and phone', async () => {
    const provider = {
      _id: oid(),
      displayName: 'Sparkle Home',
      slug: 'sparkle-home',
      bio: 'Cleaning',
      avatar: null,
      coverImage: null,
      startingAtPrice: 250000,
      ratingAvg: 4.8,
      ratingCount: 10,
      completedBookings: 12,
      phone: '+923001234567',
      addressLine: 'House 1',
      location: { type: 'Point', coordinates: [73.08, 31.42] },
      categoryId: { _id: oid(), name: 'Cleaning', slug: 'cleaning' },
      cityId: { _id: oid(), name: 'Faisalabad' },
      blockId: { _id: oid(), name: 'Madina Town', center: { type: 'Point', coordinates: [73.09, 31.43] } },
    };
    ServiceProvider.findOne.mockReturnValue({ populate: () => Promise.resolve(provider) });
    ServiceOffering.find.mockReturnValue({
      sort: () => Promise.resolve([offeringDoc({ providerId: provider._id })]),
    });

    const result = await getPublicProvider('sparkle-home');

    expect(ServiceProvider.findOne).toHaveBeenCalledWith({
      slug: 'sparkle-home',
      status: 'ACTIVE',
      verification: 'VERIFIED',
    });
    expect(result.offerings).toHaveLength(1);
    expect(result.availability).toMatchObject({ isPublished: false });
    expect(result.reviews).toEqual([]);
    expect(result.block).toMatchObject({ name: 'Madina Town', center: { lat: 31.43, lng: 73.09 } });
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('addressLine');
    expect(result).not.toHaveProperty('location');
  });

  it('answers 404 for a provider that is not approved', async () => {
    ServiceProvider.findOne.mockReturnValue({ populate: () => Promise.resolve(null) });
    await expect(getPublicProvider('pending-provider')).rejects.toMatchObject({ status: 404 });
  });
});
