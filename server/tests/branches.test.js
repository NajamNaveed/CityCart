const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/branch.model');

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
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

function brandAdmin() {
  return makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
}

const BLOCK_CENTER = { type: 'Point', coordinates: [73.1, 31.4] };

function makeBlock(cityId, overrides = {}) {
  return { _id: oid(), cityId, name: 'Gulberg', isActive: true, center: BLOCK_CENTER, ...overrides };
}

function makeBranch(brandId, blockId, overrides = {}) {
  return {
    _id: oid(),
    brandId,
    blockId,
    name: 'Main shop',
    address: '',
    phone: '',
    isActive: true,
    location: BLOCK_CENTER,
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('authorization on /api/v1/brand/branches', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/brand/branches')).status).toBe(401);
  });

  it('forbids customers and brand employees', async () => {
    const [h, v] = asUser(makeFakeUser({ role: ROLES.CUSTOMER }));
    expect((await request(app).get('/api/v1/brand/branches').set(h, v)).status).toBe(403);

    const [h2, v2] = asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() }));
    expect((await request(app).post('/api/v1/brand/branches').set(h2, v2).send({})).status).toBe(403);
    expect(Branch.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/brand/branches', () => {
  it("lists only the caller's own brand, with block names", async () => {
    const admin = brandAdmin();
    const [h, v] = asUser(admin);
    const block = makeBlock(oid());
    Branch.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([makeBranch(admin.brandId, block._id)]) });
    Block.find.mockResolvedValue([block]);

    const res = await request(app).get('/api/v1/brand/branches?brandId=someoneElse').set(h, v);

    expect(res.status).toBe(200);
    expect(Branch.find).toHaveBeenCalledWith({ brandId: admin.brandId.toString() });
    expect(res.body.branches[0]).toMatchObject({ blockName: 'Gulberg', latitude: 31.4, longitude: 73.1 });
  });
});

describe('POST /api/v1/brand/branches', () => {
  const cityId = oid();

  function setup() {
    const admin = brandAdmin();
    const block = makeBlock(cityId);
    Branch.countDocuments.mockResolvedValue(0);
    Block.findOne.mockResolvedValue(block);
    Brand.findById.mockResolvedValue({ _id: admin.brandId, cityId });
    Branch.create.mockImplementation(async (data) => makeBranch(data.brandId, data.blockId, data));
    return { admin, block, headers: asUser(admin) };
  }

  it("uses the authenticated tenant's brand, never one from the body", async () => {
    const { admin, block, headers } = setup();

    const res = await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: block._id.toString(), brandId: oid().toString() });

    expect(res.status).toBe(201);
    expect(Branch.create).toHaveBeenCalledWith(expect.objectContaining({ brandId: admin.brandId.toString() }));
  });

  it('defaults the pin to the block centre when none is sent', async () => {
    const { block, headers } = setup();

    await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: block._id.toString() });

    expect(Branch.create).toHaveBeenCalledWith(expect.objectContaining({ location: BLOCK_CENTER }));
  });

  it('stores a dropped pin as [lng, lat]', async () => {
    const { block, headers } = setup();

    const res = await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: block._id.toString(), latitude: 31.41, longitude: 73.11 });

    expect(res.status).toBe(201);
    expect(Branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ location: { type: 'Point', coordinates: [73.11, 31.41] } })
    );
  });

  it('rejects a pin far from the block (e.g. swapped lat/lng)', async () => {
    const { block, headers } = setup();

    const res = await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: block._id.toString(), latitude: 73.1, longitude: 31.4 });

    expect(res.status).toBe(400);
    expect(Branch.create).not.toHaveBeenCalled();
  });

  it("rejects a block from another city, or an unknown one, with the same message", async () => {
    const { block, headers } = setup();
    Brand.findById.mockResolvedValue({ cityId: oid() }); // brand lives in a different city

    const res = await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: block._id.toString() });
    expect(res.status).toBe(400);

    Block.findOne.mockResolvedValue(null);
    const res2 = await request(app)
      .post('/api/v1/brand/branches')
      .set(...headers)
      .send({ name: 'Main shop', blockId: oid().toString() });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toBe(res.body.message);
  });

  it('enforces the per-brand branch limit and validates input', async () => {
    const { block, headers } = setup();
    Branch.countDocuments.mockResolvedValue(50);
    expect(
      (await request(app).post('/api/v1/brand/branches').set(...headers).send({ name: 'x', blockId: block._id.toString() })).status
    ).toBe(400);

    expect((await request(app).post('/api/v1/brand/branches').set(...headers).send({ name: '', blockId: 'bad' })).status).toBe(400);
    expect(
      (await request(app).post('/api/v1/brand/branches').set(...headers).send({ name: 'x', blockId: block._id.toString(), latitude: 31.4 })).status
    ).toBe(400);
  });
});

