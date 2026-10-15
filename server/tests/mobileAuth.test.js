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
const { authenticateHandshake } = require('../src/sockets');
const { AUTH_COOKIE_NAME } = require('../src/config/cookie');

const oid = () => new mongoose.Types.ObjectId();
const MOBILE = ['X-Client', 'mobile'];

function fakeUser(overrides = {}) {
  return { _id: oid(), name: 'Sana Iqbal', email: 'sana@example.com', role: 'CUSTOMER', isActive: true, passwordVersion: 0, ...overrides };
}
const tokenFor = (user, options) =>
  signToken({ userId: user._id, role: user.role, brandId: user.brandId, passwordVersion: user.passwordVersion || 0 }, options);
const cookieFor = (user) => `${AUTH_COOKIE_NAME}=${tokenFor(user)}`;
const setCookies = (res) => res.headers['set-cookie'] || [];

beforeEach(() => {
  jest.resetAllMocks();
});

describe('login for the native app (X-Client: mobile)', () => {
  async function loginMock() {
    const user = fakeUser({ passwordHash: await hashPassword('correcthorse123') });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    return user;
  }

  it('returns the token in the body and sets no cookie, and the token works as a Bearer token', async () => {
    const user = await loginMock();

    const res = await request(app).post('/api/v1/auth/login').set(...MOBILE).send({ email: 'sana@example.com', password: 'correcthorse123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(setCookies(res)).toEqual([]);

    User.findById.mockResolvedValue(user);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('sana@example.com');
  });

  it('never puts the token in a response to the web (no X-Client header): cookie only', async () => {
    await loginMock();

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'sana@example.com', password: 'correcthorse123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(setCookies(res).some((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`) && /HttpOnly/i.test(c))).toBe(true);
  });

  it('does the same for registration', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockImplementation(async (data) => ({ _id: oid(), role: 'CUSTOMER', isActive: true, passwordVersion: 0, ...data }));
    const body = { name: 'Sana Iqbal', email: 'sana@example.com', password: 'correcthorse123' };

    const mobile = await request(app).post('/api/v1/auth/register').set(...MOBILE).send(body);
    expect(mobile.status).toBe(201);
    expect(typeof mobile.body.token).toBe('string');
    expect(setCookies(mobile)).toEqual([]);

    User.findOne.mockResolvedValue(null);
    const web = await request(app).post('/api/v1/auth/register').send(body);
    expect(web.status).toBe(201);
    expect(web.body.token).toBeUndefined();
    expect(setCookies(web).length).toBe(1);
  });

  it('refuses the seller and admin doors outright, before looking up any account', async () => {
    for (const path of ['/api/v1/auth/brand/login', '/api/v1/auth/admin/login']) {
      const res = await request(app).post(path).set(...MOBILE).send({ email: 'owner@example.com', password: 'whatever123' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WEB_ONLY');
      expect(res.body.token).toBeUndefined();
    }
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('still gives the generic error for wrong credentials, with no token', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = await request(app).post('/api/v1/auth/login').set(...MOBILE).send({ email: 'nobody@example.com', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
});

describe('Authorization: Bearer on the API', () => {
  const me = (authorization) => request(app).get('/api/v1/auth/me').set('Authorization', authorization);

  it('accepts a valid customer token', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);
    expect((await me(`Bearer ${tokenFor(user)}`)).status).toBe(200);
    expect((await me(`bearer ${tokenFor(user)}`)).status).toBe(200); // the scheme name is case-insensitive
  });

  it('rejects missing, malformed, tampered and expired tokens with the same message', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);
    const expired = jwt.sign({ userId: user._id, role: 'CUSTOMER', passwordVersion: 0, exp: Math.floor(Date.now() / 1000) - 60 }, env.jwtSecret);
    const forged = jwt.sign({ userId: user._id, role: 'CUSTOMER', passwordVersion: 0 }, 'not-the-real-secret');

    for (const header of ['Bearer', 'Bearer ', 'Bearer a b', 'Bearer not.a.jwt', `Bearer ${expired}`, `Bearer ${forged}`]) {
      const res = await me(header);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid or expired session.');
    }
  });

  it('still checks the database on every request: inactive accounts and old tokens are refused', async () => {
    const user = fakeUser();
    const token = tokenFor(user);

    User.findById.mockResolvedValue({ ...user, isActive: false });
    expect((await me(`Bearer ${token}`)).status).toBe(401);

    User.findById.mockResolvedValue(null);
    expect((await me(`Bearer ${token}`)).status).toBe(401);

    // password changed after the token was issued
    User.findById.mockResolvedValue({ ...user, passwordVersion: 1 });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it('is for shoppers only: a seller or admin token is refused as a Bearer token but still works as the web cookie', async () => {
    for (const role of ['BRAND_ADMIN', 'BRAND_EMPLOYEE', 'SUPER_ADMIN']) {
      const staff = fakeUser({ role, brandId: oid() });
      User.findById.mockResolvedValue(staff);
      const bearer = await me(`Bearer ${tokenFor(staff)}`);
      expect(bearer.status).toBe(403);
      expect(bearer.body.code).toBe('WEB_ONLY');
    }
    const owner = fakeUser({ role: 'BRAND_ADMIN', brandId: oid() });
    User.findById.mockResolvedValue(owner);
    const viaCookie = await request(app).get('/api/v1/auth/me').set('Cookie', cookieFor(owner));
    expect(viaCookie.status).toBe(200);
  });

  it('leaves other schemes alone, so web users behind a Basic-auth proxy are not broken', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookieFor(user)).set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(200);
  });

  it('uses the header over a cookie when both are sent, so a bad header is never rescued by a cookie', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookieFor(user)).set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('does not bypass authorization: a customer token is still refused on seller routes', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);
    const res = await request(app).get('/api/v1/brand/orders').set('Authorization', `Bearer ${tokenFor(user)}`);
    expect(res.status).toBe(403);
  });

  it('requires a token at all', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('socket handshake', () => {
  // Stands in for a socket.io socket: handshake.auth is what the app sends,
  // request.headers.cookie is what a browser sends.
  const socketWith = ({ auth, cookie } = {}) => ({ handshake: { auth }, request: { headers: cookie ? { cookie } : {} }, data: {} });
  const run = async (socket, user) => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const next = jest.fn();
    await authenticateHandshake(socket, next);
    return next.mock.calls[0][0]; // undefined = accepted, Error = refused
  };

  it('accepts a customer token from the handshake auth payload and joins them to their own room', async () => {
    const user = fakeUser();
    const socket = socketWith({ auth: { token: tokenFor(user) } });
    expect(await run(socket, user)).toBeUndefined();
    expect(socket.data.userId).toBe(String(user._id));
  });

  it('still accepts the browser cookie', async () => {
    const user = fakeUser({ role: 'BRAND_ADMIN', brandId: oid() });
    expect(await run(socketWith({ cookie: cookieFor(user) }), user)).toBeUndefined();
  });

  it('refuses a connection with no credentials, a bad token, or a non-string token', async () => {
    const user = fakeUser();
    expect((await run(socketWith(), user)).message).toBe('Unauthorized');
    expect((await run(socketWith({ auth: { token: 'junk' } }), user)).message).toBe('Unauthorized');
    expect((await run(socketWith({ auth: { token: { $ne: null } } }), user)).message).toBe('Unauthorized');
    const forged = jwt.sign({ userId: user._id, role: 'CUSTOMER', passwordVersion: 0 }, 'not-the-real-secret');
    expect((await run(socketWith({ auth: { token: forged } }), user)).message).toBe('Unauthorized');
  });

  it('refuses inactive accounts and tokens issued before a password change', async () => {
    const user = fakeUser();
    expect((await run(socketWith({ auth: { token: tokenFor(user) } }), { ...user, isActive: false })).message).toBe('Unauthorized');
    expect((await run(socketWith({ auth: { token: tokenFor(user) } }), { ...user, passwordVersion: 2 })).message).toBe('Unauthorized');
    // the same rule now applies to the cookie path
    expect((await run(socketWith({ cookie: cookieFor(user) }), { ...user, passwordVersion: 2 })).message).toBe('Unauthorized');
  });

  it('keeps seller and admin accounts off the Bearer path, as on HTTP', async () => {
    const owner = fakeUser({ role: 'BRAND_ADMIN', brandId: oid() });
    expect((await run(socketWith({ auth: { token: tokenFor(owner) } }), owner)).message).toBe('Unauthorized');
  });
});
