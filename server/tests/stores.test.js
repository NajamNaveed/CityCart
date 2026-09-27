const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/employee.model');

const User = require('../src/models/user.model');
const Store = require('../src/models/store.model');
const Employee = require('../src/models/employee.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
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

describe('GET /api/v1/stores/:id (public)', () => {
  it('returns an active store with no authentication required', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    Store.findOne.mockResolvedValue({ _id: id, name: 'Main Store', isActive: true });

    const res = await request(app).get(`/api/v1/stores/${id}`);
    expect(res.status).toBe(200);
    expect(Store.findOne).toHaveBeenCalledWith({ _id: id, isActive: true });
  });

  it('returns 404 for an inactive store (never exposed publicly)', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    // findOne with { isActive: true } naturally finds nothing for an
    // inactive store.
    Store.findOne.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/stores/${id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent store', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    Store.findOne.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/stores/${id}`);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid ObjectId with 400', async () => {
    const res = await request(app).get('/api/v1/stores/not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/stores/me', () => {
  it("derives the store from the authenticated user's brandId", async () => {
    const brandId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Store.findOne.mockResolvedValue({ brandId, name: 'My Store' });

    const res = await request(app).get('/api/v1/stores/me').set(...asUser(brandAdmin));

    expect(res.status).toBe(200);
    expect(Store.findOne).toHaveBeenCalledWith({ brandId: brandId.toString() });
    expect(res.body.store.name).toBe('My Store');
  });

  it("ignores any client-supplied brandId and still uses the authenticated user's brand", async () => {
    const realBrandId = new mongoose.Types.ObjectId();
    const spoofedBrandId = new mongoose.Types.ObjectId().toString();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: realBrandId });
    Store.findOne.mockResolvedValue({ brandId: realBrandId, name: 'My Store' });

    const res = await request(app)
      .get(`/api/v1/stores/me?brandId=${spoofedBrandId}`)
      .set(...asUser(brandAdmin))
      .send({ brandId: spoofedBrandId });

    expect(res.status).toBe(200);
    expect(Store.findOne).toHaveBeenCalledWith({ brandId: realBrandId.toString() });
  });

  it('returns 404 when the brand has no store yet', async () => {
    const brandAdmin = makeFakeUser({
      role: ROLES.BRAND_ADMIN,
      brandId: new mongoose.Types.ObjectId(),
    });
    Store.findOne.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/stores/me').set(...asUser(brandAdmin));
    expect(res.status).toBe(404);
  });

  it('denies CUSTOMER with 403', async () => {
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });
    const res = await request(app).get('/api/v1/stores/me').set(...asUser(customer));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/stores/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/stores/:id', () => {
  it('allows a BRAND_ADMIN to update their own store', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    Store.findById.mockResolvedValue({ _id: storeId, brandId, name: 'Old', save });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies cross-brand update (Brand A user, Brand B store) with 403', async () => {
    const ownBrandId = new mongoose.Types.ObjectId();
    const otherBrandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: ownBrandId });
    Store.findById.mockResolvedValue({ _id: storeId, brandId: otherBrandId, name: 'Other' });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('allows an authorized BRAND_EMPLOYEE (has store.update permission)', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.STORE_UPDATE],
    });
    const save = jest.fn().mockResolvedValue(true);
    Store.findById.mockResolvedValue({ _id: storeId, brandId, name: 'Old', save });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(employee))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE without store.update permission', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });
    Store.findById.mockResolvedValue({ _id: storeId, brandId, name: 'Old' });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(employee))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER outright', async () => {
    const storeId = new mongoose.Types.ObjectId();
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(customer))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent store', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Store.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(404);
  });

  it('cannot change brandId — the field is not even accepted by the schema', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const storeId = new mongoose.Types.ObjectId();
    const spoofedBrandId = new mongoose.Types.ObjectId().toString();
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    const storeDoc = { _id: storeId, brandId, name: 'Old', save };
    Store.findById.mockResolvedValue(storeDoc);

    await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'New Name', brandId: spoofedBrandId });

    expect(storeDoc.brandId).toBe(brandId); // unchanged
  });

  it('allows SUPER_ADMIN to update any store', async () => {
    const storeId = new mongoose.Types.ObjectId();
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const save = jest.fn().mockResolvedValue(true);
    Store.findById.mockResolvedValue({
      _id: storeId,
      brandId: new mongoose.Types.ObjectId(),
      name: 'Old',
      save,
    });

    const res = await request(app)
      .patch(`/api/v1/stores/${storeId.toString()}`)
      .set(...asUser(superAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
  });
});