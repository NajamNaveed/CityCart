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
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));
jest.mock('../src/services/notification.service');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const Inventory = require('../src/models/inventory.model');
const notifications = require('../src/services/notification.service');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');
const {
  legalSourcesFor,
  brandNextStatuses,
  BRAND_SETTABLE_STATUSES,
} = require('../src/config/orderTransitions');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();

function asRole(role, permissions) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId }) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

beforeEach(() => jest.resetAllMocks());

describe('transition rules', () => {
  it('finds the legal source statuses for a target', () => {
    expect(legalSourcesFor('CONFIRMED')).toEqual(['PENDING']);
    expect(legalSourcesFor('REJECTED').sort()).toEqual(['CONFIRMED', 'PENDING']);
    expect(legalSourcesFor('PROCESSING')).toEqual(['CONFIRMED']);
    expect(legalSourcesFor('DELIVERED')).toEqual(['OUT_FOR_DELIVERY']);
  });

  it('never allows skipping (PENDING -> PROCESSING / DELIVERED)', () => {
    expect(legalSourcesFor('PROCESSING')).not.toContain('PENDING');
    expect(legalSourcesFor('DELIVERED')).not.toContain('PENDING');
  });

  it('lists what a brand can do next', () => {
    expect(brandNextStatuses('PENDING').sort()).toEqual(['CONFIRMED', 'REJECTED']);
    expect(brandNextStatuses('SHIPPED')).toEqual([]); // delivery flow, not brand
    expect(BRAND_SETTABLE_STATUSES).not.toContain('CANCELLED');
  });
});

