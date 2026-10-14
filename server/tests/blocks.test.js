const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/city.model');
jest.mock('../src/models/block.model');

const User = require('../src/models/user.model');
const City = require('../src/models/city.model');
const Block = require('../src/models/block.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();

function makeFakeUser(overrides = {}) {
  return { _id: oid(), role: ROLES.CUSTOMER, brandId: undefined, isActive: true, ...overrides };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

// A block as Mongoose would return it: GeoJSON centre is [lng, lat].
function makeBlock(overrides = {}) {
  return {
    _id: oid(),
    cityId: oid(),
    name: 'Peoples Colony',
    slug: 'peoples-colony',
    isActive: true,
    center: { type: 'Point', coordinates: [73.1, 31.4] },
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/blocks (public)', () => {
  it('lists blocks with latitude/longitude flattened, no authentication', async () => {
    Block.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([makeBlock()]) });

    const res = await request(app).get('/api/v1/blocks');

    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(1);
    expect(res.body.blocks[0]).toMatchObject({ name: 'Peoples Colony', latitude: 31.4, longitude: 73.1 });
    expect(res.body.blocks[0].center).toBeUndefined();
  });

  it('filters by cityId and isActive', async () => {
    const cityId = oid().toString();
    Block.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get(`/api/v1/blocks?cityId=${cityId}&isActive=true`);

    expect(res.status).toBe(200);
    expect(Block.find).toHaveBeenCalledWith({ cityId, isActive: true });
  });

  it('rejects an invalid cityId with 400', async () => {
    const res = await request(app).get('/api/v1/blocks?cityId=nope');
    expect(res.status).toBe(400);
    expect(Block.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/blocks/resolve (public)', () => {
  it('returns the nearest block and its city', async () => {
    const block = makeBlock();
    const city = { _id: block.cityId, name: 'Faisalabad', isActive: true };
    Block.find.mockReturnValue({ limit: jest.fn().mockResolvedValue([block]) });
    City.find.mockResolvedValue([city]);

    const res = await request(app).get('/api/v1/blocks/resolve?lat=31.401&lng=73.101');

    expect(res.status).toBe(200);
    expect(res.body.block.name).toBe('Peoples Colony');
    expect(res.body.city.name).toBe('Faisalabad');
    expect(typeof res.body.distanceKm).toBe('number');
    // Uses a $near query on the block centre, active blocks only.
    const filter = Block.find.mock.calls[0][0];
    expect(filter.isActive).toBe(true);
    expect(filter.center.$near.$geometry).toEqual({ type: 'Point', coordinates: [73.101, 31.401] });
  });

  it('returns nulls (not an error) outside every supported area', async () => {
    Block.find.mockReturnValue({ limit: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get('/api/v1/blocks/resolve?lat=10&lng=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, block: null, city: null, distanceKm: null });
  });

  it('skips a block whose city is inactive', async () => {
    const block = makeBlock();
    Block.find.mockReturnValue({ limit: jest.fn().mockResolvedValue([block]) });
    City.find.mockResolvedValue([]); // the city query only returns ACTIVE cities

    const res = await request(app).get('/api/v1/blocks/resolve?lat=31.4&lng=73.1');

    expect(res.status).toBe(200);
    expect(res.body.block).toBeNull();
  });

  it('rejects missing or out-of-range coordinates with 400', async () => {
    expect((await request(app).get('/api/v1/blocks/resolve')).status).toBe(400);
    expect((await request(app).get('/api/v1/blocks/resolve?lat=95&lng=73')).status).toBe(400);
    expect((await request(app).get('/api/v1/blocks/resolve?lat=abc&lng=73')).status).toBe(400);
    expect(Block.find).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/blocks (Super Admin only)', () => {
  const body = () => ({ cityId: oid().toString(), name: 'Madina Town', latitude: 31.41, longitude: 73.08 });

  it('creates a block as SUPER_ADMIN, deriving the slug and storing [lng, lat]', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    City.findById.mockResolvedValue({ _id: oid() });
    Block.findOne.mockResolvedValue(null);
    Block.create.mockImplementation(async (data) => makeBlock(data));

    const res = await request(app).post('/api/v1/blocks').set(h, v).send(body());

    expect(res.status).toBe(201);
    expect(Block.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'madina-town',
        center: { type: 'Point', coordinates: [73.08, 31.41] },
      })
    );
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/blocks').send(body());
    expect(res.status).toBe(401);
  });

  it('forbids a brand admin', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() }));
    const res = await request(app).post('/api/v1/blocks').set(h, v).send(body());
    expect(res.status).toBe(403);
    expect(Block.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown city and 409 for a duplicate name', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));

    City.findById.mockResolvedValue(null);
    expect((await request(app).post('/api/v1/blocks').set(h, v).send(body())).status).toBe(404);

    City.findById.mockResolvedValue({ _id: oid() });
    Block.findOne.mockResolvedValue(makeBlock());
    expect((await request(app).post('/api/v1/blocks').set(h, v).send(body())).status).toBe(409);
  });

  it('validates coordinates', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    const res = await request(app)
      .post('/api/v1/blocks')
      .set(h, v)
      .send({ ...body(), latitude: 120 });
    expect(res.status).toBe(400);
    expect(Block.create).not.toHaveBeenCalled();
  });
});

describe('PATCH/DELETE /api/v1/blocks/:id (Super Admin only)', () => {
  it('updates name and centre together and keeps the slug', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    const block = makeBlock();
    Block.findById.mockResolvedValue(block);

    const res = await request(app)
      .patch(`/api/v1/blocks/${block._id}`)
      .set(h, v)
      .send({ name: 'Peoples Colony No. 1', latitude: 31.5, longitude: 73.2 });

    expect(res.status).toBe(200);
    expect(block.slug).toBe('peoples-colony');
    expect(block.center.coordinates).toEqual([73.2, 31.5]);
  });

  it('rejects latitude without longitude', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    const res = await request(app)
      .patch(`/api/v1/blocks/${oid()}`)
      .set(h, v)
      .send({ latitude: 31.5 });
    expect(res.status).toBe(400);
  });

  it('deactivates instead of deleting', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    const block = makeBlock();
    Block.findById.mockResolvedValue(block);

    const res = await request(app).delete(`/api/v1/blocks/${block._id}`).set(h, v);

    expect(res.status).toBe(200);
    expect(block.isActive).toBe(false);
    expect(block.save).toHaveBeenCalled();
  });

  it('returns 404 for a missing block and 403 for non-admins', async () => {
    const id = oid();
    const [h, v] = asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
    Block.findById.mockResolvedValue(null);
    expect((await request(app).delete(`/api/v1/blocks/${id}`).set(h, v)).status).toBe(404);

    const [h2, v2] = asUser(makeFakeUser({ role: ROLES.CUSTOMER }));
    expect((await request(app).delete(`/api/v1/blocks/${id}`).set(h2, v2)).status).toBe(403);
  });
});
