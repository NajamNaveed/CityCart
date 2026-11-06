jest.mock('../../src/services/email.service');

const mongoose = require('mongoose');
const request = require('supertest');

const { connect, disconnect, clearAll } = require('./db');
const City = require('../../src/models/city.model');
const Block = require('../../src/models/block.model');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const ServiceCategory = require('../../src/models/serviceCategory.model');
const ServiceProvider = require('../../src/models/serviceProvider.model');
const AuthToken = require('../../src/models/authToken.model');
const Notification = require('../../src/models/notification.model');
const app = require('../../src/app');
const {
  applyForProvider,
  changeProviderBlock,
  changeProviderStatus,
} = require('../../src/services/serviceProvider.service');
const { verifyEmail } = require('../../src/services/emailAuth.service');
const { sendEmail } = require('../../src/services/email.service');
const { hashPassword } = require('../../src/utils/password');
const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');

const oid = () => new mongoose.Types.ObjectId();
const ok = (results) => results.filter((r) => r.status === 'fulfilled');
let n = 0;

let city;
let blockA;
let blockB;
let category;
let admin;

const application = (over = {}) => {
  n += 1;
  return {
    owner: { name: `Owner ${n}`, email: `owner${n}@services.com`, password: 'secret123', phone: '+923001234567', ...over.owner },
    provider: {
      displayName: `Sparkle ${n}`,
      categoryId: String(category._id),
      cityId: String(city._id),
      blockId: String(blockA._id),
      startingAtPrice: 250000,
      latitude: blockA.center.coordinates[1],
      longitude: blockA.center.coordinates[0],
      ...over.provider,
    },
  };
};

const tokenFor = (call = 0) => sendEmail.mock.calls[call][0].text.match(/verify-email\?token=([a-f0-9]{64})/)[1];

const loginAsAdmin = async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/admin/login').send({ email: admin.email, password: 'secret123' });
  return agent;
};

beforeAll(async () => {
  await connect();
  await Promise.all(
    [City, Block, Brand, User, ServiceCategory, ServiceProvider, AuthToken, Notification].map((m) => m.init())
  );
});

afterAll(disconnect);

beforeEach(async () => {
  await clearAll();
  n += 1;
  city = await City.create({ name: `City${n}`, slug: `city${n}`, isActive: true });
  blockA = await Block.create({
    cityId: city._id,
    name: `Block A${n}`,
    slug: `block-a${n}`,
    center: { type: 'Point', coordinates: [73.08, 31.42] },
    isActive: true,
  });
  blockB = await Block.create({
    cityId: city._id,
    name: `Block B${n}`,
    slug: `block-b${n}`,
    center: { type: 'Point', coordinates: [73.09, 31.43] },
    isActive: true,
  });
  category = await ServiceCategory.create({ name: `Cleaning ${n}`, slug: `cleaning${n}` });
  admin = await User.create({
    name: 'Super Admin',
    email: `admin${n}@citycart.local`,
    passwordHash: await hashPassword('secret123'),
    role: 'SUPER_ADMIN',
    emailVerifiedAt: new Date(),
  });
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ delivered: true });
});

