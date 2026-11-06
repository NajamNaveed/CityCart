const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/serviceProvider.model');
jest.mock('../src/models/serviceCategory.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/city.model');
jest.mock('../src/models/branch.model');
jest.mock('../src/utils/password', () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));
jest.mock('../src/utils/transaction', () => ({ runInTransaction: (work) => work('SESSION') }));
jest.mock('../src/services/notification.service');
jest.mock('../src/services/emailAuth.service', () => ({
  sendVerificationEmail: jest.fn(),
}));

const User = require('../src/models/user.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const ServiceCategory = require('../src/models/serviceCategory.model');
const Block = require('../src/models/block.model');
const City = require('../src/models/city.model');
const notifications = require('../src/services/notification.service');
const emailAuth = require('../src/services/emailAuth.service');
const { comparePassword, hashPassword } = require('../src/utils/password');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();

const providerDoc = (over = {}) => ({
  _id: oid(),
  userId: oid(),
  displayName: 'Sparkle Home',
  legalName: 'Sparkle Home Services',
  slug: 'sparkle-home',
  categoryId: oid(),
  cityId: oid(),
  blockId: oid(),
  location: { type: 'Point', coordinates: [73.08, 31.42] },
  addressLine: 'Street 1',
  phone: '+923001234567',
  bio: 'Home cleaning',
  startingAtPrice: 250000,
  status: 'PENDING',
  verification: 'UNVERIFIED',
  ratingAvg: 0,
  ratingCount: 0,
  completedBookings: 0,
  rankScore: 0,
  billingStatus: 'ACTIVE',
  blockChangedAt: new Date(),
  blockHistory: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const application = (over = {}) => ({
  owner: {
    name: 'Sara Owner',
    email: 'sara@services.com',
    password: 'secret123',
    phone: '+923001234567',
    ...over.owner,
  },
  provider: {
    displayName: 'Sparkle Home',
    categoryId: oid().toString(),
    cityId: oid().toString(),
    blockId: oid().toString(),
    startingAtPrice: 250000,
    latitude: 31.42,
    longitude: 73.08,
    ...over.provider,
  },
});

let city;
let block;

function applyWorld() {
  city = { _id: oid(), isActive: true };
  block = { _id: oid(), cityId: city._id, isActive: true, center: { type: 'Point', coordinates: [73.08, 31.42] } };
  City.findOne.mockResolvedValue(city);
  ServiceCategory.findOne.mockResolvedValue({ _id: oid(), name: 'Home Cleaning', isActive: true });
  Block.findOne.mockResolvedValue(block);
  User.findOne.mockResolvedValue(null);
  ServiceProvider.exists.mockResolvedValue(null);
  ServiceProvider.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  User.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  emailAuth.sendVerificationEmail.mockResolvedValue(true);
}

function asRole(role) {
  const user = { _id: oid(), role, isActive: true, ...(role === ROLES.BRAND_ADMIN && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

function asProvider(over = {}) {
  const provider = providerDoc(over);
  const user = { _id: provider.userId, role: ROLES.SERVICE_PROVIDER, isActive: true };
  User.findById.mockResolvedValue(user);
  ServiceProvider.findOne.mockResolvedValue(provider);
  return { provider, user, cookie: ['Cookie', getAuthCookie(user)] };
}

const populated = (provider) => ({ populate: () => Promise.resolve(provider) });

beforeEach(() => {
  jest.resetAllMocks();
  hashPassword.mockResolvedValue('HASHED');
  comparePassword.mockResolvedValue(true);
  emailAuth.sendVerificationEmail.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

describe('POST /api/v1/services/apply', () => {
  const post = (body) => request(app).post('/api/v1/services/apply').send(body);

  it.each([
    ['owner name missing', (a) => delete a.owner.name],
    ['owner phone missing', (a) => delete a.owner.phone],
    ['owner phone invalid', (a) => (a.owner.phone = 'abc')],
    ['weak password', (a) => (a.owner.password = '123')],
    ['bad email', (a) => (a.owner.email = 'nope')],
    ['display name missing', (a) => delete a.provider.displayName],
    ['invalid categoryId', (a) => (a.provider.categoryId = 'xyz')],
    ['invalid cityId', (a) => (a.provider.cityId = 'xyz')],
    ['invalid blockId', (a) => (a.provider.blockId = 'xyz')],
    ['negative startingAtPrice', (a) => (a.provider.startingAtPrice = -1)],
    ['fractional startingAtPrice', (a) => (a.provider.startingAtPrice = 10.5)],
    ['pin without latitude', (a) => delete a.provider.latitude],
    ['latitude out of range', (a) => (a.provider.latitude = 95)],
    ['bio too long', (a) => (a.provider.bio = 'x'.repeat(1001))],
    ['provider section missing', (a) => delete a.provider],
  ])('400 and nothing created when: %s', async (_name, mutate) => {
    applyWorld();
    const body = application();
    mutate(body);

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(ServiceProvider.create).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
    expect(emailAuth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('is public and creates a PENDING provider plus an unverified SERVICE owner', async () => {
    applyWorld();
    const body = application();

    const res = await post(body);

    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.provider).toMatchObject({ displayName: 'Sparkle Home', status: 'PENDING' });
    expect(res.body.user).toMatchObject({ email: 'sara@services.com', role: ROLES.SERVICE_PROVIDER, emailVerified: false });

    const [[provider], providerOpts] = ServiceProvider.create.mock.calls[0];
    expect(providerOpts).toEqual({ session: 'SESSION' });
    expect(provider).toMatchObject({
      displayName: 'Sparkle Home',
      slug: 'sparkle-home',
      status: 'PENDING',
      verification: 'UNVERIFIED',
      startingAtPrice: 250000,
      phone: '+923001234567',
    });
    expect(provider.location).toEqual({ type: 'Point', coordinates: [73.08, 31.42] });
    expect(provider.blockHistory).toHaveLength(1);
    expect(String(provider.blockHistory[0].blockId)).toBe(String(block._id));

    const [[user]] = User.create.mock.calls[0];
    expect(user).toMatchObject({
      role: ROLES.SERVICE_PROVIDER,
      accountType: 'SERVICE',
      email: 'sara@services.com',
      passwordHash: 'HASHED',
      emailVerifiedAt: null,
    });
    expect(String(user._id)).toBe(String(provider.userId));
    expect(emailAuth.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'sara@services.com' }));
    // The super admin hears about the application after verification, not here.
    expect(notifications.notifySuperAdminsOfNewProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/HASHED|secret123|passwordHash/);
  });

  it('uses the provider phone/address when given and falls back to the owner phone', async () => {
    applyWorld();
    const withOwn = application();
    withOwn.provider.phone = '+923009999999';
    withOwn.provider.addressLine = 'Office 4, Main Boulevard';
    await post(withOwn);
    expect(ServiceProvider.create.mock.calls[0][0][0]).toMatchObject({
      phone: '+923009999999',
      addressLine: 'Office 4, Main Boulevard',
    });

    applyWorld();
    const fallback = application();
    fallback.provider.phone = undefined;
    await post(fallback);
    expect(ServiceProvider.create.mock.calls.at(-1)[0][0].phone).toBe('+923001234567');
  });

  it('400 when the pin is outside the selected block outline', async () => {
    applyWorld();
    Block.findOne.mockResolvedValue({
      ...block,
      area: {
        type: 'Polygon',
        coordinates: [[[73.2, 31.5], [73.3, 31.5], [73.3, 31.6], [73.2, 31.6], [73.2, 31.5]]],
      },
    });

    const res = await post(application());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/outside/i);
    expect(ServiceProvider.create).not.toHaveBeenCalled();
  });

  it('400 when the city or category is unknown or inactive', async () => {
    applyWorld();
    City.findOne.mockResolvedValue(null);
    expect((await post(application())).status).toBe(400);
    expect(ServiceProvider.create).not.toHaveBeenCalled();

    applyWorld();
    ServiceCategory.findOne.mockResolvedValue(null);
    const res = await post(application());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
    expect(ServiceProvider.create).not.toHaveBeenCalled();
  });

  it('400 when the block is inactive or belongs to another city', async () => {
    applyWorld();
    Block.findOne.mockResolvedValue(null);
    let res = await post(application());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/blockId/i);

    applyWorld();
    Block.findOne.mockResolvedValue({ ...block, cityId: oid() });
    res = await post(application());
    expect(res.status).toBe(400);
    expect(ServiceProvider.create).not.toHaveBeenCalled();
  });

  it('409 for a taken email or provider name', async () => {
    applyWorld();
    User.findOne.mockResolvedValue({ _id: oid() });
    expect((await post(application())).status).toBe(409);

    applyWorld();
    ServiceProvider.exists.mockResolvedValue({ _id: oid() });
    const res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/name/i);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('409 when a unique-index race is lost (E11000) and no email is sent', async () => {
    applyWorld();
    ServiceProvider.create.mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key collection: citycart.serviceproviders index: slug_1'), { code: 11000 })
    );

    const res = await post(application());

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/name/i);
    expect(emailAuth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('status, role, accountType and userId are never taken from the client', async () => {
    applyWorld();
    const body = application();
    body.provider.status = 'ACTIVE';
    body.provider.verification = 'VERIFIED';
    body.provider.userId = oid().toString();
    body.owner.role = ROLES.SUPER_ADMIN;
    body.owner.accountType = 'PLATFORM_ADMIN';

    expect((await post(body)).status).toBe(201);

    const [[provider]] = ServiceProvider.create.mock.calls[0];
    const [[user]] = User.create.mock.calls[0];
    expect(provider).toMatchObject({ status: 'PENDING', verification: 'UNVERIFIED' });
    expect(String(user._id)).toBe(String(provider.userId));
    expect(user).toMatchObject({ role: ROLES.SERVICE_PROVIDER, accountType: 'SERVICE' });
  });
});

describe('GET /api/v1/services/categories', () => {
  it('is public and returns only active categories in display order', async () => {
    ServiceCategory.find.mockReturnValue({
      sort: () => Promise.resolve([{ name: 'Home Cleaning' }, { name: 'Plumbing' }]),
    });

    const res = await request(app).get('/api/v1/services/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(2);
    expect(ServiceCategory.find).toHaveBeenCalledWith({ isActive: true });
  });
});

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/service/login', () => {
  const login = (body, headers = {}) => request(app).post('/api/v1/auth/service/login').set(headers).send(body);
  const credentials = { email: 'owner@services.com', password: 'secret123' };

  function loginWorld(userOver = {}, providerOver = {}) {
    const user = {
      _id: oid(),
      email: 'owner@services.com',
      role: ROLES.SERVICE_PROVIDER,
      accountType: 'SERVICE',
      isActive: true,
      emailVerifiedAt: new Date(),
      passwordHash: 'HASHED',
      passwordVersion: 0,
      ...userOver,
    };
    const provider = providerDoc({ userId: user._id, ...providerOver });
    User.findOne.mockReturnValue({ select: () => Promise.resolve(user) });
    ServiceProvider.findOne.mockResolvedValue(provider);
    return { user, provider };
  }

  it('signs in a PENDING provider, sets the web cookie and returns the tenant', async () => {
    const { provider } = loginWorld({}, { status: 'PENDING' });

    const res = await login(credentials);

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toMatchObject({
      email: 'owner@services.com',
      role: ROLES.SERVICE_PROVIDER,
      provider: { displayName: 'Sparkle Home', status: 'PENDING' },
    });
    expect(String(res.body.user.providerId)).toBe(String(provider._id));
    expect(JSON.stringify(res.body)).not.toMatch(/HASHED|passwordHash/);
  });

  it('refuses an unverified owner with EMAIL_NOT_VERIFIED', async () => {
    loginWorld({ emailVerifiedAt: null });
    const res = await login(credentials);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('refuses a suspended or terminated provider with the generic error', async () => {
    for (const status of ['SUSPENDED', 'TERMINATED']) {
      loginWorld({}, { status });
      const res = await login(credentials);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password.');
    }
  });

  it('refuses a brand or customer account on the service portal', async () => {
    const brandUser = {
      _id: oid(),
      email: 'owner@services.com',
      role: ROLES.BRAND_ADMIN,
      accountType: 'SERVICE',
      isActive: true,
      emailVerifiedAt: new Date(),
      passwordHash: 'HASHED',
    };
    User.findOne.mockReturnValue({ select: () => Promise.resolve(brandUser) });
    const res = await login(credentials);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('is web-only: the mobile app cannot use the service portal', async () => {
    const res = await login(credentials, { 'X-Client': 'mobile' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Provider tenant
// ---------------------------------------------------------------------------

describe('/api/v1/services/provider', () => {
  it('401 anonymous, 403 for a brand admin, customer or picker', async () => {
    expect((await request(app).get('/api/v1/services/provider/me')).status).toBe(401);

    for (const role of [ROLES.BRAND_ADMIN, ROLES.CUSTOMER, ROLES.PICKER]) {
      const { cookie } = asRole(role);
      const res = await request(app).get('/api/v1/services/provider/me').set(...cookie);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
    }
  });

  it("401 as soon as the provider's tenant is suspended or terminated", async () => {
    for (const status of ['SUSPENDED', 'TERMINATED']) {
      const { cookie } = asProvider({ status });
      const res = await request(app).get('/api/v1/services/provider/me').set(...cookie);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PROVIDER_INACTIVE');
    }
  });

  it('GET /me returns the provider and a safe owner, with no password hash', async () => {
    const { provider, user, cookie } = asProvider();
    provider.categoryId = { _id: oid(), name: 'Home Cleaning', slug: 'home-cleaning' };
    provider.cityId = { _id: provider.cityId, name: 'Faisalabad' };
    provider.blockId = { _id: provider.blockId, name: 'Block A' };
    ServiceProvider.findById.mockReturnValue(populated(provider));
    // authenticate loads the session user first; the controller then loads the owner.
    User.findById
      .mockResolvedValueOnce(user)
      .mockResolvedValue({ _id: provider.userId, name: 'Owner', email: 'o@x.com', passwordHash: 'SECRET' });

    const res = await request(app).get('/api/v1/services/provider/me').set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.provider).toMatchObject({ displayName: 'Sparkle Home', status: 'PENDING' });
    expect(res.body.owner.email).toBe('o@x.com');
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|passwordHash/);
  });

  it('PATCH /me updates profile fields only, never slug, category, status or tenant', async () => {
    const { provider, cookie } = asProvider();
    ServiceProvider.findById
      .mockReturnValueOnce(provider)
      .mockReturnValueOnce(populated({ ...provider, displayName: 'Sparkle Plus', startingAtPrice: 300000 }));

    const res = await request(app)
      .patch('/api/v1/services/provider/me')
      .set(...cookie)
      .send({
        displayName: 'Sparkle Plus',
        startingAtPrice: 300000,
        status: 'ACTIVE',
        slug: 'hijacked',
        categoryId: oid().toString(),
        userId: oid().toString(),
      });

    expect(res.status).toBe(200);
    expect(provider.displayName).toBe('Sparkle Plus');
    expect(provider.startingAtPrice).toBe(300000);
    expect(provider.status).toBe('PENDING');
    expect(provider.slug).toBe('sparkle-home');
    expect(provider.save).toHaveBeenCalledTimes(1);
  });

  it('PATCH /me rejects an empty body and invalid values', async () => {
    const { cookie } = asProvider();
    expect((await request(app).patch('/api/v1/services/provider/me').set(...cookie).send({})).status).toBe(400);

    const res = await request(app)
      .patch('/api/v1/services/provider/me')
      .set(...cookie)
      .send({ bio: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(ServiceProvider.findById).not.toHaveBeenCalled();
  });

  describe('PATCH /provider/block', () => {
    const patch = (cookie, body) => request(app).patch('/api/v1/services/provider/block').set(...cookie).send(body);

    it('allows a pin move inside the current block without spending the monthly change', async () => {
      const { provider, cookie } = asProvider();
      const before = provider.blockChangedAt;
      ServiceProvider.findById
        .mockReturnValueOnce(provider)
        .mockReturnValueOnce(populated(provider));
      Block.findOne.mockResolvedValue({ _id: provider.blockId, cityId: provider.cityId, isActive: true, center: provider.location });

      const res = await patch(cookie, { blockId: String(provider.blockId), latitude: 31.421, longitude: 73.081 });

      expect(res.status).toBe(200);
      expect(provider.location.coordinates).toEqual([73.081, 31.421]);
      expect(provider.blockChangedAt).toBe(before);
      expect(provider.blockHistory).toHaveLength(0);
    });

    it("refuses a second block change in the same calendar month with BLOCK_CHANGE_LIMIT", async () => {
      const { provider, cookie } = asProvider({ blockChangedAt: new Date() });
      ServiceProvider.findById.mockReturnValueOnce(provider);
      Block.findOne.mockResolvedValue({ _id: oid(), cityId: provider.cityId, isActive: true, center: provider.location });

      const res = await patch(cookie, { blockId: oid().toString(), latitude: 31.42, longitude: 73.08 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BLOCK_CHANGE_LIMIT');
      expect(provider.save).not.toHaveBeenCalled();
    });

    it('allows a block change in a later month and records history', async () => {
      const { provider, cookie } = asProvider({ blockChangedAt: new Date(Date.UTC(2020, 0, 15)) });
      const nextBlockId = oid();
      ServiceProvider.findById
        .mockReturnValueOnce(provider)
        .mockReturnValueOnce(populated(provider));
      Block.findOne.mockResolvedValue({ _id: nextBlockId, cityId: provider.cityId, isActive: true, center: provider.location });

      const res = await patch(cookie, { blockId: String(nextBlockId), latitude: 31.42, longitude: 73.08 });

      expect(res.status).toBe(200);
      expect(String(provider.blockId)).toBe(String(nextBlockId));
      expect(provider.blockHistory).toHaveLength(1);
      expect(provider.blockChangedAt.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('400 for an inactive block, another city, or a pin outside it', async () => {
      const { provider, cookie } = asProvider({ blockChangedAt: new Date(Date.UTC(2020, 0, 15)) });
      ServiceProvider.findById.mockReturnValue(provider);
      Block.findOne.mockResolvedValue(null);
      expect((await patch(cookie, { blockId: oid().toString(), latitude: 31.42, longitude: 73.08 })).status).toBe(400);

      Block.findOne.mockResolvedValue({ _id: oid(), cityId: oid(), isActive: true, center: provider.location });
      expect((await patch(cookie, { blockId: oid().toString(), latitude: 31.42, longitude: 73.08 })).status).toBe(400);

      Block.findOne.mockResolvedValue({
        _id: provider.blockId,
        cityId: provider.cityId,
        isActive: true,
        area: { type: 'Polygon', coordinates: [[[73.2, 31.5], [73.3, 31.5], [73.3, 31.6], [73.2, 31.6], [73.2, 31.5]]] },
      });
      const outside = await patch(cookie, { blockId: String(provider.blockId), latitude: 31.42, longitude: 73.08 });
      expect(outside.status).toBe(400);
      expect(outside.body.message).toMatch(/outside/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Admin approval
// ---------------------------------------------------------------------------

describe('/api/v1/admin/providers', () => {
  it('401 anonymous; 403 for brand admins, customers and providers', async () => {
    expect((await request(app).get('/api/v1/admin/providers')).status).toBe(401);

    for (const role of [ROLES.BRAND_ADMIN, ROLES.CUSTOMER]) {
      const { cookie } = asRole(role);
      expect((await request(app).get('/api/v1/admin/providers').set(...cookie)).status).toBe(403);
    }

    const { cookie } = asProvider();
    expect((await request(app).get('/api/v1/admin/providers').set(...cookie)).status).toBe(403);
  });

  it('lists providers with status filter, escaped search and pagination', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const items = [providerDoc({ status: 'PENDING' })];
    const limit = jest.fn().mockReturnValue({ populate: () => Promise.resolve(items) });
    ServiceProvider.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    ServiceProvider.countDocuments.mockResolvedValue(1);
    User.find.mockResolvedValue([{ _id: items[0].userId, name: 'Owner', email: 'o@x.com' }]);

    const res = await request(app)
      .get('/api/v1/admin/providers?status=PENDING&search=(a%2B)&page=2&limit=5')
      .set(...cookie);

    expect(res.status).toBe(200);
    expect(ServiceProvider.find).toHaveBeenCalledWith({
      status: 'PENDING',
      $or: [
        { displayName: { $regex: '\\(a\\+\\)', $options: 'i' } },
        { legalName: { $regex: '\\(a\\+\\)', $options: 'i' } },
        { slug: { $regex: '\\(a\\+\\)', $options: 'i' } },
      ],
    });
    expect(res.body.pagination).toEqual({ page: 2, limit: 5, total: 1, pages: 1 });
    expect(res.body.providers[0].owner.email).toBe('o@x.com');

    expect((await request(app).get('/api/v1/admin/providers?status=NOPE').set(...cookie)).status).toBe(400);
  });

  it('GET /:id returns the provider and owner without secrets, or 404', async () => {
    const { cookie, user: admin } = asRole(ROLES.SUPER_ADMIN);
    const provider = providerDoc();
    const owner = { _id: provider.userId, name: 'Owner', email: 'o@x.com', passwordHash: 'SECRET' };
    ServiceProvider.findById.mockReturnValue(populated(provider));
    User.findById.mockImplementation(async (id) => (String(id) === String(admin._id) ? admin : owner));

    const res = await request(app).get(`/api/v1/admin/providers/${provider._id}`).set(...cookie);
    expect(res.status).toBe(200);
    expect(res.body.owner.email).toBe('o@x.com');
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|passwordHash/);

    ServiceProvider.findById.mockReturnValue(populated(null));
    expect((await request(app).get(`/api/v1/admin/providers/${oid()}`).set(...cookie)).status).toBe(404);
  });

  describe('PATCH /:id/status', () => {
    const patch = (cookie, id, body) => request(app).patch(`/api/v1/admin/providers/${id}/status`).set(...cookie).send(body);

    it('requires a reason when suspending or terminating', async () => {
      const { cookie } = asRole(ROLES.SUPER_ADMIN);
      for (const status of ['SUSPENDED', 'TERMINATED']) {
        const res = await patch(cookie, oid(), { status });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'reason' })]));
      }
      expect(ServiceProvider.findById).not.toHaveBeenCalled();
    });

    it('approves a PENDING provider: ACTIVE, VERIFIED, approvedBy set and the owner notified', async () => {
      const { cookie, user } = asRole(ROLES.SUPER_ADMIN);
      const provider = providerDoc();
      ServiceProvider.findById.mockReturnValueOnce(provider).mockReturnValueOnce(populated(provider));

      const res = await patch(cookie, provider._id, { status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(provider).toMatchObject({ status: 'ACTIVE', verification: 'VERIFIED' });
      expect(provider.approvedAt).toBeInstanceOf(Date);
      expect(String(provider.approvedBy)).toBe(String(user._id));
      expect(notifications.notifyProviderStatusChanged).toHaveBeenCalledWith(provider, 'ACTIVE');
    });

    it('refusing a PENDING application marks it REJECTED', async () => {
      const { cookie } = asRole(ROLES.SUPER_ADMIN);
      const provider = providerDoc();
      ServiceProvider.findById.mockReturnValueOnce(provider).mockReturnValueOnce(populated(provider));

      const res = await patch(cookie, provider._id, { status: 'SUSPENDED', reason: 'Incomplete documents' });

      expect(res.status).toBe(200);
      expect(provider).toMatchObject({ status: 'SUSPENDED', verification: 'REJECTED' });
    });

    it('follows the transition table and refuses illegal moves', async () => {
      const { cookie } = asRole(ROLES.SUPER_ADMIN);
      const provider = providerDoc({ status: 'SUSPENDED' });
      ServiceProvider.findById.mockReturnValueOnce(provider).mockReturnValueOnce(populated(provider));

      const ok = await patch(cookie, provider._id, { status: 'ACTIVE' });
      expect(ok.status).toBe(200);
      expect(provider.status).toBe('ACTIVE');

      const terminated = providerDoc({ status: 'TERMINATED' });
      ServiceProvider.findById.mockReturnValueOnce(terminated);
      const res = await patch(cookie, terminated._id, { status: 'ACTIVE' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_PROVIDER_STATUS');
      expect(terminated.save).not.toHaveBeenCalled();
    });

    it('404 for an unknown provider', async () => {
      const { cookie } = asRole(ROLES.SUPER_ADMIN);
      ServiceProvider.findById.mockReturnValueOnce(null);
      expect((await patch(cookie, oid(), { status: 'ACTIVE' })).status).toBe(404);
    });
  });
});
