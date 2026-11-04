const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/return.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/models/inventoryMovement.model');
jest.mock('../src/models/orderAdjustment.model');
jest.mock('../src/models/product.model');
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
const Return = require('../src/models/return.model');
const Inventory = require('../src/models/inventory.model');
const InventoryMovement = require('../src/models/inventoryMovement.model');
const OrderAdjustment = require('../src/models/orderAdjustment.model');
const notifications = require('../src/services/notification.service');
const receipts = require('../src/services/receipt.service');
const app = require('../src/app');
const env = require('../src/config/env');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { signToken } = require('../src/utils/jwt');
const { getAuthCookie } = require('./helpers/testAuth');
const { buildCompletion } = require('../src/services/return.service');
const { OrderError } = require('../src/services/order.service');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const itemA = oid();
const itemB = oid();

// A query stub that behaves like a Mongoose query: awaitable AND chainable with
// .select()/.session(), which the services use interchangeably.
const query = (value) => ({
  select: () => Promise.resolve(value),
  session: () => Promise.resolve(value),
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const orderDoc = (overrides = {}) => ({
  _id: oid(),
  brandId,
  orderNumber: 'CC-2026-000042',
  customerId: oid(),
  subtotal: 2300,
  deliveryFee: 150,
  total: 2450,
  currency: 'PKR',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  orderStatus: 'OUT_FOR_DELIVERY',
  items: [
    { _id: itemA, productId: oid(), productName: 'Lawn suit', quantity: 2, unitPrice: 1000, totalPrice: 2000 },
    { _id: itemB, productId: oid(), productName: 'Dupatta', quantity: 1, unitPrice: 300, totalPrice: 300 },
  ],
  ...overrides,
});

const deliveryDoc = (overrides = {}) => ({
  _id: oid(),
  orderId: oid(),
  brandId,
  customerId: oid(),
  riderId: oid(),
  status: 'OUT_FOR_DELIVERY',
  deliveryCode: '482913',
  codeAttempts: 0,
  address: { name: 'Sana Iqbal', phone: '+923001112223', address: 'House 5', city: 'Faisalabad' },
  updatedAt: new Date(),
  ...overrides,
});

// Half accepted, half refused: 1 of 2 suits kept, the dupatta kept.
const partialLines = () => [
  { itemId: itemA.toString(), acceptedQty: 1, rejectedQty: 1, reason: 'NOT_WANTED' },
  { itemId: itemB.toString(), acceptedQty: 1, rejectedQty: 0 },
];

function signedIn(role, permissions = []) {
  const user = {
    _id: oid(),
    role,
    isActive: true,
    passwordVersion: 0,
    ...(role.includes('BRAND') || role === ROLES.RIDER || role === ROLES.PICKER ? { brandId } : {}),
  };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions });
  }
  return user;
}

const asRider = () => {
  const user = signedIn(ROLES.RIDER);
  const token = signToken(
    { userId: user._id, role: user.role, brandId: user.brandId, passwordVersion: 0, client: 'delivery' },
    { expiresIn: '8h' }
  );
  return { header: ['Authorization', `Bearer ${token}`], user };
};

const asWeb = (role, permissions) => {
  const user = signedIn(role, permissions);
  return { header: ['Cookie', getAuthCookie(user)], user };
};

const complete = (header, id, body) =>
  request(app).post(`/api/v1/rider/deliveries/${id}/complete`).set(...header).send(body);

const CLOUDINARY = { cloudName: 'democloud', apiKey: 'demo-key', apiSecret: 'demo-secret' };
const originalCloudinary = { ...env.cloudinary };

beforeEach(() => {
  jest.resetAllMocks();
  env.cloudinary = { ...CLOUDINARY };
  OrderAdjustment.find.mockReturnValue({ sort: () => Promise.resolve([]) });
  Return.findOne.mockResolvedValue(null);
  Return.create.mockImplementation(async (docs) => docs.map((doc) => ({ _id: oid(), ...doc })));
});

afterAll(() => {
  env.cloudinary = originalCloudinary;
});

