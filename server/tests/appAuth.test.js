const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const env = require('../src/config/env');
const { signToken } = require('../src/utils/jwt');
const { hashPassword } = require('../src/utils/password');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const PASSWORD = 'correcthorse123';

const fakeUser = (role, overrides = {}) => ({
  _id: oid(),
  name: 'Bilal Ahmed',
  email: 'bilal@example.com',
  role,
  isActive: true,
  passwordVersion: 0,
  ...(role !== 'CUSTOMER' && role !== 'SUPER_ADMIN' && { brandId }),
  ...overrides,
});
const tokenFor = (user, extra = {}) =>
  signToken({ userId: user._id, role: user.role, brandId: user.brandId, passwordVersion: 0, ...extra }, { expiresIn: '8h' });
const bearer = (token) => ['Authorization', `Bearer ${token}`];

const loginAs = (path, client, body = { email: 'bilal@example.com', password: PASSWORD }) => {
  const req = request(app).post(path);
  if (client) req.set('X-Client', client);
  return req.send(body);
};

beforeEach(() => jest.resetAllMocks());

describe('POST /api/v1/auth/staff/login', () => {
  const login = (client = 'staff', body) => loginAs('/api/v1/auth/staff/login', client, body);

  async function accountExists(role) {
    const user = fakeUser(role, { passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    return user;
  }

  it('403 STAFF_APP_ONLY without the staff header, before any account lookup', async () => {
    const res = await login(null);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it.each(['mobile', 'delivery'])('the %s app header does not open the staff sign-in either', async (client) => {
    const res = await login(client);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_APP_ONLY');
  });

  it.each(['BRAND_EMPLOYEE', 'PICKER'])('%s: token in the body, no cookie, marked as a staff token with a staff-length life', async (role) => {
    const user = await accountExists(role);

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.user).toMatchObject({ role, brandId: String(brandId) });
    expect(res.body.user.passwordHash).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role, client: 'staff' });
    expect(payload.exp - payload.iat).toBe(env.staffSessionHours * 3600);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'bilal@example.com', accountType: 'BRAND' });
  });

  it.each(['RIDER', 'BRAND_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'])('%s cannot sign in here, with the same generic error as a wrong password', async (role) => {
    await accountExists(role);
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
    expect(res.body.token).toBeUndefined();
  });

  it('a wrong password and an unknown email look the same', async () => {
    await accountExists('BRAND_EMPLOYEE');
    const wrong = await login('staff', { email: 'bilal@example.com', password: 'wrongpassword1' });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const unknown = await login();
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('an inactive picker cannot sign in', async () => {
    const user = fakeUser('PICKER', { isActive: false, passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    expect((await login()).status).toBe(401);
  });

  it('400 for a malformed body', async () => {
    expect((await login('staff', { email: 'nope' })).status).toBe(400);
  });

  it('a rider cannot use the web brand login', async () => {
    await accountExists('RIDER');
    const res = await request(app).post('/api/v1/auth/brand/login').send({ email: 'bilal@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/v1/auth/delivery/login', () => {
  const login = (client = 'delivery', body) => loginAs('/api/v1/auth/delivery/login', client, body);

  async function accountExists(role) {
    const user = fakeUser(role, { passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    return user;
  }

  it('403 DELIVERY_APP_ONLY without the delivery header, before any account lookup', async () => {
    const res = await login(null);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DELIVERY_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it.each(['mobile', 'staff'])('the %s app header does not open the delivery sign-in', async (client) => {
    const res = await login(client);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DELIVERY_APP_ONLY');
  });

  it('a rider gets a token in the body, no cookie, marked as a delivery token with a staff-length life', async () => {
    const user = await accountExists('RIDER');

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.user).toMatchObject({ role: 'RIDER', brandId: String(brandId) });
    expect(res.body.user.passwordHash).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role: 'RIDER', client: 'delivery' });
    expect(payload.exp - payload.iat).toBe(env.staffSessionHours * 3600);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'bilal@example.com', accountType: 'BRAND' });
  });

  it.each(['BRAND_EMPLOYEE', 'PICKER', 'BRAND_ADMIN', 'CUSTOMER'])('%s cannot sign in here, with the same generic error as a wrong password', async (role) => {
    await accountExists(role);
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
    expect(res.body.token).toBeUndefined();
  });

  it('an inactive rider cannot sign in', async () => {
    const user = fakeUser('RIDER', { isActive: false, passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    expect((await login()).status).toBe(401);
  });

  it('400 for a malformed body', async () => {
    expect((await login('delivery', { email: 'nope' })).status).toBe(400);
  });
});

describe('Bearer tokens on the API', () => {
  const me = (...header) => request(app).get('/api/v1/auth/me').set(...header);

  it('a staff token works for a brand team member', async () => {
    const user = fakeUser('BRAND_EMPLOYEE');
    User.findById.mockResolvedValue(user);
    const Employee = require('../src/models/employee.model');
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: ['orders.view'] });
    const res = await me(...bearer(tokenFor(user, { client: 'staff' })));
    expect(res.status).toBe(200);
    expect(res.body.user.permissions).toEqual(['orders.view']);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a staff token works for a picker, with no brand-team permissions', async () => {
    const user = fakeUser('PICKER');
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'staff' })));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'PICKER', brandId: String(brandId) });
    expect(res.body.user.permissions).toBeUndefined();
  });

  it('a delivery token works for a rider and renews no cookie', async () => {
    const user = fakeUser('RIDER');
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'delivery' })));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'RIDER' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a staff token never works for a rider, and a delivery token never works for staff roles', async () => {
    const rider = fakeUser('RIDER');
    User.findById.mockResolvedValue(rider);
    const asRider = await me(...bearer(tokenFor(rider, { client: 'staff' })));
    expect(asRider.status).toBe(403);
    expect(asRider.body.code).toBe('WRONG_APP');

    for (const role of ['BRAND_EMPLOYEE', 'PICKER']) {
      const user = fakeUser(role);
      User.findById.mockResolvedValue(user);
      const res = await me(...bearer(tokenFor(user, { client: 'delivery' })));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WRONG_APP');
    }
  });

  it.each(['RIDER', 'BRAND_EMPLOYEE', 'PICKER'])('%s: a bearer token WITHOUT an app mark is refused (WRONG_APP)', async (role) => {
    const user = fakeUser(role);
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user)));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it.each(['BRAND_ADMIN', 'SUPER_ADMIN'])('%s: even a staff or delivery token is refused, they stay on the web', async (role) => {
    const user = fakeUser(role);
    User.findById.mockResolvedValue(user);
    for (const client of ['staff', 'delivery']) {
      const res = await me(...bearer(tokenFor(user, { client })));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WEB_ONLY');
    }
  });

  it('an app-marked token never works for a shopper account, and a shopper token still does', async () => {
    const customer = fakeUser('CUSTOMER');
    User.findById.mockResolvedValue(customer);
    for (const client of ['staff', 'delivery']) {
      const res = await me(...bearer(tokenFor(customer, { client })));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WRONG_APP');
    }
    expect((await me(...bearer(tokenFor(customer)))).status).toBe(200);
  });

  it('a token is revoked by a password change (passwordVersion), app tokens included', async () => {
    const user = fakeUser('RIDER', { passwordVersion: 1 });
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'delivery' })));
    expect(res.status).toBe(401);
  });

  it('a deactivated rider is signed out at once', async () => {
    const user = fakeUser('RIDER', { isActive: false });
    User.findById.mockResolvedValue(user);
    expect((await me(...bearer(tokenFor(user, { client: 'delivery' })))).status).toBe(401);
  });

  it('a rider with an ordinary cookie session cannot reach brand dashboards', async () => {
    const user = fakeUser('RIDER');
    User.findById.mockResolvedValue(user);
    const res = await request(app).get('/api/v1/deliveries').set('Cookie', getAuthCookie(user));
    expect(res.status).toBe(403);
  });

  it('the old partner sign-in is gone', async () => {
    const res = await loginAs('/api/v1/auth/partner/login', 'partner');
    expect(res.status).toBe(404);
  });
});
