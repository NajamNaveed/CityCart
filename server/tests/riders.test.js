const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/delivery.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Delivery = require('../src/models/delivery.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();

function asRole(role, permissions) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') || role === 'RIDER' ? { brandId } : {}) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const riderDoc = (overrides = {}) => ({
  _id: oid(), name: 'Bilal', email: 'bilal@example.com', phone: '+923001234567', isActive: true, createdAt: new Date(), ...overrides,
});
const NEW_RIDER = { name: 'Bilal', email: 'Bilal@Example.com', password: 'correcthorse123', phone: '+92 300 1234567' };

beforeEach(() => jest.resetAllMocks());

describe('access to /api/v1/riders', () => {
  const calls = (cookie) => [
    request(app).get('/api/v1/riders').set(...cookie),
    request(app).post('/api/v1/riders').set(...cookie).send(NEW_RIDER),
    request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({ name: 'x' }),
    request(app).patch(`/api/v1/riders/${oid()}/password`).set(...cookie).send({ password: 'newpassword123' }),
  ];

  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/riders')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ROLES.RIDER])('403 for %s on every endpoint', async (role) => {
    const { cookie } = asRole(role);
    for (const res of await Promise.all(calls(cookie))) {
      expect(res.status).toBe(403);
    }
    expect(User.create).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a team member needs the matching permission for each action', async () => {
    const { cookie } = asRole(ROLES.BRAND_EMPLOYEE, []);
    for (const res of await Promise.all(calls(cookie))) {
      expect(res.status).toBe(403);
    }

    const view = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.RIDERS_VIEW]);
    User.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    User.countDocuments.mockResolvedValue(0);
    const [list, create, update] = await Promise.all(calls(view.cookie));
    expect(list.status).toBe(200);
    expect(create.status).toBe(403);
    expect(update.status).toBe(403);
  });
});

