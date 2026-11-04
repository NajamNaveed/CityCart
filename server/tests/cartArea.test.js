const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/cart.model');
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), STATUSES: actual.STATUSES };
});
jest.mock('../src/models/brand.model');
jest.mock('../src/models/branch.model');

const User = require('../src/models/user.model');
const Cart = require('../src/models/cart.model');
const Product = require('../src/models/product.model');
const Brand = require('../src/models/brand.model');
const Branch = require('../src/models/branch.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();

function asUser(role = ROLES.CUSTOMER) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { user, cookie: ['Cookie', getAuthCookie(user)] };
}

const post = (cookie, payload) => request(app).post('/api/v1/cart/area-check').set(...cookie).send(payload);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('POST /api/v1/cart/area-check', () => {
  const block = oid().toString();

  it('says which cart items a store can still deliver in the chosen blocks, without changing the cart', async () => {
    const { user, cookie } = asUser();
    const near = { _id: oid(), brandId: oid(), name: 'Dalda Ghee' };
    const far = { _id: oid(), brandId: oid(), name: 'Silk Scarf' };
    Cart.findOne.mockResolvedValue({ userId: user._id, items: [{ productId: near._id }, { productId: far._id }] });
    Product.find.mockResolvedValue([near, far]);
    Branch.find.mockResolvedValue([{ brandId: near.brandId }]);
    Brand.find.mockResolvedValue([
      { _id: near.brandId, name: 'Near Mart' },
      { _id: far.brandId, name: 'Far Boutique' },
    ]);

    const res = await post(cookie, { blockIds: [block] });

    expect(res.status).toBe(200);
    expect(res.body.deliverable).toEqual([near._id.toString()]);
    expect(res.body.undeliverable).toEqual([{ productId: far._id.toString(), name: 'Silk Scarf', brandName: 'Far Boutique' }]);
    expect(Cart.findOne).toHaveBeenCalledWith({ userId: user._id });
    expect(Branch.find).toHaveBeenCalledWith({
      brandId: { $in: [near.brandId.toString(), far.brandId.toString()] },
      isActive: true,
      blockIds: { $in: [block] },
    });
  });

  it('is empty for an empty or missing cart, without any further lookups', async () => {
    const { cookie } = asUser();
    Cart.findOne.mockResolvedValue({ items: [] });
    expect((await post(cookie, { blockIds: [block] })).body).toMatchObject({ deliverable: [], undeliverable: [] });
    Cart.findOne.mockResolvedValue(null);
    expect((await post(cookie, { blockIds: [block] })).body).toMatchObject({ deliverable: [], undeliverable: [] });
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('counts an item whose product no longer exists as not deliverable', async () => {
    const { cookie } = asUser();
    const gone = oid();
    Cart.findOne.mockResolvedValue({ items: [{ productId: gone }] });
    Product.find.mockResolvedValue([]);
    Branch.find.mockResolvedValue([]);
    Brand.find.mockResolvedValue([]);
    const res = await post(cookie, { blockIds: [block] });
    expect(res.body.undeliverable).toEqual([{ productId: gone.toString(), name: null, brandName: null }]);
  });

  it('validates blockIds (400)', async () => {
    const { cookie } = asUser();
    expect((await post(cookie, {})).status).toBe(400);
    expect((await post(cookie, { blockIds: [] })).status).toBe(400);
    expect((await post(cookie, { blockIds: ['nope'] })).status).toBe(400);
    expect((await post(cookie, { blockIds: Array.from({ length: 11 }, () => oid().toString()) })).status).toBe(400);
    expect(Cart.findOne).not.toHaveBeenCalled();
  });

  it('is for signed-in customers only', async () => {
    expect((await request(app).post('/api/v1/cart/area-check').send({ blockIds: [block] })).status).toBe(401);
    const { cookie } = asUser(ROLES.BRAND_ADMIN);
    expect((await post(cookie, { blockIds: [block] })).status).toBe(403);
  });
});
