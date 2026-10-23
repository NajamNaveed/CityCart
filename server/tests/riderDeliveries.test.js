const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));
jest.mock('../src/services/notification.service');
jest.mock('../src/services/receipt.service');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const notifications = require('../src/services/notification.service');
const receipts = require('../src/services/receipt.service');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { signToken } = require('../src/utils/jwt');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const FINAL = ['DELIVERED', 'CANCELLED', 'RETURNED'];

function signedIn(role, permissions) {
  const user = { _id: oid(), role, isActive: true, passwordVersion: 0, ...(role.includes('BRAND') || role === 'RIDER' ? { brandId } : {}) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return user;
}
// The partner app sends a partner-marked Bearer token; web users send the cookie.
const asRider = () => {
  const user = signedIn(ROLES.RIDER);
  const token = signToken({ userId: user._id, role: user.role, brandId: user.brandId, passwordVersion: 0, client: 'partner' }, { expiresIn: '8h' });
  return { header: ['Authorization', `Bearer ${token}`], user };
};
const asWeb = (role, permissions) => {
  const user = signedIn(role, permissions);
  return { header: ['Cookie', getAuthCookie(user)], user };
};

const codOrder = (overrides = {}) => ({
  _id: oid(),
  brandId,
  orderNumber: 'CC-2026-000042',
  total: 2450,
  currency: 'PKR',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  items: [{ productName: 'Printed lawn suit', quantity: 2, unitPrice: 1200, productId: oid() }],
  ...overrides,
});
const delivery = (overrides = {}) => ({
  _id: oid(),
  orderId: oid(),
  brandId,
  customerId: oid(),
  riderId: oid(),
  status: 'OUT_FOR_DELIVERY',
  deliveryCode: '482913',
  codeAttempts: 0,
  address: { name: 'Sana Iqbal', phone: '+923001112223', address: 'House 5, Street 2', city: 'Faisalabad', postalCode: '38000', state: 'Punjab', country: 'PK', additionalInstructions: 'Blue gate' },
  updatedAt: new Date(),
  ...overrides,
});
const listOf = (items) => ({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve(items) }) }) });

beforeEach(() => jest.resetAllMocks());