describe('applyForProvider (real MongoDB)', () => {
  it('creates a PENDING provider and an unverified SERVICE owner together', async () => {
    const { provider, user } = await applyForProvider(application({ provider: { displayName: 'Fresh Home' } }));

    expect(provider).toMatchObject({ displayName: 'Fresh Home', slug: 'fresh-home', status: 'PENDING', verification: 'UNVERIFIED' });
    expect(provider.blockHistory).toHaveLength(1);
    expect(String(provider.blockHistory[0].blockId)).toBe(String(blockA._id));
    expect(user).toMatchObject({ role: 'SERVICE_PROVIDER', accountType: 'SERVICE', emailVerifiedAt: null, brandId: undefined });
    expect(String(provider.userId)).toBe(String(user._id));

    const stored = await User.findById(user._id).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toBe('secret123');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe(user.email);
    expect(sendEmail.mock.calls[0][0].text).toContain('/verify-email?token=');
    expect(sendEmail.mock.calls[0][0].text).toContain('portal=service');
    expect(await AuthToken.countDocuments({ userId: user._id, type: 'EMAIL_VERIFY' })).toBe(1);
  });

  it('rejects a pin outside the block outline and creates nothing', async () => {
    blockA.area = {
      type: 'Polygon',
      coordinates: [[[73.2, 31.5], [73.3, 31.5], [73.3, 31.6], [73.2, 31.6], [73.2, 31.5]]],
    };
    await blockA.save();

    await expect(applyForProvider(application())).rejects.toThrow(/outside/i);

    expect(await ServiceProvider.countDocuments()).toBe(0);
    expect(await User.countDocuments({ role: 'SERVICE_PROVIDER' })).toBe(0);
    expect(await AuthToken.countDocuments()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ROLLS BACK the provider if the owner account cannot be created', async () => {
    const spy = jest.spyOn(User, 'create').mockRejectedValueOnce(new Error('user write failed'));

    await expect(applyForProvider(application())).rejects.toThrow('user write failed');
    spy.mockRestore();

    expect(await ServiceProvider.countDocuments()).toBe(0);
    expect(await User.countDocuments({ role: 'SERVICE_PROVIDER' })).toBe(0);
    expect(await AuthToken.countDocuments()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects an inactive category, a block from another city and a taken email/slug', async () => {
    await ServiceCategory.updateOne({ _id: category._id }, { $set: { isActive: false } });
    await expect(applyForProvider(application())).rejects.toMatchObject({ status: 400 });
    await ServiceCategory.updateOne({ _id: category._id }, { $set: { isActive: true } });

    const other = await City.create({ name: `Other${n}`, slug: `other${n}`, isActive: true });
    const foreign = await Block.create({
      cityId: other._id,
      name: 'Foreign',
      slug: `foreign${n}`,
      center: { type: 'Point', coordinates: [73.1, 31.5] },
      isActive: true,
    });
    await expect(applyForProvider(application({ provider: { blockId: String(foreign._id) } }))).rejects.toMatchObject({ status: 400 });

    await applyForProvider(application({ provider: { displayName: 'Taken Name' }, owner: { email: 'taken@services.com' } }));
    await expect(
      applyForProvider(application({ provider: { displayName: 'Another Name' }, owner: { email: 'taken@services.com' } }))
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      applyForProvider(application({ provider: { displayName: 'Taken Name' }, owner: { email: 'other@services.com' } }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same email as a customer or brand account, but not twice as a provider', async () => {
    await User.create({ name: 'Shopper', email: 'shared@x.com', passwordHash: 'x', role: 'CUSTOMER' });

    await expect(applyForProvider(application({ owner: { email: 'shared@x.com' } }))).resolves.toBeTruthy();
    await expect(
      applyForProvider(application({ provider: { displayName: 'Second Service' }, owner: { email: 'shared@x.com' } }))
    ).rejects.toMatchObject({ status: 409 });

    expect(await User.countDocuments({ email: 'shared@x.com' })).toBe(2);
    expect(await User.countDocuments({ email: 'shared@x.com', accountType: 'SERVICE' })).toBe(1);
  });

  it('6 concurrent applications with the same email: exactly one wins', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        applyForProvider(application({ provider: { displayName: `Race ${i}` }, owner: { email: 'race@services.com' } }))
      )
    );

    expect(ok(results)).toHaveLength(1);
    expect(await ServiceProvider.countDocuments()).toBe(1);
    expect(await User.countDocuments({ email: 'race@services.com', accountType: 'SERVICE' })).toBe(1);
  });
});

describe('email verification and provider approval (real MongoDB)', () => {
  it('verifying the inbox activates the owner, keeps the provider PENDING and notifies the super admin', async () => {
    const { provider, user } = await applyForProvider(application());
    const token = tokenFor();

    await expect(verifyEmail(token)).resolves.toEqual({ verified: true });

    expect((await User.findById(user._id)).emailVerifiedAt).toBeInstanceOf(Date);
    expect((await ServiceProvider.findById(provider._id)).status).toBe('PENDING');
    const note = await Notification.findOne({ userId: admin._id, type: 'SYSTEM_NOTIFICATION' });
    expect(note.title).toBe('New service provider registered');

    // One click only.
    await expect(verifyEmail(token)).rejects.toMatchObject({ status: 400 });
  });

  it('keeping the provider PENDING means it is not discoverable, even after verification', async () => {
    const { provider, user } = await applyForProvider(application());
    await verifyEmail(tokenFor());
    expect((await User.findById(user._id)).emailVerifiedAt).toBeInstanceOf(Date);
    expect((await ServiceProvider.findById(provider._id)).status).toBe('PENDING');
  });

  it('transitions follow the table; approval sets approvedBy/At and notifies the owner', async () => {
    const { provider, user } = await applyForProvider(application());

    const approved = await changeProviderStatus({ providerId: provider._id, status: 'ACTIVE', adminId: admin._id });
    expect(approved.provider).toMatchObject({ status: 'ACTIVE', verification: 'VERIFIED' });
    const stored = await ServiceProvider.findById(provider._id);
    expect(stored.approvedAt).toBeInstanceOf(Date);
    expect(String(stored.approvedBy)).toBe(String(admin._id));
    expect(await Notification.countDocuments({ userId: user._id, title: 'Provider account status changed' })).toBe(1);

    await expect(
      changeProviderStatus({ providerId: provider._id, status: 'ACTIVE', adminId: admin._id })
    ).rejects.toMatchObject({ status: 409 });

    await changeProviderStatus({ providerId: provider._id, status: 'TERMINATED', reason: 'Repeated violations', adminId: admin._id });
    await expect(
      changeProviderStatus({ providerId: provider._id, status: 'ACTIVE', reason: 'Please reinstate', adminId: admin._id })
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_PROVIDER_STATUS' });
  });

  it('refusing a PENDING application marks it REJECTED', async () => {
    const { provider } = await applyForProvider(application());
    const result = await changeProviderStatus({ providerId: provider._id, status: 'SUSPENDED', reason: 'Incomplete documents', adminId: admin._id });
    expect(result.provider).toMatchObject({ status: 'SUSPENDED', verification: 'REJECTED' });
  });
});

describe('service sign-in (real MongoDB)', () => {
  const login = (email) => request(app).post('/api/v1/auth/service/login').send({ email, password: 'secret123' });

  it('signs a verified PENDING provider in on the web only', async () => {
    const { provider, user } = await applyForProvider(application());
    await verifyEmail(tokenFor());

    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toMatchObject({ role: 'SERVICE_PROVIDER' });
    expect(String(res.body.user.providerId)).toBe(String(provider._id));

    expect((await request(app).post('/api/v1/auth/service/login').set('X-Client', 'mobile').send({ email: user.email, password: 'secret123' })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/brand/login').send({ email: user.email, password: 'secret123' })).status).toBe(401);
  });

  it('refuses an unverified owner and a suspended provider', async () => {
    const { provider, user } = await applyForProvider(application());
    expect((await login(user.email)).status).toBe(403);

    await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } });
    expect((await login(user.email)).status).toBe(200);

    await ServiceProvider.updateOne({ _id: provider._id }, { $set: { status: 'SUSPENDED' } });
    expect((await login(user.email)).status).toBe(401);
  });
});

describe('provider tenant and block (real MongoDB)', () => {
  it('authenticate resolves the tenant from the account, not from the token claim', async () => {
    const a = await applyForProvider(application());
    const b = await applyForProvider(application({ provider: { displayName: 'Other Provider' } }));
    await User.updateOne({ _id: a.user._id }, { $set: { emailVerifiedAt: new Date() } });

    // A forged claim must not move the session into the other provider.
    const forged = signToken({
      userId: a.user._id,
      role: 'SERVICE_PROVIDER',
      providerId: b.provider._id,
    });

    const res = await request(app)
      .get('/api/v1/services/provider/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=${forged}`);

    expect(res.status).toBe(200);
    expect(String(res.body.provider._id)).toBe(String(a.provider._id));
    expect(String(res.body.provider._id)).not.toBe(String(b.provider._id));
  });

  it('a brand admin can never reach the provider tenant', async () => {
    const brand = await Brand.create({ name: 'Brand', slug: 'brand', cityId: city._id, status: 'ACTIVE' });
    const brandAdmin = await User.create({
      name: 'Brand Admin',
      email: 'brand@x.com',
      passwordHash: await hashPassword('secret123'),
      role: 'BRAND_ADMIN',
      brandId: brand._id,
      emailVerifiedAt: new Date(),
    });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/brand/login').send({ email: brandAdmin.email, password: 'secret123' });

    const res = await agent.get('/api/v1/services/provider/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('suspending the tenant invalidates an existing session on the next request', async () => {
    const { provider, user } = await applyForProvider(application());
    await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } });
    await changeProviderStatus({ providerId: provider._id, status: 'ACTIVE', adminId: admin._id });

    const agent = request.agent(app);
    expect((await agent.post('/api/v1/auth/service/login').send({ email: user.email, password: 'secret123' })).status).toBe(200);
    expect((await agent.get('/api/v1/services/provider/me')).status).toBe(200);

    await ServiceProvider.updateOne({ _id: provider._id }, { $set: { status: 'SUSPENDED' } });

    const res = await agent.get('/api/v1/services/provider/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PROVIDER_INACTIVE');
  });

  it('a pin move inside the current block is free; a block change is once per calendar month', async () => {
    const { provider, user } = await applyForProvider(application());

    const movedPin = await changeProviderBlock(provider._id, {
      blockId: String(blockA._id),
      latitude: 31.421,
      longitude: 73.081,
    });
    expect(movedPin.location.coordinates).toEqual([73.081, 31.421]);
    expect((await ServiceProvider.findById(provider._id)).blockHistory).toHaveLength(1);

    await expect(
      changeProviderBlock(provider._id, {
        blockId: String(blockB._id),
        latitude: blockB.center.coordinates[1],
        longitude: blockB.center.coordinates[0],
      })
    ).rejects.toMatchObject({ status: 409, code: 'BLOCK_CHANGE_LIMIT' });

    // Last calendar month: the change is allowed and recorded.
    await ServiceProvider.updateOne(
      { _id: provider._id },
      { $set: { blockChangedAt: new Date(Date.UTC(2020, 0, 15)) } }
    );
    const changed = await changeProviderBlock(provider._id, {
      blockId: String(blockB._id),
      latitude: blockB.center.coordinates[1],
      longitude: blockB.center.coordinates[0],
    });
    expect(String(changed.blockId)).toBe(String(blockB._id));
    const stored = await ServiceProvider.findById(provider._id);
    expect(stored.blockHistory).toHaveLength(2);
    expect(String(stored.blockHistory[1].blockId)).toBe(String(blockB._id));
    expect(String(stored.blockHistory[1].changedBy)).toBe(String(user._id));

    // And the next move in the same month is refused again.
    await expect(
      changeProviderBlock(provider._id, {
        blockId: String(blockA._id),
        latitude: blockA.center.coordinates[1],
        longitude: blockA.center.coordinates[0],
      })
    ).rejects.toMatchObject({ status: 409, code: 'BLOCK_CHANGE_LIMIT' });
  });
});

describe('admin provider endpoints (real MongoDB)', () => {
  it('the super admin lists and approves a provider through the API', async () => {
    const { provider, user } = await applyForProvider(application());
    await verifyEmail(tokenFor());
    const agent = await loginAsAdmin();

    const list = await agent.get('/api/v1/admin/providers?status=PENDING');
    expect(list.status).toBe(200);
    expect(list.body.providers).toHaveLength(1);
    expect(String(list.body.providers[0]._id)).toBe(String(provider._id));

    const approved = await agent.patch(`/api/v1/admin/providers/${provider._id}/status`).send({ status: 'ACTIVE' });
    expect(approved.status).toBe(200);
    expect(approved.body.provider).toMatchObject({ status: 'ACTIVE', verification: 'VERIFIED' });
    expect((await ServiceProvider.findById(provider._id)).status).toBe('ACTIVE');
    expect(await Notification.countDocuments({ userId: user._id, title: 'Provider account status changed' })).toBe(1);
  });

  it('a provider or brand admin cannot use the admin endpoints', async () => {
    const { user } = await applyForProvider(application());
    await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } });

    const providerAgent = request.agent(app);
    await providerAgent.post('/api/v1/auth/service/login').send({ email: user.email, password: 'secret123' });
    expect((await providerAgent.get('/api/v1/admin/providers')).status).toBe(403);

    const brand = await Brand.create({ name: 'B2', slug: 'b2', cityId: city._id, status: 'ACTIVE' });
    const brandAdmin = await User.create({
      name: 'Admin',
      email: 'brand2@x.com',
      passwordHash: await hashPassword('secret123'),
      role: 'BRAND_ADMIN',
      brandId: brand._id,
      emailVerifiedAt: new Date(),
    });
    const brandAgent = request.agent(app);
    await brandAgent.post('/api/v1/auth/brand/login').send({ email: brandAdmin.email, password: 'secret123' });
    expect((await brandAgent.get('/api/v1/admin/providers')).status).toBe(403);
  });
});
