const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
function asUser(overrides) {
  const user = { _id: oid(), isActive: true, ...overrides };
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => jest.resetAllMocks());

describe('POST /api/v1/stores', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app).post('/api/v1/stores').send({ name: 'S' });
    expect(res.status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.BRAND_EMPLOYEE])('403 for %s', async (role) => {
    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role, brandId: role === ROLES.BRAND_EMPLOYEE ? oid() : undefined }))
      .send({ name: 'S' });
    expect(res.status).toBe(403);
  });

  it('BRAND_ADMIN creates a store for their own brand and ignores a spoofed brandId', async () => {
    const brandId = oid();
    Brand.findById.mockResolvedValue({ _id: brandId });
    Store.findOne.mockResolvedValue(null);
    Store.create.mockImplementation(async (d) => d);

    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role: ROLES.BRAND_ADMIN, brandId }))
      .send({ name: 'Main Store', brandId: oid().toString() });

    expect(res.status).toBe(201);
    expect(Brand.findById).toHaveBeenCalledWith(brandId.toString());
    expect(Store.create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: brandId.toString(), slug: 'main-store' })
    );
  });

  it('SUPER_ADMIN must supply brandId (400) and can create when supplied (201)', async () => {
    const cookie = asUser({ role: ROLES.SUPER_ADMIN });
    const missing = await request(app).post('/api/v1/stores').set(...cookie).send({ name: 'S' });
    expect(missing.status).toBe(400);

    const brandId = oid().toString();
    Brand.findById.mockResolvedValue({ _id: brandId });
    Store.findOne.mockResolvedValue(null);
    Store.create.mockImplementation(async (d) => d);
    const ok = await request(app)
      .post('/api/v1/stores')
      .set(...cookie)
      .send({ name: 'S', brandId });
    expect(ok.status).toBe(201);
  });

  it('404 when the brand does not exist', async () => {
    Brand.findById.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role: ROLES.BRAND_ADMIN, brandId: oid() }))
      .send({ name: 'S' });
    expect(res.status).toBe(404);
  });

  it('409 when the brand already has a store', async () => {
    Brand.findById.mockResolvedValue({ _id: oid() });
    Store.findOne.mockResolvedValue({ _id: oid() });
    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role: ROLES.BRAND_ADMIN, brandId: oid() }))
      .send({ name: 'S' });
    expect(res.status).toBe(409);
  });

  it('409 on a duplicate-key race from the unique brandId index', async () => {
    Brand.findById.mockResolvedValue({ _id: oid() });
    Store.findOne.mockResolvedValue(null);
    Store.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role: ROLES.BRAND_ADMIN, brandId: oid() }))
      .send({ name: 'S' });
    expect(res.status).toBe(409);
  });

  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/stores')
      .set(...asUser({ role: ROLES.BRAND_ADMIN, brandId: oid() }))
      .send({});
    expect(res.status).toBe(400);
  });
});