describe('buildCompletion: quantity rules', () => {
  it('omitted lines mean everything was accepted (the old behaviour)', () => {
    expect(buildCompletion(orderDoc())).toEqual({
      fulfilment: 'FULL',
      acceptedSubtotal: 2300,
      returnedSubtotal: 0,
      feeRefunded: false,
      netTotal: 2450,
      returnLines: [],
    });
  });

  it('splits a line into accepted and refused units and prices both correctly', () => {
    const result = buildCompletion(orderDoc(), partialLines());

    expect(result.fulfilment).toBe('PARTIAL');
    expect(result.acceptedSubtotal).toBe(1300);
    expect(result.returnedSubtotal).toBe(1000);
    expect(result.feeRefunded).toBe(false);
    expect(result.netTotal).toBe(1450);
    expect(result.returnLines).toEqual([
      {
        orderItemId: itemA,
        productId: expect.anything(),
        productName: 'Lawn suit',
        quantity: 1,
        unitPrice: 1000,
        reason: 'NOT_WANTED',
      },
    ]);
  });

  it('cannot refuse more units than were ordered', () => {
    const lines = [
      { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 3, reason: 'DAMAGED' },
      { itemId: itemB.toString(), acceptedQty: 1, rejectedQty: 0 },
    ];
    expect(() => buildCompletion(orderDoc(), lines)).toThrow(OrderError);
    try {
      buildCompletion(orderDoc(), lines);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.extra.code).toBe('INVALID_RETURN_QUANTITY');
    }
  });

  it.each([
    [[{ acceptedQty: -1, rejectedQty: 3 }]],
    [[{ acceptedQty: 1.5, rejectedQty: 0.5 }]],
  ])('rejects negative or fractional quantities (%j)', (pair) => {
    const lines = pair.map((line, index) => ({
      itemId: index === 0 ? itemA.toString() : itemB.toString(),
      ...line,
      reason: 'DAMAGED',
    }));
    lines.push({ itemId: itemB.toString(), acceptedQty: 1, rejectedQty: 0 });
    try {
      buildCompletion(orderDoc(), lines);
      throw new Error('expected a failure');
    } catch (err) {
      expect(err).toBeInstanceOf(OrderError);
      expect(err.extra.code).toBe('INVALID_RETURN_LINES');
    }
  });

  it('requires every order item exactly once', () => {
    const missing = [partialLines()[1]];
    try {
      buildCompletion(orderDoc(), missing);
    } catch (err) {
      expect(err.extra.code).toBe('INVALID_RETURN_LINES');
    }

    const duplicated = [...partialLines(), partialLines()[0]];
    try {
      buildCompletion(orderDoc(), duplicated);
    } catch (err) {
      expect(err.extra.code).toBe('INVALID_RETURN_LINES');
    }

    const foreign = partialLines();
    foreign[0].itemId = oid().toString();
    try {
      buildCompletion(orderDoc(), foreign);
    } catch (err) {
      expect(err.extra.code).toBe('INVALID_RETURN_LINES');
    }
  });

  it('requires a reason for a refused line', () => {
    const lines = partialLines();
    delete lines[0].reason;
    try {
      buildCompletion(orderDoc(), lines);
    } catch (err) {
      expect(err.extra.code).toBe('INVALID_RETURN_REASON');
    }
  });

  it('an empty lines array is refused', () => {
    try {
      buildCompletion(orderDoc(), []);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.extra.code).toBe('INVALID_RETURN_LINES');
    }
  });
});

