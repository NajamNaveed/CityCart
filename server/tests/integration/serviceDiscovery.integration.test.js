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
const ServiceOffering = require('../../src/models/serviceOffering.model');
const AdminAction = require('../../src/models/adminAction.model');
const app = require('../../src/app');
const { hashPassword } = require('../../src/utils/password');
const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');

let n = 0;

let city;
let blockA;
let blockB;
let category;
let otherCategory;
let admin;

const cookieFor = (user) =>
  `${AUTH_COOKIE_NAME}=${signToken({
    userId: user._id,
    role: user.role,
    passwordVersion: user.passwordVersion,
  })}`;

const createOwner = async (over = {}) => {
  n += 1;
  return User.create({
    name: `Owner ${n}`,
    email: `owner${n}@services.com`,
    passwordHash: await hashPassword('secret123'),
    role: 'SERVICE_PROVIDER',
    emailVerifiedAt: new Date(),
    ...over,
  });
};

const createProvider = async (over = {}) => {
  n += 1;
  const owner = over.owner || (await createOwner());
  const provider = await ServiceProvider.create({
    userId: owner._id,
    displayName: `Provider ${n}`,
    slug: `provider-${n}`,
    categoryId: category._id,
    cityId: city._id,
    blockId: blockA._id,
    location: { type: 'Point', coordinates: [73.08, 31.42] },
    startingAtPrice: 100000,
    status: 'ACTIVE',
    verification: 'VERIFIED',
    ...over.provider,
  });
  return { owner, provider };
};

const createOffering = async (provider, over = {}) => {
  n += 1;
  return ServiceOffering.create({
    providerId: provider._id,
    categoryId: provider.categoryId,
    title: `Deep clean ${n}`,
    slug: `deep-clean-${n}`,
    startingAtPrice: 150000,
    durationMinutes: 60,
    ...over,
  });
};

const loginAsAdmin = async () => {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/admin/login').send({ email: admin.email, password: 'secret123' });
  expect(res.status).toBe(200);
  return agent;
};

beforeAll(async () => {
  await connect();
  await Promise.all(
    [City, Block, Brand, User, ServiceCategory, ServiceProvider, ServiceOffering, AdminAction].map((m) => m.init())
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
    center: { type: 'Point', coordinates: [73.19, 31.52] },
    isActive: true,
  });
  category = await ServiceCategory.create({ name: `Cleaning ${n}`, slug: `cleaning${n}` });
  otherCategory = await ServiceCategory.create({ name: `Plumbing ${n}`, slug: `plumbing${n}` });
  admin = await User.create({
    name: 'Super Admin',
    email: `admin${n}@citycart.local`,
    passwordHash: await hashPassword('secret123'),
    role: 'SUPER_ADMIN',
    emailVerifiedAt: new Date(),
  });
});

describe('public provider page (real MongoDB)', () => {
  it('publishes only approved providers and never exposes the pin, phone or street address', async () => {
    const { provider } = await createProvider({
      provider: {
        displayName: 'Sparkle Home',
        slug: 'sparkle-home',
        phone: '+923001112222',
        addressLine: 'House 7, Street 3',
        location: { type: 'Point', coordinates: [73.081, 31.421] },
      },
    });
    await createOffering(provider, { title: 'Deep clean', slug: 'deep-clean', isActive: true });
    await createOffering(provider, { title: 'Old service', slug: 'old-service', isActive: false });

    const res = await request(app).get('/api/v1/services/providers/sparkle-home');

    expect(res.status).toBe(200);
    expect(res.body.provider).toMatchObject({
      displayName: 'Sparkle Home',
      slug: 'sparkle-home',
      city: { name: city.name },
      category: { name: category.name },
    });
    expect(res.body.provider.block).toMatchObject({ name: blockA.name, center: { lat: 31.42, lng: 73.08 } });
    expect(res.body.provider.offerings).toHaveLength(1);
    expect(res.body.provider.offerings[0].title).toBe('Deep clean');
    expect(res.body.provider).not.toHaveProperty('phone');
    expect(res.body.provider).not.toHaveProperty('addressLine');
    expect(res.body.provider).not.toHaveProperty('location');
    expect(JSON.stringify(res.body)).not.toContain('+923001112222');
    expect(JSON.stringify(res.body)).not.toContain('House 7');
  });

  it('answers 404 for pending, suspended and unknown providers, and 400 for an invalid link', async () => {
    await createProvider({ provider: { displayName: 'Pending Place', slug: 'pending-place', status: 'PENDING', verification: 'UNVERIFIED' } });
    await createProvider({ provider: { displayName: 'Suspended Place', slug: 'suspended-place', status: 'SUSPENDED' } });

    for (const slug of ['pending-place', 'suspended-place', 'no-such-provider']) {
      const res = await request(app).get(`/api/v1/services/providers/${slug}`);
      expect(res.status).toBe(404);
    }

    const invalid = await request(app).get('/api/v1/services/providers/Not A Slug');
    expect(invalid.status).toBe(400);
  });
});