describe('PATCH/DELETE /api/v1/brand/branches/:id', () => {
  it("forbids touching another brand's branch (403) and 404s a missing one", async () => {
    const admin = brandAdmin();
    const [h, v] = asUser(admin);

    Branch.findById.mockResolvedValue(makeBranch(oid(), oid()));
    expect((await request(app).patch(`/api/v1/brand/branches/${oid()}`).set(h, v).send({ name: 'Hack' })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/brand/branches/${oid()}`).set(h, v)).status).toBe(403);

    Branch.findById.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/brand/branches/${oid()}`).set(h, v).send({ name: 'X' })).status).toBe(404);
  });

  it('rejects an invalid id with 400', async () => {
    const [h, v] = asUser(brandAdmin());
    expect((await request(app).patch('/api/v1/brand/branches/not-an-id').set(h, v).send({ name: 'X' })).status).toBe(400);
  });

  it('updates fields on an owned branch', async () => {
    const admin = brandAdmin();
    const [h, v] = asUser(admin);
    const block = makeBlock(oid());
    const branch = makeBranch(admin.brandId, block._id);
    Branch.findById.mockResolvedValue(branch);
    Block.findById.mockResolvedValue(block);

    const res = await request(app)
      .patch(`/api/v1/brand/branches/${branch._id}`)
      .set(h, v)
      .send({ name: 'Renamed', phone: '0300' });

    expect(res.status).toBe(200);
    expect(branch.name).toBe('Renamed');
    expect(branch.phone).toBe('0300');
  });

  it('resets the pin to the new block centre when moved without a new pin', async () => {
    const admin = brandAdmin();
    const [h, v] = asUser(admin);
    const cityId = oid();
    const oldBlock = makeBlock(cityId);
    const newBlock = makeBlock(cityId, { name: 'Madina Town', center: { type: 'Point', coordinates: [73.05, 31.38] } });
    const branch = makeBranch(admin.brandId, oldBlock._id);
    Branch.findById.mockResolvedValue(branch);
    Block.findById.mockResolvedValue(oldBlock);
    Block.findOne.mockResolvedValue(newBlock);
    Brand.findById.mockResolvedValue({ cityId });

    const res = await request(app)
      .patch(`/api/v1/brand/branches/${branch._id}`)
      .set(h, v)
      .send({ blockId: newBlock._id.toString() });

    expect(res.status).toBe(200);
    expect(branch.blockId).toBe(newBlock._id);
    expect(branch.location).toEqual(newBlock.center);
  });

  it('deactivates instead of deleting', async () => {
    const admin = brandAdmin();
    const [h, v] = asUser(admin);
    const block = makeBlock(oid());
    const branch = makeBranch(admin.brandId, block._id);
    Branch.findById.mockResolvedValue(branch);
    Block.findById.mockResolvedValue(block);

    const res = await request(app).delete(`/api/v1/brand/branches/${branch._id}`).set(h, v);

    expect(res.status).toBe(200);
    expect(branch.isActive).toBe(false);
    expect(branch.save).toHaveBeenCalled();
  });
});