describe('GET /api/v1/riders', () => {
  it("lists only the caller's brand's riders and ignores a brandId in the query", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const limit = jest.fn().mockResolvedValue([riderDoc({ passwordHash: 'secret' })]);
    User.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    User.countDocuments.mockResolvedValue(1);

    const res = await request(app).get(`/api/v1/riders?isActive=true&brandId=${oid()}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(User.find).toHaveBeenCalledWith({ brandId: brandId.toString(), role: 'RIDER', isActive: true });
    expect(res.body.riders).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('400 for a bad query', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).get('/api/v1/riders?limit=500').set(...cookie)).status).toBe(400);
  });
});

describe('POST /api/v1/riders', () => {
  const post = (cookie, body) => request(app).post('/api/v1/riders').set(...cookie).send(body);

  it('creates a RIDER of the caller\'s brand; role and brand are never taken from the body', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Brand.findById.mockResolvedValue({ status: 'ACTIVE' });
    User.findOne.mockResolvedValue(null);
    User.create.mockImplementation(async (doc) => ({ _id: oid(), createdAt: new Date(), isActive: true, ...doc }));

    const res = await post(cookie, { ...NEW_RIDER, role: 'SUPER_ADMIN', brandId: oid(), accountType: 'PLATFORM_ADMIN' });

    expect(res.status).toBe(201);
    const [doc] = User.create.mock.calls[0];
    expect(doc).toMatchObject({ role: 'RIDER', accountType: 'BRAND', email: 'bilal@example.com', phone: '+92 300 1234567' });
    expect(String(doc.brandId)).toBe(brandId.toString());
    expect(doc.passwordHash).toMatch(/^\$2[aby]\$/); // hashed, never the plain password
    expect(JSON.stringify(res.body)).not.toContain('correcthorse123');
    expect(res.body.rider.passwordHash).toBeUndefined();
    expect(User.findOne).toHaveBeenCalledWith({ email: 'bilal@example.com', accountType: 'BRAND' });
  });

  it.each([
    [{ ...NEW_RIDER, phone: undefined }],
    [{ ...NEW_RIDER, password: 'short' }],
    [{ ...NEW_RIDER, email: 'nope' }],
    [{ ...NEW_RIDER, name: '' }],
    [{ ...NEW_RIDER, phone: 'call me' }],
  ])('400 for invalid body %#', async (body) => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await post(cookie, body)).status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('409 when the email is already used by a brand account', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Brand.findById.mockResolvedValue({ status: 'ACTIVE' });
    User.findOne.mockResolvedValue({ _id: oid() });
    expect((await post(cookie, NEW_RIDER)).status).toBe(409);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('409 BRAND_TERMINATED for a terminated brand', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Brand.findById.mockResolvedValue({ status: 'TERMINATED' });
    const res = await post(cookie, NEW_RIDER);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BRAND_TERMINATED');
  });

  it('409 on a duplicate-key race', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Brand.findById.mockResolvedValue({ status: 'ACTIVE' });
    User.findOne.mockResolvedValue(null);
    User.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect((await post(cookie, NEW_RIDER)).status).toBe(409);
  });
});

describe('PATCH /api/v1/riders/:id and /:id/password', () => {
  it('updates only a RIDER of the caller\'s brand', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Delivery.countDocuments.mockResolvedValue(0);
    User.findOneAndUpdate.mockResolvedValue(riderDoc({ _id: id, isActive: false }));

    const res = await request(app).patch(`/api/v1/riders/${id}`).set(...cookie).send({ isActive: false, role: 'BRAND_ADMIN', brandId: oid() });

    expect(res.status).toBe(200);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), role: 'RIDER' },
      { $set: { isActive: false } },
      { new: true }
    );
  });

  it('will not deactivate a rider who still has open deliveries: they must be given to someone else first', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Delivery.countDocuments.mockResolvedValue(2);

    const res = await request(app).patch(`/api/v1/riders/${id}`).set(...cookie).send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'RIDER_HAS_OPEN_DELIVERIES', openDeliveries: 2 });
    expect(res.body.message).toMatch(/2 open deliveries/);
    expect(Delivery.countDocuments).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      riderId: id.toString(),
      status: { $nin: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
    });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses the singular for one open delivery', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Delivery.countDocuments.mockResolvedValue(1);
    const res = await request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({ isActive: false });
    expect(res.body.message).toMatch(/1 open delivery\. Give it to another rider first/);
  });

  it('editing a name, or reactivating, never looks at deliveries', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    User.findOneAndUpdate.mockResolvedValue(riderDoc());
    expect((await request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({ name: 'New Name' })).status).toBe(200);
    expect((await request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({ isActive: true })).status).toBe(200);
    expect(Delivery.countDocuments).not.toHaveBeenCalled();
  });

  it("404 for another brand's rider (or any non-rider account), 400 for bad id or empty body", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    User.findOneAndUpdate.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({ name: 'x' })).status).toBe(404);
    expect((await request(app).patch('/api/v1/riders/nope').set(...cookie).send({ name: 'x' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/riders/${oid()}`).set(...cookie).send({})).status).toBe(400);
  });

  it('resets the password: stored hashed, and every old session of that rider is revoked', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    User.findOneAndUpdate.mockResolvedValue(riderDoc({ _id: id }));

    const res = await request(app).patch(`/api/v1/riders/${id}/password`).set(...cookie).send({ password: 'brandnewpass123' });

    expect(res.status).toBe(200);
    const [filter, update] = User.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: id.toString(), brandId: brandId.toString(), role: 'RIDER' });
    expect(update.$set.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(update.$inc).toEqual({ passwordVersion: 1 });
    expect(JSON.stringify(res.body)).not.toContain('brandnewpass123');
  });

  it('password reset: 400 for a short password, 404 for someone else\'s rider', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).patch(`/api/v1/riders/${oid()}/password`).set(...cookie).send({ password: 'short' })).status).toBe(400);
    User.findOneAndUpdate.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/riders/${oid()}/password`).set(...cookie).send({ password: 'longenoughpass1' })).status).toBe(404);
  });
});