describe('access to /api/v1/rider/deliveries', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/rider/deliveries')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN])('403 for %s on every rider endpoint', async (role) => {
    const { header } = asWeb(role, Object.values(PERMISSIONS));
    const id = oid();
    const results = await Promise.all([
      request(app).get('/api/v1/rider/deliveries').set(...header),
      request(app).get(`/api/v1/rider/deliveries/${id}`).set(...header),
      request(app).patch(`/api/v1/rider/deliveries/${id}/status`).set(...header).send({ status: 'PICKED_UP' }),
      request(app).post(`/api/v1/rider/deliveries/${id}/complete`).set(...header).send({ code: '123456' }),
    ]);
    results.forEach((res) => expect(res.status).toBe(403));
    expect(Delivery.find).not.toHaveBeenCalled();
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a rider has no access to the brand dashboard endpoints', async () => {
    const { header } = asRider();
    const id = oid();
    const results = await Promise.all([
      request(app).get('/api/v1/deliveries').set(...header),
      request(app).patch(`/api/v1/deliveries/${id}/status`).set(...header).send({ status: 'DELIVERED' }),
      request(app).patch(`/api/v1/deliveries/${id}/rider`).set(...header).send({ riderId: null }),
      request(app).get('/api/v1/brand/orders').set(...header),
      request(app).get('/api/v1/employees').set(...header),
      request(app).get(`/api/v1/payments/order/${id}`).set(...header),
    ]);
    results.forEach((res) => expect(res.status).toBe(403));
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/rider/deliveries', () => {
  it("lists only this rider's open deliveries by default, pinned to rider and brand", async () => {
    const { header, user } = asRider();
    Delivery.find.mockReturnValue(listOf([]));
    Delivery.countDocuments.mockResolvedValue(0);

    const res = await request(app).get(`/api/v1/rider/deliveries?riderId=${oid()}&brandId=${oid()}`).set(...header);

    expect(res.status).toBe(200);
    expect(Delivery.find).toHaveBeenCalledWith({ brandId: brandId.toString(), riderId: user._id, status: { $nin: FINAL } });
  });

  it('history shows the finished ones', async () => {
    const { header, user } = asRider();
    Delivery.find.mockReturnValue(listOf([]));
    Delivery.countDocuments.mockResolvedValue(0);
    await request(app).get('/api/v1/rider/deliveries?scope=history').set(...header);
    expect(Delivery.find).toHaveBeenCalledWith({ brandId: brandId.toString(), riderId: user._id, status: { $in: FINAL } });
  });

  it('400 for a bad scope', async () => {
    const { header } = asRider();
    expect((await request(app).get('/api/v1/rider/deliveries?scope=all').set(...header)).status).toBe(400);
  });

  it('gives the rider what the job needs and nothing else: no customer account, brand, code, prices or other payments', async () => {
    const { header } = asRider();
    const order = codOrder();
    const d = delivery({ orderId: order._id, status: 'OUT_FOR_DELIVERY' });
    Delivery.find.mockReturnValue(listOf([d]));
    Delivery.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({ select: () => Promise.resolve([order]) });

    const res = await request(app).get('/api/v1/rider/deliveries').set(...header);

    expect(res.status).toBe(200);
    const [item] = res.body.deliveries;
    expect(item).toMatchObject({
      orderNumber: 'CC-2026-000042',
      status: 'OUT_FOR_DELIVERY',
      paymentMethod: 'COD',
      amountToCollect: 2450,
      cashCollected: false,
      currency: 'PKR',
      address: { name: 'Sana Iqbal', phone: '+923001112223', address: 'House 5, Street 2', city: 'Faisalabad', additionalInstructions: 'Blue gate' },
      items: [{ productName: 'Printed lawn suit', quantity: 2 }],
    });
    const text = JSON.stringify(res.body);
    ['customerId', 'brandId', 'riderId', 'deliveryCode', '482913', 'codeAttempts', 'unitPrice', 'productId', 'Punjab'].forEach((leak) =>
      expect(text).not.toContain(leak)
    );
  });

  it('cash to collect: only for COD that is still unpaid; prepaid shows none; a collected one shows as collected', async () => {
    const { header } = asRider();
    const unpaid = codOrder();
    const paid = codOrder({ paymentStatus: 'PAID' });
    const prepaid = codOrder({ paymentMethod: 'CARD', paymentStatus: 'PAID' });
    const ds = [unpaid, paid, prepaid].map((o) => delivery({ orderId: o._id }));
    Delivery.find.mockReturnValue(listOf(ds));
    Delivery.countDocuments.mockResolvedValue(3);
    Order.find.mockReturnValue({ select: () => Promise.resolve([unpaid, paid, prepaid]) });

    const res = await request(app).get('/api/v1/rider/deliveries').set(...header);

    const [a, b, c] = res.body.deliveries;
    expect([a.amountToCollect, a.cashCollected]).toEqual([2450, false]);
    expect([b.amountToCollect, b.cashCollected]).toEqual([0, true]);
    expect([c.amountToCollect, c.cashCollected]).toEqual([0, false]);
  });

  it('personal details disappear once the delivery is closed', async () => {
    const { header } = asRider();
    const order = codOrder({ paymentStatus: 'PAID' });
    Delivery.find.mockReturnValue(listOf([delivery({ orderId: order._id, status: 'DELIVERED' })]));
    Delivery.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({ select: () => Promise.resolve([order]) });

    const res = await request(app).get('/api/v1/rider/deliveries?scope=history').set(...header);

    const [item] = res.body.deliveries;
    expect(item.address).toBeNull();
    expect(item.items).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain('Sana Iqbal');
    expect(JSON.stringify(res.body)).not.toContain('+9230011');
  });
});

