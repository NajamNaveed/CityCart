const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { signToken } = require('../src/utils/jwt');
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
const asRider = () => {
  const user = { _id: oid(), role: ROLES.RIDER, isActive: true, passwordVersion: 0, brandId };
  User.findById.mockResolvedValue(user);
  const token = signToken({ userId: user._id, role: user.role, brandId, passwordVersion: 0, client: 'partner' }, { expiresIn: '8h' });
  return { header: ['Authorization', `Bearer ${token}`], user };
};

beforeEach(() => jest.resetAllMocks());

describe('access to cash settlement', () => {
  const calls = (cookie) => [
    request(app).get('/api/v1/payments/cash/outstanding').set(...cookie),
    request(app).post('/api/v1/payments/cash/settle').set(...cookie).send({ collectorId: oid(), paymentIds: [oid()] }),
  ];

  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/payments/cash/outstanding')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.SUPER_ADMIN])('403 for %s', async (role) => {
    const { cookie } = asRole(role);
    for (const res of await Promise.all(calls(cookie))) expect(res.status).toBe(403);
  });

  it('a rider cannot see or settle the brand\'s cash', async () => {
    const { header } = asRider();
    for (const res of await Promise.all(calls(header))) expect(res.status).toBe(403);
    expect(Payment.aggregate).not.toHaveBeenCalled();
    expect(Payment.updateMany).not.toHaveBeenCalled();
  });

  it('viewing needs payments.view; settling needs payments.manage', async () => {
    const view = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_VIEW]);
    Payment.aggregate.mockResolvedValue([]);
    const [list, settle] = await Promise.all(calls(view.cookie));
    expect(list.status).toBe(200);
    expect(settle.status).toBe(403);

    asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_MANAGE]);
    const none = asRole(ROLES.BRAND_EMPLOYEE, []);
    expect((await Promise.all(calls(none.cookie))).map((r) => r.status)).toEqual([403, 403]);
  });
});

describe('GET /api/v1/payments/cash/outstanding', () => {
  it("sums each collector's unsettled cash for the caller's brand only", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const rider = oid();
    Payment.aggregate.mockResolvedValue([{ _id: rider, count: 3, total: 7350, oldest: new Date('2026-10-20') }]);
    User.find.mockReturnValue({ select: () => Promise.resolve([{ _id: rider, name: 'Shoaib Raza', role: 'RIDER' }]) });

    const res = await request(app).get(`/api/v1/payments/cash/outstanding?brandId=${oid()}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.collectors).toEqual([
      { collectorId: rider.toString(), name: 'Shoaib Raza', role: 'RIDER', count: 3, total: 7350, oldest: '2026-10-20T00:00:00.000Z' },
    ]);
    const [pipeline] = Payment.aggregate.mock.calls[0];
    expect(String(pipeline[0].$match.brandId)).toBe(brandId.toString());
    expect(pipeline[0].$match).toMatchObject({ collectedBy: { $exists: true }, settledAt: { $exists: false } });
    // names are only looked up inside the brand
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: [rider] }, brandId: brandId.toString() });
  });

  it("lists one collector's unsettled payments, oldest first, with order numbers", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const rider = oid();
    const p1 = { _id: oid(), orderId: oid(), amount: 2450, collectedAt: new Date('2026-10-20') };
    const p2 = { _id: oid(), orderId: oid(), amount: 900, collectedAt: new Date('2026-10-21') };
    const limit = jest.fn().mockResolvedValue([p1, p2]);
    Payment.find.mockReturnValue({ sort: () => ({ limit }) });
    Order.find.mockReturnValue({ select: () => Promise.resolve([{ _id: p1.orderId, orderNumber: 'CC-1' }, { _id: p2.orderId, orderNumber: 'CC-2' }]) });

    const res = await request(app).get(`/api/v1/payments/cash/outstanding?collectorId=${rider}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Payment.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      collectedBy: rider.toString(),
      settledAt: { $exists: false },
    });
    expect(res.body.total).toBe(3350);
    expect(res.body.payments.map((p) => p.orderNumber)).toEqual(['CC-1', 'CC-2']);
  });

  it('400 for a bad collectorId', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).get('/api/v1/payments/cash/outstanding?collectorId=nope').set(...cookie)).status).toBe(400);
  });
});

