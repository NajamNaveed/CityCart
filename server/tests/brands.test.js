const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/city.model');

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const City = require('../src/models/city.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/brands (public)', () => {
  it('lists active brands with no authentication required', async () => {
    const sort = jest.fn().mockResolvedValue([{ name: 'Acme', status: 'ACTIVE' }]);
    Brand.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/brands');
    expect(res.status).toBe(200);
    // Default filter (no ?status=) is ACTIVE-only.
    expect(Brand.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
  });

  it('filters by cityId', async () => {
    const cityId = new mongoose.Types.ObjectId().toString();
    const sort = jest.fn().mockResolvedValue([]);
    Brand.find.mockReturnValue({ sort });

    const res = await request(app).get(`/api/v1/brands?cityId=${cityId}`);
    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith(expect.objectContaining({ cityId }));
  });

  it('supports search filtering', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    Brand.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/brands?search=pizza');
    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith(
      expect.objectContaining({ name: { $regex: 'pizza', $options: 'i' } })
    );
  });

  it('supports an explicit status filter', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    Brand.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/brands?status=PENDING');
    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
  });

  it('rejects an invalid status value with 400', async () => {
    const res = await request(app).get('/api/v1/brands?status=NOT_A_STATUS');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/brands/:id (public)', () => {
  it('returns an active brand', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    Brand.findOne.mockResolvedValue({ _id: id, name: 'Acme', status: 'ACTIVE' });

    const res = await request(app).get(`/api/v1/brands/${id}`);
    expect(res.status).toBe(200);
    expect(Brand.findOne).toHaveBeenCalledWith({ _id: id, status: 'ACTIVE' });
  });

  it('returns 404 for a non-active brand (hides existence rather than exposing status)', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    Brand.findOne.mockResolvedValue(null); // findOne with status:'ACTIVE' filter finds nothing

    const res = await request(app).get(`/api/v1/brands/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/brands (Super Admin only)', () => {
  it('creates a brand as SUPER_ADMIN, defaulting to PENDING status', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const cityId = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue({ _id: cityId, name: 'Lahore' });
    Brand.findOne.mockResolvedValue(null);
    Brand.create.mockImplementation(async (data) => ({ ...data, status: 'PENDING' }));

    const res = await request(app)
      .post('/api/v1/brands')
      .set(...asUser(superAdmin))
      .send({ name: 'Acme', cityId });

    expect(res.status).toBe(201);
    expect(res.body.brand.status).toBe('PENDING');
    // status is never accepted from the client on create.
    expect(Brand.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() })
    );
  });

  it('rejects an invalid/non-existent cityId', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const cityId = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/brands')
      .set(...asUser(superAdmin))
      .send({ name: 'Acme', cityId });

    expect(res.status).toBe(400);
    expect(Brand.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate brand slug with 409', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const cityId = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue({ _id: cityId });
    Brand.findOne.mockResolvedValue({ slug: 'acme' });

    const res = await request(app)
      .post('/api/v1/brands')
      .set(...asUser(superAdmin))
      .send({ name: 'Acme', cityId });

    expect(res.status).toBe(409);
  });

  it('denies CUSTOMER with 403', async () => {
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });

    const res = await request(app)
      .post('/api/v1/brands')
      .set(...asUser(customer))
      .send({ name: 'Acme', cityId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(403);
  });

  it('cannot use a client-supplied brandId as ownership (no such field even accepted)', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const cityId = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue({ _id: cityId });
    Brand.findOne.mockResolvedValue(null);
    Brand.create.mockImplementation(async (data) => data);

    await request(app)
      .post('/api/v1/brands')
      .set(...asUser(superAdmin))
      .send({ name: 'Acme', cityId, brandId: 'spoofed-value' });

    expect(Brand.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ brandId: expect.anything() })
    );
  });
});

describe('PATCH /api/v1/brands/:id (own-brand update)', () => {
  it('allows a BRAND_ADMIN to update their own brand', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    // Brand IS the tenant — it has no brandId field. Ownership is
    // resource._id === req.user.brandId, so the fixture must not fake a
    // brandId field (that would mask the real bug this test guards against).
    const brandFixture = { _id: brandId, name: 'Old', save };
    expect(brandFixture).not.toHaveProperty('brandId');
    Brand.findById.mockResolvedValue(brandFixture);

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies a BRAND_ADMIN updating a different brand (cross-brand denied)', async () => {
    const ownBrandId = new mongoose.Types.ObjectId();
    const otherBrandId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: ownBrandId });
    Brand.findById.mockResolvedValue({ _id: otherBrandId, name: 'Other' });

    const res = await request(app)
      .patch(`/api/v1/brands/${otherBrandId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to update any brand', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const save = jest.fn().mockResolvedValue(true);
    Brand.findById.mockResolvedValue({ _id: brandId, name: 'Old', save });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}`)
      .set(...asUser(superAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
  });

  it('denies CUSTOMER outright', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}`)
      .set(...asUser(customer))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('denies a BRAND_EMPLOYEE outright (not authorized for brand-level updates)', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}`)
      .set(...asUser(employee))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('strips status from the update payload — status is platform-controlled', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    const brandDoc = { _id: brandId, name: 'Old', status: 'ACTIVE', save };
    Brand.findById.mockResolvedValue(brandDoc);

    await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'New Name', status: 'SUSPENDED' });

    // status field is not in updateBrandSchema at all, so it can never
    // reach Object.assign in applyBrandUpdate.
    expect(brandDoc.status).toBe('ACTIVE');
  });
});

describe('PATCH /api/v1/brands/:id/status (Super Admin only)', () => {
  it('allows SUPER_ADMIN to change brand status', async () => {
    const brandId = new mongoose.Types.ObjectId().toString();
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const save = jest.fn().mockResolvedValue(true);
    Brand.findById.mockResolvedValue({ _id: brandId, status: 'PENDING', save });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId}/status`)
      .set(...asUser(superAdmin))
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies a BRAND_ADMIN (even for their own brand) with 403', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId.toString()}/status`)
      .set(...asUser(brandAdmin))
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(403);
  });

  it('rejects an invalid status enum value with 400', async () => {
    const brandId = new mongoose.Types.ObjectId().toString();
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });

    const res = await request(app)
      .patch(`/api/v1/brands/${brandId}/status`)
      .set(...asUser(superAdmin))
      .send({ status: 'NOT_REAL' });

    expect(res.status).toBe(400);
  });
});