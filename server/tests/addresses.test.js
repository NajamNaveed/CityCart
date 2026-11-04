const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/address.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/city.model');

const User = require('../src/models/user.model');
const Address = require('../src/models/address.model');
const Block = require('../src/models/block.model');
const City = require('../src/models/city.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const cityId = oid();
const dGround = { _id: oid(), cityId, name: 'D Ground' };

function asUser(role = ROLES.CUSTOMER) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { user, cookie: ['Cookie', getAuthCookie(user)] };
}

const body = {
  label: 'Home',
  fullName: 'John Doe',
  phone: '+923001234567',
  addressLine: 'House 4, Street 2',
  city: 'Faisalabad',
  latitude: 31.4045,
  longitude: 73.095,
};

/** A saved address document with working save(). */
function saved(userId, over = {}) {
  const doc = {
    _id: oid(),
    userId,
    label: 'Home',
    fullName: 'John Doe',
    phone: '+923001234567',
    addressLine: 'House 4',
    city: 'Faisalabad',
    location: { type: 'Point', coordinates: [73.095, 31.4045] },
    isDefault: false,
    ...over,
  };
  doc.toObject = () => ({ ...doc });
  doc.save = jest.fn(async () => doc);
  return doc;
}

beforeEach(() => {
  jest.resetAllMocks();
  // By default the pin is inside D Ground, in an open city.
  Block.find.mockResolvedValue([dGround]);
  City.find.mockResolvedValue([{ _id: cityId }]);
  Address.create.mockImplementation(async (d) => saved(d.userId, d));
  Address.updateMany.mockResolvedValue({});
});

describe('access', () => {
  it('needs a signed-in customer', async () => {
    expect((await request(app).get('/api/v1/addresses')).status).toBe(401);
    for (const role of [ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN]) {
      const { cookie } = asUser(role);
      expect((await request(app).get('/api/v1/addresses').set(...cookie)).status).toBe(403);
      expect((await request(app).post('/api/v1/addresses').set(...cookie).send(body)).status).toBe(403);
    }
  });
});

describe('GET /api/v1/addresses', () => {
  it("lists only the caller's addresses, default first, as latitude/longitude with their blocks", async () => {
    const { user, cookie } = asUser();
    const sort = jest.fn().mockResolvedValue([saved(user._id, { isDefault: true }), saved(user._id, { label: 'Work' })]);
    Address.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/addresses').set(...cookie);

    expect(res.status).toBe(200);
    expect(Address.find).toHaveBeenCalledWith({ userId: user._id });
    expect(sort).toHaveBeenCalledWith({ isDefault: -1, createdAt: -1 });
    const [first] = res.body.addresses;
    expect(first).toMatchObject({ label: 'Home', latitude: 31.4045, longitude: 73.095, isDefault: true });
    expect(first.blocks).toEqual([expect.objectContaining({ name: 'D Ground' })]);
    expect(first.location).toBeUndefined();
  });

  it('shows no blocks for an address whose zone was switched off since', async () => {
    const { user, cookie } = asUser();
    Address.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([saved(user._id)]) });
    Block.find.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/addresses').set(...cookie);
    expect(res.body.addresses[0].blocks).toEqual([]);
  });
});