describe('service discovery (real MongoDB)', () => {
  it('filters by block and only returns approved providers in that block', async () => {
    const { provider: inBlock } = await createProvider({ provider: { displayName: 'In Block' } });
    await createProvider({ provider: { displayName: 'Other Block', blockId: blockB._id } });
    await createProvider({ provider: { displayName: 'Still Pending', status: 'PENDING', verification: 'UNVERIFIED' } });
    await createProvider({ provider: { displayName: 'Not Verified', verification: 'UNVERIFIED' } });
    await createOffering(inBlock, { title: 'Block clean', slug: 'block-clean' });

    const res = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'block', blockId: String(blockA._id) });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      displayName: 'In Block',
      offeringCount: 1,
      block: { name: blockA.name },
    });
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.meta.scope).toBe('block');
  });

  it('searches provider names and offering text, filters by category and sorts by price', async () => {
    const { provider: cheap } = await createProvider({
      provider: { displayName: 'Cheap Cleaners', startingAtPrice: 50000 },
    });
    const { provider: mid } = await createProvider({
      provider: { displayName: 'Mid Cleaners', startingAtPrice: 150000 },
    });
    const { provider: pricey } = await createProvider({
      provider: { displayName: 'Pricey Cleaners', startingAtPrice: 900000 },
    });
    await createProvider({
      provider: { displayName: 'Pipe Fixers', categoryId: otherCategory._id, startingAtPrice: 10000 },
    });

    await createOffering(mid, { title: 'Sofa shampoo', slug: 'sofa-shampoo' });

    const byName = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), q: 'pricey' });
    expect(byName.status).toBe(200);
    expect(byName.body.items.map((p) => p.displayName)).toEqual(['Pricey Cleaners']);

    const byOffering = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), q: 'shampoo' });
    expect(byOffering.body.items.map((p) => p.displayName)).toEqual(['Mid Cleaners']);
    expect(byOffering.body.items[0].topOfferings[0].title).toBe('Sofa shampoo');

    const byCategory = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), categoryId: String(otherCategory._id) });
    expect(byCategory.body.items.map((p) => p.displayName)).toEqual(['Pipe Fixers']);

    const byPrice = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), categoryId: String(category._id), sort: 'price' });
    expect(byPrice.body.items.map((p) => p.displayName)).toEqual([
      'Cheap Cleaners',
      'Mid Cleaners',
      'Pricey Cleaners',
    ]);
    expect(byPrice.body.items[0]._id).toBe(String(cheap._id));
    expect(byPrice.body.items[2]._id).toBe(String(pricey._id));
  });

  it('paginates and keeps the count authoritative', async () => {
    for (const price of [300000, 200000, 100000]) {
      await createProvider({ provider: { displayName: `Priced ${price}`, startingAtPrice: price } });
    }

    const pageOne = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), sort: 'price', limit: 2, page: 1 });
    const pageTwo = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'city', cityId: String(city._id), sort: 'price', limit: 2, page: 2 });

    expect(pageOne.body.items.map((p) => p.startingAtPrice)).toEqual([100000, 200000]);
    expect(pageTwo.body.items.map((p) => p.startingAtPrice)).toEqual([300000]);
    expect(pageOne.body.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
    expect(pageTwo.body.pagination).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('uses the radius scope around the shopper and rejects invalid scope parameters', async () => {
    await createProvider({
      provider: { displayName: 'Close By', location: { type: 'Point', coordinates: [73.0805, 31.4205] } },
    });
    await createProvider({
      provider: {
        displayName: 'Far Away',
        blockId: blockB._id,
        location: { type: 'Point', coordinates: [73.19, 31.52] },
      },
    });

    const near = await request(app).get('/api/v1/services/discover').query({
      scope: 'radius',
      lat: 31.42,
      lng: 73.08,
      radiusKm: 2,
    });
    expect(near.status).toBe(200);
    expect(near.body.items.map((p) => p.displayName)).toEqual(['Close By']);
    expect(near.body.items[0].distanceKm).toBeGreaterThanOrEqual(0);

    const noCity = await request(app).get('/api/v1/services/discover').query({ scope: 'city' });
    expect(noCity.status).toBe(400);

    const noRadius = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'radius', lat: 31.42, lng: 73.08 });
    expect(noRadius.status).toBe(400);

    const missingBlock = await request(app)
      .get('/api/v1/services/discover')
      .query({ scope: 'block', blockId: String(new mongoose.Types.ObjectId()) });
    expect(missingBlock.status).toBe(404);
  });
});

