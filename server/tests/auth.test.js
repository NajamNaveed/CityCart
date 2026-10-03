process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const request = require('supertest');
const mongoose = require('mongoose');

// The User model is mocked so these tests never require a live MongoDB
// connection — app.js itself never connects to a database (only
// server.js does, via config/db.js), so mocking at the model boundary is
// enough to exercise the full HTTP request/response cycle, including
// real bcrypt hashing and real JWT signing/verification.
jest.mock('../src/models/user.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const { hashPassword, comparePassword } = require('../src/utils/password');
const { AUTH_COOKIE_NAME } = require('../src/config/cookie');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'CUSTOMER',
    brandId: undefined,
    isActive: true,
    passwordHash: undefined,
    ...overrides,
  };
}

function getCookieValue(res, cookieName) {
  const setCookieHeader = res.headers['set-cookie'] || [];
  const match = setCookieHeader.find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return null;
  return match.split(';')[0].split('=')[1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/auth/register', () => {
  it('registers a new customer successfully', async () => {
    User.findOne.mockResolvedValue(null); // no existing account
    const created = makeFakeUser();
    User.create.mockResolvedValue(created);

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'correcthorse123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      id: created._id.toString(),
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'CUSTOMER',
    });
    // Never leak sensitive fields.
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/correcthorse123/);

    // Role is always CUSTOMER regardless of what might be sent, and is
    // never taken from client input for this endpoint.
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' })
    );

    // Sets the HTTP-only auth cookie.
    expect(getCookieValue(res, AUTH_COOKIE_NAME)).toBeTruthy();
  });

  it('rejects a duplicate email with 409', async () => {
    User.findOne.mockResolvedValue(makeFakeUser());

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'correcthorse123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects invalid registration input (bad email, short password)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    // Never reaches the database on invalid input.
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it('cannot self-assign a privileged role', async () => {
    User.findOne.mockResolvedValue(null);
    const created = makeFakeUser();
    User.create.mockResolvedValue(created);

    await request(app).post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'correcthorse123',
      role: 'SUPER_ADMIN', // attempted privilege escalation via extra field
    });

    // The role passed to User.create must always be CUSTOMER — the
    // registerSchema doesn't even accept a role field, so it's dropped
    // before reaching the service.
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' })
    );
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockImplementation(async (data) => makeFakeUser(data));

    await request(app).post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'correcthorse123',
    });

    const createArg = User.create.mock.calls[0][0];
    expect(createArg.passwordHash).toBeDefined();
    expect(createArg.passwordHash).not.toBe('correcthorse123');
    expect(createArg).not.toHaveProperty('password');
    // A real bcrypt hash for the original password verifies correctly.
    await expect(comparePassword('correcthorse123', createArg.passwordHash)).resolves.toBe(
      true
    );
  });
});

describe('password hashing utility', () => {
  it('hashes a password so it does not match the plaintext, but still verifies', async () => {
    const hash = await hashPassword('correcthorse123');
    expect(hash).not.toBe('correcthorse123');
    await expect(comparePassword('correcthorse123', hash)).resolves.toBe(true);
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in successfully with correct credentials', async () => {
    const passwordHash = await hashPassword('correcthorse123');
    const user = makeFakeUser({ passwordHash });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorse123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('jane@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(getCookieValue(res, AUTH_COOKIE_NAME)).toBeTruthy();
  });

  it('rejects a wrong password with a generic message', async () => {
    const passwordHash = await hashPassword('correcthorse123');
    const user = makeFakeUser({ passwordHash });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'totally-wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects login for a non-existent email with the same generic message', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects login for an inactive user with the same generic message', async () => {
    const passwordHash = await hashPassword('correcthorse123');
    const user = makeFakeUser({ passwordHash, isActive: false });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorse123' });

    expect(res.status).toBe(401);
    // Identical message/status to the wrong-password case, so an
    // inactive account can't be distinguished from a wrong password.
    expect(res.body.message).toBe('Invalid email or password.');
  });
});

describe('login portals: each role can only use its own door', () => {
  const PORTALS = [
    ['/api/v1/auth/login', 'CUSTOMER'],
    ['/api/v1/auth/brand/login', 'BRAND_ADMIN'],
    ['/api/v1/auth/brand/login', 'BRAND_EMPLOYEE'],
    ['/api/v1/auth/admin/login', 'SUPER_ADMIN'],
  ];
  const ROLES_LIST = ['CUSTOMER', 'BRAND_ADMIN', 'BRAND_EMPLOYEE', 'SUPER_ADMIN'];

  async function attempt(path, role) {
    const passwordHash = await hashPassword('correct-password');
    const brandId = role.startsWith('BRAND') ? new mongoose.Types.ObjectId() : undefined;
    const fakeUser = makeFakeUser({ role, brandId, passwordHash });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });
    return request(app).post(path).send({ email: fakeUser.email, password: 'correct-password' });
  }

  for (const [path, role] of PORTALS) {
    it(`${role} can log in at ${path}`, async () => {
      const res = await attempt(path, role);
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
      expect(getCookieValue(res, AUTH_COOKIE_NAME)).toBeTruthy();
    });
  }

  for (const [path, allowedRole] of PORTALS) {
    for (const role of ROLES_LIST) {
      const allowed = PORTALS.some(([p, r]) => p === path && r === role);
      if (allowed || role === allowedRole) continue;
      it(`${role} is refused at ${path} with the generic error and no cookie`, async () => {
        const res = await attempt(path, role);
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid email or password.');
        expect(getCookieValue(res, AUTH_COOKIE_NAME)).toBeNull();
      });
    }
  }
});

describe('GET /api/v1/auth/me (JWT/cookie authentication)', () => {
  it('returns the authenticated user when a valid session cookie is sent', async () => {
    const passwordHash = await hashPassword('correcthorse123');
    const user = makeFakeUser({ passwordHash });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorse123' });
    expect(loginRes.status).toBe(200);

    // authenticate middleware re-loads the user by id on every request.
    User.findById.mockResolvedValue(user);

    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('jane@example.com');
    expect(meRes.body.user.passwordHash).toBeUndefined();
  });

  it('rejects an unauthenticated request with no cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a request with a garbage/invalid cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=not-a-real-jwt`]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a valid token for a user that is no longer active', async () => {
    const passwordHash = await hashPassword('correcthorse123');
    const user = makeFakeUser({ passwordHash });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorse123' });

    // Account was deactivated after the token was issued.
    User.findById.mockResolvedValue({ ...user, isActive: false });

    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the authentication cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const setCookieHeader = res.headers['set-cookie'] || [];
    const cleared = setCookieHeader.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    expect(cleared).toBeDefined();
    // clearCookie sends an already-expired cookie with an empty value.
    expect(cleared).toMatch(new RegExp(`${AUTH_COOKIE_NAME}=;`));
  });
});