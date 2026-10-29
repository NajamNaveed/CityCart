const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/orderAdjustment.model');
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
const OrderAdjustment = require('../src/models/orderAdjustment.model');
const notifications = require('../src/services/notification.service');
const receipts = require('../src/services/receipt.service');
const app = require('../src/app');
const env = require('../src/config/env');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { signToken } = require('../src/utils/jwt');
const { getAuthCookie } = require('./helpers/testAuth');
const {
  createPaymentProofSignature,
  paymentProofFolder,
  signApiParams,
} = require('../src/services/upload.service');
const {
  duplicateFlags,
  proofBelongsToDelivery,
  purgeVerifiedProofs,
} = require('../src/services/paymentProof.service');

const oid = () => new mongoose.Types.ObjectId();
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');
const brandId = oid();
const CONFIG = { cloudName: 'democloud', apiKey: 'key123', apiSecret: 'secret456' };

function asRole(role, permissions) {
  const user = {
    _id: oid(),
    role,
    isActive: true,
    passwordVersion: 0,
    ...(role.includes('BRAND') || role === ROLES.RIDER ? { brandId } : {}),
  };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const asRider = () => {
  const ctx = asRole(ROLES.RIDER);
  const token = signToken(
    { userId: ctx.user._id, role: ROLES.RIDER, brandId, passwordVersion: 0, client: 'partner' },
    { expiresIn: '8h' }
  );
  return { header: ['Authorization', `Bearer ${token}`], user: ctx.user };
};

const delivery = (overrides = {}) => ({
  _id: oid(),
  orderId: oid(),
  brandId,
  customerId: oid(),
  riderId: oid(),
  status: 'OUT_FOR_DELIVERY',
  deliveryCode: '482913',
  codeAttempts: 0,
  updatedAt: new Date(),
  ...overrides,
});

const codOrder = (overrides = {}) => ({
  _id: oid(),
  brandId,
  orderNumber: 'CC-2026-000042',
  total: 2450,
  currency: 'PKR',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  items: [{ productName: 'Printed lawn suit', quantity: 2 }],
  ...overrides,
});

const proofOf = (brand, deliveryId, name = 'photo') => `${paymentProofFolder(brand, deliveryId)}/${name}`;

const storedPayment = (overrides = {}) => ({
  _id: oid(),
  orderId: oid(),
  brandId,
  amount: 2450,
  currency: 'PKR',
  method: 'WALLET',
  status: 'PAID',
  paidAt: new Date('2026-10-20T10:00:00Z'),
  collection: {
    method: 'WALLET',
    wallet: 'JAZZCASH',
    reference: 'JC-7788',
    proof: { publicId: proofOf(brandId, oid()), fingerprint: 'etag-1' },
    verification: 'SUBMITTED',
  },
  ...overrides,
});

const listOf = (items) => ({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve(items) }) }) });
const paymentQuery = (value) => ({ session: () => Promise.resolve(value), select: () => Promise.resolve(value) });

const originalCloudinary = { ...env.cloudinary };
beforeEach(() => {
  jest.resetAllMocks();
  OrderAdjustment.find.mockReturnValue({ sort: () => Promise.resolve([]) });
  env.cloudinary = { ...CONFIG };
});
afterAll(() => {
  env.cloudinary = originalCloudinary;
});

describe('private upload for a payment proof', () => {
  it('signs an authenticated upload into this brand + delivery folder only', () => {
    const id = oid();
    const upload = createPaymentProofSignature(brandId, id, { now: 1700000000000, config: CONFIG });
    const folder = paymentProofFolder(brandId, id);

    expect(upload.type).toBe('authenticated');
    expect(upload.folder).toBe(folder);
    expect(upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/democloud/image/upload');
    expect(upload.signature).toBe(
      sha1(`allowed_formats=jpg,png,webp&folder=${folder}&timestamp=1700000000&type=authenticatedsecret456`)
    );
    expect(JSON.stringify(upload)).not.toContain('secret456');
  });

  it('only accepts a photo path inside THIS brand and THIS delivery folder', () => {
    const id = oid();
    const other = oid();
    const folder = paymentProofFolder(brandId, id);

    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: `${folder}/photo` })).toBe(true);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: `${folder}x/photo` })).toBe(false);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: folder })).toBe(false);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: `${folder}/../secret` })).toBe(false);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: proofOf(brandId, other) })).toBe(false);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: proofOf(oid(), id) })).toBe(false);
    expect(proofBelongsToDelivery({ brandId, deliveryId: id, publicId: undefined })).toBe(false);
  });
});