describe('buildCompletion: money rules', () => {
  it('a full rejection for a store-fault reason refunds the delivery fee', () => {
    const result = buildCompletion(orderDoc(), [
      { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 2, reason: 'DAMAGED' },
      { itemId: itemB.toString(), acceptedQty: 0, rejectedQty: 1, reason: 'MISSING' },
    ]);

    expect(result.fulfilment).toBe('NONE');
    expect(result.acceptedSubtotal).toBe(0);
    expect(result.returnedSubtotal).toBe(2300);
    expect(result.feeRefunded).toBe(true);
    expect(result.netTotal).toBe(0);
  });

  it('a full rejection the customer simply did not want keeps the fee payable', () => {
    const result = buildCompletion(orderDoc(), [
      { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 2, reason: 'NOT_WANTED' },
      { itemId: itemB.toString(), acceptedQty: 0, rejectedQty: 1, reason: 'NOT_WANTED' },
    ]);

    expect(result.fulfilment).toBe('NONE');
    expect(result.feeRefunded).toBe(false);
    expect(result.netTotal).toBe(150);
  });

  it('does not refund the fee when some goods were accepted, even if one was damaged', () => {
    const result = buildCompletion(orderDoc(), [
      { itemId: itemA.toString(), acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED' },
      { itemId: itemB.toString(), acceptedQty: 1, rejectedQty: 0 },
    ]);

    expect(result.fulfilment).toBe('PARTIAL');
    expect(result.feeRefunded).toBe(false);
  });
});

describe('delivery completion with refused lines (COD)', () => {
  // Sets up the rider completion and the transaction-side queries. `order` is
  // also what viewFor() reads back after the completion.
  function world({ order, deliveryStatus = 'DELIVERED' }) {
    const d = deliveryDoc({ orderId: order._id });
    const updated = { ...d, status: deliveryStatus, returnId: oid() };
    Delivery.findOne.mockReturnValue(query(d));
    Order.findOne.mockReturnValue(query(order));
    Delivery.findOneAndUpdate.mockReturnValueOnce(query({ ...d, codeAttempts: 1 })).mockResolvedValueOnce(d);
    Order.findOneAndUpdate.mockResolvedValue(order);
    Delivery.findById.mockReturnValue(query(updated));
    Payment.findOne.mockReturnValue(query(null));
    Delivery.updateOne.mockResolvedValue({});
    Order.updateOne.mockResolvedValue({});
    Payment.findOneAndUpdate.mockResolvedValue({ _id: oid() });
    return { d, updated };
  }

  it('the half-and-half order: order and payment carry the accepted total, one IN_TRANSIT return', async () => {
    const { header, user } = asRider();
    const order = orderDoc({
      fulfilment: 'PARTIAL',
      returnedAmount: 1000,
      netTotal: 1450,
      feeRefunded: false,
      paymentStatus: 'PAID',
    });
    world({ order });

    const res = await complete(header, oid(), { code: '482913', lines: partialLines() });

    expect(res.status).toBe(200);

    const [, orderUpdate] = Order.findOneAndUpdate.mock.calls[0];
    expect(orderUpdate.$set).toMatchObject({
      orderStatus: 'DELIVERED',
      fulfilment: 'PARTIAL',
      returnedAmount: 1000,
      netTotal: 1450,
      feeRefunded: false,
    });

    const [paymentFilter, paymentUpdate] = Payment.findOneAndUpdate.mock.calls[0];
    expect(paymentFilter).toEqual({ orderId: order._id, status: 'PENDING' });
    expect(paymentUpdate.$set).toMatchObject({ status: 'PAID', amount: 1450, collectedBy: user._id });

    const [returnDoc] = Return.create.mock.calls[0][0];
    expect(returnDoc).toMatchObject({
      orderId: order._id,
      source: 'DOOR',
      status: 'IN_TRANSIT',
      returnedSubtotal: 1000,
      feeRefunded: false,
      refundAmount: 0,
      currency: 'PKR',
    });
    expect(returnDoc.lines).toHaveLength(1);
    expect(returnDoc.lines[0]).toMatchObject({ orderItemId: itemA, quantity: 1, reason: 'NOT_WANTED' });

    expect(Delivery.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { status: 'DELIVERED', returnId: expect.anything() } },
      { session: 'SESSION' }
    );

    expect(notifications.notifyCustomerOfOrderStatus).toHaveBeenCalledWith(expect.anything(), 'DELIVERED');
    expect(notifications.notifyPaymentReceived).toHaveBeenCalledTimes(1);
    expect(receipts.issueReceiptBestEffort).toHaveBeenCalledTimes(1);
    expect(notifications.notifyBrandOfReturn).toHaveBeenCalledWith(expect.anything(), expect.anything());

    expect(res.body.delivery).toMatchObject({
      status: 'DELIVERED',
      fulfilment: 'PARTIAL',
      returnedAmount: 1000,
      netTotal: 1450,
      address: null,
    });
  });

  it('everything refused for a store fault: order RETURNED, nothing collected, payment cancelled', async () => {
    const { header } = asRider();
    const order = orderDoc({
      orderStatus: 'RETURNED',
      fulfilment: 'NONE',
      returnedAmount: 2300,
      netTotal: 0,
      feeRefunded: true,
      paymentStatus: 'CANCELLED',
    });
    world({ order, deliveryStatus: 'RETURNED' });

    const res = await complete(header, oid(), {
      code: '482913',
      lines: [
        { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 2, reason: 'DAMAGED' },
        { itemId: itemB.toString(), acceptedQty: 0, rejectedQty: 1, reason: 'WRONG_ITEM' },
      ],
    });

    expect(res.status).toBe(200);
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { orderId: order._id, status: 'PENDING' },
      { $set: { status: 'CANCELLED' } },
      { session: 'SESSION' }
    );
    expect(Order.updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      { $set: { paymentStatus: 'CANCELLED' } },
      { session: 'SESSION' }
    );
    expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
    expect(receipts.issueReceiptBestEffort).not.toHaveBeenCalled();
    expect(notifications.notifyCustomerOfOrderStatus).toHaveBeenCalledWith(expect.anything(), 'RETURNED');
    expect(res.body.delivery).toMatchObject({ status: 'RETURNED', fulfilment: 'NONE', netTotal: 0 });
  });
});