describe('POST /api/v1/addresses', () => {
  it('saves an address for the caller, making the first one the default', async () => {
    const { user, cookie } = asUser();
    Address.countDocuments.mockResolvedValue(0);

    const res = await request(app).post('/api/v1/addresses').set(...cookie).send(body);

    expect(res.status).toBe(201);
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user._id, label: 'Home', isDefault: true, location: { type: 'Point', coordinates: [73.095, 31.4045] } })
    );
    expect(res.body.address).toMatchObject({ latitude: 31.4045, longitude: 73.095 });
  });

  it('keeps the existing default unless the new one asks to be the default', async () => {
    const { cookie } = asUser();
    Address.countDocuments.mockResolvedValue(2);

    await request(app).post('/api/v1/addresses').set(...cookie).send(body);
    expect(Address.create.mock.calls[0][0].isDefault).toBe(false);
    expect(Address.updateMany).not.toHaveBeenCalled();

    await request(app).post('/api/v1/addresses').set(...cookie).send({ ...body, isDefault: true });
    expect(Address.create.mock.calls[1][0].isDefault).toBe(true);
    expect(Address.updateMany).toHaveBeenCalledWith({ userId: expect.anything(), isDefault: true }, { $set: { isDefault: false } });
  });

  it('ignores a userId sent in the body', async () => {
    const { user, cookie } = asUser();
    Address.countDocuments.mockResolvedValue(0);
    await request(app).post('/api/v1/addresses').set(...cookie).send({ ...body, userId: oid().toString() });
    expect(Address.create.mock.calls[0][0].userId).toBe(user._id);
  });

  it('refuses a pin outside every zone (400 OUTSIDE_DELIVERY_ZONE)', async () => {
    const { cookie } = asUser();
    Block.find.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/addresses').set(...cookie).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTSIDE_DELIVERY_ZONE');
    expect(Address.create).not.toHaveBeenCalled();
  });

  it('refuses an 11th address (409)', async () => {
    const { cookie } = asUser();
    Address.countDocuments.mockResolvedValue(10);
    const res = await request(app).post('/api/v1/addresses').set(...cookie).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ADDRESS_LIMIT');
    expect(Address.create).not.toHaveBeenCalled();
  });

  it.each([
    ['no label', { label: undefined }],
    ['a bad phone', { phone: 'abc' }],
    ['no street', { addressLine: ' ' }],
    ['no pin', { latitude: undefined, longitude: undefined }],
    ['an impossible pin', { latitude: 200 }],
    ['a label that is too long', { label: 'x'.repeat(41) }],
  ])('400 for %s', async (_name, change) => {
    const { cookie } = asUser();
    const res = await request(app).post('/api/v1/addresses').set(...cookie).send({ ...body, ...change });
    expect(res.status).toBe(400);
    expect(Address.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/addresses/:id', () => {
  it('updates fields of the caller\'s own address', async () => {
    const { user, cookie } = asUser();
    const doc = saved(user._id);
    Address.findOne.mockResolvedValue(doc);

    const res = await request(app).patch(`/api/v1/addresses/${doc._id}`).set(...cookie).send({ label: 'Office', phone: '+923111234567' });

    expect(res.status).toBe(200);
    expect(Address.findOne).toHaveBeenCalledWith({ _id: doc._id.toString(), userId: user._id });
    expect(doc).toMatchObject({ label: 'Office', phone: '+923111234567' });
    expect(doc.save).toHaveBeenCalled();
  });

  it('moves the pin only to a place we deliver', async () => {
    const { user, cookie } = asUser();
    const doc = saved(user._id);
    Address.findOne.mockResolvedValue(doc);

    const ok = await request(app).patch(`/api/v1/addresses/${doc._id}`).set(...cookie).send({ latitude: 31.41, longitude: 73.1 });
    expect(ok.status).toBe(200);
    expect(doc.location).toEqual({ type: 'Point', coordinates: [73.1, 31.41] });

    Block.find.mockResolvedValue([]);
    const outside = await request(app).patch(`/api/v1/addresses/${doc._id}`).set(...cookie).send({ latitude: 25, longitude: 67 });
    expect(outside.status).toBe(400);
  });

  it('404 for an address that is not the caller\'s, 400 for a bad id, an empty body or half a pin', async () => {
    const { cookie } = asUser();
    Address.findOne.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/addresses/${oid()}`).set(...cookie).send({ label: 'x' })).status).toBe(404);
    expect((await request(app).patch('/api/v1/addresses/nope').set(...cookie).send({ label: 'x' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/addresses/${oid()}`).set(...cookie).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/addresses/${oid()}`).set(...cookie).send({ latitude: 31.4 })).status).toBe(400);
  });
});

describe('POST /api/v1/addresses/:id/default', () => {
  it('makes one address the default and clears the others', async () => {
    const { user, cookie } = asUser();
    const doc = saved(user._id);
    Address.findOne.mockResolvedValue(doc);

    const res = await request(app).post(`/api/v1/addresses/${doc._id}/default`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Address.updateMany).toHaveBeenCalledWith({ userId: user._id, isDefault: true }, { $set: { isDefault: false } });
    expect(doc.isDefault).toBe(true);
  });

  it('404 for someone else\'s address', async () => {
    const { cookie } = asUser();
    Address.findOne.mockResolvedValue(null);
    expect((await request(app).post(`/api/v1/addresses/${oid()}/default`).set(...cookie)).status).toBe(404);
  });
});

describe('DELETE /api/v1/addresses/:id', () => {
  it('deletes the address; deleting the default promotes the most recent remaining one', async () => {
    const { user, cookie } = asUser();
    const doc = saved(user._id, { isDefault: true });
    const next = saved(user._id);
    Address.findOne.mockImplementation((filter) => (filter._id ? Promise.resolve(doc) : { sort: () => Promise.resolve(next) }));
    Address.deleteOne.mockResolvedValue({});

    const res = await request(app).delete(`/api/v1/addresses/${doc._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Address.deleteOne).toHaveBeenCalledWith({ _id: doc._id });
    expect(next.isDefault).toBe(true);
    expect(next.save).toHaveBeenCalled();
  });

  it('leaves the default alone when a non-default address is deleted', async () => {
    const { user, cookie } = asUser();
    const doc = saved(user._id);
    Address.findOne.mockResolvedValue(doc);
    Address.deleteOne.mockResolvedValue({});
    const res = await request(app).delete(`/api/v1/addresses/${doc._id}`).set(...cookie);
    expect(res.status).toBe(200);
    expect(Address.findOne).toHaveBeenCalledTimes(1);
  });

  it('404 for someone else\'s address and 400 for a bad id', async () => {
    const { cookie } = asUser();
    Address.findOne.mockResolvedValue(null);
    expect((await request(app).delete(`/api/v1/addresses/${oid()}`).set(...cookie)).status).toBe(404);
    expect((await request(app).delete('/api/v1/addresses/nope').set(...cookie)).status).toBe(400);
    expect(Address.deleteOne).not.toHaveBeenCalled();
  });
});