describe('POST /api/v1/rider/deliveries/:id/proof-upload', () => {
  const post = (header, id) => request(app).post(`/api/v1/rider/deliveries/${id}/proof-upload`).set(...header);

  it('401 unauthenticated; 403 for everyone who is not a rider', async () => {
    expect((await request(app).post(`/api/v1/rider/deliveries/${oid()}/proof-upload`)).status).toBe(401);
    for (const role of [ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN]) {
      expect((await post(asRole(role, Object.values(PERMISSIONS)).cookie, oid())).status).toBe(403);
    }
  });

  it('answers 404 for a delivery that is not this rider’s (or not this brand’s)', async () => {
    const { header, user } = asRider();
    const id = oid();
    Delivery.findOne.mockResolvedValue(null);

    const res = await post(header, id);

    expect(res.status).toBe(404);
    expect(Delivery.findOne).toHaveBeenCalledWith({ _id: id.toString(), brandId: brandId.toString(), riderId: user._id });
  });

  it('is only allowed while the delivery is out for delivery', async () => {
    const { header } = asRider();
    Delivery.findOne.mockResolvedValue(delivery({ status: 'PICKED_UP' }));

    const res = await post(header, oid());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROOF_NOT_ALLOWED');
  });

  it('503 with a clear code when Cloudinary is not set up', async () => {
    const { header } = asRider();
    env.cloudinary = { cloudName: 'your_cloud_name', apiKey: 'your_api_key', apiSecret: 'your_api_secret' };
    Delivery.findOne.mockResolvedValue(delivery());

    const res = await post(header, oid());

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROOF_NOT_CONFIGURED');
  });

  it('returns a signature for the delivery’s own folder and never the secret', async () => {
    const { header } = asRider();
    const id = oid();
    Delivery.findOne.mockResolvedValue(delivery({ _id: id }));

    const res = await post(header, id);

    expect(res.status).toBe(200);
    expect(res.body.upload).toMatchObject({
      type: 'authenticated',
      folder: paymentProofFolder(brandId, id),
      apiKey: 'key123',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret456');
    // The client cannot choose the folder.
    expect(JSON.stringify(res.body)).not.toContain('citycart/brands/products');
  });
});

describe('POST /api/v1/rider/deliveries/:id/complete with a non-cash collection', () => {
  const post = (header, id, body) => request(app).post(`/api/v1/rider/deliveries/${id}/complete`).set(...header).send(body);

  function world({ order = codOrder(), viewPayment = { collection: { method: 'WALLET', verification: 'SUBMITTED' } }, duplicate = null } = {}) {
    const attempt = delivery({ orderId: order._id });
    Delivery.findOneAndUpdate
      .mockReturnValueOnce({ select: () => Promise.resolve(attempt) })
      .mockResolvedValueOnce({ ...attempt, status: 'OUT_FOR_DELIVERY' });
    Delivery.findById.mockReturnValue({ session: () => Promise.resolve({ ...attempt, status: 'DELIVERED' }) });
    Order.findOneAndUpdate.mockResolvedValue(order);
    Order.updateOne.mockResolvedValue({});
    // After completion the order reads as PAID (the transaction just set it).
    Order.findOne.mockReturnValue({ select: () => Promise.resolve({ ...order, paymentStatus: 'PAID' }) });
    Payment.findOneAndUpdate.mockResolvedValue({ _id: oid() });
    Payment.findOne.mockImplementation((filter) => paymentQuery(filter && filter.orderId ? viewPayment : duplicate));
    Payment.updateOne.mockResolvedValue({});
    return attempt;
  }

  const collection = (attempt, overrides = {}) => ({
    method: 'WALLET',
    wallet: 'JAZZCASH',
    reference: 'JC-7788',
    proof: { publicId: proofOf(brandId, attempt._id), fingerprint: 'etag-1' },
    ...overrides,
  });

  it('requires a reference and a photo, and keeps cash free of both', async () => {
    const { header } = asRider();
    const attempt = delivery();
    const good = collection(attempt);
    const bad = [
      { method: 'BANK_TRANSFER', proof: good.proof },
      { method: 'BANK_TRANSFER', reference: 'FT-123456' },
      { method: 'WALLET', reference: 'JC-7788', proof: good.proof },
      { method: 'BANK_TRANSFER', wallet: 'JAZZCASH', reference: 'FT-123456', proof: good.proof },
      { method: 'CASH', reference: 'FT-123456' },
      { method: 'CASH', proof: good.proof },
      { ...good, cardNumber: '4111111111111111' },
    ];

    for (const body of bad) {
      expect((await post(header, attempt._id, { code: '482913', collection: body })).status).toBe(400);
    }
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('503 when Cloudinary is not configured', async () => {
    const { header } = asRider();
    const attempt = world();
    env.cloudinary = { cloudName: '', apiKey: '', apiSecret: '' };

    const res = await post(header, attempt._id, { code: '482913', collection: collection(attempt) });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROOF_NOT_CONFIGURED');
    expect(Delivery.findOneAndUpdate).toHaveBeenCalledTimes(1); // the code attempt only
  });

  it("refuses another delivery's photo", async () => {
    const { header } = asRider();
    const otherDelivery = oid();
    const badPaths = [
      (deliveryId) => proofOf(brandId, otherDelivery),
      (deliveryId) => proofOf(oid(), deliveryId),
      (deliveryId) => `${paymentProofFolder(brandId, deliveryId)}/../x`,
    ];

    for (const badPath of badPaths) {
      const attempt = delivery();
      Delivery.findOneAndUpdate.mockReturnValueOnce({ select: () => Promise.resolve(attempt) });
      const res = await post(header, attempt._id, {
        code: '482913',
        collection: collection(attempt, { proof: { publicId: badPath(attempt._id), fingerprint: 'etag-1' } }),
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROOF_NOT_YOURS');
    }
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks the payment PAID-but-unverified, without a collector or cash balance entry', async () => {
    const { header } = asRider();
    const attempt = world();
    const body = collection(attempt);

    const res = await post(header, attempt._id, { code: '482913', collection: body });

    expect(res.status).toBe(200);
    const [, update] = Payment.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      status: 'PAID',
      method: 'WALLET',
      'collection.method': 'WALLET',
      'collection.wallet': 'JAZZCASH',
      'collection.reference': 'JC-7788',
      'collection.proof': body.proof,
      'collection.verification': 'SUBMITTED',
    });
    expect(update.$set).not.toHaveProperty('collectedBy');
    expect(update.$set).not.toHaveProperty('collectedAt');
    expect(res.body.delivery).toMatchObject({ status: 'DELIVERED', cashCollected: false, proofStatus: 'SUBMITTED', paymentOptions: [] });
    expect(notifications.notifyPaymentReceived).toHaveBeenCalledWith(expect.anything(), { nonCash: true });
    expect(receipts.issueReceiptBestEffort).toHaveBeenCalledTimes(1);
    expect(Payment.updateOne).not.toHaveBeenCalled(); // no duplicates found
  });

  it('flags a reused reference or a reused photo for the verifier', async () => {
    const { header } = asRider();
    const attempt = world({ duplicate: { _id: oid() } });

    const res = await post(header, attempt._id, { code: '482913', collection: collection(attempt) });

    expect(res.status).toBe(200);
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { 'collection.duplicateReference': true, 'collection.duplicateProof': true } },
      { session: 'SESSION' }
    );
  });

  it('cash on delivery still records the collector, and the collection method', async () => {
    const { header } = asRider();
    const attempt = world({ viewPayment: { collection: { method: 'CASH' } } });
    const res = await post(header, attempt._id, { code: '482913' });

    expect(res.status).toBe(200);
    const [, update] = Payment.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({ 'collection.method': 'CASH', collectedBy: expect.anything() });
    expect(res.body.delivery).toMatchObject({ cashCollected: true, amountToCollect: 0 });
  });

  it('an order paid up front cannot carry a proof', async () => {
    const { header } = asRider();
    const attempt = world({ order: codOrder({ paymentMethod: 'CARD', paymentStatus: 'PAID' }) });

    const res = await post(header, attempt._id, { code: '482913', collection: collection(attempt) });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_PREPAID');
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/rider/deliveries/cash', () => {
  it('sums only money physically collected (non-cash never has a collector)', async () => {
    const { header, user } = asRider();
    Payment.find.mockReturnValue({ select: () => Promise.resolve([{ amount: 2450 }]) });

    const res = await request(app).get('/api/v1/rider/deliveries/cash').set(...header);

    expect(res.status).toBe(200);
    expect(Payment.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      collectedBy: user._id,
      settledAt: { $exists: false },
    });
    expect(res.body.cash).toEqual({ count: 1, total: 2450 });
  });
});

describe('GET /api/v1/payments/proofs — the “payments to verify” queue', () => {
  const get = (cookie, query = '') => request(app).get(`/api/v1/payments/proofs${query}`).set(...cookie);

  it('401 unauthenticated; customers, riders and employees without payments.view are refused', async () => {
    expect((await request(app).get('/api/v1/payments/proofs')).status).toBe(401);
    expect((await get(asRole(ROLES.CUSTOMER).cookie)).status).toBe(403);
    expect((await get(asRole(ROLES.RIDER).cookie)).status).toBe(403);
    expect((await get(asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]).cookie)).status).toBe(403);
  });

  it("is pinned to the brand and to unverified proofs, and never exposes the photo id", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const orderId = oid();
    const payment = storedPayment({ orderId });
    const publicId = payment.collection.proof.publicId;
    Payment.find.mockReturnValue(listOf([payment]));
    Payment.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({ select: () => Promise.resolve([{ _id: orderId, orderNumber: 'CC-2026-000042' }]) });

    const res = await get(cookie, `?brandId=${oid()}`);

    expect(res.status).toBe(200);
    expect(Payment.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      'collection.proof.publicId': { $exists: true, $ne: '' },
      'collection.verification': 'SUBMITTED',
    });
    expect(res.body.proofs[0]).toMatchObject({
      orderNumber: 'CC-2026-000042',
      amount: 2450,
      method: 'WALLET',
      wallet: 'JAZZCASH',
      reference: 'JC-7788',
      verification: 'SUBMITTED',
      proofAvailable: true,
      duplicateReference: false,
      duplicateProof: false,
    });
    expect(JSON.stringify(res.body)).not.toContain(publicId);
    expect(JSON.stringify(res.body)).not.toContain('etag-1');
  });

  it('a platform admin sees every brand', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    Payment.find.mockReturnValue(listOf([]));
    Payment.countDocuments.mockResolvedValue(0);

    expect((await get(cookie)).status).toBe(200);
    expect(Payment.find).toHaveBeenCalledWith({
      'collection.proof.publicId': { $exists: true, $ne: '' },
      'collection.verification': 'SUBMITTED',
    });
  });

  it('filters by decision state and paginates', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const q = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn() };
    q.sort.mockReturnValue(q);
    q.skip.mockReturnValue(q);
    q.limit.mockResolvedValue([]);
    Payment.find.mockReturnValue(q);
    Payment.countDocuments.mockResolvedValue(0);

    const res = await get(cookie, '?status=VERIFIED&page=2&limit=5');

    expect(res.status).toBe(200);
    expect(Payment.find).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: brandId.toString(), 'collection.verification': 'VERIFIED' })
    );
    expect(q.skip).toHaveBeenCalledWith(5);
    expect(q.limit).toHaveBeenCalledWith(5);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 5 });
  });

  it('400 for a bad status or page size', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await get(cookie, '?status=SOMETHING')).status).toBe(400);
    expect((await get(cookie, '?limit=500')).status).toBe(400);
  });
});