describe('delivery completion with refused lines (prepaid)', () => {
  function world({ order, payment, refunded }) {
    const d = deliveryDoc({ orderId: order._id });
    Delivery.findOneAndUpdate.mockReturnValueOnce(query({ ...d, codeAttempts: 1 })).mockResolvedValueOnce(d);
    Delivery.findOne.mockReturnValue(query(d));
    Order.findOne.mockReturnValue(query(order));
    Order.findOneAndUpdate.mockResolvedValue(order);
    Delivery.findById.mockReturnValue(query({ ...d, status: 'DELIVERED', returnId: oid() }));
    Payment.findOne.mockReturnValue(query(payment));
    Payment.findOneAndUpdate.mockResolvedValue(refunded);
    Delivery.updateOne.mockResolvedValue({});
    Order.updateOne.mockResolvedValue({});
  }

  it('refunds the refused goods on the original payment', async () => {
    const { header, user } = asRider();
    const order = orderDoc({
      paymentMethod: 'CARD',
      paymentStatus: 'PARTIALLY_REFUNDED',
      fulfilment: 'PARTIAL',
      returnedAmount: 1000,
      netTotal: 1450,
    });
    world({
      order,
      payment: { _id: oid(), status: 'PAID', amount: 2450, refundedAmount: 0 },
      refunded: { _id: oid(), status: 'PARTIALLY_REFUNDED', refundedAmount: 1000 },
    });

    const res = await complete(header, oid(), { code: '482913', lines: partialLines() });

    expect(res.status).toBe(200);
    const [filter, update] = Payment.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ status: 'PAID', refundedAmount: { $in: [0, null] } });
    expect(update.$set).toEqual({ status: 'PARTIALLY_REFUNDED', refundedAmount: 1000 });
    expect(update.$push.refunds).toMatchObject({ amount: 1000, by: user._id });

    expect(Order.updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      { $set: { paymentStatus: 'PARTIALLY_REFUNDED' } },
      { session: 'SESSION' }
    );
    expect(notifications.notifyRefundIssued).toHaveBeenCalledWith(expect.anything(), { amount: 1000, reason: expect.any(String) });
    expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
    expect(Return.create.mock.calls[0][0][0].refundAmount).toBe(1000);
  });

  it('a full store-fault rejection refunds the goods and the delivery fee', async () => {
    const { header } = asRider();
    const order = orderDoc({
      paymentMethod: 'CARD',
      paymentStatus: 'REFUNDED',
      orderStatus: 'RETURNED',
      fulfilment: 'NONE',
      returnedAmount: 2300,
      netTotal: 0,
      feeRefunded: true,
    });
    world({
      order,
      payment: { _id: oid(), status: 'PAID', amount: 2450, refundedAmount: 0 },
      refunded: { _id: oid(), status: 'REFUNDED', refundedAmount: 2450 },
    });

    const res = await complete(header, oid(), {
      code: '482913',
      lines: [
        { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 2, reason: 'DAMAGED' },
        { itemId: itemB.toString(), acceptedQty: 0, rejectedQty: 1, reason: 'MISSING' },
      ],
    });

    expect(res.status).toBe(200);
    expect(Payment.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ status: 'REFUNDED', refundedAmount: 2450 });
    expect(Return.create.mock.calls[0][0][0].refundAmount).toBe(2450);
    expect(Return.create.mock.calls[0][0][0].feeRefunded).toBe(true);
  });

  it('a full rejection the customer did not want refunds only the goods, not the fee', async () => {
    const { header } = asRider();
    const order = orderDoc({
      paymentMethod: 'CARD',
      paymentStatus: 'PARTIALLY_REFUNDED',
      orderStatus: 'RETURNED',
      fulfilment: 'NONE',
      returnedAmount: 2300,
      netTotal: 150,
      feeRefunded: false,
    });
    world({
      order,
      payment: { _id: oid(), status: 'PAID', amount: 2450, refundedAmount: 0 },
      refunded: { _id: oid(), status: 'PARTIALLY_REFUNDED', refundedAmount: 2300 },
    });

    const res = await complete(header, oid(), {
      code: '482913',
      lines: [
        { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 2, reason: 'NOT_WANTED' },
        { itemId: itemB.toString(), acceptedQty: 0, rejectedQty: 1, reason: 'NOT_WANTED' },
      ],
    });

    expect(res.status).toBe(200);
    expect(Payment.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ status: 'PARTIALLY_REFUNDED', refundedAmount: 2300 });
    expect(Return.create.mock.calls[0][0][0].refundAmount).toBe(2300);
    expect(Return.create.mock.calls[0][0][0].feeRefunded).toBe(false);
  });
});

