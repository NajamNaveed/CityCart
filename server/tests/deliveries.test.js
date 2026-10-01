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

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');
const {
  legalDeliverySourcesFor,
  nextDeliveryStatuses,
  legalOrderSourcesFor,
  ORDER_STATUS_FOR_DELIVERY,
} = require('../src/config/deliveryTransitions');

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

describe('delivery transition rules', () => {
  it('knows the legal sources for each target', () => {
    expect(legalDeliverySourcesFor('PICKED_UP')).toEqual(['READY_FOR_PICKUP']);
    expect(legalDeliverySourcesFor('OUT_FOR_DELIVERY').sort()).toEqual(['FAILED', 'IN_TRANSIT', 'PICKED_UP']);
    expect(legalDeliverySourcesFor('DELIVERED')).toEqual(['OUT_FOR_DELIVERY']);
  });

  it('never allows skipping to DELIVERED or leaving DELIVERED', () => {
    expect(legalDeliverySourcesFor('DELIVERED')).not.toContain('READY_FOR_PICKUP');
    expect(nextDeliveryStatuses('DELIVERED')).toEqual([]);
  });

  it('maps delivery steps onto legal order transitions', () => {
    Object.values(ORDER_STATUS_FOR_DELIVERY).forEach((orderTarget) => {
      expect(legalOrderSourcesFor(orderTarget).length).toBeGreaterThan(0);
    });
    expect(ORDER_STATUS_FOR_DELIVERY.DELIVERED).toBe('DELIVERED');
  });
});

describe('delivery access control', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/deliveries')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.SUPER_ADMIN])('403 for %s on list and updates', async (role) => {
    const { cookie } = asRole(role);
    expect((await request(app).get('/api/v1/deliveries').set(...cookie)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/deliveries/${oid()}/status`).set(...cookie).send({ status: 'PICKED_UP' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/deliveries/${oid()}`).set(...cookie).send({ assignedAgent: 'x' })).status).toBe(403);
  });

  it('employee needs delivery.view to read and delivery.manage to change', async () => {
    let { cookie } = asRole(ROLES.BRAND_EMPLOYEE, []);
    expect((await request(app).get('/api/v1/deliveries').set(...cookie)).status).toBe(403);

    ({ cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.DELIVERY_VIEW]));
    Delivery.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    Delivery.countDocuments.mockResolvedValue(0);
    expect((await request(app).get('/api/v1/deliveries').set(...cookie)).status).toBe(200);
    expect((await request(app).patch(`/api/v1/deliveries/${oid()}/status`).set(...cookie).send({ status: 'PICKED_UP' })).status).toBe(403);
  });
});

describe('GET /api/v1/deliveries and /:id', () => {
  it("lists only the caller's brand's deliveries", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const limit = jest.fn().mockResolvedValue([{ status: 'READY_FOR_PICKUP' }]);
    Delivery.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Delivery.countDocuments.mockResolvedValue(1);

    const res = await request(app).get(`/api/v1/deliveries?status=READY_FOR_PICKUP&brandId=${oid()}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Delivery.find).toHaveBeenCalledWith({ brandId: brandId.toString(), status: 'READY_FOR_PICKUP' });
  });

  it('scopes GET /:id per role: customer by owner, brand by brand, super admin unrestricted', async () => {
    const id = oid();
    Delivery.findOne.mockResolvedValue({ _id: id });

    let ctx = asRole(ROLES.CUSTOMER);
    expect((await request(app).get(`/api/v1/deliveries/${id}`).set(...ctx.cookie)).status).toBe(200);
    expect(Delivery.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), customerId: ctx.user._id });

    ctx = asRole(ROLES.BRAND_ADMIN);
    await request(app).get(`/api/v1/deliveries/${id}`).set(...ctx.cookie);
    expect(Delivery.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), brandId: brandId.toString() });

    ctx = asRole(ROLES.SUPER_ADMIN);
    await request(app).get(`/api/v1/deliveries/${id}`).set(...ctx.cookie);
    expect(Delivery.findOne).toHaveBeenLastCalledWith({ _id: id.toString() });
  });

  it("404 for someone else's delivery, 400 for a bad id", async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Delivery.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/deliveries/${oid()}`).set(...cookie)).status).toBe(404);
    expect((await request(app).get('/api/v1/deliveries/nope').set(...cookie)).status).toBe(400);
  });
});

