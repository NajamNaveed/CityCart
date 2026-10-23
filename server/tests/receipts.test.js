const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/receipt.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/counter.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Receipt = require('../src/models/receipt.model');
const Brand = require('../src/models/brand.model');
const Counter = require('../src/models/counter.model');
const app = require('../src/app');
const { issueReceiptForPayment, issueReceiptBestEffort } = require('../src/services/receipt.service');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();

function asRole(role, permissions) {
  const user = { _id: oid(), role, isActive: true, passwordVersion: 0, ...(role.includes('BRAND') || role === 'RIDER' ? { brandId } : {}) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const stored = (overrides = {}) => ({
  _id: oid(),
  receiptNumber: 'RC-2026-000007',
  paymentId: oid(),
  orderId: oid(),
  orderNumber: 'CC-2026-000042',
  brandId,
  brandName: 'Loom & Co.',
  customerId: oid(),
  billedTo: 'Sana Iqbal',
  method: 'COD',
  amount: 2450,
  currency: 'PKR',
  items: [{ productName: 'Printed lawn suit', quantity: 2, unitPrice: 1200, totalPrice: 2400 }],
  subtotal: 2400,
  deliveryFee: 50,
  discount: 0,
  tax: 0,
  transactionReference: 'RCPT-000042',
  provider: 'Cash on Delivery',
  collectedBy: oid(),
  collectedByName: 'Shoaib Raza',
  issuedAt: new Date('2026-10-20T10:00:00Z'),
  ...overrides,
});
const listOf = (items) => ({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve(items) }) }) });

beforeEach(() => jest.resetAllMocks());

describe('access to /api/v1/receipts', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/receipts')).status).toBe(401);
  });

  it('a rider never sees receipts', async () => {
    const { cookie } = asRole(ROLES.RIDER);
    const id = oid();
    for (const path of ['/api/v1/receipts', `/api/v1/receipts/${id}`, `/api/v1/receipts/order/${id}`]) {
      expect((await request(app).get(path).set(...cookie)).status).toBe(403);
    }
    expect(Receipt.find).not.toHaveBeenCalled();
    expect(Receipt.findOne).not.toHaveBeenCalled();
  });

  it('a team member needs payments.view', async () => {
    let { cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]);
    expect((await request(app).get('/api/v1/receipts').set(...cookie)).status).toBe(403);

    ({ cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_VIEW]));
    Receipt.find.mockReturnValue(listOf([]));
    Receipt.countDocuments.mockResolvedValue(0);
    expect((await request(app).get('/api/v1/receipts').set(...cookie)).status).toBe(200);
  });

  it('receipts cannot be created, edited or deleted through the API', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    expect((await request(app).post('/api/v1/receipts').set(...cookie).send({})).status).toBe(404);
    expect((await request(app).patch(`/api/v1/receipts/${id}`).set(...cookie).send({ amount: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/receipts/${id}`).set(...cookie)).status).toBe(404);
  });
});

describe('GET /api/v1/receipts', () => {
  const run = async (role, query = '') => {
    const ctx = asRole(role);
    Receipt.find.mockReturnValue(listOf([stored()]));
    Receipt.countDocuments.mockResolvedValue(1);
    const res = await request(app).get(`/api/v1/receipts${query}`).set(...ctx.cookie);
    return { res, user: ctx.user };
  };

  it('customer: only their own', async () => {
    const { res, user } = await run(ROLES.CUSTOMER, `?customerId=${oid()}&brandId=${oid()}`);
    expect(res.status).toBe(200);
    expect(Receipt.find).toHaveBeenCalledWith({ customerId: user._id });
  });

  it("brand user: only their brand's, whatever the query says", async () => {
    const { res } = await run(ROLES.BRAND_ADMIN, `?brandId=${oid()}`);
    expect(res.status).toBe(200);
    expect(Receipt.find).toHaveBeenCalledWith({ brandId: brandId.toString() });
  });

  it('super admin: all', async () => {
    const { res } = await run(ROLES.SUPER_ADMIN);
    expect(res.status).toBe(200);
    expect(Receipt.find).toHaveBeenCalledWith({});
  });

  it('filters by date and paginates', async () => {
    const { res } = await run(ROLES.BRAND_ADMIN, '?from=2026-10-01&to=2026-10-31&page=2&limit=5');
    expect(res.status).toBe(200);
    expect(Receipt.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      issuedAt: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-31') },
    });
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 5 });
  });

  it('400 for bad query values', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    expect((await request(app).get('/api/v1/receipts?limit=500').set(...cookie)).status).toBe(400);
    expect((await request(app).get('/api/v1/receipts?from=yesterday-ish').set(...cookie)).status).toBe(400);
  });

  it('each role sees only what it should on a receipt', async () => {
    const customer = (await run(ROLES.CUSTOMER)).res.body.receipts[0];
    expect(customer).toMatchObject({ receiptNumber: 'RC-2026-000007', brandName: 'Loom & Co.', amount: 2450, billedTo: 'Sana Iqbal' });
    for (const hidden of ['collectedBy', 'collectedByName', 'paymentId', 'transactionReference', 'customerId', 'brandId', 'provider']) {
      expect(customer).not.toHaveProperty(hidden);
    }

    const brand = (await run(ROLES.BRAND_ADMIN)).res.body.receipts[0];
    expect(brand).toMatchObject({ collectedByName: 'Shoaib Raza', transactionReference: 'RCPT-000042' });
    expect(brand).toHaveProperty('paymentId');
    expect(brand).not.toHaveProperty('customerId');
    expect(brand).not.toHaveProperty('collectedBy'); // the rider's account id is never exposed

    const admin = (await run(ROLES.SUPER_ADMIN)).res.body.receipts[0];
    expect(admin).toHaveProperty('customerId');
    expect(admin).toHaveProperty('brandId');
  });
});

describe('GET /api/v1/receipts/:id', () => {
  it('is scoped per role, and the id alone is never enough', async () => {
    const id = oid();
    Receipt.findOne.mockResolvedValue(stored({ _id: id }));

    let ctx = asRole(ROLES.CUSTOMER);
    expect((await request(app).get(`/api/v1/receipts/${id}`).set(...ctx.cookie)).status).toBe(200);
    expect(Receipt.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), customerId: ctx.user._id });

    ctx = asRole(ROLES.BRAND_ADMIN);
    await request(app).get(`/api/v1/receipts/${id}`).set(...ctx.cookie);
    expect(Receipt.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), brandId: brandId.toString() });

    ctx = asRole(ROLES.SUPER_ADMIN);
    await request(app).get(`/api/v1/receipts/${id}`).set(...ctx.cookie);
    expect(Receipt.findOne).toHaveBeenLastCalledWith({ _id: id.toString() });
  });

  it("404 for someone else's receipt, 400 for a bad id", async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Receipt.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/receipts/${oid()}`).set(...cookie)).status).toBe(404);
    expect((await request(app).get('/api/v1/receipts/nope').set(...cookie)).status).toBe(400);
  });
});

