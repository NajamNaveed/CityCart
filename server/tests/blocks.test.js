const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/city.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/branch.model');

const User = require('../src/models/user.model');
const City = require('../src/models/city.model');
const Block = require('../src/models/block.model');
const Branch = require('../src/models/branch.model');
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
  // Changing a zone re-checks which block each shop is in: by default there are none.
  Block.find.mockResolvedValue([]);
  Branch.find.mockResolvedValue([]);
  Branch.bulkWrite.mockResolvedValue({});
});

// A one-kilometre square of Faisalabad, as the [latitude, longitude] corners an admin draws.
const SQUARE = [
  [31.4, 73.09],
  [31.4, 73.1],
  [31.409, 73.1],
  [31.409, 73.09],
];
// Edges that cross each other (a bow-tie).
const BOWTIE = [
  [31.4, 73.09],
  [31.409, 73.1],
  [31.4, 73.1],
  [31.409, 73.09],
];

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

describe('blocks drawn as zones (polygon)', () => {
  const admin = () => asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN }));
  const body = (polygon) => ({ cityId: oid().toString(), name: 'Faisal Town', polygon });
  const inCity = () => {
    City.findById.mockResolvedValue({ _id: oid() });
    Block.findOne.mockResolvedValue(null);
    Block.create.mockImplementation(async (data) => makeBlock(data));
  };

  it('creates a block from a drawn outline: stores a closed GeoJSON ring and an inside centre', async () => {
    const [h, v] = admin();
    inCity();

    const res = await request(app).post('/api/v1/blocks').set(h, v).send(body(SQUARE));

    expect(res.status).toBe(201);
    const stored = Block.create.mock.calls[0][0];
    expect(stored.area.type).toBe('Polygon');
    const ring = stored.area.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual([73.09, 31.4]); // [lng, lat]
    const [lng, lat] = stored.center.coordinates;
    expect(lat).toBeGreaterThan(31.4);
    expect(lat).toBeLessThan(31.409);
    expect(lng).toBeGreaterThan(73.09);
    expect(lng).toBeLessThan(73.1);
    // the client gets the outline back as open [lat, lng] pairs
    expect(res.body.block.polygon).toHaveLength(4);
    expect(res.body.block.overlaps).toEqual([]);
  });

  it('accepts an outline that repeats its first corner at the end', async () => {
    const [h, v] = admin();
    inCity();
    const res = await request(app).post('/api/v1/blocks').set(h, v).send(body([...SQUARE, SQUARE[0]]));
    expect(res.status).toBe(201);
    expect(Block.create.mock.calls[0][0].area.coordinates[0]).toHaveLength(5);
  });

  it('refuses outlines that cannot be a zone, with a message an admin can act on (400)', async () => {
    const [h, v] = admin();
    inCity();
    const post = (polygon) => request(app).post('/api/v1/blocks').set(h, v).send(body(polygon));

    const bowtie = await post(BOWTIE);
    expect(bowtie.status).toBe(400);
    expect(bowtie.body.message).toMatch(/crosses itself/);

    expect((await post([[31.4, 73.09], [31.41, 73.1]])).status).toBe(400); // two corners
    const tiny = await post([[31.4, 73.09], [31.4, 73.0901], [31.4001, 73.0901]]);
    expect(tiny.status).toBe(400);
    expect(tiny.body.message).toMatch(/too small/);
    const huge = await post([[30, 72], [30, 74], [32, 74], [32, 72]]);
    expect(huge.status).toBe(400);
    expect(huge.body.message).toMatch(/too large/);
    expect((await post([[31.4, 73.09], [31.4, 73.09], [31.409, 73.1], [31.409, 73.09]])).status).toBe(400); // repeated corner
    expect((await post([[95, 73.09], [31.4, 73.1], [31.409, 73.1]])).status).toBe(400); // latitude out of range
    expect(Block.create).not.toHaveBeenCalled();
  });

  it('needs an outline or a centre point', async () => {
    const [h, v] = admin();
    const res = await request(app).post('/api/v1/blocks').set(h, v).send({ cityId: oid().toString(), name: 'Nowhere' });
    expect(res.status).toBe(400);
  });

  it('tells the admin which other blocks the new zone overlaps', async () => {
    const [h, v] = admin();
    inCity();
    Block.find.mockImplementation(async (filter) =>
      filter.area ? [{ _id: oid(), name: 'Peoples Colony' }] : []
    );

    const res = await request(app).post('/api/v1/blocks').set(h, v).send(body(SQUARE));

    expect(res.status).toBe(201);
    expect(res.body.block.overlaps).toEqual([expect.objectContaining({ name: 'Peoples Colony' })]);
    const query = Block.find.mock.calls.find(([f]) => f.area)[0];
    expect(query.isActive).toBe(true);
    expect(query.area.$geoIntersects.$geometry.type).toBe('Polygon');
  });

  it('re-checks which block holds each shop after the outline changes', async () => {
    const [h, v] = admin();
    const block = makeBlock();
    Block.findById.mockResolvedValue(block);
    // the block as saved has the new outline; the shop sits far outside it
    const shop = { _id: oid(), blockId: block._id, blockIds: [block._id], location: { type: 'Point', coordinates: [73.5, 31.9] } };
    Branch.find.mockResolvedValue([shop]);
    Block.find.mockImplementation(async (filter) => (filter.area ? [] : [block]));

    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ polygon: SQUARE });

    expect(res.status).toBe(200);
    expect(block.area.type).toBe('Polygon');
    expect(res.body.block.branchesWithoutBlock).toBe(1);
    expect(Branch.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: shop._id }, update: { $set: { blockIds: [] } } } },
    ]);
  });

  it('puts a shop into the block when its pin is now inside the new outline', async () => {
    const [h, v] = admin();
    const block = makeBlock();
    Block.findById.mockResolvedValue(block);
    const shop = { _id: oid(), blockId: block._id, blockIds: [], location: { type: 'Point', coordinates: [73.095, 31.4045] } };
    Branch.find.mockResolvedValue([shop]);
    Block.find.mockImplementation(async (filter) => (filter.area ? [] : [block]));

    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ polygon: SQUARE });

    expect(res.body.block.branchesWithoutBlock).toBe(0);
    expect(Branch.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: shop._id }, update: { $set: { blockIds: [block._id] } } } },
    ]);
  });

  it('removes the outline with polygon: null (back to a centre-only block)', async () => {
    const [h, v] = admin();
    const block = makeBlock({ area: { type: 'Polygon', coordinates: [[[73.09, 31.4], [73.1, 31.4], [73.1, 31.409], [73.09, 31.4]]] } });
    Block.findById.mockResolvedValue(block);
    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ polygon: null });
    expect(res.status).toBe(200);
    expect(block.area).toBeUndefined();
    expect(res.body.block.polygon).toBeNull();
  });

  it('refuses a new centre point for a block that has an outline (the centre follows the shape)', async () => {
    const [h, v] = admin();
    const block = makeBlock({ area: { type: 'Polygon', coordinates: [[[73.09, 31.4], [73.1, 31.4], [73.1, 31.409], [73.09, 31.4]]] } });
    Block.findById.mockResolvedValue(block);
    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ latitude: 31.5, longitude: 73.2 });
    expect(res.status).toBe(400);
    expect(block.save).not.toHaveBeenCalled();
  });

  it('refuses a crossing outline on update (400)', async () => {
    const [h, v] = admin();
    const block = makeBlock();
    Block.findById.mockResolvedValue(block);
    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ polygon: BOWTIE });
    expect(res.status).toBe(400);
    expect(block.save).not.toHaveBeenCalled();
  });

  it('re-checks shops when a block is switched off', async () => {
    const [h, v] = admin();
    const area = { type: 'Polygon', coordinates: [[[73.09, 31.4], [73.1, 31.4], [73.1, 31.409], [73.09, 31.409], [73.09, 31.4]]] };
    const block = makeBlock({ area });
    Block.findById.mockResolvedValue(block);
    const shop = { _id: oid(), blockId: block._id, blockIds: [block._id], location: { type: 'Point', coordinates: [73.095, 31.4045] } };
    Branch.find.mockResolvedValue([shop]);
    Block.find.mockImplementation(async (filter) => (filter.area ? [] : [block]));

    const res = await request(app).patch(`/api/v1/blocks/${block._id}`).set(h, v).send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.block.branchesWithoutBlock).toBe(1);
    expect(Branch.bulkWrite).toHaveBeenCalled();
  });

  it('lists blocks with their outline for the public map', async () => {
    const area = { type: 'Polygon', coordinates: [[[73.09, 31.4], [73.1, 31.4], [73.1, 31.409], [73.09, 31.409], [73.09, 31.4]]] };
    Block.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([makeBlock({ area }), makeBlock({ name: 'Old block' })]) });
    const res = await request(app).get('/api/v1/blocks');
    expect(res.status).toBe(200);
    expect(res.body.blocks[0].polygon).toEqual([
      [31.4, 73.09],
      [31.4, 73.1],
      [31.409, 73.1],
      [31.409, 73.09],
    ]);
    expect(res.body.blocks[1].polygon).toBeNull(); // a centre-only block
  });
});

