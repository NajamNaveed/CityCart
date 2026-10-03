const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/utils/password', () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');
const { isAllowedWhenRestricted } = require('../src/config/restrictedAccess');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const HOUR = 3600 * 1000;

// A brand staff member whose brand was terminated.
function staff({ role = ROLES.BRAND_ADMIN, restricted = true, expiresIn = 5 * HOUR, perms = [] } = {}) {
  const user = {
    _id: oid(), role, isActive: true, brandId,
    accessRestricted: restricted,
    accessExpiresAt: expiresIn === null ? undefined : new Date(Date.now() + expiresIn),
  };
  User.findById.mockResolvedValue(user);
  Employee.findOne.mockResolvedValue({ isActive: true, permissions: perms });
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

beforeEach(() => {
  jest.resetAllMocks();
  require('../src/utils/password').comparePassword.mockResolvedValue(true);
});

describe('isAllowedWhenRestricted', () => {
  it.each([
    ['GET', '/api/v1/brand/orders', true],
    ['GET', '/api/v1/payments/order/abc', true],
    ['HEAD', '/api/v1/deliveries', true],
    ['PATCH', `/api/v1/deliveries/${'a'.repeat(24)}/status`, true], // finish in-transit deliveries
    ['PATCH', `/api/v1/deliveries/${'a'.repeat(24)}`, false], // tracking edits are not
    ['POST', '/api/v1/products', false],
    ['PATCH', `/api/v1/products/${'a'.repeat(24)}`, false],
    ['DELETE', `/api/v1/employees/${'a'.repeat(24)}`, false],
    ['PATCH', `/api/v1/payments/${'a'.repeat(24)}/status`, false], // no refunds
    ['PATCH', `/api/v1/brand/orders/${'a'.repeat(24)}/status`, false],
    ['PATCH', '/api/v1/deliveries/not-an-id/status', false],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isAllowedWhenRestricted(method, path)).toBe(expected);
  });
});

describe('terminated-brand staff during the grace period (read-only)', () => {
  it('can still read, and /auth/me tells the UI they are restricted', async () => {
    const { cookie, user } = staff();
    const res = await request(app).get('/api/v1/auth/me').set(...cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.access).toMatchObject({ restricted: true });
    expect(new Date(res.body.user.access.expiresAt).getTime()).toBe(user.accessExpiresAt.getTime());
  });

  it.each([
    ['POST', '/api/v1/categories', { name: 'x' }],
    ['POST', '/api/v1/products', { name: 'x' }],
    ['PATCH', `/api/v1/inventory/${oid()}`, { quantity: 5 }],
    ['POST', '/api/v1/employees', {}],
    ['PATCH', `/api/v1/payments/${oid()}/status`, { status: 'REFUNDED' }],
    ['PATCH', `/api/v1/brand/orders/${oid()}/status`, { status: 'CONFIRMED' }],
    ['PATCH', `/api/v1/deliveries/${oid()}`, { assignedAgent: 'x' }],
    ['DELETE', `/api/v1/products/${oid()}`, undefined],
  ])('writes are blocked: %s %s -> 403 ACCOUNT_RESTRICTED', async (method, path, body) => {
    const { cookie } = staff();
    const call = request(app)[method.toLowerCase()](path).set(...cookie);
    const res = await (body ? call.send(body) : call);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_RESTRICTED');
    expect(res.body.accessExpiresAt).toBeDefined();
  });

  it('can still update delivery status (passes authentication; an invalid body then gets a normal 400)', async () => {
    const { cookie } = staff();
    const res = await request(app).patch(`/api/v1/deliveries/${oid()}/status`).set(...cookie).send({});
    expect(res.status).toBe(400); // reached the handler's validation, not blocked
    expect(res.body.code).toBeUndefined();
  });

  it('applies to restricted employees too, still limited by their own permissions', async () => {
    const { cookie } = staff({ role: ROLES.BRAND_EMPLOYEE, perms: [PERMISSIONS.PRODUCTS_CREATE] });
    const res = await request(app).post('/api/v1/products').set(...cookie).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_RESTRICTED'); // blocked even though they hold products.create
  });
});

describe('after the grace period', () => {
  it('every request is rejected with 401 ACCESS_EXPIRED (reads and writes)', async () => {
    const { cookie } = staff({ expiresIn: -1000 });
    for (const [method, path] of [['GET', '/api/v1/auth/me'], ['GET', '/api/v1/brand/orders'], ['PATCH', `/api/v1/deliveries/${oid()}/status`]]) {
      const res = await request(app)[method.toLowerCase()](path).set(...cookie).send();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCESS_EXPIRED');
    }
  });

  it('graceHours 0 style cut-off: an expiry of exactly now is already expired', async () => {
    const { cookie, user } = staff();
    user.accessExpiresAt = new Date(Date.now());
    const res = await request(app).get('/api/v1/auth/me').set(...cookie);
    expect(res.status).toBe(401);
  });

  it('they can no longer log in', async () => {
    const user = { _id: oid(), role: ROLES.BRAND_ADMIN, isActive: true, brandId, accessRestricted: true, accessExpiresAt: new Date(Date.now() - 1000), passwordHash: 'x', email: 'a@b.co' };
    User.findOne.mockReturnValue({ select: () => Promise.resolve(user) });
    const res = await request(app).post('/api/v1/auth/brand/login').send({ email: 'a@b.co', password: 'secret123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });
});

describe('login during the grace period, and normal users are unaffected', () => {
  it('can still log in before the access ends, and sees the restricted flag', async () => {
    const user = { _id: oid(), name: 'A', email: 'a@b.co', role: ROLES.BRAND_ADMIN, isActive: true, brandId, accessRestricted: true, accessExpiresAt: new Date(Date.now() + HOUR), passwordHash: 'x' };
    User.findOne.mockReturnValue({ select: () => Promise.resolve(user) });
    const res = await request(app).post('/api/v1/auth/brand/login').send({ email: 'a@b.co', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.user.access.restricted).toBe(true);
  });

  it('users without the fields (everyone else) are not restricted and /auth/me has no access block', async () => {
    const { cookie } = staff({ restricted: false, expiresIn: null });
    const res = await request(app).get('/api/v1/auth/me').set(...cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.access).toBeUndefined();
    const write = await request(app).post('/api/v1/categories').set(...cookie).send({});
    expect(write.body.code).not.toBe('ACCOUNT_RESTRICTED');
  });
});
