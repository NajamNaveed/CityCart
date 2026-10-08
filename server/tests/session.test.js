process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const app = require('../src/app');
const { hashPassword } = require('../src/utils/password');
const { AUTH_COOKIE_NAME } = require('../src/config/cookie');
const { getAuthCookie } = require('./helpers/testAuth');

// Jest's testEnvironment runs with NODE_ENV=test via tests/setupEnv.js, so
// the rate limiters are skipped and env.staffSessionHours defaults to 8h.
const STAFF_MAX_AGE_S = 8 * 60 * 60; // 8 hours in seconds
const CUSTOMER_MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days in seconds
const PASSWORD = 'correcthorse123';

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'CUSTOMER',
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

// Users that can actually pass the bcrypt comparison in loginUser.
async function makeHashedUser(overrides = {}) {
  const user = makeFakeUser({ passwordHash: await hashPassword(PASSWORD), ...overrides });
  return user;
}

// Max-Age (in seconds) of the auth cookie in a response, if one was set.
function authCookieMaxAge(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const cookie = setCookie.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!cookie) return null;
  const match = cookie.match(/Max-Age=(\d+)/);
  return match ? Number(match[1]) : null;
}

// Whether the response re-issued (rather than cleared or omitted) the cookie.
function cookieWasIssued(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const cookie = setCookie.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  return Boolean(cookie) && !/Max-Age=0/.test(cookie) && !/^auth_token=;/.test(cookie);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cookie lifetime by role (docs/06 §9 — staff session security)', () => {
  it('issues a 7-day cookie to a customer login', async () => {
    const user = await makeHashedUser();
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const maxAge = authCookieMaxAge(res);
    expect(maxAge).not.toBeNull();
    // 7 days, with a small margin for the request round-trip.
    expect(maxAge).toBeGreaterThan(CUSTOMER_MAX_AGE_S - 60);
    expect(maxAge).toBeLessThanOrEqual(CUSTOMER_MAX_AGE_S);
  });

  it('issues a short-lived cookie to a brand login', async () => {
    const user = await makeHashedUser({
      role: 'BRAND_ADMIN',
      brandId: new mongoose.Types.ObjectId(),
    });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app).post('/api/v1/auth/brand/login').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const maxAge = authCookieMaxAge(res);
    expect(maxAge).not.toBeNull();
    expect(maxAge).toBeGreaterThan(STAFF_MAX_AGE_S - 60);
    expect(maxAge).toBeLessThanOrEqual(STAFF_MAX_AGE_S);
  });

  it('issues a short-lived cookie to a platform admin login', async () => {
    const user = await makeHashedUser({ role: 'SUPER_ADMIN' });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app).post('/api/v1/auth/admin/login').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const maxAge = authCookieMaxAge(res);
    expect(maxAge).not.toBeNull();
    expect(maxAge).toBeLessThanOrEqual(STAFF_MAX_AGE_S);
  });

  it('issues a 7-day cookie on customer registration', async () => {
    const created = makeFakeUser({ passwordHash: '$2a$10$fakehash$' });
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(created);

    const res = await request(app).post('/api/v1/auth/register').send({
      name: created.name,
      email: created.email,
      password: 'correcthorse123',
    });

    expect(res.status).toBe(201);
    const maxAge = authCookieMaxAge(res);
    expect(maxAge).toBeGreaterThan(CUSTOMER_MAX_AGE_S - 60);
  });

  it('sets SameSite=Lax outside production (test env is same-site)', async () => {
    const user = await makeHashedUser();
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    const setCookie = res.headers['set-cookie'].find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });
});

describe('sliding renewal for staff (docs/06 §9)', () => {
  it('re-issues the short-lived cookie on an authenticated staff request', async () => {
    const user = makeFakeUser({
      role: 'BRAND_ADMIN',
      brandId: new mongoose.Types.ObjectId(),
    });
    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', getAuthCookie(user));

    expect(res.status).toBe(200);
    expect(cookieWasIssued(res)).toBe(true);
    const maxAge = authCookieMaxAge(res);
    expect(maxAge).not.toBeNull();
    expect(maxAge).toBeLessThanOrEqual(STAFF_MAX_AGE_S);
  });

  it('re-issues the cookie for a platform admin too', async () => {
    const user = makeFakeUser({ role: 'SUPER_ADMIN' });
    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', getAuthCookie(user));

    expect(res.status).toBe(200);
    expect(cookieWasIssued(res)).toBe(true);
  });

  it('does not touch the cookie for a customer', async () => {
    const user = makeFakeUser({ role: 'CUSTOMER' });
    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', getAuthCookie(user));

    expect(res.status).toBe(200);
    expect(cookieWasIssued(res)).toBe(false);
  });
});