describe('completion rejects bad quantities before anything moves', () => {
  it('a line returning more than was ordered is refused and does not use a code attempt', async () => {
    const { header } = asRider();
    Delivery.findOne.mockReturnValue(query(deliveryDoc()));
    Order.findOne.mockReturnValue(query(orderDoc()));

    const res = await complete(header, oid(), {
      code: '482913',
      lines: [
        { itemId: itemA.toString(), acceptedQty: 0, rejectedQty: 3, reason: 'DAMAGED' },
        { itemId: itemB.toString(), acceptedQty: 1, rejectedQty: 0 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RETURN_QUANTITY');
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Return.create).not.toHaveBeenCalled();
  });

  it('lines are only accepted for a DELIVERED completion', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const res = await request(app)
      .patch(`/api/v1/deliveries/${oid()}/status`)
      .set(...header)
      .send({ status: 'PICKED_UP', lines: partialLines() });
    expect(res.status).toBe(400);
    expect(Delivery.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses a return photo that was not uploaded to this delivery', async () => {
    const { header } = asRider();
    const d = deliveryDoc();
    Delivery.findOne.mockReturnValue(query(d));
    Order.findOne.mockReturnValue(query(orderDoc()));
    Delivery.findOneAndUpdate.mockReturnValueOnce(query({ ...d, codeAttempts: 1 }));

    const lines = partialLines();
    lines[0].photo = { publicId: `citycart/brands/${oid()}/deliveries/${oid()}/returns/x.jpg`, fingerprint: 'fp' };

    const res = await complete(header, d._id, { code: '482913', lines });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RETURN_PHOTO_NOT_YOURS');
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Return.create).not.toHaveBeenCalled();
  });

  it('accepts a photo from this delivery’s return folder and keeps its path private', async () => {
    const { header } = asRider();
    const order = orderDoc({ fulfilment: 'PARTIAL', returnedAmount: 1000, netTotal: 1450 });
    const d = deliveryDoc({ orderId: order._id });
    Delivery.findOne.mockReturnValue(query(d));
    Order.findOne.mockReturnValue(query(order));
    Delivery.findOneAndUpdate.mockReturnValueOnce(query({ ...d, codeAttempts: 1 })).mockResolvedValueOnce(d);
    Order.findOneAndUpdate.mockResolvedValue(order);
    Delivery.findById.mockReturnValue(query({ ...d, status: 'DELIVERED' }));
    Payment.findOne.mockReturnValue(query(null));
    Delivery.updateOne.mockResolvedValue({});
    Order.updateOne.mockResolvedValue({});
    Payment.findOneAndUpdate.mockResolvedValue({ _id: oid() });

    const lines = partialLines();
    lines[0].photo = {
      publicId: `citycart/brands/${brandId}/deliveries/${d._id}/returns/photo.jpg`,
      fingerprint: 'fp',
    };

    const res = await complete(header, d._id, { code: '482913', lines });

    expect(res.status).toBe(200);
    expect(Return.create.mock.calls[0][0][0].lines[0].photo).toEqual(lines[0].photo);
    expect(JSON.stringify(res.body)).not.toContain('photo.jpg');
  });
});

describe('the brand can complete a delivery with lines too', () => {
  it('writes the same accepted total and return, confirmed by the team member', async () => {
    const { header, user } = asWeb(ROLES.BRAND_ADMIN);
    const order = orderDoc({ fulfilment: 'PARTIAL', returnedAmount: 1000, netTotal: 1450 });
    const d = deliveryDoc({ orderId: order._id });
    Delivery.findOneAndUpdate.mockResolvedValue(d);
    Order.findOne.mockReturnValue(query(order));
    Order.findOneAndUpdate.mockResolvedValue(order);
    Delivery.findById.mockReturnValue(query({ ...d, status: 'DELIVERED' }));
    Payment.findOne.mockReturnValue(query(null));
    Delivery.updateOne.mockResolvedValue({});
    Order.updateOne.mockResolvedValue({});
    Payment.findOneAndUpdate.mockResolvedValue({ _id: oid() });

    const res = await request(app)
      .patch(`/api/v1/deliveries/${d._id}/status`)
      .set(...header)
      .send({ status: 'DELIVERED', lines: partialLines() });

    expect(res.status).toBe(200);
    expect(Order.findOneAndUpdate.mock.calls[0][1].$set.netTotal).toBe(1450);
    expect(Payment.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ amount: 1450, confirmedBy: user._id });
    expect(Return.create).toHaveBeenCalledTimes(1);
  });
});

describe('rider return-photo upload', () => {
  const upload = (header, id) => request(app).post(`/api/v1/rider/deliveries/${id}/return-upload`).set(...header);

  it('signs a private upload into the delivery’s own return folder', async () => {
    const { header } = asRider();
    const d = deliveryDoc();
    Delivery.findOne.mockResolvedValue(d);

    const res = await upload(header, d._id);

    expect(res.status).toBe(200);
    expect(res.body.upload).toMatchObject({
      folder: `citycart/brands/${brandId}/deliveries/${d._id}/returns`,
      type: 'authenticated',
      allowedFormats: 'jpg,png,webp',
    });
    expect(res.body.upload.signature).toBeTruthy();
  });

  it('404 for another rider’s delivery, 409 once the delivery is closed', async () => {
    const { header } = asRider();
    Delivery.findOne.mockResolvedValue(null);
    expect((await upload(header, oid())).status).toBe(404);

    Delivery.findOne.mockResolvedValue(deliveryDoc({ status: 'DELIVERED' }));
    expect((await upload(header, oid())).status).toBe(409);
  });

  it('503 when Cloudinary is not set up', async () => {
    const { header } = asRider();
    env.cloudinary = { cloudName: '', apiKey: '', apiSecret: '' };
    Delivery.findOne.mockResolvedValue(deliveryDoc());

    const res = await upload(header, oid());

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RETURN_PHOTO_NOT_CONFIGURED');
  });

  it('brand users and customers cannot use the rider route', async () => {
    expect((await upload(asWeb(ROLES.BRAND_ADMIN).header, oid())).status).toBe(403);
    expect((await upload(asWeb(ROLES.CUSTOMER).header, oid())).status).toBe(403);
  });
});

describe('return access control', () => {
  it('401 when unauthenticated', async () => {
    expect((await request(app).get('/api/v1/returns')).status).toBe(401);
    expect((await request(app).get('/api/v1/returns/summary')).status).toBe(401);
  });

  it.each([ROLES.CUSTOMER, ROLES.RIDER, ROLES.PICKER])('403 for %s on the returns inbox', async (role) => {
    const headers = role === ROLES.RIDER ? asRider().header : asWeb(role).header;
    const id = oid();
    expect((await request(app).get('/api/v1/returns').set(...headers)).status).toBe(403);
    expect((await request(app).get('/api/v1/returns/summary').set(...headers)).status).toBe(403);
    expect((await request(app).get(`/api/v1/returns/${id}`).set(...headers)).status).toBe(403);
    expect((await request(app).post(`/api/v1/returns/${id}/receive`).set(...headers)).status).toBe(403);
    expect(Return.find).not.toHaveBeenCalled();
  });

  it('an employee needs delivery.view to read and delivery.manage to receive', async () => {
    const id = oid();
    let { header } = asWeb(ROLES.BRAND_EMPLOYEE, []);
    expect((await request(app).get('/api/v1/returns').set(...header)).status).toBe(403);

    ({ header } = asWeb(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.DELIVERY_VIEW]));
    Return.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    Return.countDocuments.mockResolvedValue(0);
    Order.find.mockReturnValue({ select: () => Promise.resolve([]) });
    expect((await request(app).get('/api/v1/returns').set(...header)).status).toBe(200);

    Return.findOne.mockReturnValue(query({ _id: id, lines: [] }));
    expect((await request(app).post(`/api/v1/returns/${id}/receive`).set(...header)).status).toBe(403);
    expect(Return.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('only a brand user with delivery.manage may receive; platform admins and riders cannot', async () => {
    const id = oid();
    for (const ctx of [asWeb(ROLES.SUPER_ADMIN), asWeb(ROLES.CUSTOMER), asRider()]) {
      expect((await request(app).post(`/api/v1/returns/${id}/receive`).set(...ctx.header).send({})).status).toBe(403);
    }
    const employee = asWeb(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.DELIVERY_MANAGE]);
    const ret = { _id: id, orderId: oid(), brandId, status: 'IN_TRANSIT', lines: [] };
    Return.findOne.mockReturnValue(query(ret));
    Return.findOneAndUpdate.mockResolvedValue({ ...ret, status: 'RECEIVED' });
    Order.findById.mockReturnValue(query({ orderNumber: 'CC-2026-000042' }));
    expect((await request(app).post(`/api/v1/returns/${id}/receive`).set(...employee.header).send({})).status).toBe(200);
  });
});

describe('GET /api/v1/returns', () => {
  it('is scoped to the brand, with the order number attached', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const orderId = oid();
    const ret = {
      _id: oid(),
      orderId,
      deliveryId: oid(),
      source: 'DOOR',
      status: 'IN_TRANSIT',
      lines: [{ orderItemId: itemA, productId: oid(), productName: 'Lawn suit', quantity: 1, unitPrice: 1000, reason: 'DAMAGED' }],
      returnedSubtotal: 1000,
      feeRefunded: false,
      refundAmount: 0,
      currency: 'PKR',
      createdAt: new Date(),
    };
    Return.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([ret]) }) }) });
    Return.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({ select: () => Promise.resolve([{ _id: orderId, orderNumber: 'CC-2026-000042' }]) });

    const res = await request(app).get('/api/v1/returns?status=IN_TRANSIT').set(...header);

    expect(res.status).toBe(200);
    expect(Return.find).toHaveBeenCalledWith({ brandId: brandId.toString(), status: 'IN_TRANSIT' });
    expect(res.body.returns[0]).toMatchObject({ orderNumber: 'CC-2026-000042', status: 'IN_TRANSIT', returnedSubtotal: 1000 });
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
  });

  it('a super admin sees every brand’s returns', async () => {
    const { header } = asWeb(ROLES.SUPER_ADMIN);
    Return.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    Return.countDocuments.mockResolvedValue(0);

    expect((await request(app).get('/api/v1/returns').set(...header)).status).toBe(200);
    expect(Return.find).toHaveBeenCalledWith({});
  });

  it('the private photo path is never part of the list', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const publicId = `citycart/brands/${brandId}/deliveries/${oid()}/returns/secret.jpg`;
    const ret = {
      _id: oid(),
      orderId: oid(),
      deliveryId: oid(),
      source: 'DOOR',
      status: 'IN_TRANSIT',
      lines: [
        {
          orderItemId: itemA,
          productId: oid(),
          productName: 'Lawn suit',
          quantity: 1,
          unitPrice: 1000,
          reason: 'DAMAGED',
          photo: { publicId, fingerprint: 'fp' },
        },
      ],
      returnedSubtotal: 1000,
      refundAmount: 0,
      createdAt: new Date(),
    };
    Return.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([ret]) }) }) });
    Return.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({ select: () => Promise.resolve([]) });

    const res = await request(app).get('/api/v1/returns').set(...header);

    expect(res.body.returns[0].lines[0].hasPhoto).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(publicId);
    expect(res.body.returns[0].lines[0].photo).toBeUndefined();
  });
});