describe('brand order access control', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/brand/orders')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.SUPER_ADMIN])('403 for %s', async (role) => {
    const { cookie } = asRole(role);
    expect((await request(app).get('/api/v1/brand/orders').set(...cookie)).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/brand/orders/${oid()}/status`).set(...cookie).send({ status: 'CONFIRMED' })).status
    ).toBe(403);
  });

  it('employee needs orders.view to list and orders.manage to update', async () => {
    let { cookie } = asRole(ROLES.BRAND_EMPLOYEE, []);
    expect((await request(app).get('/api/v1/brand/orders').set(...cookie)).status).toBe(403);

    ({ cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]));
    Order.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    Order.countDocuments.mockResolvedValue(0);
    expect((await request(app).get('/api/v1/brand/orders').set(...cookie)).status).toBe(200);
    expect(
      (await request(app).patch(`/api/v1/brand/orders/${oid()}/status`).set(...cookie).send({ status: 'CONFIRMED' })).status
    ).toBe(403); // view only
  });
});

describe('GET /api/v1/brand/orders and /:id', () => {
  it("lists only the caller's brand's orders (brand from the token, not the query)", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const limit = jest.fn().mockResolvedValue([{ orderNumber: 'CC-1' }]);
    Order.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Order.countDocuments.mockResolvedValue(3);

    const res = await request(app)
      .get(`/api/v1/brand/orders?status=PENDING&brandId=${oid()}`)
      .set(...cookie);

    expect(res.status).toBe(200);
    expect(Order.find).toHaveBeenCalledWith({ brandId: brandId.toString(), orderStatus: 'PENDING' });
    expect(res.body.pagination.total).toBe(3);
  });

  it("another brand's order is a 404; own order returns with payment", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Order.findOne.mockResolvedValue(null);
    let res = await request(app).get(`/api/v1/brand/orders/${id}`).set(...cookie);
    expect(res.status).toBe(404);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: id.toString(), brandId: brandId.toString() });

    Order.findOne.mockResolvedValue({ _id: id });
    Payment.findOne.mockResolvedValue({ method: 'COD' });
    res = await request(app).get(`/api/v1/brand/orders/${id}`).set(...cookie);
    expect(res.status).toBe(200);
    expect(res.body.payment.method).toBe('COD');
  });

  it('400 for an invalid id or status filter', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).get('/api/v1/brand/orders/nope').set(...cookie)).status).toBe(400);
    expect((await request(app).get('/api/v1/brand/orders?status=NOPE').set(...cookie)).status).toBe(400);
  });
});

describe('PATCH /api/v1/brand/orders/:id/status', () => {
  const patch = (cookie, id, status) =>
    request(app).patch(`/api/v1/brand/orders/${id}/status`).set(...cookie).send({ status });

  it.each(['DELIVERED', 'SHIPPED', 'CANCELLED', 'PENDING', 'NOPE'])('400 when a brand tries to set %s', async (status) => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await patch(cookie, oid(), status)).status).toBe(400);
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('applies a legal transition atomically, scoped to the brand, with audit history', async () => {
    const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Order.findOneAndUpdate.mockResolvedValue({ _id: id, orderStatus: 'CONFIRMED', items: [] });

    const res = await patch(cookie, id, 'CONFIRMED');

    expect(res.status).toBe(200);
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), orderStatus: { $in: ['PENDING'] } },
      {
        $set: { orderStatus: 'CONFIRMED' },
        $push: { statusHistory: { status: 'CONFIRMED', by: user._id, at: expect.any(Date) } },
      },
      { new: true, session: 'SESSION' }
    );
    expect(Inventory.updateOne).not.toHaveBeenCalled(); // only REJECTED restocks
    // The buyer is told their order is confirmed (docs/12 §5).
    expect(notifications.notifyCustomerOfOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ _id: id, orderStatus: 'CONFIRMED' }),
      'CONFIRMED'
    );
  });

  it('REJECTED restocks every item, cancels the payment and payment status', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const p1 = oid();
    const p2 = oid();
    Order.findOneAndUpdate.mockResolvedValue({
      _id: oid(),
      items: [{ productId: p2, quantity: 1 }, { productId: p1, quantity: 4 }],
    });
    Inventory.updateOne.mockResolvedValue({});
    Payment.updateMany.mockResolvedValue({});

    const res = await patch(cookie, oid(), 'REJECTED');

    expect(res.status).toBe(200);
    const [filter, update] = Order.findOneAndUpdate.mock.calls[0];
    expect(filter.orderStatus.$in.sort()).toEqual(['CONFIRMED', 'PENDING']);
    expect(update.$set).toEqual({ orderStatus: 'REJECTED', paymentStatus: 'CANCELLED' });
    expect(Inventory.updateOne).toHaveBeenCalledTimes(2);
    expect(Inventory.updateOne).toHaveBeenCalledWith(
      { productId: p1, trackInventory: true },
      { $inc: { quantity: 4 } },
      { session: 'SESSION' }
    );
    expect(Payment.updateMany).toHaveBeenCalled();
  });

  it('READY_FOR_SHIPMENT creates the delivery record from the order snapshot, in the same transaction', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const orderId = oid();
    const customerId = oid();
    const shippingAddress = { name: 'John', phone: '+9230', address: 'Street 1', city: 'Lahore' };
    Order.findOneAndUpdate.mockResolvedValue({
      _id: orderId, brandId, customerId, shippingAddress, deliveryFee: 0, items: [],
    });
    Delivery.create.mockResolvedValue([]);

    const res = await patch(cookie, orderId, 'READY_FOR_SHIPMENT');

    expect(res.status).toBe(200);
    expect(Delivery.create).toHaveBeenCalledWith(
      [{ orderId, brandId, customerId, status: 'READY_FOR_PICKUP', address: shippingAddress, deliveryFee: 0 }],
      { session: 'SESSION' }
    );
    // READY_FOR_SHIPMENT is internal workflow — the customer hears nothing yet.
    expect(notifications.notifyCustomerOfOrderStatus).not.toHaveBeenCalled();
  });

  it('other statuses do not create a delivery', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Order.findOneAndUpdate.mockResolvedValue({ _id: oid(), items: [] });
    await patch(cookie, oid(), 'PROCESSING');
    expect(Delivery.create).not.toHaveBeenCalled();
  });

  it('409 INVALID_TRANSITION (with allowed next steps) and NO restock for an illegal move', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Order.findOneAndUpdate.mockResolvedValue(null);
    Order.findOne.mockReturnValue({ session: () => Promise.resolve({ orderStatus: 'PENDING' }) });

    const res = await patch(cookie, oid(), 'PROCESSING');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INVALID_TRANSITION', from: 'PENDING', to: 'PROCESSING' });
    expect(res.body.allowed.sort()).toEqual(['CONFIRMED', 'REJECTED']);
    expect(Inventory.updateOne).not.toHaveBeenCalled();
    // An illegal move changes nothing and announces nothing.
    expect(notifications.notifyCustomerOfOrderStatus).not.toHaveBeenCalled();
  });

  it("404 for another brand's or a missing order", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Order.findOneAndUpdate.mockResolvedValue(null);
    Order.findOne.mockReturnValue({ session: () => Promise.resolve(null) });
    expect((await patch(cookie, oid(), 'CONFIRMED')).status).toBe(404);
  });
});
