const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/models/cart.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/counter.model');
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
// Transaction semantics are proven against real MongoDB in
// tests/integration; here the callback just runs with a fake session.
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const Cart = require('../src/models/cart.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Counter = require('../src/models/counter.model');
const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const q = (value) => ({ session: () => Promise.resolve(value) });

const address = {
  fullName: 'John Doe',
  phone: '+923001234567',
  addressLine: 'Example Street',
  city: 'Lahore',
  state: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
};
const body = { shippingAddress: address, paymentMethod: 'COD' };

function asRole(role = ROLES.CUSTOMER) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const brandA = { _id: oid(), status: 'ACTIVE' };
const brandB = { _id: oid(), status: 'ACTIVE' };
const mkProduct = (brand, o = {}) => ({
  _id: oid(),
  brandId: brand._id,
  name: 'Item',
  sku: 'SKU',
  price: 19.99,
  images: ['i.jpg'],
  status: 'ACTIVE',
  isActive: true,
  ...o,
});
const mkInv = (p, o = {}) => ({ productId: p._id, availableQuantity: 10, trackInventory: true, ...o });

function checkoutWorld({ lines, products, brands = [brandA, brandB], inventories }) {
  Cart.findOne.mockReturnValue(
    q({ items: lines.map(([p, quantity]) => ({ productId: p._id, brandId: p.brandId, quantity })) })
  );
  Product.find.mockReturnValue(q(products));
  Brand.find.mockReturnValue(q(brands));
  Inventory.find.mockReturnValue(q(inventories || products.map((p) => mkInv(p))));
  Inventory.findOneAndUpdate.mockResolvedValue({}); // deduction succeeds
  Counter.findOneAndUpdate
    .mockResolvedValueOnce({ seq: 1 })
    .mockResolvedValueOnce({ seq: 2 })
    .mockResolvedValueOnce({ seq: 3 });
  Order.create.mockImplementation(async (docs) => docs.map((d) => ({ ...d, _id: oid() })));
  Payment.create.mockResolvedValue([]);
  Cart.updateOne.mockResolvedValue({});
}

beforeEach(() => jest.resetAllMocks());

describe('order access control', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).post('/api/v1/orders').send(body)).status).toBe(401);
    expect((await request(app).get('/api/v1/orders/my')).status).toBe(401);
  });

  it.each([ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN])('403 for %s on checkout, my orders, cancel', async (role) => {
    const { cookie } = asRole(role);
    expect((await request(app).post('/api/v1/orders').set(...cookie).send(body)).status).toBe(403);
    expect((await request(app).get('/api/v1/orders/my').set(...cookie)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/orders/${oid()}/cancel`).set(...cookie)).status).toBe(403);
  });
});

describe('POST /api/v1/orders (checkout)', () => {
  const post = (payload = body) => {
    const { cookie } = asRole();
    return request(app).post('/api/v1/orders').set(...cookie).send(payload);
  };

  it.each([
    ['no address', { paymentMethod: 'COD' }],
    ['no payment method', { shippingAddress: address }],
    ['CARD not supported', { shippingAddress: address, paymentMethod: 'CARD' }],
    ['bad phone', { shippingAddress: { ...address, phone: 'abc' }, paymentMethod: 'COD' }],
    ['missing city', { shippingAddress: { ...address, city: '' }, paymentMethod: 'COD' }],
  ])('400 for %s', async (_n, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(Cart.findOne).not.toHaveBeenCalled();
  });

  it('400 CART_EMPTY for an empty or missing cart', async () => {
    Cart.findOne.mockReturnValue(q({ items: [] }));
    let res = await post();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CART_EMPTY');

    Cart.findOne.mockReturnValue(q(null));
    res = await post();
    expect(res.status).toBe(400);
  });

  it('splits a multi-brand cart into one order per brand, priced from the database', async () => {
    const a1 = mkProduct(brandA, { price: 19.99 });
    const a2 = mkProduct(brandA, { price: 5 });
    const b1 = mkProduct(brandB, { price: 7.5 });
    checkoutWorld({ lines: [[a1, 3], [a2, 1], [b1, 2]], products: [a1, a2, b1] });

    const res = await post({ ...body, items: [{ price: 0.01 }], total: 1, brandId: oid().toString() });

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(2);
    const [orderA, orderB] = Order.create.mock.calls[0][0];

    expect(String(orderA.brandId)).toBe(String(brandA._id));
    expect(orderA.items).toHaveLength(2);
    expect(orderA.items[0]).toMatchObject({ productName: 'Item', unitPrice: 19.99, quantity: 3, totalPrice: 59.97 });
    expect(orderA.subtotal).toBe(64.97);
    expect(orderA.total).toBe(64.97);
    expect(orderA).toMatchObject({ currency: 'PKR', paymentMethod: 'COD', paymentStatus: 'PENDING', orderStatus: 'PENDING', deliveryFee: 0 });
    expect(orderA.orderNumber).toMatch(/^CC-\d{4}-000001$/);

    expect(String(orderB.brandId)).toBe(String(brandB._id));
    expect(orderB.total).toBe(15);
    expect(orderB.orderNumber).toMatch(/-000002$/);
    expect(orderA.shippingAddress).toMatchObject({ name: 'John Doe', address: 'Example Street', state: 'Punjab', country: 'Pakistan' });
  });

  it('deducts stock per line inside the session, in productId order', async () => {
    const p1 = mkProduct(brandA);
    const p2 = mkProduct(brandB);
    checkoutWorld({ lines: [[p2, 2], [p1, 1]], products: [p1, p2] });

    await post();

    const calls = Inventory.findOneAndUpdate.mock.calls;
    expect(calls).toHaveLength(2);
    const ids = calls.map((c) => String(c[0].productId));
    expect(ids).toEqual([String(p1._id), String(p2._id)].sort());
    expect(calls[0][1]).toEqual({ $inc: { quantity: -(String(calls[0][0].productId) === String(p1._id) ? 1 : 2) } });
    expect(calls[0][2]).toMatchObject({ session: 'SESSION' });
  });

  it('creates a PENDING COD payment per order and clears the cart', async () => {
    const p1 = mkProduct(brandA, { price: 10 });
    checkoutWorld({ lines: [[p1, 2]], products: [p1] });

    await post();

    const payments = Payment.create.mock.calls[0][0];
    expect(payments).toEqual([
      expect.objectContaining({ method: 'COD', status: 'PENDING', amount: 20, currency: 'PKR' }),
    ]);
    expect(Cart.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { items: [] } }, { session: 'SESSION' });
  });

  it('409 reports ALL problem lines together and creates nothing', async () => {
    const ok = mkProduct(brandA);
    const inactive = mkProduct(brandA, { isActive: false });
    const scarce = mkProduct(brandB);
    checkoutWorld({
      lines: [[ok, 1], [inactive, 1], [scarce, 5]],
      products: [ok, inactive, scarce],
      inventories: [mkInv(ok), mkInv(inactive), mkInv(scarce, { availableQuantity: 2 })],
    });

    const res = await post();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHECKOUT_ISSUES');
    expect(res.body.issues).toHaveLength(2);
    expect(res.body.issues.map((i) => i.code).sort()).toEqual(['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE']);
    expect(res.body.issues.find((i) => i.code === 'INSUFFICIENT_STOCK').availableQuantity).toBe(2);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Order.create).not.toHaveBeenCalled();
    expect(Cart.updateOne).not.toHaveBeenCalled();
  });

  it('409 when the atomic deduction loses a race for the last unit', async () => {
    const p1 = mkProduct(brandA);
    checkoutWorld({ lines: [[p1, 1]], products: [p1] });
    Inventory.findOneAndUpdate.mockResolvedValue(null); // someone else took it
    Inventory.findOne.mockReturnValue({ session: () => Promise.resolve({ trackInventory: true }) });

    const res = await post();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHECKOUT_ISSUES');
    expect(Order.create).not.toHaveBeenCalled();
  });

  it('does not deduct untracked products', async () => {
    const p1 = mkProduct(brandA);
    checkoutWorld({ lines: [[p1, 3]], products: [p1], inventories: [mkInv(p1, { trackInventory: false, availableQuantity: 0 })] });
    Inventory.findOneAndUpdate.mockResolvedValue(null);
    Inventory.findOne.mockReturnValue({ session: () => Promise.resolve({ trackInventory: false }) });

    expect((await post()).status).toBe(201);
  });
});

describe('GET /api/v1/admin/orders (super admin, all orders)', () => {
  function mockList(items, total = items.length) {
    const limit = jest.fn().mockResolvedValue(items);
    Order.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Order.countDocuments.mockResolvedValue(total);
  }

  it('lists orders from every brand with the brand name attached', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const brandId = oid();
    mockList([{ _id: oid(), orderNumber: 'CC-2026-000001', brandId, orderStatus: 'PENDING' }], 41);
    Brand.find.mockReturnValue({ select: () => Promise.resolve([{ _id: brandId, name: 'Loom & Co' }]) });

    const res = await request(app).get('/api/v1/admin/orders?limit=10').set(...cookie);

    expect(res.status).toBe(200);
    expect(Order.find).toHaveBeenCalledWith({});
    expect(res.body.orders[0].brandName).toBe('Loom & Co');
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 41, pages: 5 });
  });

  it('filters by status, brand and an order-number prefix', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const brandId = oid();
    mockList([]);

    const res = await request(app)
      .get(`/api/v1/admin/orders?status=DELIVERED&brandId=${brandId}&search=cc-2026`)
      .set(...cookie);

    expect(res.status).toBe(200);
    const filter = Order.find.mock.calls[0][0];
    expect(filter.orderStatus).toBe('DELIVERED');
    expect(String(filter.brandId)).toBe(String(brandId));
    expect(filter.orderNumber.$regex).toBe('^cc-2026');
    expect(filter.orderNumber.$options).toBe('i');
  });

  it('treats search text literally (no regex injection)', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    mockList([]);

    await request(app).get('/api/v1/admin/orders?search=' + encodeURIComponent('.*')).set(...cookie);

    expect(Order.find.mock.calls[0][0].orderNumber.$regex).toBe('^\\.\\*');
  });

  it('rejects bad filters with 400', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    expect((await request(app).get('/api/v1/admin/orders?status=NOPE').set(...cookie)).status).toBe(400);
    expect((await request(app).get('/api/v1/admin/orders?brandId=x').set(...cookie)).status).toBe(400);
  });

  it('is closed to guests, customers, brand admins and employees', async () => {
    expect((await request(app).get('/api/v1/admin/orders')).status).toBe(401);
    for (const role of [ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE]) {
      const { cookie } = asRole(role);
      expect((await request(app).get('/api/v1/admin/orders').set(...cookie)).status).toBe(403);
    }
  });
});

describe('GET /api/v1/orders/my and /:id', () => {
  it('lists only the caller\'s orders with pagination', async () => {
    const { cookie, user } = asRole();
    const limit = jest.fn().mockResolvedValue([{ orderNumber: 'CC-1' }]);
    Order.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Order.countDocuments.mockResolvedValue(45);

    const res = await request(app).get('/api/v1/orders/my?status=PENDING&limit=10').set(...cookie);

    expect(res.status).toBe(200);
    expect(Order.find).toHaveBeenCalledWith({ customerId: user._id, orderStatus: 'PENDING' });
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 45, pages: 5 });
  });

  it('400 for a bad status filter', async () => {
    const { cookie } = asRole();
    expect((await request(app).get('/api/v1/orders/my?status=NOPE').set(...cookie)).status).toBe(400);
  });

  it('customer fetch is scoped to their own customerId; missing/foreign order is 404', async () => {
    const { cookie, user } = asRole();
    const id = oid();
    Order.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/orders/${id}`).set(...cookie);
    expect(res.status).toBe(404);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: id.toString(), customerId: user._id });
  });

  it('returns the order with its payment; SUPER_ADMIN is not customer-scoped', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const id = oid();
    Order.findOne.mockResolvedValue({ _id: id, orderNumber: 'CC-1' });
    Payment.findOne.mockResolvedValue({ method: 'COD', status: 'PENDING' });

    const res = await request(app).get(`/api/v1/orders/${id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.payment.method).toBe('COD');
    expect(Order.findOne).toHaveBeenCalledWith({ _id: id.toString() });
  });

  it('400 for an invalid id', async () => {
    const { cookie } = asRole();
    expect((await request(app).get('/api/v1/orders/nope').set(...cookie)).status).toBe(400);
  });
});

describe('PATCH /api/v1/orders/:id/cancel', () => {
  it('cancels a PENDING order, restocks each item and cancels the payment', async () => {
    const { cookie, user } = asRole();
    const p1 = oid();
    const id = oid();
    Order.findOneAndUpdate.mockResolvedValue({
      _id: id,
      items: [{ productId: p1, quantity: 3 }],
    });
    Inventory.updateOne.mockResolvedValue({});
    Payment.updateMany.mockResolvedValue({});

    const res = await request(app).patch(`/api/v1/orders/${id}/cancel`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), customerId: user._id, orderStatus: { $in: ['PENDING'] } },
      {
        $set: { orderStatus: 'CANCELLED', paymentStatus: 'CANCELLED' },
        $push: { statusHistory: { status: 'CANCELLED', by: user._id, at: expect.any(Date) } },
      },
      { new: true, session: 'SESSION' }
    );
    expect(Inventory.updateOne).toHaveBeenCalledWith(
      { productId: p1, trackInventory: true },
      { $inc: { quantity: 3 } },
      { session: 'SESSION' }
    );
    expect(Payment.updateMany).toHaveBeenCalled();
  });

  it('409 (no restock) when the order is no longer PENDING', async () => {
    const { cookie } = asRole();
    Order.findOneAndUpdate.mockResolvedValue(null);
    Order.findOne.mockReturnValue({ session: () => Promise.resolve({ orderStatus: 'SHIPPED' }) });

    const res = await request(app).patch(`/api/v1/orders/${oid()}/cancel`).set(...cookie);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_CANCELLABLE');
    expect(Inventory.updateOne).not.toHaveBeenCalled();
  });

  it('404 for a missing or someone else\'s order', async () => {
    const { cookie } = asRole();
    Order.findOneAndUpdate.mockResolvedValue(null);
    Order.findOne.mockReturnValue({ session: () => Promise.resolve(null) });
    expect((await request(app).patch(`/api/v1/orders/${oid()}/cancel`).set(...cookie)).status).toBe(404);
  });
});
