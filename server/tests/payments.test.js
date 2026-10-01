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
const { getAuthCookie } = require('./helpers/testAuth');

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

const q = (v) => ({ session: () => Promise.resolve(v) });
const mkPayment = (o = {}) => ({
  _id: oid(), orderId: oid(), amount: 100, refundedAmount: 0, method: 'COD', status: 'PAID', ...o,
});

function world({ payment = mkPayment(), order = { _id: payment.orderId, orderStatus: 'DELIVERED' }, updated = { ok: true } } = {}) {
  Payment.findById.mockReturnValue(q(payment));
  Order.findOne.mockReturnValue(q(order));
  Payment.findOneAndUpdate.mockResolvedValue(updated);
  Order.updateOne.mockResolvedValue({});
  return payment;
}

beforeEach(() => jest.resetAllMocks());

describe('GET /api/v1/payments/order/:orderId', () => {
  it('401 unauthenticated; 400 bad id', async () => {
    expect((await request(app).get(`/api/v1/payments/order/${oid()}`)).status).toBe(401);
    const { cookie } = asRole(ROLES.CUSTOMER);
    expect((await request(app).get('/api/v1/payments/order/nope').set(...cookie)).status).toBe(400);
  });

  it('scopes by order ownership per role', async () => {
    const id = oid();
    Order.findOne.mockResolvedValue({ _id: id });
    Payment.findOne.mockResolvedValue({ status: 'PENDING' });

    let ctx = asRole(ROLES.CUSTOMER);
    expect((await request(app).get(`/api/v1/payments/order/${id}`).set(...ctx.cookie)).status).toBe(200);
    expect(Order.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), customerId: ctx.user._id });

    ctx = asRole(ROLES.BRAND_ADMIN);
    await request(app).get(`/api/v1/payments/order/${id}`).set(...ctx.cookie);
    expect(Order.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), brandId: brandId.toString() });

    ctx = asRole(ROLES.SUPER_ADMIN);
    await request(app).get(`/api/v1/payments/order/${id}`).set(...ctx.cookie);
    expect(Order.findOne).toHaveBeenLastCalledWith({ _id: id.toString() });
  });

  it("404 for someone else's order; employee needs payments.view", async () => {
    let { cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/payments/order/${oid()}`).set(...cookie)).status).toBe(404);

    ({ cookie } = asRole(ROLES.BRAND_EMPLOYEE, []));
    expect((await request(app).get(`/api/v1/payments/order/${oid()}`).set(...cookie)).status).toBe(403);
  });
});

describe('PATCH /api/v1/payments/:id/status — access', () => {
  const patch = (cookie, body) =>
    request(app).patch(`/api/v1/payments/${oid()}/status`).set(...cookie).send(body);

  it('401 unauthenticated and 403 for customers (they can never change payment status)', async () => {
    expect((await request(app).patch(`/api/v1/payments/${oid()}/status`).send({ status: 'PAID' })).status).toBe(401);
    const { cookie } = asRole(ROLES.CUSTOMER);
    expect((await patch(cookie, { status: 'PAID' })).status).toBe(403);
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('employee needs payments.manage (payments.view is not enough)', async () => {
    let { cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_VIEW]);
    expect((await patch(cookie, { status: 'PAID' })).status).toBe(403);

    ({ cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_MANAGE]));
    world({ payment: mkPayment({ status: 'PENDING' }) });
    expect((await patch(cookie, { status: 'PAID' })).status).toBe(200);
  });
});

describe('PATCH /api/v1/payments/:id/status — validation', () => {
  it.each([
    [{ status: 'FAILED' }],
    [{ status: 'CANCELLED' }],
    [{ status: 'PENDING' }],
    [{ status: 'REFUNDED' }], // reason required
    [{ status: 'PARTIALLY_REFUNDED', refundReason: 'x' }], // amount required
    [{ status: 'PARTIALLY_REFUNDED', refundAmount: 10 }], // reason required
    [{ status: 'PARTIALLY_REFUNDED', refundAmount: -5, refundReason: 'x' }],
    [{ status: 'PARTIALLY_REFUNDED', refundAmount: 0, refundReason: 'x' }],
    [{ status: 'PARTIALLY_REFUNDED', refundAmount: 1.005, refundReason: 'x' }],
    [{ status: 'PARTIALLY_REFUNDED', refundAmount: '10', refundReason: 'x' }],
    [{}],
  ])('400 for %j', async (body) => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const res = await request(app).patch(`/api/v1/payments/${oid()}/status`).set(...cookie).send(body);
    expect(res.status).toBe(400);
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/payments/:id/status — rules', () => {
  const patch = (cookie, id, body) => request(app).patch(`/api/v1/payments/${id}/status`).set(...cookie).send(body);
  const reason = 'Customer returned item';

  it("a brand only reaches its own orders' payments (else 404)", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const payment = mkPayment();
    Payment.findById.mockReturnValue(q(payment));
    Order.findOne.mockReturnValue(q(null));

    expect((await patch(cookie, payment._id, { status: 'REFUNDED', refundReason: reason })).status).toBe(404);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: payment.orderId, brandId: brandId.toString() });
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN is not brand-scoped', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const payment = world();
    await patch(cookie, payment._id, { status: 'REFUNDED', refundReason: reason });
    expect(Order.findOne).toHaveBeenCalledWith({ _id: payment.orderId });
  });

  describe('manual PAID', () => {
    it('only for a COD payment on a DELIVERED order; records who and when', async () => {
      const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ status: 'PENDING' }) });

      const res = await patch(cookie, payment._id, { status: 'PAID' });

      expect(res.status).toBe(200);
      expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: payment._id, status: 'PENDING', refundedAmount: { $in: [0, null] } },
        { $set: { status: 'PAID', paidAt: expect.any(Date), confirmedBy: user._id } },
        { new: true, session: 'SESSION' }
      );
      expect(Order.updateOne).toHaveBeenCalledWith({ _id: payment.orderId }, { $set: { paymentStatus: 'PAID' } }, { session: 'SESSION' });
    });

    it('409 before delivery (no early "cash collected")', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = mkPayment({ status: 'PENDING' });
      world({ payment, order: { _id: payment.orderId, orderStatus: 'SHIPPED' } });
      const res = await patch(cookie, payment._id, { status: 'PAID' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_NOT_COLLECTABLE');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(['PAID', 'REFUNDED', 'CANCELLED', 'FAILED'])('409 when the payment is already %s', async (status) => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ status }) });
      expect((await patch(cookie, payment._id, { status: 'PAID' })).status).toBe(409);
    });
  });

  describe('refunds', () => {
    it('REFUNDED refunds the whole remaining amount and logs it', async () => {
      const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ amount: 100, refundedAmount: 30, status: 'PARTIALLY_REFUNDED' }) });

      const res = await patch(cookie, payment._id, { status: 'REFUNDED', refundReason: reason });

      expect(res.status).toBe(200);
      expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: payment._id, status: 'PARTIALLY_REFUNDED', refundedAmount: 30 },
        {
          $set: { status: 'REFUNDED', refundedAmount: 100 },
          $push: { refunds: { amount: 70, reason, by: user._id, at: expect.any(Date) } },
        },
        { new: true, session: 'SESSION' }
      );
      expect(Order.updateOne).toHaveBeenCalledWith({ _id: payment.orderId }, { $set: { paymentStatus: 'REFUNDED' } }, { session: 'SESSION' });
    });

    it('PARTIALLY_REFUNDED adds to the cumulative refunded total', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ amount: 100, refundedAmount: 0 }) });

      const res = await patch(cookie, payment._id, { status: 'PARTIALLY_REFUNDED', refundAmount: 30.5, refundReason: reason });

      expect(res.status).toBe(200);
      const [, update] = Payment.findOneAndUpdate.mock.calls[0];
      expect(update.$set).toEqual({ status: 'PARTIALLY_REFUNDED', refundedAmount: 30.5 });
      expect(Order.updateOne.mock.calls[0][1]).toEqual({ $set: { paymentStatus: 'PARTIALLY_REFUNDED' } });
    });

    it('409 when the refund exceeds what remains', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ amount: 100, refundedAmount: 80, status: 'PARTIALLY_REFUNDED' }) });
      const res = await patch(cookie, payment._id, { status: 'PARTIALLY_REFUNDED', refundAmount: 30, refundReason: reason });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'REFUND_EXCEEDS_REMAINING', remaining: 20 });
    });

    it('409 USE_FULL_REFUND when a partial equals the whole remainder', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ amount: 100, refundedAmount: 0 }) });
      const res = await patch(cookie, payment._id, { status: 'PARTIALLY_REFUNDED', refundAmount: 100, refundReason: reason });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USE_FULL_REFUND');
    });

    it('409 when a "full" refund is given a smaller amount', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world();
      const res = await patch(cookie, payment._id, { status: 'REFUNDED', refundAmount: 10, refundReason: reason });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REFUND_AMOUNT_MISMATCH');
    });

    it.each(['PENDING', 'REFUNDED', 'CANCELLED', 'FAILED'])('409 refunding a %s payment (REFUNDED -> anything is blocked)', async (status) => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ payment: mkPayment({ status }) });
      const res = await patch(cookie, payment._id, { status: 'REFUNDED', refundReason: reason });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('409 PAYMENT_CHANGED when a concurrent change wins (optimistic guard)', async () => {
      const { cookie } = asRole(ROLES.BRAND_ADMIN);
      const payment = world({ updated: null });
      const res = await patch(cookie, payment._id, { status: 'REFUNDED', refundReason: reason });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_CHANGED');
      expect(Order.updateOne).not.toHaveBeenCalled();
    });
  });
});