describe('GET /api/v1/receipts/order/:orderId', () => {
  it("finds the receipt of the caller's own order", async () => {
    const ctx = asRole(ROLES.CUSTOMER);
    const order = { _id: oid() };
    Order.findOne.mockResolvedValue(order);
    Receipt.findOne.mockResolvedValue(stored({ orderId: order._id }));

    const res = await request(app).get(`/api/v1/receipts/order/${order._id}`).set(...ctx.cookie);

    expect(res.status).toBe(200);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: order._id.toString(), customerId: ctx.user._id });
    expect(res.body.receipt.receiptNumber).toBe('RC-2026-000007');
  });

  it("404 for another person's order, before any receipt is looked at", async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/receipts/order/${oid()}`).set(...cookie)).status).toBe(404);
    expect(Receipt.findOne).not.toHaveBeenCalled();
  });

  it('issues a missing receipt on the spot when the payment was paid', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    const order = { _id: oid() };
    const payment = { _id: oid(), orderId: order._id, status: 'PAID', paidAt: new Date(), amount: 100, method: 'COD' };
    Order.findOne.mockResolvedValue(order);
    Order.findById.mockResolvedValue({ _id: order._id, orderNumber: 'CC-1', brandId, customerId: oid(), items: [], subtotal: 100, shippingAddress: { name: 'Sana' } });
    Receipt.findOne.mockResolvedValue(null);
    Payment.findOne.mockResolvedValue(payment);
    Brand.findById.mockReturnValue({ select: () => Promise.resolve({ name: 'Loom & Co.' }) });
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 3 });
    Receipt.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));

    const res = await request(app).get(`/api/v1/receipts/order/${order._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Receipt.create).toHaveBeenCalledTimes(1);
  });

  it('404 NO_RECEIPT for an order that has not been paid', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    const order = { _id: oid() };
    Order.findOne.mockResolvedValue(order);
    Receipt.findOne.mockResolvedValue(null);
    Payment.findOne.mockResolvedValueOnce({ _id: oid() }); // exists, but is not paid
    Payment.findOne.mockResolvedValueOnce(null);
    const res = await request(app).get(`/api/v1/receipts/order/${order._id}`).set(...cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_RECEIPT');
    expect(Receipt.create).not.toHaveBeenCalled();
  });
});