describe('GET /api/v1/returns/summary', () => {
  it('counts and totals by status within the brand', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    Return.find.mockReturnValue({
      select: () =>
        Promise.resolve([
          { status: 'IN_TRANSIT', returnedSubtotal: 1000, refundAmount: 0 },
          { status: 'RECEIVED', returnedSubtotal: 500, refundAmount: 500 },
          { status: 'RECEIVED', returnedSubtotal: 250.5, refundAmount: 0 },
        ]),
    });

    const res = await request(app).get('/api/v1/returns/summary').set(...header);

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      IN_TRANSIT: { count: 1, returnedSubtotal: 1000 },
      RECEIVED: { count: 2, returnedSubtotal: 750.5 },
      returnedSubtotal: 1750.5,
      refundAmount: 500,
    });
  });
});

describe('GET /api/v1/returns/:id and its photo', () => {
  const storedReturn = (overrides = {}) => ({
    _id: oid(),
    orderId: oid(),
    deliveryId: oid(),
    source: 'DOOR',
    status: 'RECEIVED',
    lines: [
      {
        orderItemId: itemA,
        productId: oid(),
        productName: 'Lawn suit',
        quantity: 1,
        unitPrice: 1000,
        reason: 'DAMAGED',
        photo: { publicId: `citycart/brands/${brandId}/deliveries/x/returns/p.jpg`, fingerprint: 'fp' },
      },
    ],
    returnedSubtotal: 1000,
    refundAmount: 0,
    createdAt: new Date(),
    ...overrides,
  });

  it('404 for another brand’s return (the query is brand-scoped)', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const id = oid();
    Return.findOne.mockResolvedValue(null);

    expect((await request(app).get(`/api/v1/returns/${id}`).set(...header)).status).toBe(404);
    expect(Return.findOne).toHaveBeenCalledWith({ _id: id.toString(), brandId: brandId.toString() });
  });

  it('a short-lived signed link is generated for a stored photo, but never the raw path', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const ret = storedReturn();
    Return.findOne.mockResolvedValue(ret);

    const res = await request(app).get(`/api/v1/returns/${ret._id}/photo?line=0`).set(...header);

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('https://api.cloudinary.com/v1_1/democloud/image/download');
    expect(res.body.url).toContain(encodeURIComponent(ret.lines[0].photo.publicId));
    expect(res.body.expiresAt).toBeTruthy();
  });

  it('404 when there is no photo, or the line does not exist', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    Return.findOne.mockResolvedValue(storedReturn({ lines: [{ ...storedReturn().lines[0], photo: undefined }] }));
    const noPhoto = await request(app).get(`/api/v1/returns/${oid()}/photo`).set(...header);
    expect(noPhoto.status).toBe(404);
    expect(noPhoto.body.code).toBe('RETURN_PHOTO_NOT_FOUND');

    Return.findOne.mockResolvedValue(storedReturn());
    const noLine = await request(app).get(`/api/v1/returns/${oid()}/photo?line=9`).set(...header);
    expect(noLine.status).toBe(404);
    expect(noLine.body.code).toBe('RETURN_LINE_NOT_FOUND');
  });
});