describe('provider offerings (real MongoDB, session-scoped)', () => {
  it('creates an offering in the session tenant, ignoring client providerId and categoryId', async () => {
    const { owner, provider } = await createProvider();
    const { provider: other } = await createProvider();

    const res = await request(app)
      .post('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(owner))
      .send({
        title: 'Kitchen deep clean',
        description: 'Every surface',
        startingAtPrice: 250000,
        durationMinutes: 90,
        attributes: { rooms: 2, supplies: true },
        providerId: String(other._id),
        categoryId: String(otherCategory._id),
      });

    expect(res.status).toBe(201);
    expect(res.body.offering).toMatchObject({
      title: 'Kitchen deep clean',
      slug: 'kitchen-deep-clean',
      startingAtPrice: 250000,
      durationMinutes: 90,
      isActive: true,
    });
    expect(String(res.body.offering.providerId)).toBe(String(provider._id));
    expect(String(res.body.offering.categoryId)).toBe(String(provider.categoryId));

    const stored = await ServiceOffering.findById(res.body.offering._id);
    expect(String(stored.providerId)).toBe(String(provider._id));
    expect(String(stored.categoryId)).toBe(String(provider.categoryId));
  });

  it('rejects a duplicate title for the same provider and invalid money or duration', async () => {
    const { owner, provider } = await createProvider();
    await createOffering(provider, { title: 'Window wash', slug: 'window-wash' });

    const duplicate = await request(app)
      .post('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(owner))
      .send({ title: 'Window wash', startingAtPrice: 100000, durationMinutes: 60 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('OFFERING_EXISTS');

    const fractional = await request(app)
      .post('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(owner))
      .send({ title: 'Half paisa', startingAtPrice: 10.5, durationMinutes: 60 });
    expect(fractional.status).toBe(400);

    const tooShort = await request(app)
      .post('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(owner))
      .send({ title: 'Quick fix', startingAtPrice: 100000, durationMinutes: 1 });
    expect(tooShort.status).toBe(400);
  });

  it('updates and deactivates only its own offering; another provider sees 404', async () => {
    const { owner, provider } = await createProvider();
    const { owner: otherOwner } = await createProvider();
    const offering = await createOffering(provider, { title: 'Carpet clean', slug: 'carpet-clean' });

    const update = await request(app)
      .patch(`/api/v1/services/provider/offerings/${offering._id}`)
      .set('Cookie', cookieFor(owner))
      .send({ title: 'Carpet and rug clean', startingAtPrice: 275000 });
    expect(update.status).toBe(200);
    expect(update.body.offering).toMatchObject({
      title: 'Carpet and rug clean',
      startingAtPrice: 275000,
      // The slug is the stable public key and never changes after creation.
      slug: 'carpet-clean',
    });

    const foreignUpdate = await request(app)
      .patch(`/api/v1/services/provider/offerings/${offering._id}`)
      .set('Cookie', cookieFor(otherOwner))
      .send({ startingAtPrice: 1 });
    expect(foreignUpdate.status).toBe(404);

    const foreignDelete = await request(app)
      .delete(`/api/v1/services/provider/offerings/${offering._id}`)
      .set('Cookie', cookieFor(otherOwner));
    expect(foreignDelete.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/v1/services/provider/offerings/${offering._id}`)
      .set('Cookie', cookieFor(owner));
    expect(remove.status).toBe(200);
    expect(remove.body.offering.isActive).toBe(false);
    expect((await ServiceOffering.findById(offering._id)).isActive).toBe(false);
  });

  it('refuses a brand session and an anonymous caller', async () => {
    const brand = await Brand.create({ name: 'Brand Co', slug: `brand-co-${n}`, cityId: city._id, status: 'ACTIVE' });
    const brandAdmin = await User.create({
      name: 'Brand Admin',
      email: `brand${n}@x.com`,
      passwordHash: await hashPassword('secret123'),
      role: 'BRAND_ADMIN',
      brandId: brand._id,
      emailVerifiedAt: new Date(),
    });

    const asBrand = await request(app)
      .get('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(brandAdmin));
    expect(asBrand.status).toBe(403);
    expect(asBrand.body.code).toBe('ROLE_NOT_ALLOWED');

    const anonymous = await request(app).get('/api/v1/services/provider/offerings');
    expect(anonymous.status).toBe(401);
  });

  it('lists every offering of the tenant, including inactive ones', async () => {
    const { owner, provider } = await createProvider();
    await createOffering(provider, { title: 'Active one', slug: 'active-one' });
    await createOffering(provider, { title: 'Hidden one', slug: 'hidden-one', isActive: false });

    const res = await request(app)
      .get('/api/v1/services/provider/offerings')
      .set('Cookie', cookieFor(owner));

    expect(res.status).toBe(200);
    expect(res.body.offerings.map((o) => o.title).sort()).toEqual(['Active one', 'Hidden one']);
  });
});

describe('admin service categories (real MongoDB)', () => {
  it('creates, renames and counts categories, and deactivates only unused ones', async () => {
    const agent = await loginAsAdmin();

    const created = await agent
      .post('/api/v1/admin/service-categories')
      .send({ name: 'Appliance Repair', order: 3 });
    expect(created.status).toBe(201);
    expect(created.body.category).toMatchObject({ name: 'Appliance Repair', slug: 'appliance-repair' });

    const id = created.body.category._id;
    const renamed = await agent
      .patch(`/api/v1/admin/service-categories/${id}`)
      .send({ name: 'Appliance Care' });
    expect(renamed.status).toBe(200);

    await createProvider({ provider: { categoryId: id } });
    const listed = await agent.get('/api/v1/admin/service-categories');
    expect(listed.status).toBe(200);
    const row = listed.body.categories.find((c) => String(c._id) === String(id));
    expect(row.providerCount).toBe(1);

    const refused = await agent.delete(`/api/v1/admin/service-categories/${id}`);
    expect(refused.status).toBe(409);

    const unused = await agent.post('/api/v1/admin/service-categories').send({ name: 'Tutoring' });
    const removed = await agent.delete(`/api/v1/admin/service-categories/${unused.body.category._id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.category.isActive).toBe(false);

    // Deactivated categories disappear from the public picker.
    const publicList = await request(app).get('/api/v1/services/categories');
    expect(publicList.status).toBe(200);
    expect(publicList.body.categories.map((c) => c.name)).not.toContain('Tutoring');
  });

  it('keeps the tree two levels deep and never lets a provider session manage it', async () => {
    const agent = await loginAsAdmin();
    const parent = await agent.post('/api/v1/admin/service-categories').send({ name: 'Home Care' });
    const child = await agent
      .post('/api/v1/admin/service-categories')
      .send({ name: 'Home Care Plus', parentId: parent.body.category._id });
    expect(child.status).toBe(201);

    const deep = await agent
      .post('/api/v1/admin/service-categories')
      .send({ name: 'Home Care Premium', parentId: child.body.category._id });
    expect(deep.status).toBe(400);

    const { owner } = await createProvider();
    const asProvider = await request(app)
      .get('/api/v1/admin/service-categories')
      .set('Cookie', cookieFor(owner));
    expect(asProvider.status).toBe(403);
  });
});