describe('GET /api/v1/blocks/at (which blocks am I in?)', () => {
  const area = { type: 'Polygon', coordinates: [[[73.09, 31.4], [73.1, 31.4], [73.1, 31.409], [73.09, 31.409], [73.09, 31.4]]] };

  function givenBlocks({ inside, nearby, activeCityIds }) {
    Block.find.mockImplementation((filter) =>
      filter.area ? Promise.resolve(inside) : { limit: () => Promise.resolve(nearby) }
    );
    City.find.mockResolvedValue(activeCityIds.map((id) => ({ _id: id })));
  }

  it('returns every block that holds the position, then the nearest others', async () => {
    const cityId = oid();
    const a = makeBlock({ cityId, name: 'D Ground', area });
    const b = makeBlock({ cityId, name: 'Peoples Colony', area });
    const c = makeBlock({ cityId, name: 'Gulberg', center: { type: 'Point', coordinates: [73.103, 31.439] } });
    givenBlocks({ inside: [a, b], nearby: [a, b, c], activeCityIds: [cityId] });

    const res = await request(app).get('/api/v1/blocks/at?lat=31.4045&lng=73.095');

    expect(res.status).toBe(200);
    expect(res.body.containing.map((x) => x.name)).toEqual(['D Ground', 'Peoples Colony']);
    expect(res.body.nearest.map((x) => x.name)).toEqual(['Gulberg']); // not repeated
    expect(res.body.containing[0].polygon).toHaveLength(4);
    expect(typeof res.body.nearest[0].distanceKm).toBe('number');
    const query = Block.find.mock.calls.find(([f]) => f.area)[0];
    expect(query).toEqual({
      isActive: true,
      area: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [73.095, 31.4045] } } },
    });
  });

  it('returns nothing containing and the nearest blocks when the position is on a border', async () => {
    const cityId = oid();
    const c = makeBlock({ cityId, name: 'Gulberg' });
    givenBlocks({ inside: [], nearby: [c], activeCityIds: [cityId] });
    const res = await request(app).get('/api/v1/blocks/at?lat=31.42&lng=73.09');
    expect(res.body.containing).toEqual([]);
    expect(res.body.nearest).toHaveLength(1);
  });

  it('leaves out blocks of an inactive city', async () => {
    const live = oid();
    const dead = oid();
    givenBlocks({
      inside: [makeBlock({ cityId: dead, area })],
      nearby: [makeBlock({ cityId: dead }), makeBlock({ cityId: live, name: 'Open' })],
      activeCityIds: [live],
    });
    const res = await request(app).get('/api/v1/blocks/at?lat=31.4&lng=73.09');
    expect(res.body.containing).toEqual([]);
    expect(res.body.nearest.map((x) => x.name)).toEqual(['Open']);
  });

  it('is public and validates the position (400)', async () => {
    givenBlocks({ inside: [], nearby: [], activeCityIds: [] });
    expect((await request(app).get('/api/v1/blocks/at?lat=31.4&lng=73.09')).status).toBe(200);
    expect((await request(app).get('/api/v1/blocks/at?lat=200&lng=73.09')).status).toBe(400);
    expect((await request(app).get('/api/v1/blocks/at')).status).toBe(400);
  });
});