describe('POST /api/v1/returns/:id/receive', () => {
  const storedReturn = () =>
    ({
      _id: oid(),
      orderId: oid(),
      brandId,
      status: 'IN_TRANSIT',
      lines: [
        { orderItemId: itemA, productId: oid(), productName: 'Lawn suit', quantity: 2, unitPrice: 1000, reason: 'DAMAGED', restock: false },
        { orderItemId: itemB, productId: oid(), productName: 'Dupatta', quantity: 1, unitPrice: 300, reason: 'NOT_WANTED', restock: false },
      ],
      returnedSubtotal: 2300,
      refundAmount: 0,
      createdAt: new Date(),
    });

  function receiveWorld(ret) {
    Return.findOne.mockReturnValue(query(ret));
    Return.findOneAndUpdate.mockResolvedValue({ ...ret, status: 'RECEIVED', receivedAt: new Date() });
    Order.findById.mockReturnValue(query({ orderNumber: 'CC-2026-000042' }));
    Inventory.updateOne.mockResolvedValue({});
    InventoryMovement.create.mockResolvedValue([]);
  }

  const post = (header, id, body = {}) =>
    request(app).post(`/api/v1/returns/${id}/receive`).set(...header).send(body);

  it('defaults to writing everything off: no stock changes at all', async () => {
    const { header, user } = asWeb(ROLES.BRAND_ADMIN);
    const ret = storedReturn();
    receiveWorld(ret);

    const res = await post(header, ret._id);

    expect(res.status).toBe(200);
    expect(res.body.return).toMatchObject({ status: 'RECEIVED' });
    const update = Return.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.receivedBy).toEqual(user._id);
    expect(update.$set.lines.every((line) => line.restock === false)).toBe(true);
    expect(Inventory.updateOne).not.toHaveBeenCalled();
    expect(InventoryMovement.create).not.toHaveBeenCalled();
  });

  it('restocks only the lines the store ticked, and records the movement', async () => {
    const { header, user } = asWeb(ROLES.BRAND_ADMIN);
    const ret = storedReturn();
    receiveWorld(ret);

    const res = await post(header, ret._id, { decisions: [{ index: 1, restock: true }] });

    expect(res.status).toBe(200);
    const lines = Return.findOneAndUpdate.mock.calls[0][1].$set.lines;
    expect(lines.map((line) => line.restock)).toEqual([false, true]);
    expect(lines[1].restockedAt).toBeInstanceOf(Date);

    expect(Inventory.updateOne).toHaveBeenCalledTimes(1);
    expect(Inventory.updateOne).toHaveBeenCalledWith(
      { productId: ret.lines[1].productId, trackInventory: true },
      { $inc: { quantity: 1 } },
      { session: 'SESSION' }
    );
    expect(InventoryMovement.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          productId: ret.lines[1].productId,
          brandId,
          orderId: ret.orderId,
          reason: 'RETURN_RESTOCKED',
          quantityChange: 1,
          by: user._id,
        }),
      ],
      { session: 'SESSION' }
    );
  });

  it('409 when the return was already received; nothing is restocked twice', async () => {
    const { header } = asWeb(ROLES.BRAND_ADMIN);
    const ret = storedReturn();
    Return.findOne.mockReturnValue(query(ret));
    Return.findOneAndUpdate.mockResolvedValue(null);

    const res = await post(header, ret._id, { decisions: [{ index: 0, restock: true }] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RETURN_ALREADY_RECEIVED');
    expect(Inventory.updateOne).not.toHaveBeenCalled();
  });

  it.each([[{ decisions: [{ index: 5, restock: true }] }], [{ decisions: [{ index: 0, restock: 'yes' }] }]])(
    '400 for a bad decision (the return stays IN_TRANSIT)',
    async (body) => {
      const { header } = asWeb(ROLES.BRAND_ADMIN);
      const ret = storedReturn();
      receiveWorld(ret);

      const res = await post(header, ret._id, body);

      expect(res.status).toBe(400);
      expect(Return.findOneAndUpdate).not.toHaveBeenCalled();
    }
  );
});