describe('issuing a receipt', () => {
  const paidPayment = (overrides = {}) => ({
    _id: oid(), orderId: oid(), status: 'PAID', paidAt: new Date('2026-10-20T10:00:00Z'), amount: 2450, method: 'COD',
    currency: 'PKR', transactionReference: 'RCPT-1', provider: 'Cash on Delivery', collectedBy: oid(), ...overrides,
  });
  const order = (payment) => ({
    _id: payment.orderId, orderNumber: 'CC-2026-000042', brandId, customerId: oid(), subtotal: 2400, deliveryFee: 50, discount: 0, tax: 0,
    shippingAddress: { name: 'Sana Iqbal', phone: '+9230', address: 'secret street' },
    items: [{ productId: oid(), productName: 'Printed lawn suit', sku: 'LOOM-001', quantity: 2, unitPrice: 1200, totalPrice: 2400 }],
  });
  function world(payment) {
    Receipt.findOne.mockResolvedValue(null);
    Payment.findOne.mockResolvedValue(payment);
    Order.findById.mockResolvedValue(order(payment));
    Brand.findById.mockReturnValue({ select: () => Promise.resolve({ name: 'Loom & Co.' }) });
    User.findById.mockReturnValue({ select: () => Promise.resolve({ name: 'Shoaib Raza' }) });
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 7 });
    Receipt.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));
  }

  it('writes a snapshot of the order and payment, numbered RC-year-000000', async () => {
    const payment = paidPayment();
    world(payment);

    const receipt = await issueReceiptForPayment(payment._id);

    const year = new Date().getFullYear();
    expect(Counter.findOneAndUpdate).toHaveBeenCalledWith({ _id: `receipt-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    expect(receipt).toMatchObject({
      receiptNumber: `RC-${year}-000007`,
      paymentId: payment._id,
      orderNumber: 'CC-2026-000042',
      brandName: 'Loom & Co.',
      billedTo: 'Sana Iqbal',
      method: 'COD',
      amount: 2450,
      issuedAt: payment.paidAt,
      collectedByName: 'Shoaib Raza',
      items: [{ productName: 'Printed lawn suit', quantity: 2, unitPrice: 1200, totalPrice: 2400 }],
    });
    // The customer's address and phone are not copied onto the receipt.
    expect(JSON.stringify(receipt)).not.toContain('secret street');
    expect(JSON.stringify(receipt)).not.toContain('+9230');
  });

  it('is idempotent: an existing receipt is returned and nothing new is written', async () => {
    const existing = stored();
    Receipt.findOne.mockResolvedValue(existing);
    expect(await issueReceiptForPayment(oid())).toBe(existing);
    expect(Receipt.create).not.toHaveBeenCalled();
    expect(Counter.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a payment that is not paid gets no receipt', async () => {
    Receipt.findOne.mockResolvedValue(null);
    Payment.findOne.mockResolvedValue(null); // the query only matches PAID / refunded payments
    expect(await issueReceiptForPayment(oid())).toBeNull();
    expect(Payment.findOne).toHaveBeenCalledWith({ _id: expect.anything(), status: { $in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } });
    expect(Receipt.create).not.toHaveBeenCalled();
  });

  it('nothing to do without a payment id', async () => {
    expect(await issueReceiptForPayment(undefined)).toBeNull();
    expect(Receipt.findOne).not.toHaveBeenCalled();
  });

  it('a duplicate-key race returns the receipt the other request wrote', async () => {
    const payment = paidPayment();
    world(payment);
    const winner = stored();
    Receipt.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    Receipt.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    expect(await issueReceiptForPayment(payment._id)).toBe(winner);
  });

  it('best effort: a failure is logged and never thrown into the payment that already succeeded', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Receipt.findOne.mockRejectedValue(new Error('db down'));
    await expect(issueReceiptBestEffort(oid())).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