describe('GET /api/v1/payments/:id/proof — a short signed link', () => {
  const get = (cookie, id) => request(app).get(`/api/v1/payments/${id}/proof`).set(...cookie);

  it("404 when the payment is not the caller's brand, even with a valid id", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const id = oid();
    Payment.findOne.mockResolvedValue(null);

    expect((await get(cookie, id)).status).toBe(404);
    expect(Payment.findOne).toHaveBeenCalledWith({ _id: id.toString(), brandId: brandId.toString() });

    Payment.findOne.mockResolvedValue(null);
    const admin = asRole(ROLES.SUPER_ADMIN);
    expect((await get(admin.cookie, id)).status).toBe(404);
    expect(Payment.findOne).toHaveBeenLastCalledWith({ _id: id.toString() });
  });

  it('404 when the photo was never taken or has been deleted', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Payment.findOne.mockResolvedValue(storedPayment({ collection: { verification: 'SUBMITTED' } }));

    const res = await get(cookie, oid());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROOF_NOT_FOUND');
  });

  it('404s before Cloudinary is consulted for another brand', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Payment.findOne.mockResolvedValue(null);
    const res = await get(cookie, oid());
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('url');
  });

  it('needs payments.view', async () => {
    const { cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]);
    expect((await get(cookie, oid())).status).toBe(403);
  });

  it('gives a signed, expiring download URL and never the secret', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const payment = storedPayment();
    Payment.findOne.mockResolvedValue(payment);
    Order.findById.mockReturnValue({ select: () => Promise.resolve({ orderNumber: 'CC-2026-000042' }) });

    const res = await get(cookie, payment._id);

    expect(res.status).toBe(200);
    expect(res.body.proof).toMatchObject({
      paymentId: String(payment._id),
      orderNumber: 'CC-2026-000042',
      method: 'WALLET',
      wallet: 'JAZZCASH',
      reference: 'JC-7788',
      verification: 'SUBMITTED',
      proofAvailable: true,
    });
    const url = new URL(res.body.proof.url);
    expect(url.origin).toBe('https://api.cloudinary.com');
    expect(url.pathname).toBe('/v1_1/democloud/image/download');
    expect(url.searchParams.get('api_key')).toBe('key123');
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('public_id')).toBe(payment.collection.proof.publicId);
    const timestamp = Number(url.searchParams.get('timestamp'));
    expect(Number(url.searchParams.get('expires_at')) - timestamp).toBe(5 * 60);
    expect(url.searchParams.get('signature')).toBe(
      signApiParams(
        {
          expires_at: Number(url.searchParams.get('expires_at')),
          public_id: payment.collection.proof.publicId,
          timestamp,
          type: 'authenticated',
        },
        'secret456'
      )
    );
    expect(JSON.stringify(res.body)).not.toContain('secret456');
  });

  it('503 when Cloudinary is not set up', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    env.cloudinary = { cloudName: '', apiKey: '', apiSecret: '' };
    Payment.findOne.mockResolvedValue(storedPayment());

    const res = await get(cookie, oid());

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROOF_NOT_CONFIGURED');
  });

  it('400 for a malformed id', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await get(cookie, 'nope')).status).toBe(400);
  });
});