describe('the customer sees their order’s final figures and return', () => {
  it('GET /orders/:id includes netTotal and the returned lines, but no photo path', async () => {
    const user = signedIn(ROLES.CUSTOMER);
    const order = orderDoc({
      customerId: user._id,
      orderStatus: 'DELIVERED',
      fulfilment: 'PARTIAL',
      returnedAmount: 1000,
      feeRefunded: false,
      netTotal: 1450,
      paymentStatus: 'PAID',
    });
    const publicId = `citycart/brands/${brandId}/deliveries/${oid()}/returns/p.jpg`;
    Order.findOne.mockResolvedValue(order);
    Payment.findOne.mockResolvedValue({ orderId: order._id, status: 'PAID', amount: 1450 });
    Delivery.findOne.mockResolvedValue(deliveryDoc({ orderId: order._id, status: 'DELIVERED' }));
    Return.findOne.mockResolvedValue({
      _id: oid(),
      orderId: order._id,
      deliveryId: oid(),
      source: 'DOOR',
      status: 'RECEIVED',
      lines: [
        { orderItemId: itemA, productId: oid(), productName: 'Lawn suit', quantity: 1, unitPrice: 1000, reason: 'DAMAGED', photo: { publicId, fingerprint: 'fp' } },
      ],
      returnedSubtotal: 1000,
      refundAmount: 1000,
      createdAt: new Date(),
    });

    const res = await request(app).get(`/api/v1/orders/${order._id}`).set(...['Cookie', getAuthCookie(user)]);

    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ fulfilment: 'PARTIAL', returnedAmount: 1000, netTotal: 1450, feeRefunded: false });
    expect(res.body.return).toMatchObject({ status: 'RECEIVED', returnedSubtotal: 1000, refundAmount: 1000 });
    expect(res.body.return.lines[0]).toMatchObject({ productName: 'Lawn suit', quantity: 1, reason: 'DAMAGED', hasPhoto: true });
    expect(JSON.stringify(res.body)).not.toContain(publicId);
  });
});