describe('POST /api/v1/payments/cash/settle', () => {
  const post = (cookie, body) => request(app).post('/api/v1/payments/cash/settle').set(...cookie).send(body);

  it.each([
    [{}],
    [{ collectorId: 'nope', paymentIds: [] }],
    [{ collectorId: new mongoose.Types.ObjectId().toString(), paymentIds: [] }],
    [{ collectorId: new mongoose.Types.ObjectId().toString(), paymentIds: ['nope'] }],
    [{ collectorId: new mongoose.Types.ObjectId().toString(), paymentIds: Array.from({ length: 201 }, () => new mongoose.Types.ObjectId().toString()) }],
  ])('400 for %#', async (body) => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await post(cookie, body)).status).toBe(400);
    expect(Payment.updateMany).not.toHaveBeenCalled();
  });

  it('settles exactly the listed payments, pinned to the brand and the collector, recording who counted the cash', async () => {
    const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
    const rider = oid();
    const a = { _id: oid(), amount: 2450 };
    const b = { _id: oid(), amount: 900 };
    Payment.find.mockReturnValue({ session: () => Promise.resolve([a, b]) });
    Payment.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const res = await post(cookie, { collectorId: rider, paymentIds: [a._id, b._id, a._id] }); // a duplicate is ignored

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ settled: 2, total: 3350 });
    const filter = {
      brandId: brandId.toString(),
      collectedBy: rider.toString(),
      settledAt: { $exists: false },
      _id: { $in: [a._id.toString(), b._id.toString()] },
    };
    expect(Payment.find).toHaveBeenCalledWith(filter);
    expect(Payment.updateMany).toHaveBeenCalledWith(filter, { $set: { settledAt: expect.any(Date), settledBy: user._id } }, { session: 'SESSION' });
  });

  it('409 CASH_CHANGED, and nothing is settled, if any listed payment is not eligible (another brand, another collector, or already settled)', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const a = { _id: oid(), amount: 100 };
    Payment.find.mockReturnValue({ session: () => Promise.resolve([a]) }); // only one of the two qualifies
    const res = await post(cookie, { collectorId: oid(), paymentIds: [a._id, oid()] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CASH_CHANGED');
    expect(Payment.updateMany).not.toHaveBeenCalled();
  });

  it('409 CASH_CHANGED when a concurrent request settled one in between', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const a = { _id: oid(), amount: 100 };
    Payment.find.mockReturnValue({ session: () => Promise.resolve([a]) });
    Payment.updateMany.mockResolvedValue({ modifiedCount: 0 });
    const res = await post(cookie, { collectorId: oid(), paymentIds: [a._id] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CASH_CHANGED');
  });
});

describe('GET /api/v1/rider/deliveries/cash', () => {
  it("shows a rider only the total and count of their own unsettled cash", async () => {
    const { header, user } = asRider();
    Payment.find.mockReturnValue({ select: () => Promise.resolve([{ amount: 2450 }, { amount: 900 }]) });

    const res = await request(app).get('/api/v1/rider/deliveries/cash').set(...header);

    expect(res.status).toBe(200);
    expect(res.body.cash).toEqual({ count: 2, total: 3350 });
    expect(Payment.find).toHaveBeenCalledWith({ brandId: brandId.toString(), collectedBy: user._id, settledAt: { $exists: false } });
  });

  it('only riders may ask', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).get('/api/v1/rider/deliveries/cash').set(...cookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/rider/deliveries/cash')).status).toBe(401);
  });
});
