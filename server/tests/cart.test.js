const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/models/cart.model');
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    STATUSES: actual.STATUSES,
  };
});

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const Cart = require('../src/models/cart.model');
const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const productId = oid();

const makeProduct = (o = {}) => ({
  _id: productId,
  brandId,
  name: 'Phone',
  slug: 'phone',
  price: 19.99,
  images: ['a.jpg'],
  status: 'ACTIVE',
  isActive: true,
  ...o,
});
const makeBrand = (o = {}) => ({ _id: brandId, name: 'Nike', slug: 'nike', status: 'ACTIVE', ...o });
const makeInv = (o = {}) => ({ productId, availableQuantity: 10, trackInventory: true, ...o });

function asRole(role = ROLES.CUSTOMER) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId }) };
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

function world({ items = [], product = makeProduct(), brand = makeBrand(), inventory = makeInv() } = {}) {
  Cart.findOneAndUpdate.mockResolvedValue({ items });
  Cart.findOne.mockResolvedValue({ items });
  Cart.updateOne.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });
  Product.findById.mockResolvedValue(product);
  Product.find.mockResolvedValue(product ? [product] : []);
  Brand.findById.mockResolvedValue(brand);
  Brand.find.mockResolvedValue(brand ? [brand] : []);
  Inventory.findOne.mockResolvedValue(inventory);
  Inventory.find.mockResolvedValue(inventory ? [inventory] : []);
}

const line = (quantity, o = {}) => ({ productId, brandId, quantity, ...o });

beforeEach(() => jest.resetAllMocks());

describe('cart access control', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
  });

  it.each([ROLES.SUPER_ADMIN, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE])('403 for %s', async (role) => {
    const res = await request(app).get('/api/v1/cart').set(...asRole(role));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/cart', () => {
  it('returns an empty cart', async () => {
    world({ items: [] });
    const res = await request(app).get('/api/v1/cart').set(...asRole());
    expect(res.status).toBe(200);
    expect(res.body.cart).toEqual({ groups: [], subtotal: 0, itemCount: 0, hasIssues: false });
  });

  it('groups by brand and prices lines from the database', async () => {
    world({ items: [line(3)] });
    const res = await request(app).get('/api/v1/cart').set(...asRole());

    const { cart } = res.body;
    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].brand.name).toBe('Nike');
    expect(cart.groups[0].items[0]).toMatchObject({
      name: 'Phone',
      unitPrice: 19.99,
      quantity: 3,
      lineTotal: 59.97, // exact: computed in cents
      issue: null,
      image: 'a.jpg',
    });
    expect(cart.subtotal).toBe(59.97);
    expect(cart.itemCount).toBe(3);
    expect(cart.hasIssues).toBe(false);
  });

  it('flags stale lines, excludes them from totals, reveals stock only when fixable', async () => {
    world({ items: [line(5)], inventory: makeInv({ availableQuantity: 2 }) });
    let res = await request(app).get('/api/v1/cart').set(...asRole());
    expect(res.body.cart.groups[0].items[0]).toMatchObject({
      issue: 'INSUFFICIENT_STOCK',
      availableQuantity: 2,
      lineTotal: 0,
    });
    expect(res.body.cart).toMatchObject({ subtotal: 0, itemCount: 0, hasIssues: true });

    world({ items: [line(1)], product: makeProduct({ isActive: false }) });
    res = await request(app).get('/api/v1/cart').set(...asRole());
    const item = res.body.cart.groups[0].items[0];
    expect(item.issue).toBe('PRODUCT_UNAVAILABLE');
    expect(item).not.toHaveProperty('availableQuantity');

    world({ items: [line(1)], brand: makeBrand({ status: 'SUSPENDED' }) });
    res = await request(app).get('/api/v1/cart').set(...asRole());
    expect(res.body.cart.groups[0].items[0].issue).toBe('BRAND_UNAVAILABLE');

    world({ items: [line(1)], inventory: null });
    res = await request(app).get('/api/v1/cart').set(...asRole());
    expect(res.body.cart.groups[0].items[0].issue).toBe('OUT_OF_STOCK');
  });
});