describe('PATCH /api/v1/payments/:id/proof — verify or reject', () => {
  const patch = (cookie, id, body) => request(app).patch(`/api/v1/payments/${id}/proof`).set(...cookie).send(body);
  const decided = (overrides = {}) => {
    const payment = storedPayment();
    payment.collection = { ...payment.collection, verification: 'VERIFIED', verifiedBy: oid(), verifiedAt: new Date(), ...overrides };
    return payment;
  };

  it('needs payments.manage', async () => {
    const { cookie } = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PAYMENTS_VIEW]);
    expect((await patch(cookie, oid(), { verification: 'VERIFIED' })).status).toBe(403);
  });

  it('a rejection needs a reason', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    expect((await patch(cookie, oid(), { verification: 'REJECTED' })).status).toBe(400);
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('verifies once, scoped to the brand', async () => {
    const { cookie, user } = asRole(ROLES.BRAND_ADMIN);
    const payment = storedPayment();
    Payment.findOneAndUpdate.mockResolvedValue(decided());

    const res = await patch(cookie, payment._id, { verification: 'VERIFIED' });

    expect(res.status).toBe(200);
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: payment._id.toString(),
        brandId: brandId.toString(),
        'collection.proof.publicId': { $exists: true, $ne: '' },
        'collection.verification': 'SUBMITTED',
      },
      { $set: { 'collection.verification': 'VERIFIED', 'collection.verifiedBy': user._id, 'collection.verifiedAt': expect.any(Date) } },
      { new: true }
    );
    expect(notifications.notifyBrandOfRejectedProof).not.toHaveBeenCalled();
  });

  it('rejecting records the reason and raises a flag to the brand owner', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const updated = decided({ verification: 'REJECTED', note: 'No such transaction' });
    const order = { orderNumber: 'CC-2026-000042', brandId };
    Payment.findOneAndUpdate.mockResolvedValue(updated);
    Order.findById.mockReturnValue({ select: () => Promise.resolve(order) });

    const res = await patch(cookie, updated._id, { verification: 'REJECTED', note: 'No such transaction' });

    expect(res.status).toBe(200);
    const [, update] = Payment.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({ 'collection.verification': 'REJECTED', 'collection.note': 'No such transaction' });
    expect(notifications.notifyBrandOfRejectedProof).toHaveBeenCalledWith({
      brandId,
      orderId: updated.orderId,
      orderNumber: 'CC-2026-000042',
      paymentId: updated._id,
      amount: 2450,
      note: 'No such transaction',
    });
  });

  it('a decision is final: a second one is refused with 409', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    const payment = storedPayment();
    Payment.findOneAndUpdate.mockResolvedValue(null);
    Payment.findOne.mockResolvedValue(payment); // already VERIFIED / REJECTED

    const res = await patch(cookie, payment._id, { verification: 'VERIFIED' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROOF_ALREADY_DECIDED');
  });

  it("404 for another brand's payment", async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    Payment.findOneAndUpdate.mockResolvedValue(null);
    Payment.findOne.mockResolvedValue(null);

    expect((await patch(cookie, oid(), { verification: 'VERIFIED' })).status).toBe(404);
  });

  it('a platform admin decides across brands', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const payment = storedPayment();
    Payment.findOneAndUpdate.mockResolvedValue(decided());

    const res = await patch(cookie, payment._id, { verification: 'VERIFIED' });

    expect(res.status).toBe(200);
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: payment._id.toString(), 'collection.proof.publicId': { $exists: true, $ne: '' }, 'collection.verification': 'SUBMITTED' },
      expect.anything(),
      { new: true }
    );
  });
});

