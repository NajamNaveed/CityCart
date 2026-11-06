process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async () => 'HASHED'),
  comparePassword: jest.fn(async () => true),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const app = require('../src/app');
const env = require('../src/config/env');
const { signToken } = require('../src/utils/jwt');
const { getAuthCookie } = require('./helpers/testAuth');
const { ROLES } = require('../src/config/roles');

const oid = () => new mongoose.Types.ObjectId();
const PASSWORD = 'correcthorse123';

let user;
let memberships;
let brands;

function makeUser() {
  user = {
    _id: oid(),
    name: 'Multi Brand',
    email: 'multi@example.com',
    role: ROLES.BRAND_EMPLOYEE,
    brandId: null,
    isActive: true,
    passwordVersion: 0,
    passwordHash: 'HASHED',
    emailVerifiedAt: new Date(),
  };
  return user;
}

function makeMembership(brandId, over = {}) {
  return {
    _id: oid(),
    userId: user._id,
    brandId,
    role: ROLES.BRAND_EMPLOYEE,
    permissions: ['orders.view'],
    isActive: true,
    ...over,
  };
}

function wireModels() {
  User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  User.findById.mockImplementation(async (id) => (String(id) === String(user._id) ? user : null));
  Employee.find.mockImplementation(async (filter) =>
    memberships.filter((m) => String(m.userId) === String(filter.userId) && m.isActive === true)
  );
  Employee.findOne.mockImplementation(async (filter) =>
    memberships.find(
      (m) =>
        String(m.userId) === String(filter.userId) &&
        String(m.brandId) === String(filter.brandId) &&
        m.isActive === true &&
        (!filter._id || String(m._id) === String(filter._id))
    ) || null
  );
  Brand.find.mockImplementation(async (filter) => {
    const ids = (filter && filter._id && filter._id.$in) || [];
    return brands.filter((b) => ids.some((id) => String(id) === String(b._id)));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  makeUser();
  memberships = [];
  brands = [];
  wireModels();
});

describe('workspace login for a multi-brand employee', () => {
  it('answers 409 WORKSPACE_REQUIRED after a correct password, with no session', async () => {
    const a = oid();
    const b = oid();
    brands = [
      { _id: a, name: 'Acme' },
      { _id: b, name: 'Bravo' },
    ];
    memberships = [makeMembership(a), makeMembership(b)];

    const res = await request(app)
      .post('/api/v1/auth/brand/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'WORKSPACE_REQUIRED', message: 'Choose a workspace.' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ brandId: String(a), brandName: 'Acme', role: ROLES.BRAND_EMPLOYEE }),
        expect.objectContaining({ brandId: String(b), brandName: 'Bravo', role: ROLES.BRAND_EMPLOYEE }),
      ])
    );
    expect(typeof res.body.workspaceToken).toBe('string');
    const payload = jwt.verify(res.body.workspaceToken, env.jwtSecret);
    expect(payload).toMatchObject({ purpose: 'workspace', portal: 'brand', userId: String(user._id) });
  });

  it('a workspace token is not a session', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a), makeMembership(b)];

    const login = await request(app).post('/api/v1/auth/brand/login').send({ email: user.email, password: PASSWORD });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`auth_token=${login.body.workspaceToken}`]);

    expect(res.status).toBe(401);
  });

  it('exchanges the token and chosen brand for a normal staff session scoped to that membership', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a, { permissions: ['orders.view'] }), makeMembership(b, { permissions: ['products.view'] })];

    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/brand/login').send({ email: user.email, password: PASSWORD });
    const chosen = memberships[1];

    const res = await agent
      .post('/api/v1/auth/workspace')
      .send({ workspaceToken: login.body.workspaceToken, brandId: String(b) });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: ROLES.BRAND_EMPLOYEE, brandId: String(b) });
    expect(res.headers['set-cookie'].some((c) => c.startsWith('auth_token='))).toBe(true);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ brandId: String(b), membershipId: String(chosen._id) });
    expect(me.body.user.permissions).toEqual(['products.view']);
  });

  it('refuses a brand whose membership was revoked after the workspace token was issued', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a), makeMembership(b)];

    const login = await request(app).post('/api/v1/auth/brand/login').send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(409);
    memberships = [memberships[0]]; // removed from Bravo between login and choice
    const res = await request(app)
      .post('/api/v1/auth/workspace')
      .send({ workspaceToken: login.body.workspaceToken, brandId: String(b) });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKSPACE_UNAVAILABLE');
  });

  it('gives the staff app a body token marked client:staff, not a cookie', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a), makeMembership(b)];

    const login = await request(app)
      .post('/api/v1/auth/staff/login')
      .set('X-Client', 'staff')
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(409);
    expect(login.body.code).toBe('WORKSPACE_REQUIRED');

    const res = await request(app)
      .post('/api/v1/auth/workspace')
      .set('X-Client', 'staff')
      .send({ workspaceToken: login.body.workspaceToken, brandId: String(a) });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({
      role: ROLES.BRAND_EMPLOYEE,
      brandId: String(a),
      client: 'staff',
      membershipId: String(memberships[0]._id),
    });
  });

  it('the web cannot use a staff workspace token', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a), makeMembership(b)];

    const login = await request(app)
      .post('/api/v1/auth/staff/login')
      .set('X-Client', 'staff')
      .send({ email: user.email, password: PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/workspace')
      .send({ workspaceToken: login.body.workspaceToken, brandId: String(a) });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_APP_ONLY');
  });
});

describe('membership revocation and switching', () => {
  it('a session whose membership was removed is refused, never downgraded', async () => {
    const a = oid();
    const b = oid();
    brands = [{ _id: a, name: 'Acme' }];
    memberships = [makeMembership(a)];

    const token = signToken({
      userId: user._id,
      role: ROLES.BRAND_EMPLOYEE,
      brandId: b, // token claims another brand
      passwordVersion: 0,
    });
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', [`auth_token=${token}`]);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
  });

  it('switches to another active membership without the password', async () => {
    const a = oid();
    const b = oid();
    const tokenBrand = oid();
    brands = [{ _id: a, name: 'Acme' }, { _id: b, name: 'Bravo' }];
    memberships = [makeMembership(a, { permissions: ['orders.view'] }), makeMembership(b, { permissions: ['products.manage'] })];

    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/workspace')
      .send({
        workspaceToken: signToken(
          { userId: user._id, role: ROLES.BRAND_EMPLOYEE, purpose: 'workspace', portal: 'brand', passwordVersion: 0 },
          { expiresIn: '5m' }
        ),
        brandId: String(a),
      });

    const res = await agent.post('/api/v1/auth/workspace/switch').send({ brandId: String(b) });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ brandId: String(b) });

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.user).toMatchObject({ brandId: String(b) });
    expect(me.body.user.permissions).toEqual(['products.manage']);

    const denied = await agent.post('/api/v1/auth/workspace/switch').send({ brandId: String(tokenBrand) });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('WORKSPACE_UNAVAILABLE');
  });

  it('a brand owner cannot switch workspaces', async () => {
    const a = oid();
    user.role = ROLES.BRAND_ADMIN;
    user.brandId = a;
    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/workspace/switch')
      .set('Cookie', getAuthCookie(user))
      .send({ brandId: String(a) });

    expect(res.status).toBe(403);
  });
});