describe('POST /api/v1/cart/items', () => {
  const post = (body) =>
    request(app).post('/api/v1/cart/items').set(...asRole()).send(body);

  it.each([
    [{ productId: productId.toString(), quantity: 0 }],
    [{ productId: productId.toString(), quantity: 1.5 }],
    [{ productId: productId.toString(), quantity: 100 }],
    [{ productId: productId.toString(), quantity: '2' }],
    [{ productId: 'nope', quantity: 1 }],
    [{ quantity: 1 }],
  ])('400 for invalid body %j', async (body) => {
    world();
    expect((await post(body)).status).toBe(400);
  });

  it('pushes a NEW line using the product\'s brandId and ignores client price/brandId', async () => {
    world({ items: [] });
    const res = await post({
      productId: productId.toString(),
      quantity: 2,
      price: 0.01,
      brandId: oid().toString(),
    });

    expect(res.status).toBe(200);
    const [filter, update] = Cart.updateOne.mock.calls[0];
    expect(filter['items.productId']).toEqual({ $ne: productId });
    expect(update.$push.items).toEqual({ productId, brandId, quantity: 2 });
  });

  it('increments an EXISTING line atomically, with the quantity cap in the filter', async () => {
    world({ items: [line(2)] });
    await post({ productId: productId.toString(), quantity: 3 });

    const [filter, update] = Cart.updateOne.mock.calls[0];
    expect(filter.items.$elemMatch).toEqual({ productId, quantity: { $lte: 96 } });
    expect(update).toEqual({ $inc: { 'items.$.quantity': 3 } });
  });

  it.each([
    ['inactive product', { product: makeProduct({ isActive: false }) }, 404],
    ['draft product', { product: makeProduct({ status: 'DRAFT' }) }, 404],
    ['suspended brand', { brand: makeBrand({ status: 'SUSPENDED' }) }, 404],
    ['missing product', { product: null }, 404],
    ['no inventory record', { inventory: null }, 409],
    ['zero stock', { inventory: makeInv({ availableQuantity: 0 }) }, 409],
  ])('rejects %s', async (_n, overrides, status) => {
    world(overrides);
    const res = await post({ productId: productId.toString(), quantity: 1 });
    expect(res.status).toBe(status);
    expect(Cart.updateOne).not.toHaveBeenCalled();
  });

  it('409 with availableQuantity when the request exceeds stock', async () => {
    world({ inventory: makeInv({ availableQuantity: 3 }) });
    const res = await post({ productId: productId.toString(), quantity: 4 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', availableQuantity: 3 });
  });

  it('checks existing + requested quantity against stock', async () => {
    world({ items: [line(4)], inventory: makeInv({ availableQuantity: 5 }) });
    const res = await post({ productId: productId.toString(), quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('untracked products have no stock limit', async () => {
    world({ inventory: makeInv({ trackInventory: false, availableQuantity: 0 }) });
    expect((await post({ productId: productId.toString(), quantity: 5 })).status).toBe(200);
  });

  it('409 QUANTITY_LIMIT beyond 99 of one product', async () => {
    world({ items: [line(98)], inventory: makeInv({ availableQuantity: 500 }) });
    const res = await post({ productId: productId.toString(), quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUANTITY_LIMIT');
  });

  it('409 CART_FULL at 50 distinct products', async () => {
    const items = Array.from({ length: 50 }, () => line(1, { productId: oid() }));
    world({ items });
    const res = await post({ productId: productId.toString(), quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CART_FULL');
  });

  it('retries when the cart changed between read and write, then succeeds', async () => {
    world({ items: [] });
    Cart.updateOne
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 1 });
    const res = await post({ productId: productId.toString(), quantity: 1 });
    expect(res.status).toBe(200);
    expect(Cart.updateOne).toHaveBeenCalledTimes(2);
  });

  it('409 CART_CONFLICT after repeated lost races', async () => {
    world({ items: [] });
    Cart.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await post({ productId: productId.toString(), quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CART_CONFLICT');
  });
});

describe('PATCH /api/v1/cart/items/:productId', () => {
  const patch = (id, body) =>
    request(app).patch(`/api/v1/cart/items/${id}`).set(...asRole()).send(body);

  it('sets the quantity', async () => {
    world({ items: [line(1)] });
    const res = await patch(productId, { quantity: 4 });
    expect(res.status).toBe(200);
    expect(Cart.updateOne).toHaveBeenCalledWith(
      { userId: expect.anything(), 'items.productId': productId.toString() },
      { $set: { 'items.$.quantity': 4 } }
    );
  });

  it('404 when the product is not in the cart', async () => {
    world({ items: [] });
    const res = await patch(productId, { quantity: 2 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_IN_CART');
  });

  it('409 when the new quantity exceeds stock', async () => {
    world({ items: [line(1)], inventory: makeInv({ availableQuantity: 2 }) });
    const res = await patch(productId, { quantity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.availableQuantity).toBe(2);
  });

  it('400 for invalid quantity or id', async () => {
    world({ items: [line(1)] });
    expect((await patch(productId, { quantity: 0 })).status).toBe(400);
    expect((await patch('nope', { quantity: 1 })).status).toBe(400);
  });
});

describe('DELETE /api/v1/cart/items/:productId and DELETE /api/v1/cart', () => {
  it('removes an item (even one whose product is now unavailable)', async () => {
    world({ items: [line(1)], product: makeProduct({ isActive: false }) });
    const res = await request(app).delete(`/api/v1/cart/items/${productId}`).set(...asRole());
    expect(res.status).toBe(200);
    expect(Cart.updateOne.mock.calls[0][1]).toEqual({ $pull: { items: { productId: productId.toString() } } });
  });

  it('404 when removing an item that is not in the cart', async () => {
    world();
    Cart.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await request(app).delete(`/api/v1/cart/items/${productId}`).set(...asRole());
    expect(res.status).toBe(404);
  });

  it('clears the cart', async () => {
    world({ items: [] });
    const res = await request(app).delete('/api/v1/cart').set(...asRole());
    expect(res.status).toBe(200);
    expect(Cart.updateOne.mock.calls[0][1]).toEqual({ $set: { items: [] } });
  });
});
