const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/paymentEvent.model', () => {
  const model = { create: jest.fn(), find: jest.fn(), countDocuments: jest.fn() };
  model.OUTCOMES = ['PAID', 'FAILED_ATTEMPT', 'LATE_PAYMENT', 'DUPLICATE_PAYMENT', 'AMOUNT_MISMATCH', 'UNKNOWN_PAYMENT'];
  return model;
});
jest.mock('../src/services/inventory.service');
jest.mock('../src/services/notification.service');
jest.mock('../src/services/receipt.service');
jest.mock('../src/utils/transaction', () => ({ runInTransaction: (work) => work('SESSION') }));

const User = require('../src/models/user.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const PaymentEvent = require('../src/models/paymentEvent.model');
const inventory = require('../src/services/inventory.service');
const notifications = require('../src/services/notification.service');
const receipts = require('../src/services/receipt.service');
const app = require('../src/app');
const env = require('../src/config/env');
const { ROLES } = require('../src/config/roles');
const { activeProvider } = require('../src/payments');
const { expireUnpaidOnlinePayments } = require('../src/services/onlinePayment.service');
const { getAuthCookie } = require('./helpers/testAuth');

const SECRET = 'a-long-test-webhook-secret-123';
const oid = () => new mongoose.Types.ObjectId();
const sign = (raw) => `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;

const defaults = { ...env.payments };
const setProvider = (provider, extra = {}) => Object.assign(env.payments, { provider, webhookSecret: SECRET, ...extra });

function asRole(role) {
  const user = { _id: oid(), role, isActive: true, passwordVersion: 0 };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const onlinePayment = (overrides = {}) => ({
  _id: oid(), orderId: oid(), customerId: oid(), amount: 2450, currency: 'PKR', method: 'ONLINE_GATEWAY', status: 'PENDING',
  provider: 'mock', transactionReference: 'mock_ref_1', expiresAt: new Date(Date.now() + 20 * 60 * 1000), ...overrides,
});

// A webhook the way the test gateway would send it.
function webhook(body, { signature, raw } = {}) {
  const rawBody = raw !== undefined ? raw : JSON.stringify(body);
  return request(app)
    .post('/api/v1/payments/webhooks/mock')
    .set('Content-Type', 'application/json')
    .set('X-CityCart-Signature', signature !== undefined ? signature : sign(rawBody))
    .send(rawBody);
}
const event = (over = {}) => ({ eventId: 'evt_1', reference: 'mock_ref_1', status: 'PAID', amount: 2450, currency: 'PKR', ...over });

beforeEach(() => {
  jest.resetAllMocks();
  Object.assign(env.payments, defaults);
  setProvider('mock');
});
afterAll(() => Object.assign(env.payments, defaults));

describe('when online payments are on or off', () => {
  it('are off by default, and need a known provider and a strong secret', () => {
    Object.assign(env.payments, defaults);
    expect(activeProvider()).toBeNull();
    setProvider('nonsense');
    expect(activeProvider()).toBeNull();
    setProvider('mock', { webhookSecret: 'short' });
    expect(activeProvider()).toBeNull();
    setProvider('mock');
    expect(activeProvider().name).toBe('mock');
  });

  it('the test gateway can NEVER be on in production, where customers would pay nothing', () => {
    const before = env.nodeEnv;
    env.nodeEnv = 'production';
    try {
      expect(activeProvider()).toBeNull();
    } finally {
      env.nodeEnv = before;
    }
  });

  it('GET /payments/methods offers cash always and online only while a provider is on', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    let res = await request(app).get('/api/v1/payments/methods').set(...cookie);
    expect(res.body.methods.map((m) => m.method)).toEqual(['COD', 'ONLINE_GATEWAY']);
    expect(res.body.methods[1].holdMinutes).toBe(30);

    Object.assign(env.payments, defaults);
    res = await request(app).get('/api/v1/payments/methods').set(...cookie);
    expect(res.body.methods.map((m) => m.method)).toEqual(['COD']);
  });

  it('only a customer asks for the methods', async () => {
    expect((await request(app).get('/api/v1/payments/methods')).status).toBe(401);
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await request(app).get('/api/v1/payments/methods').set(...cookie)).status).toBe(403);
  });
});

describe('POST /api/v1/payments/order/:orderId/checkout', () => {
  const post = (cookie, orderId) => request(app).post(`/api/v1/payments/order/${orderId}/checkout`).set(...cookie);
  const world = (user, paymentOver = {}, orderOver = {}) => {
    const payment = onlinePayment({ customerId: user._id, ...paymentOver });
    const order = { _id: payment.orderId, customerId: user._id, orderStatus: 'PENDING', ...orderOver };
    Order.findOne.mockResolvedValue(order);
    Payment.findOne.mockResolvedValue(payment);
    Payment.updateOne.mockResolvedValue({ matchedCount: 1 });
    return { payment, order };
  };

  it('401 / 403: only a customer can pay', async () => {
    expect((await request(app).post(`/api/v1/payments/order/${oid()}/checkout`)).status).toBe(401);
    expect((await post(asRole(ROLES.BRAND_ADMIN).cookie, oid())).status).toBe(403);
    expect((await post(asRole(ROLES.RIDER).cookie, oid())).status).toBe(403);
  });

  it('returns the gateway page for the customer\'s own pending online order, and remembers the reference', async () => {
    const { cookie, user } = asRole(ROLES.CUSTOMER);
    const { payment, order } = world(user, { provider: undefined, transactionReference: undefined });

    const res = await post(cookie, order._id);

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toMatch(/\/api\/v1\/payments\/mock-checkout\/mock_/);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: order._id.toString(), customerId: user._id });
    const [filter, update] = Payment.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: payment._id, status: 'PENDING' }); // a payment that is no longer pending is never touched
    expect(update.$set.provider).toBe('mock');
    expect(update.$set.transactionReference).toMatch(/^mock_/);
  });

  it('opening Pay twice reuses the same reference, so there is still one payment', async () => {
    const { cookie, user } = asRole(ROLES.CUSTOMER);
    const { order } = world(user, { transactionReference: 'mock_existing' });
    const res = await post(cookie, order._id);
    expect(res.body.checkoutUrl).toMatch(/mock_existing$/);
    expect(Payment.updateOne.mock.calls[0][1].$set.transactionReference).toBe('mock_existing');
  });

  it("404 for someone else's order (it cannot be probed)", async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(null);
    expect((await post(cookie, oid())).status).toBe(404);
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['an order paid with cash', { payment: null }, 'NOT_ONLINE'],
    ['a payment already paid', { paymentOver: { status: 'PAID' } }, 'ALREADY_PAID'],
    ['a cancelled payment', { paymentOver: { status: 'CANCELLED' } }, 'NOT_PAYABLE'],
    ['an order no longer pending', { orderOver: { orderStatus: 'CANCELLED' } }, 'NOT_PAYABLE'],
    ['a payment whose hold has ended', { paymentOver: { expiresAt: new Date(Date.now() - 1000) } }, 'PAYMENT_EXPIRED'],
  ])('409 for %s', async (_name, { payment, paymentOver, orderOver }, code) => {
    const { cookie, user } = asRole(ROLES.CUSTOMER);
    const w = world(user, paymentOver, orderOver);
    if (payment === null) Payment.findOne.mockResolvedValue(null);
    const res = await post(cookie, w.order._id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(code);
    expect(Payment.updateOne).not.toHaveBeenCalled();
  });

  it('503 when online payments are off', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Object.assign(env.payments, defaults);
    const res = await post(cookie, oid());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ONLINE_PAYMENTS_UNAVAILABLE');
  });

  it('409 if the payment stopped being pending while the page was being prepared', async () => {
    const { cookie, user } = asRole(ROLES.CUSTOMER);
    const { order } = world(user);
    Payment.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect((await post(cookie, order._id)).status).toBe(409);
  });
});

describe('POST /api/v1/payments/webhooks/:provider', () => {
  function pendingWorld(paymentOver = {}) {
    const payment = onlinePayment(paymentOver);
    Payment.findOne.mockReturnValue({ session: () => Promise.resolve(payment) });
    Payment.findOneAndUpdate.mockResolvedValue({ ...payment, status: 'PAID' });
    Order.findOneAndUpdate.mockResolvedValue({ _id: payment.orderId, customerId: payment.customerId, orderNumber: 'CC-1' });
    PaymentEvent.create.mockResolvedValue([{}]);
    return payment;
  }

  it('marks the payment PAID, records the event, and tells the customer and issues the receipt AFTER it commits', async () => {
    const payment = pendingWorld();
    const res = await webhook(event());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, received: true, outcome: 'PAID' });
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: payment._id, status: 'PENDING' },
      { $set: { status: 'PAID', paidAt: expect.any(Date) } },
      { new: true, session: 'SESSION' }
    );
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith({ _id: payment.orderId }, { $set: { paymentStatus: 'PAID' } }, { new: true, session: 'SESSION' });
    expect(PaymentEvent.create).toHaveBeenCalledWith(
      [expect.objectContaining({ provider: 'mock', eventId: 'evt_1', reference: 'mock_ref_1', outcome: 'PAID', amount: 2450 })],
      { session: 'SESSION' }
    );
    expect(notifications.notifyPaymentReceived).toHaveBeenCalledTimes(1);
    expect(receipts.issueReceiptBestEffort).toHaveBeenCalledWith(payment._id);
  });

  describe('is never trusted blindly', () => {
    it('a wrong signature is refused before anything is read', async () => {
      const res = await webhook(event(), { signature: 'sha256=' + 'a'.repeat(64) });
      expect(res.status).toBe(401);
      expect(Payment.findOne).not.toHaveBeenCalled();
      expect(PaymentEvent.create).not.toHaveBeenCalled();
    });

    it('a missing signature is refused', async () => {
      const res = await webhook(event(), { signature: '' });
      expect(res.status).toBe(401);
    });

    it('a body changed after signing is refused (the signature covers the exact bytes)', async () => {
      const original = JSON.stringify(event());
      const tampered = JSON.stringify(event({ amount: 1 }));
      const res = await webhook(null, { raw: tampered, signature: sign(original) });
      expect(res.status).toBe(401);
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a signature made with the wrong secret is refused', async () => {
      const raw = JSON.stringify(event());
      const wrong = `sha256=${crypto.createHmac('sha256', 'another-secret-another-secret').update(raw).digest('hex')}`;
      expect((await webhook(null, { raw, signature: wrong })).status).toBe(401);
    });

    it.each([
      [{ ...event(), status: 'REFUNDED' }],
      [{ ...event(), amount: '2450' }],
      [{ ...event(), reference: undefined }],
      [{ ...event(), eventId: undefined }],
      [{ ...event(), currency: undefined }],
    ])('a signed but malformed notification is a 400 (%#)', async (body) => {
      expect((await webhook(body)).status).toBe(400);
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a signed body that is not JSON is a 400', async () => {
      const raw = 'not json';
      expect((await webhook(null, { raw, signature: sign(raw) })).status).toBe(400);
    });

    it('an unknown provider, or online payments being off, is a 404', async () => {
      const raw = JSON.stringify(event());
      const res = await request(app).post('/api/v1/payments/webhooks/evilpay').set('Content-Type', 'application/json').set('X-CityCart-Signature', sign(raw)).send(raw);
      expect(res.status).toBe(404);
      Object.assign(env.payments, defaults);
      expect((await webhook(event())).status).toBe(404);
    });
  });

  describe('is applied at most once', () => {
    it('the same notification again changes nothing and still answers 200', async () => {
      pendingWorld();
      PaymentEvent.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
      const res = await webhook(event());
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('DUPLICATE_EVENT');
      expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled(); // no second notification
      expect(receipts.issueReceiptBestEffort).not.toHaveBeenCalled();
    });

    it('a second payment of an already paid order is flagged, never applied twice', async () => {
      const payment = pendingWorld({ status: 'PAID' });
      Payment.findOneAndUpdate.mockResolvedValue(null);
      const res = await webhook(event({ eventId: 'evt_2' }));
      expect(res.body.outcome).toBe('DUPLICATE_PAYMENT');
      expect(PaymentEvent.create.mock.calls[0][0][0]).toMatchObject({ outcome: 'DUPLICATE_PAYMENT', paymentId: payment._id });
      expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
    });
  });

  describe('money that nothing can accept is recorded, never silently applied', () => {
    it.each(['CANCELLED', 'FAILED'])('a late payment for a %s payment is flagged for a refund', async (status) => {
      pendingWorld({ status });
      Payment.findOneAndUpdate.mockResolvedValue(null);
      const res = await webhook(event());
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('LATE_PAYMENT');
      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
    });

    it('a different amount is flagged and nothing is paid', async () => {
      pendingWorld();
      const res = await webhook(event({ amount: 100 }));
      expect(res.body.outcome).toBe('AMOUNT_MISMATCH');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a different currency is flagged and nothing is paid', async () => {
      pendingWorld();
      expect((await webhook(event({ currency: 'USD' }))).body.outcome).toBe('AMOUNT_MISMATCH');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a reference no payment has is recorded and ignored', async () => {
      Payment.findOne.mockReturnValue({ session: () => Promise.resolve(null) });
      PaymentEvent.create.mockResolvedValue([{}]);
      const res = await webhook(event({ reference: 'mock_nobody' }));
      expect(res.body.outcome).toBe('UNKNOWN_PAYMENT');
      expect(PaymentEvent.create.mock.calls[0][0][0].paymentId).toBeUndefined();
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a failed attempt keeps the payment pending so the customer can try again', async () => {
      pendingWorld();
      const res = await webhook(event({ status: 'FAILED' }));
      expect(res.body.outcome).toBe('FAILED_ATTEMPT');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
      expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
    });
  });

  it('the payment is found by provider AND reference (a reference of another provider never matches)', async () => {
    pendingWorld();
    await webhook(event());
    expect(Payment.findOne).toHaveBeenCalledWith({ provider: 'mock', transactionReference: 'mock_ref_1' });
  });
});

describe('the test gateway page', () => {
  it('shows a pay page for a pending payment, and answers 404 when the test gateway is off', async () => {
    const payment = onlinePayment();
    Payment.findOne.mockResolvedValue(payment);
    Order.findById.mockReturnValue({ select: () => Promise.resolve({ orderNumber: 'CC-1' }) });
    let res = await request(app).get('/api/v1/payments/mock-checkout/mock_ref_1');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Pay Rs 2,450 for order CC-1/);
    expect(res.text).toMatch(/TEST gateway/);

    Object.assign(env.payments, defaults);
    res = await request(app).get('/api/v1/payments/mock-checkout/mock_ref_1');
    expect(res.status).toBe(404);
  });

  it('escapes anything it prints', async () => {
    Payment.findOne.mockResolvedValue(onlinePayment());
    Order.findById.mockReturnValue({ select: () => Promise.resolve({ orderNumber: '<script>x</script>' }) });
    const res = await request(app).get('/api/v1/payments/mock-checkout/mock_ref_1');
    expect(res.text).not.toMatch(/<script>x/);
    expect(res.text).toMatch(/&lt;script&gt;/);
  });

  it('refuses a reference with odd characters', async () => {
    expect((await request(app).get('/api/v1/payments/mock-checkout/a%20b')).status).toBe(404);
  });

  it('paying sends a SIGNED notification through the same processing as a real gateway', async () => {
    const payment = onlinePayment();
    Payment.findOne.mockReturnValueOnce(Promise.resolve(payment)).mockReturnValue({ session: () => Promise.resolve(payment) });
    Payment.findOneAndUpdate.mockResolvedValue({ ...payment, status: 'PAID' });
    Order.findOneAndUpdate.mockResolvedValue({ _id: payment.orderId, customerId: payment.customerId, orderNumber: 'CC-1' });
    PaymentEvent.create.mockResolvedValue([{}]);

    const res = await request(app).post('/api/v1/payments/mock-checkout/mock_ref_1/pay');

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Payment received/);
    expect(Payment.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(receipts.issueReceiptBestEffort).toHaveBeenCalledWith(payment._id);
  });

  it('failing leaves the payment pending', async () => {
    const payment = onlinePayment();
    Payment.findOne.mockReturnValueOnce(Promise.resolve(payment)).mockReturnValue({ session: () => Promise.resolve(payment) });
    PaymentEvent.create.mockResolvedValue([{}]);
    const res = await request(app).post('/api/v1/payments/mock-checkout/mock_ref_1/fail');
    expect(res.text).toMatch(/did not go through/);
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('only pay or fail are choices', async () => {
    expect((await request(app).post('/api/v1/payments/mock-checkout/mock_ref_1/refund')).status).toBe(404);
  });
});

describe('releasing the stock of unpaid online orders', () => {
  const now = new Date();
  const dueWorld = (payments, orderResult) => {
    Payment.find.mockReturnValue({ limit: () => Promise.resolve(payments) });
    Order.findOneAndUpdate.mockResolvedValue(orderResult);
    Payment.updateOne.mockResolvedValue({});
    inventory.restockStock.mockResolvedValue({});
  };
  const order = (items) => ({ _id: oid(), customerId: oid(), orderNumber: 'CC-9', items });

  it('only looks at online payments that are still pending and past their hold', async () => {
    dueWorld([], null);
    await expireUnpaidOnlinePayments(now);
    expect(Payment.find).toHaveBeenCalledWith({ method: 'ONLINE_GATEWAY', status: 'PENDING', expiresAt: { $lte: now } });
  });

  it('cancels the order, returns each item to stock, cancels the payment, and tells the customer and the brand', async () => {
    const p = onlinePayment({ expiresAt: new Date(now - 1000) });
    const o = order([{ productId: oid(), quantity: 2 }, { productId: oid(), quantity: 1 }]);
    dueWorld([p], o);

    const cancelled = await expireUnpaidOnlinePayments(now);

    expect(cancelled).toBe(1);
    // one atomic conditional update: still pending AND unpaid, so a paid or already-cancelled order is never touched
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: p.orderId, orderStatus: 'PENDING', paymentStatus: 'PENDING' },
      { $set: { orderStatus: 'CANCELLED', paymentStatus: 'CANCELLED' }, $push: { statusHistory: { status: 'CANCELLED', at: now } } },
      { new: true, session: 'SESSION' }
    );
    expect(inventory.restockStock).toHaveBeenCalledTimes(2);
    expect(Payment.updateOne).toHaveBeenCalledWith({ _id: p._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { session: 'SESSION' });
    expect(notifications.notifyPaymentExpired).toHaveBeenCalledWith(o);
    expect(notifications.notifyBrandOfCancelledOrder).toHaveBeenCalledWith(o, { expired: true });
  });

  it('does NOT restock when someone else already cancelled or paid the order (no double restock)', async () => {
    dueWorld([onlinePayment({ expiresAt: new Date(now - 1000) })], null);
    expect(await expireUnpaidOnlinePayments(now)).toBe(0);
    expect(inventory.restockStock).not.toHaveBeenCalled();
    expect(Payment.updateOne).not.toHaveBeenCalled();
    expect(notifications.notifyPaymentExpired).not.toHaveBeenCalled();
  });

  it('handles each due order on its own', async () => {
    const a = onlinePayment({ expiresAt: new Date(now - 1000) });
    const b = onlinePayment({ expiresAt: new Date(now - 2000) });
    Payment.find.mockReturnValue({ limit: () => Promise.resolve([a, b]) });
    Order.findOneAndUpdate.mockResolvedValueOnce(order([{ productId: oid(), quantity: 1 }])).mockResolvedValueOnce(null);
    Payment.updateOne.mockResolvedValue({});
    inventory.restockStock.mockResolvedValue({});
    expect(await expireUnpaidOnlinePayments(now)).toBe(1);
    expect(inventory.restockStock).toHaveBeenCalledTimes(1);
  });
});

describe('the super admin\'s review list', () => {
  it('is for the super admin only', async () => {
    expect((await request(app).get('/api/v1/payments/events')).status).toBe(401);
    expect((await request(app).get('/api/v1/payments/events').set(...asRole(ROLES.BRAND_ADMIN).cookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/payments/events').set(...asRole(ROLES.CUSTOMER).cookie)).status).toBe(403);
  });

  it('lists events, filtered by outcome', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    PaymentEvent.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([{ outcome: 'LATE_PAYMENT' }]) }) }) });
    PaymentEvent.countDocuments.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/payments/events?outcome=LATE_PAYMENT').set(...cookie);
    expect(res.status).toBe(200);
    expect(PaymentEvent.find).toHaveBeenCalledWith({ outcome: 'LATE_PAYMENT' });
    expect((await request(app).get('/api/v1/payments/events?outcome=NOPE').set(...cookie)).status).toBe(400);
  });
});