describe('duplicate flags', () => {
  it('flags a reference or photo used on another payment of the same brand, excluding this one', async () => {
    const paymentId = oid();
    const other = oid();
    Payment.findOne
      .mockReturnValueOnce(paymentQuery({ _id: other }))
      .mockReturnValueOnce(paymentQuery(null));

    const flags = await duplicateFlags(
      { brandId, paymentId, reference: 'JC-7788', fingerprint: 'etag-1' },
      'SESSION'
    );

    expect(flags).toEqual({ duplicateReference: true, duplicateProof: false });
    expect(Payment.findOne).toHaveBeenNthCalledWith(1, {
      _id: { $ne: paymentId },
      brandId,
      'collection.reference': 'JC-7788',
    });
    expect(Payment.findOne).toHaveBeenNthCalledWith(2, {
      _id: { $ne: paymentId },
      brandId,
      'collection.proof.fingerprint': 'etag-1',
    });
  });

  it('does not query when there is nothing to compare', async () => {
    expect(await duplicateFlags({ brandId, paymentId: oid() }, 'SESSION')).toEqual({
      duplicateReference: false,
      duplicateProof: false,
    });
    expect(Payment.findOne).not.toHaveBeenCalled();
  });
});

describe('retention of verified proof photos', () => {
  const findLimit = (items) => ({ limit: () => Promise.resolve(items) });
  const verified = (daysAgo) =>
    storedPayment({
      collection: {
        method: 'CARD_MACHINE',
        reference: 'APPR-1',
        proof: { publicId: proofOf(brandId, oid()), fingerprint: 'etag-1' },
        verification: 'VERIFIED',
        verifiedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      },
    });

  it('does nothing while Cloudinary is not set up', async () => {
    env.cloudinary = { cloudName: '', apiKey: '', apiSecret: '' };
    expect(await purgeVerifiedProofs()).toBe(0);
    expect(Payment.find).not.toHaveBeenCalled();
  });

  it('deletes photos decided more than 90 days ago and forgets the id', async () => {
    const now = new Date('2026-10-28T00:00:00Z');
    const payment = verified(100);
    const destroy = jest.fn().mockResolvedValue(true);
    Payment.find.mockReturnValue(findLimit([payment]));
    Payment.updateOne.mockResolvedValue({});

    const deleted = await purgeVerifiedProofs({ now, config: CONFIG, destroy });

    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(Payment.find).toHaveBeenCalledWith({
      'collection.verification': { $in: ['VERIFIED', 'REJECTED'] },
      'collection.verifiedAt': { $lte: cutoff },
      'collection.proof.publicId': { $exists: true, $ne: '' },
    });
    expect(destroy).toHaveBeenCalledWith(payment.collection.proof.publicId, { config: CONFIG });
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { _id: payment._id, 'collection.proof.publicId': payment.collection.proof.publicId },
      { $unset: { 'collection.proof': '' }, $set: { 'collection.proofDeletedAt': now } }
    );
    expect(deleted).toBe(1);
  });

  it('leaves the record alone when Cloudinary does not confirm the delete, and keeps going', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failing = verified(100);
    const broken = storedPayment({
      collection: {
        ...failing.collection,
        proof: { publicId: proofOf(brandId, oid()), fingerprint: 'etag-2' },
        verifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      },
    });
    Payment.find.mockReturnValue(findLimit([failing, broken]));
    const destroy = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('network'));

    expect(await purgeVerifiedProofs({ config: CONFIG, destroy })).toBe(0);
    expect(Payment.updateOne).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips rows whose photo is already gone', async () => {
    Payment.find.mockReturnValue(findLimit([storedPayment({ collection: { method: 'CASH', verification: 'VERIFIED' } })]));
    const destroy = jest.fn();

    expect(await purgeVerifiedProofs({ config: CONFIG, destroy })).toBe(0);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('is harmless to run twice', async () => {
    const payment = verified(100);
    const destroy = jest.fn().mockResolvedValue(true);
    Payment.find.mockReturnValueOnce(findLimit([payment])).mockReturnValueOnce(findLimit([]));
    Payment.updateOne.mockResolvedValue({});

    expect(await purgeVerifiedProofs({ config: CONFIG, destroy })).toBe(1);
    expect(await purgeVerifiedProofs({ config: CONFIG, destroy })).toBe(0);
  });
});