describe('PATCH /api/v1/deliveries/:id/status', () => {
  const patch = (cookie, id, body) =>
    request(app).patch(`/api/v1/deliveries/${id}/status`).set(...cookie).send(body);

  function world({ previous, order = { _id: oid(), paymentMethod: 'COD' } }) {
    Delivery.findOneAndUpdate.mockResolvedValue(previous);
    Delivery.findById.mockReturnValue({ session: () => Promise.resolve({ _id: previous && previous._id, status: 'x' }) });
    Order.findOneAndUpdate.mockResolvedValue(order);
    Order.updateOne.mockResolvedValue({});
    Payment.updateOne.mockResolvedValue({});
  }

  it.each([
    [{ status: 'DELIVERED_NOW' }],
    [{ status: 'READY_FOR_PICKUP' }],
    [{ status: 'CANCELLED' }],
    [{ status: 'FAILED' }], // reason required
    [{ status: 'FAILED', failureReason: '' }],
    [{}],
  ])('400 for invalid body %j', async (body) => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await patch(cookie, oid(), body)).status).toBe(400);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('cannot set order or payment status through this endpoint (ignored)', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const previous = { _id: oid(), orderId: oid(), status: 'READY_FOR_PICKUP' };
    world({ previous });
    await patch(cookie, previous._id, { status: 'PICKED_UP', orderStatus: 'DELIVERED', paymentStatus: 'PAID' });
    const [, update] = Order.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({ orderStatus: 'SHIPPED' });
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });

  it('PICKED_UP: atomic, brand-scoped delivery update; order moves to SHIPPED with history', async () => {
    const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
    const previous = { _id: oid(), orderId: oid(), status: 'READY_FOR_PICKUP' };
    world({ previous });

    const res = await patch(cookie, previous._id, { status: 'PICKED_UP' });

    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: previous._id.toString(), brandId: brandId.toString(), status: { $in: ['READY_FOR_PICKUP'] } },
      { $set: { status: 'PICKED_UP' }, $unset: { failureReason: '' } },
      { new: false, session: 'SESSION' }
    );
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: previous.orderId, brandId: brandId.toString(), orderStatus: { $in: ['READY_FOR_SHIPMENT'] } },
      {
        $set: { orderStatus: 'SHIPPED' },
        $push: { statusHistory: { status: 'SHIPPED', by: user._id, at: expect.any(Date) } },
      },
      { new: true, session: 'SESSION' }
    );
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });

  it('DELIVERED: order DELIVERED and COD payment PAID (only if still PENDING) with confirmer', async () => {
    const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
    const orderId = oid();
    const previous = { _id: oid(), orderId, status: 'OUT_FOR_DELIVERY' };
    world({ previous, order: { _id: orderId, paymentMethod: 'COD' } });

    const res = await patch(cookie, previous._id, { status: 'DELIVERED' });

    expect(res.status).toBe(200);
    expect(Order.updateOne).toHaveBeenCalledWith({ _id: orderId }, { $set: { paymentStatus: 'PAID' } }, { session: 'SESSION' });
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { orderId, status: 'PENDING' },
      { $set: { status: 'PAID', paidAt: expect.any(Date), confirmedBy: user._id } },
      { session: 'SESSION' }
    );
  });

  it('FAILED records the reason and leaves order and payment untouched', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const previous = { _id: oid(), orderId: oid(), status: 'OUT_FOR_DELIVERY' };
    world({ previous });

    const res = await patch(cookie, previous._id, { status: 'FAILED', failureReason: 'Customer unavailable' });

    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { status: 'FAILED', failureReason: 'Customer unavailable' },
    });
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });

  it('a re-attempt after FAILED does not touch the order again', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const previous = { _id: oid(), orderId: oid(), status: 'FAILED' };
    world({ previous });

    expect((await patch(cookie, previous._id, { status: 'OUT_FOR_DELIVERY' })).status).toBe(200);
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('409 INVALID_TRANSITION with allowed steps; nothing else is touched', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockReturnValue({ session: () => Promise.resolve({ status: 'READY_FOR_PICKUP' }) });

    const res = await patch(cookie, oid(), { status: 'DELIVERED' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INVALID_TRANSITION', from: 'READY_FOR_PICKUP', to: 'DELIVERED' });
    expect(res.body.allowed).toEqual(['PICKED_UP']);
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("404 for another brand's delivery", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockReturnValue({ session: () => Promise.resolve(null) });
    expect((await patch(cookie, oid(), { status: 'PICKED_UP' })).status).toBe(404);
  });

  it('409 ORDER_OUT_OF_SYNC when the order is not in a legal state (whole change aborts)', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    world({ previous: { _id: oid(), orderId: oid(), status: 'OUT_FOR_DELIVERY' } });
    Order.findOneAndUpdate.mockResolvedValue(null);

    const res = await patch(cookie, oid(), { status: 'DELIVERED' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_OUT_OF_SYNC');
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/deliveries/:id', () => {
  const patch = (cookie, id, body) => request(app).patch(`/api/v1/deliveries/${id}`).set(...cookie).send(body);

  it('updates tracking info only on a non-final, own-brand delivery', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Delivery.findOneAndUpdate.mockResolvedValue({ _id: id });

    const res = await patch(cookie, id, { trackingReference: 'TRK-1', assignedAgent: 'Ali', status: 'DELIVERED', brandId: oid() });

    expect(res.status).toBe(200);
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), brandId: brandId.toString(), status: { $nin: ['DELIVERED', 'CANCELLED', 'RETURNED'] } },
      { $set: { trackingReference: 'TRK-1', assignedAgent: 'Ali' } }, // status/brandId ignored
      { new: true }
    );
  });

  it('400 with nothing to update; 409 when final; 404 when not found', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await patch(cookie, oid(), {})).status).toBe(400);

    Delivery.findOneAndUpdate.mockResolvedValue(null);
    Delivery.findOne.mockResolvedValue({ status: 'DELIVERED' });
    expect((await patch(cookie, oid(), { assignedAgent: 'x' })).status).toBe(409);

    Delivery.findOne.mockResolvedValue(null);
    expect((await patch(cookie, oid(), { assignedAgent: 'x' })).status).toBe(404);
  });
});