describe('GET /api/v1/rider/deliveries/:id', () => {
  it('finds a delivery only if it is assigned to this rider in this brand', async () => {
    const { header, user } = asRider();
    const order = codOrder();
    const d = delivery({ orderId: order._id });
    Delivery.findOne.mockResolvedValue(d);
    Order.findOne.mockReturnValue({ select: () => Promise.resolve(order) });

    const res = await request(app).get(`/api/v1/rider/deliveries/${d._id}`).set(...header);

    expect(res.status).toBe(200);
    expect(Delivery.findOne).toHaveBeenCalledWith({ _id: d._id.toString(), brandId: brandId.toString(), riderId: user._id });
    expect(res.body.delivery.orderNumber).toBe('CC-2026-000042');
  });

  it("404 for another rider's or another brand's delivery, 400 for a bad id", async () => {
    const { header } = asRider();
    Delivery.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/rider/deliveries/${oid()}`).set(...header)).status).toBe(404);
    expect((await request(app).get('/api/v1/rider/deliveries/nope').set(...header)).status).toBe(400);
  });
});

describe('PATCH /api/v1/rider/deliveries/:id/status', () => {
  const patch = (header, id, body) => request(app).patch(`/api/v1/rider/deliveries/${id}/status`).set(...header).send(body);

  function world(previous, order = codOrder()) {
    Delivery.findOneAndUpdate.mockResolvedValue(previous);
    Delivery.findById.mockReturnValue({ session: () => Promise.resolve({ ...previous, status: 'x' }) });
    Order.findOneAndUpdate.mockResolvedValue(order);
    Order.findOne.mockReturnValue({ select: () => Promise.resolve(order) });
  }

  it.each([
    [{ status: 'DELIVERED' }], // needs the code
    [{ status: 'READY_FOR_PICKUP' }],
    [{ status: 'CANCELLED' }],
    [{ status: 'RETURNED' }],
    [{ status: 'FAILED' }], // reason required
    [{}],
  ])('400 for %j', async (body) => {
    const { header } = asRider();
    expect((await patch(header, oid(), body)).status).toBe(400);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("moves the rider's own delivery: the update is pinned to this rider and brand", async () => {
    const { header, user } = asRider();
    const previous = delivery({ status: 'READY_FOR_PICKUP' });
    world(previous);

    const res = await patch(header, previous._id, { status: 'PICKED_UP' });

    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: previous._id.toString(), brandId: brandId.toString(), riderId: user._id, status: { $in: ['READY_FOR_PICKUP'] } },
      { $set: { status: 'PICKED_UP' }, $unset: { failureReason: '' } },
      { new: false, session: 'SESSION' }
    );
    expect(notifications.notifyCustomerOfOrderStatus).toHaveBeenCalledWith(expect.anything(), 'SHIPPED');
    expect(res.body.delivery.deliveryCode).toBeUndefined();
  });

  it('records a failed attempt with the reason', async () => {
    const { header } = asRider();
    const previous = delivery({ status: 'OUT_FOR_DELIVERY' });
    world(previous);
    const res = await patch(header, previous._id, { status: 'FAILED', failureReason: 'Customer not reachable' });
    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { status: 'FAILED', failureReason: 'Customer not reachable' } });
  });

  it("404 when the delivery is not this rider's; nothing else is touched", async () => {
    const { header } = asRider();
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockReturnValue({ session: () => Promise.resolve(null) });
    expect((await patch(header, oid(), { status: 'PICKED_UP' })).status).toBe(404);
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('409 INVALID_TRANSITION for an illegal move', async () => {
    const { header } = asRider();
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockReturnValue({ session: () => Promise.resolve({ status: 'READY_FOR_PICKUP' }) });
    const res = await patch(header, oid(), { status: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });
});

describe('POST /api/v1/rider/deliveries/:id/complete', () => {
  const post = (header, id, body) => request(app).post(`/api/v1/rider/deliveries/${id}/complete`).set(...header).send(body);
  const withSelect = (value) => ({ select: jest.fn().mockResolvedValue(value) });

  it.each([[{}], [{ code: '12345' }], [{ code: '1234567' }], [{ code: 'abcdef' }], [{ code: 123456 }]])('400 for %j', async (body) => {
    const { header } = asRider();
    expect((await post(header, oid(), body)).status).toBe(400);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a wrong code is counted atomically, refused with the tries left, and completes nothing', async () => {
    const { header, user } = asRider();
    const id = oid();
    Delivery.findOneAndUpdate.mockReturnValue(withSelect(delivery({ _id: id, deliveryCode: '482913', codeAttempts: 1 })));

    const res = await post(header, id, { code: '000000' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'INVALID_CODE', attemptsRemaining: 4 });
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), riderId: user._id, status: 'OUT_FOR_DELIVERY', codeAttempts: { $lt: 5 } },
      { $inc: { codeAttempts: 1 } },
      { new: true }
    );
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('482913');
  });

  it('the right code completes it: delivery DELIVERED, order DELIVERED, COD payment PAID by this rider', async () => {
    const { header, user } = asRider();
    const order = codOrder();
    const attempt = delivery({ orderId: order._id, deliveryCode: '482913', codeAttempts: 1 });
    Delivery.findOneAndUpdate
      .mockReturnValueOnce(withSelect(attempt)) // the counted try
      .mockResolvedValueOnce({ ...attempt, status: 'OUT_FOR_DELIVERY' }); // the status change
    Delivery.findById.mockReturnValue({ session: () => Promise.resolve({ ...attempt, status: 'DELIVERED' }) });
    Order.findOneAndUpdate.mockResolvedValue(order);
    Order.updateOne.mockResolvedValue({});
    const paymentId = oid();
    Payment.findOneAndUpdate.mockResolvedValue({ _id: paymentId });
    Order.findOne.mockReturnValue({ select: () => Promise.resolve({ ...order, paymentStatus: 'PAID' }) });

    const res = await post(header, attempt._id, { code: '482913' });

    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate.mock.calls[1][0]).toEqual({
      _id: attempt._id.toString(),
      brandId: brandId.toString(),
      riderId: user._id,
      status: { $in: ['OUT_FOR_DELIVERY'] },
    });
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: order._id, status: 'PENDING' },
      { $set: { status: 'PAID', paidAt: expect.any(Date), confirmedBy: user._id, brandId: order.brandId, collectedBy: user._id, collectedAt: expect.any(Date) } },
      { session: 'SESSION' }
    );
    expect(notifications.notifyCustomerOfOrderStatus).toHaveBeenCalledWith(expect.anything(), 'DELIVERED');
    expect(notifications.notifyPaymentReceived).toHaveBeenCalledTimes(1);
    expect(receipts.issueReceiptBestEffort).toHaveBeenCalledWith(paymentId);
    expect(res.body.delivery).toMatchObject({ status: 'DELIVERED', cashCollected: true, amountToCollect: 0, address: null });
    expect(JSON.stringify(res.body)).not.toContain('482913');
  });

  it('429 CODE_LOCKED after too many wrong tries; the correct code no longer helps', async () => {
    const { header } = asRider();
    Delivery.findOneAndUpdate.mockReturnValue(withSelect(null));
    Delivery.findOne.mockResolvedValue(delivery({ status: 'OUT_FOR_DELIVERY', codeAttempts: 5 }));

    const res = await post(header, oid(), { code: '482913' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('CODE_LOCKED');
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('409 when the delivery is not out for delivery, 404 when it is not this rider\'s', async () => {
    const { header } = asRider();
    Delivery.findOneAndUpdate.mockReturnValue(withSelect(null));
    Delivery.findOne.mockResolvedValue(delivery({ status: 'PICKED_UP' }));
    const notOut = await post(header, oid(), { code: '482913' });
    expect(notOut.status).toBe(409);
    expect(notOut.body.code).toBe('INVALID_TRANSITION');

    Delivery.findOne.mockResolvedValue(null);
    expect((await post(header, oid(), { code: '482913' })).status).toBe(404);
  });

  it('409 NO_DELIVERY_CODE for a delivery that has no code, and nothing is completed', async () => {
    const { header } = asRider();
    Delivery.findOneAndUpdate.mockReturnValue(withSelect(delivery({ deliveryCode: undefined, codeAttempts: 1 })));
    const res = await post(header, oid(), { code: '482913' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_DELIVERY_CODE');
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/deliveries/:id/rider (the brand assigns a rider)', () => {
  const patch = (header, id, body) => request(app).patch(`/api/v1/deliveries/${id}/rider`).set(...header).send(body);
  const rider = () => ({ _id: oid(), name: 'Bilal Ahmed' });

  it('needs delivery.manage; customers, riders and the super admin are refused', async () => {
    for (const role of [ROLES.CUSTOMER, ROLES.SUPER_ADMIN]) {
      expect((await patch(asWeb(role).header, oid(), { riderId: null })).status).toBe(403);
    }
    expect((await patch(asRider().header, oid(), { riderId: null })).status).toBe(403);
    expect((await patch(asWeb(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.DELIVERY_VIEW]).header, oid(), { riderId: oid() })).status).toBe(403);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ riderId: 'nope' }], [{ riderId: 5 }]])('400 for %j', async (body) => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    expect((await patch(header, oid(), body)).status).toBe(400);
  });

  it("assigns an active rider of the SAME brand, sets the display name, makes sure a code exists, and tells the rider", async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const r = rider();
    const id = oid();
    const orderId = oid();
    User.findOne.mockResolvedValue(r);
    Delivery.findOneAndUpdate.mockResolvedValue({ _id: id, orderId, brandId, status: 'READY_FOR_PICKUP' });
    Delivery.updateOne.mockResolvedValue({});
    Order.findById.mockReturnValue({ select: () => Promise.resolve({ orderNumber: 'CC-2026-000042' }) });
    Delivery.findById.mockResolvedValue({ _id: id, riderId: r._id, assignedAgent: 'Bilal Ahmed' });

    const res = await patch(header, id, { riderId: r._id });

    expect(res.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ _id: r._id.toString(), brandId: brandId.toString(), role: 'RIDER', isActive: true });
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), status: { $nin: FINAL } },
      { $set: { riderId: r._id, assignedAgent: 'Bilal Ahmed', assignedAt: expect.any(Date) } },
      { new: false }
    );
    expect(Delivery.updateOne).toHaveBeenCalledWith(
      { _id: id, deliveryCode: { $exists: false } },
      { $set: { deliveryCode: expect.stringMatching(/^[0-9]{6}$/) } }
    );
    expect(notifications.notifyRiderAssigned).toHaveBeenCalledWith({
      userId: r._id,
      brandId: brandId.toString(),
      orderNumber: 'CC-2026-000042',
      deliveryId: id,
    });
    expect(JSON.stringify(res.body)).not.toContain('deliveryCode');
  });

  it("404 for a rider of another brand (or an inactive one); the delivery is never touched", async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    User.findOne.mockResolvedValue(null);
    const res = await patch(header, oid(), { riderId: oid() });
    expect(res.status).toBe(404);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('assigning the same rider again does not notify them twice', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const r = rider();
    User.findOne.mockResolvedValue(r);
    Delivery.findOneAndUpdate.mockResolvedValue({ _id: oid(), orderId: oid(), riderId: r._id });
    Delivery.updateOne.mockResolvedValue({});
    Delivery.findById.mockResolvedValue({});
    expect((await patch(header, oid(), { riderId: r._id })).status).toBe(200);
    expect(notifications.notifyRiderAssigned).not.toHaveBeenCalled();
  });

  it("409 DELIVERY_FINAL for a finished delivery, 404 for another brand's delivery", async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    User.findOne.mockResolvedValue(rider());
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockResolvedValue({ status: 'DELIVERED' });
    const final = await patch(header, oid(), { riderId: oid() });
    expect(final.status).toBe(409);
    expect(final.body.code).toBe('DELIVERY_FINAL');

    Delivery.findOne.mockResolvedValue(null);
    expect((await patch(header, oid(), { riderId: oid() })).status).toBe(404);
  });

  it('riderId null takes the rider off, only if one is assigned, and needs no rider lookup', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const id = oid();
    Delivery.findOneAndUpdate.mockResolvedValue({ _id: id, riderId: oid() });
    Delivery.findById.mockResolvedValue({ _id: id });

    const res = await patch(header, id, { riderId: null });

    expect(res.status).toBe(200);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), status: { $nin: FINAL }, riderId: { $exists: true } },
      { $unset: { riderId: '', assignedAgent: '', assignedAt: '' } },
      { new: false }
    );
  });

  it('409 NO_RIDER_ASSIGNED when there is nobody to remove', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockResolvedValue({ status: 'READY_FOR_PICKUP' });
    const res = await patch(header, oid(), { riderId: null });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_RIDER_ASSIGNED');
  });
});

describe('PATCH /api/v1/deliveries/:id with a typed-in agent name', () => {
  it('409 USE_RIDER_ASSIGNMENT when a rider is assigned (the name must not drift from the rider)', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockResolvedValue({ status: 'OUT_FOR_DELIVERY', riderId: oid() });
    const res = await request(app).patch(`/api/v1/deliveries/${oid()}`).set(...header).send({ assignedAgent: 'Someone else' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_RIDER_ASSIGNMENT');
  });

  it('a tracking reference alone can still be saved on a delivery that has a rider', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    Delivery.findOneAndUpdate.mockResolvedValue({ _id: oid() });
    await request(app).patch(`/api/v1/deliveries/${oid()}`).set(...header).send({ trackingReference: 'TRK-9' });
    expect(Delivery.findOneAndUpdate.mock.calls[0][0]).not.toHaveProperty('riderId');
  });
});

describe('GET /api/v1/deliveries?riderId=', () => {
  it('lets the brand filter its deliveries by rider', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const rid = oid();
    Delivery.find.mockReturnValue(listOf([]));
    Delivery.countDocuments.mockResolvedValue(0);
    Order.find.mockReturnValue({ select: () => Promise.resolve([]) });
    const res = await request(app).get(`/api/v1/deliveries?riderId=${rid}`).set(...header);
    expect(res.status).toBe(200);
    expect(Delivery.find).toHaveBeenCalledWith({ brandId: brandId.toString(), riderId: rid.toString() });
    expect((await request(app).get('/api/v1/deliveries?riderId=nope').set(...header)).status).toBe(400);
  });
});

describe('GET /api/v1/deliveries/:id/code (the customer\'s proof-of-delivery code)', () => {
  const get = (header, id) => request(app).get(`/api/v1/deliveries/${id}/code`).set(...header);
  const withSelect = (value) => ({ select: jest.fn().mockResolvedValue(value) });

  it('only the customer may ask; brand staff, riders and the super admin never see it', async () => {
    for (const role of [ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN]) {
      expect((await get(asWeb(role).header, oid())).status).toBe(403);
    }
    expect((await get(asRider().header, oid())).status).toBe(403);
    expect(Delivery.findOne).not.toHaveBeenCalled();
  });

  it('401 when unauthenticated', async () => {
    expect((await request(app).get(`/api/v1/deliveries/${oid()}/code`)).status).toBe(401);
  });

  it('returns the code of the customer\'s own order once it is on its way', async () => {
    const { header, user } = asWeb(ROLES.CUSTOMER);
    const id = oid();
    Delivery.findOne.mockReturnValue(withSelect({ status: 'OUT_FOR_DELIVERY', deliveryCode: '482913' }));

    const res = await get(header, id);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('482913');
    expect(Delivery.findOne).toHaveBeenCalledWith({ _id: id.toString(), customerId: user._id });
    expect(Delivery.findOne.mock.results[0].value.select).toHaveBeenCalledWith('+deliveryCode status');
  });

  it.each(['READY_FOR_PICKUP', 'DELIVERED', 'CANCELLED', 'RETURNED'])('409 CODE_NOT_AVAILABLE while the delivery is %s', async (status) => {
    const { header } = asWeb(ROLES.CUSTOMER);
    Delivery.findOne.mockReturnValue(withSelect({ status, deliveryCode: '482913' }));
    const res = await get(header, oid());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CODE_NOT_AVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('482913');
  });

  it("404 for someone else's delivery, 400 for a bad id", async () => {
    const { header } = asWeb(ROLES.CUSTOMER);
    Delivery.findOne.mockReturnValue(withSelect(null));
    expect((await get(header, oid())).status).toBe(404);
    expect((await get(header, 'nope')).status).toBe(400);
  });
});
