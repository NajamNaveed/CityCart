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
const PARTNER = ['X-Client', 'partner'];
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

beforeEach(() => jest.resetAllMocks());

describe('POST /api/v1/auth/partner/login', () => {
  async function accountExists(role) {
    const user = fakeUser(role, { passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    return user;
  }
  const login = (headers = PARTNER, body = { email: 'bilal@example.com', password: PASSWORD }) => {
    const req = request(app).post('/api/v1/auth/partner/login');
    if (headers) req.set(...headers);
    return req.send(body);
  };

  it('403 PARTNER_APP_ONLY without the partner header, before any account lookup', async () => {
    const res = await login(null);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PARTNER_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('the shopper app header does not open the partner sign-in either', async () => {
    const res = await login(['X-Client', 'mobile']);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PARTNER_APP_ONLY');
  });

  it.each(['RIDER', 'BRAND_EMPLOYEE'])('%s: token in the body, no cookie, marked as a partner token with a staff-length life', async (role) => {
    const user = await accountExists(role);

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.user).toMatchObject({ role, brandId: String(brandId) });
    expect(res.body.user.passwordHash).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role, client: 'partner' });
    expect(payload.exp - payload.iat).toBe(env.staffSessionHours * 3600);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'bilal@example.com', accountType: 'BRAND' });
  });

  it.each(['BRAND_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'])('%s cannot sign in here, with the same generic error as a wrong password', async (role) => {
    await accountExists(role);
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
    expect(res.body.token).toBeUndefined();
  });

  it('a wrong password and an unknown email look the same', async () => {
    await accountExists('RIDER');
    const wrong = await login(PARTNER, { email: 'bilal@example.com', password: 'wrongpassword1' });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const unknown = await login();
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('an inactive rider cannot sign in', async () => {
    const user = fakeUser('RIDER', { isActive: false, passwordHash: await hashPassword(PASSWORD) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    expect((await login()).status).toBe(401);
  });

  it('400 for a malformed body', async () => {
    expect((await login(PARTNER, { email: 'nope' })).status).toBe(400);
  });

  it('a rider cannot use the web brand login', async () => {
    await accountExists('RIDER');
    const res = await request(app).post('/api/v1/auth/brand/login').send({ email: 'bilal@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('Bearer tokens on the API', () => {
  const me = (...header) => request(app).get('/api/v1/auth/me').set(...header);

  it('a partner token works for a rider and renews no cookie', async () => {
    const user = fakeUser('RIDER');
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'partner' })));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'RIDER' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a partner token works for a brand team member', async () => {
    const user = fakeUser('BRAND_EMPLOYEE');
    User.findById.mockResolvedValue(user);
    const Employee = require('../src/models/employee.model');
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: ['orders.view'] });
    const res = await me(...bearer(tokenFor(user, { client: 'partner' })));
    expect(res.status).toBe(200);
    expect(res.body.user.permissions).toEqual(['orders.view']);
  });

  it.each(['RIDER', 'BRAND_EMPLOYEE', 'BRAND_ADMIN'])('%s: a bearer token WITHOUT the partner mark is refused (WEB_ONLY)', async (role) => {
    const user = fakeUser(role);
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user)));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
  });

  it.each(['BRAND_ADMIN', 'SUPER_ADMIN'])('%s: even a partner-marked token is refused, they stay on the web', async (role) => {
    const user = fakeUser(role);
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'partner' })));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
  });

  it("a partner-marked token never works for a shopper account, and a shopper token still does", async () => {
    const customer = fakeUser('CUSTOMER');
    User.findById.mockResolvedValue(customer);
    expect((await me(...bearer(tokenFor(customer, { client: 'partner' })))).status).toBe(403);
    expect((await me(...bearer(tokenFor(customer)))).status).toBe(200);
  });

  it('a token is revoked by a password change (passwordVersion), partner tokens included', async () => {
    const user = fakeUser('RIDER', { passwordVersion: 1 });
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'partner' })));
    expect(res.status).toBe(401);
  });

  it('a deactivated rider is signed out at once', async () => {
    const user = fakeUser('RIDER', { isActive: false });
    User.findById.mockResolvedValue(user);
    expect((await me(...bearer(tokenFor(user, { client: 'partner' })))).status).toBe(401);
  });

  it('a rider with an ordinary cookie session cannot reach brand dashboards', async () => {
    const user = fakeUser('RIDER');
    User.findById.mockResolvedValue(user);
    const res = await request(app).get('/api/v1/deliveries').set('Cookie', getAuthCookie(user));
    expect(res.status).toBe(403);
  });
});
