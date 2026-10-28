const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const Cart = require('../../src/models/cart.model');
const Order = require('../../src/models/order.model');
const Payment = require('../../src/models/payment.model');
const Counter = require('../../src/models/counter.model');
const Delivery = require('../../src/models/delivery.model');
const OrderAdjustment = require('../../src/models/orderAdjustment.model');
const InventoryMovement = require('../../src/models/inventoryMovement.model');
const Notification = require('../../src/models/notification.model');
const User = require('../../src/models/user.model');
const env = require('../../src/config/env');
const { checkout } = require('../../src/services/order.service');
const { updateBrandOrderStatus } = require('../../src/services/brandOrder.service');
const {
  proposeAdjustment,
  withdrawAdjustment,
  respondToAdjustment,
  expireAdjustments,
} = require('../../src/services/orderAdjustment.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const address = {
  fullName: 'John Doe',
  phone: '+923001234567',
  addressLine: 'Street 1',
  city: 'Lahore',
  additionalInstructions: 'Gate 2, ring the bell.',
};

async function makeBrand() {
  n += 1;
  return Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
}

async function makeProduct({ brand, stock = 10, price = 10 }) {
  n += 1;
  const product = await Product.create({
    brandId: brand._id,
    categoryId: oid(),
    name: `P${n}`,
    slug: `p${n}`,
    sku: `S${n}`,
    price,
    status: 'ACTIVE',
    isActive: true,
  });
  await Inventory.create({ productId: product._id, brandId: brand._id, quantity: stock });
  return product;
}

// A real checkout of `qty` of one product.
async function placeOrder({ qty = 3, price = 10, stock = 10, method = 'COD' } = {}) {
  const brand = await makeBrand();
  const product = await makeProduct({ brand, stock, price });
  const user = oid();
  await Cart.create({ userId: user, items: [{ productId: product._id, brandId: brand._id, quantity: qty }] });
  const [order] = await checkout(user, { shippingAddress: address, paymentMethod: method });
  // A real brand admin, so staff-audience notifications are actually written.
  const admin = await User.create({
    name: `Admin${n}`,
    email: `admin${n}@example.com`,
    passwordHash: 'not-used-in-this-test',
    role: 'BRAND_ADMIN',
    brandId: brand._id,
  });
  return { brand, product, user, order, staff: admin._id };
}

const lineFor = (order, supplyQuantity, substitute) => ({
  orderItemId: order.items[0]._id,
  supplyQuantity,
  ...(substitute && { substitute }),
});

const propose = (ctx, over = {}) =>
  proposeAdjustment({
    brandId: ctx.brand._id,
    orderId: ctx.order._id,
    userId: ctx.staff,
    note: 'We only have some of these in good condition.',
    lines: [lineFor(ctx.order, 1)],
    ...over,
  });

const respond = (ctx, adjustment, action, customerId = ctx.user) =>
  respondToAdjustment({
    customerId,
    orderId: ctx.order._id,
    adjustmentId: adjustment._id,
    action,
    userId: customerId,
  });

const stock = async (product) => {
  const inv = await Inventory.findOne({ productId: product._id });
  return { quantity: inv.quantity, reserved: inv.reservedQuantity };
};
const reload = (ctx) => Order.findById(ctx.order._id);
const ok = (results) => results.filter((r) => r.status === 'fulfilled');

beforeAll(async () => {
  await connect();
  await Promise.all(
    [
      Brand,
      Product,
      Inventory,
      Cart,
      Order,
      Payment,
      Counter,
      Delivery,
      OrderAdjustment,
      InventoryMovement,
      Notification,
      User,
    ].map((model) => model.init())
  );
});
afterAll(disconnect);
beforeEach(clearAll);

describe('proposing a change (docs/21 §H.2/H.4)', () => {
  it('reserves the substitute once, stores both totals and tells the customer', async () => {
    const ctx = await placeOrder(); // 3 x 10, stock 10 -> 7 left
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });

    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
    });

    expect(adjustment.status).toBe('PROPOSED');
    expect(adjustment.totalsBefore.total).toBe(30);
    expect(adjustment.totalsAfter).toMatchObject({ subtotal: 18, total: 18 });
    expect(adjustment.totalsAfterRemoval).toMatchObject({ subtotal: 10, total: 10 });
    expect(adjustment.stockReservations).toHaveLength(1);

    expect(await stock(other)).toEqual({ quantity: 10, reserved: 2 });
    expect(await stock(ctx.product)).toEqual({ quantity: 7, reserved: 0 });
    expect((await reload(ctx)).activeAdjustmentId).toEqual(adjustment._id);

    const ledger = await InventoryMovement.find({ adjustmentId: adjustment._id });
    expect(ledger.map((m) => m.reason)).toEqual(['SUBSTITUTION_RESERVED']);
    expect(ledger[0]).toMatchObject({ reservedChange: 2, quantityChange: 0 });

    const note = await Notification.findOne({ userId: ctx.user, type: 'ADJUSTMENT_PROPOSED' });
    expect(note).toBeTruthy();
  });

  it('refuses an unavailable substitute (409) and leaves everything unchanged', async () => {
    const ctx = await placeOrder({ stock: 3 }); // nothing left to reserve
    const other = await makeProduct({ brand: ctx.brand, stock: 1, price: 4 });

    await expect(
      propose(ctx, { lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })] })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'SUBSTITUTE_UNAVAILABLE' } });

    expect(await OrderAdjustment.countDocuments()).toBe(0);
    expect(await stock(other)).toEqual({ quantity: 1, reserved: 0 });
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
  });

  it('only one proposal can be waiting; a race produces exactly one', async () => {
    const ctx = await placeOrder();
    const results = await Promise.allSettled([propose(ctx), propose(ctx)]);

    expect(ok(results)).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected.reason.status).toBe(409);
    expect(await OrderAdjustment.countDocuments({ status: 'PROPOSED' })).toBe(1);
  });

  it('is scoped to the brand and only accepts same-brand substitutes', async () => {
    const ctx = await placeOrder();
    const otherBrand = await makeBrand();
    const foreignProduct = await makeProduct({ brand: otherBrand, stock: 10, price: 4 });
    const foreignOrder = await placeOrder();

    await expect(propose(ctx, { brandId: otherBrand._id })).rejects.toMatchObject({ status: 404 });
    await expect(
      propose(foreignOrder, {
        lines: [lineFor(foreignOrder.order, 1, { productId: foreignProduct._id, quantity: 1 })],
      })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'SUBSTITUTE_UNAVAILABLE' } });
  });

  it('an unpaid online order cannot be adjusted', async () => {
    const previous = { ...env.payments };
    Object.assign(env.payments, { provider: 'mock', webhookSecret: 'a-long-test-webhook-secret-123' });
    try {
      const ctx = await placeOrder({ method: 'ONLINE_GATEWAY' });
      await expect(propose(ctx)).rejects.toMatchObject({
        status: 409,
        extra: { code: 'ONLINE_PAYMENT_NOT_COMPLETED' },
      });
    } finally {
      Object.assign(env.payments, previous);
    }
  });
});

describe('the customer answers (docs/21 §H.3/H.4)', () => {
  it('ACCEPT rewrites the lines, converts the reservation into a sale and updates a COD payment', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
      restockRemoved: false,
    });

    const result = await respond(ctx, adjustment, 'ACCEPT');

    expect(result.adjustment.status).toBe('ACCEPTED');
    expect(result.order.items).toHaveLength(2);
    expect(result.order.items[0]).toMatchObject({ productId: ctx.product._id, quantity: 1, unitPrice: 10 });
    expect(result.order.items[1]).toMatchObject({ productId: other._id, quantity: 2, unitPrice: 4 });
    expect(result.order.total).toBe(18);
    expect(result.order.activeAdjustmentId).toBeNull();

    expect((await Payment.findOne({ orderId: ctx.order._id })).amount).toBe(18);
    expect(await stock(ctx.product)).toEqual({ quantity: 7, reserved: 0 }); // removed units are not sellable
    expect(await stock(other)).toEqual({ quantity: 8, reserved: 0 });

    expect((await InventoryMovement.find({ adjustmentId: adjustment._id }).sort({ createdAt: 1 })).map((m) => m.reason)).toEqual([
      'SUBSTITUTION_RESERVED',
      'SUBSTITUTION_FULFILLED',
    ]);
    expect(await Notification.countDocuments({ type: 'ADJUSTMENT_ANSWERED' })).toBeGreaterThan(0);
  });

  it('REMOVE keeps the available units, drops the rest, and restocks only when the brand ticked it', async () => {
    const keep = await placeOrder();
    const keepAdjustment = await propose(keep, { restockRemoved: true });
    const kept = await respond(keep, keepAdjustment, 'REMOVE');
    expect(kept.order.items).toHaveLength(1);
    expect(kept.order.items[0].quantity).toBe(1);
    expect(kept.order.total).toBe(10);
    expect((await Payment.findOne({ orderId: keep.order._id })).amount).toBe(10);
    expect(await stock(keep.product)).toEqual({ quantity: 9, reserved: 0 }); // 7 + 2 returned

    const damaged = await placeOrder();
    const damagedAdjustment = await propose(damaged, { restockRemoved: false });
    await respond(damaged, damagedAdjustment, 'REMOVE');
    expect(await stock(damaged.product)).toEqual({ quantity: 7, reserved: 0 }); // damaged units stay out
  });

  it('CANCEL_ORDER cancels, restocks everything and releases the substitute', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 0, { productId: other._id, quantity: 1 })],
    });

    const result = await respond(ctx, adjustment, 'CANCEL_ORDER');

    expect(result.adjustment.status).toBe('ORDER_CANCELLED');
    expect(result.order.orderStatus).toBe('CANCELLED');
    expect(result.order.paymentStatus).toBe('CANCELLED');
    expect(await stock(ctx.product)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stock(other)).toEqual({ quantity: 10, reserved: 0 });
    expect((await Payment.findOne({ orderId: ctx.order._id })).status).toBe('CANCELLED');
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
  });

  it('two answers at the same time: exactly one is applied', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
    });

    const results = await Promise.allSettled([
      respond(ctx, adjustment, 'ACCEPT'),
      respond(ctx, adjustment, 'REMOVE'),
    ]);

    expect(ok(results)).toHaveLength(1);
    const final = await OrderAdjustment.findById(adjustment._id);
    expect(['ACCEPTED', 'REMOVED']).toContain(final.status);
    expect(final.stockReservations).toHaveLength(1);
    expect((await stock(other)).reserved).toBe(0);
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
  });

  it("another customer cannot answer someone else's proposal", async () => {
    const ctx = await placeOrder();
    const adjustment = await propose(ctx);
    await expect(respond(ctx, adjustment, 'ACCEPT', oid())).rejects.toMatchObject({ status: 404 });
    expect((await OrderAdjustment.findById(adjustment._id)).status).toBe('PROPOSED');
  });
});

describe('withdraw and expiry', () => {
  it('the brand can withdraw, releasing the reservation', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
    });

    const withdrawn = await withdrawAdjustment({
      brandId: ctx.brand._id,
      orderId: ctx.order._id,
      adjustmentId: adjustment._id,
      userId: ctx.staff,
    });

    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(await stock(other)).toEqual({ quantity: 10, reserved: 0 });
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
    await expect(respond(ctx, adjustment, 'ACCEPT')).rejects.toMatchObject({ status: 409 });
  });

  it('expires after the window: nothing changes, the reservation is released and the brand is told', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
    });
    await OrderAdjustment.updateOne({ _id: adjustment._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await expireAdjustments()).toBe(1);

    expect((await OrderAdjustment.findById(adjustment._id)).status).toBe('EXPIRED');
    expect(await stock(other)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stock(ctx.product)).toEqual({ quantity: 7, reserved: 0 });
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
    expect((await reload(ctx)).total).toBe(30); // unchanged
    expect(await Notification.countDocuments({ type: 'ADJUSTMENT_EXPIRED' })).toBeGreaterThan(0);

    // Running it again changes nothing.
    expect(await expireAdjustments()).toBe(0);
  });

  it('a late answer is refused and expires the proposal', async () => {
    const ctx = await placeOrder();
    const adjustment = await propose(ctx);
    await OrderAdjustment.updateOne({ _id: adjustment._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(respond(ctx, adjustment, 'ACCEPT')).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ADJUSTMENT_EXPIRED' },
    });
    expect((await OrderAdjustment.findById(adjustment._id)).status).toBe('EXPIRED');
  });
});

describe('the shipping gate and order closure', () => {
  it('cannot move to ready for shipment while a proposal waits; it can afterwards', async () => {
    const ctx = await placeOrder();
    const adjustment = await propose(ctx);
    await updateBrandOrderStatus({ brandId: ctx.brand._id, orderId: ctx.order._id, status: 'CONFIRMED', userId: ctx.staff });
    await updateBrandOrderStatus({ brandId: ctx.brand._id, orderId: ctx.order._id, status: 'PROCESSING', userId: ctx.staff });

    await expect(
      updateBrandOrderStatus({ brandId: ctx.brand._id, orderId: ctx.order._id, status: 'READY_FOR_SHIPMENT', userId: ctx.staff })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'ADJUSTMENT_PENDING' } });

    await withdrawAdjustment({
      brandId: ctx.brand._id,
      orderId: ctx.order._id,
      adjustmentId: adjustment._id,
      userId: ctx.staff,
    });

    const ready = await updateBrandOrderStatus({
      brandId: ctx.brand._id,
      orderId: ctx.order._id,
      status: 'READY_FOR_SHIPMENT',
      userId: ctx.staff,
    });
    expect(ready.orderStatus).toBe('READY_FOR_SHIPMENT');
  });

  it('brand rejection closes the waiting proposal and releases its reservation', async () => {
    const ctx = await placeOrder();
    const other = await makeProduct({ brand: ctx.brand, stock: 10, price: 4 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 1, { productId: other._id, quantity: 2 })],
    });

    await updateBrandOrderStatus({ brandId: ctx.brand._id, orderId: ctx.order._id, status: 'REJECTED', userId: ctx.staff });

    expect((await OrderAdjustment.findById(adjustment._id)).status).toBe('ORDER_CANCELLED');
    expect(await stock(other)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stock(ctx.product)).toEqual({ quantity: 10, reserved: 0 });
    expect((await reload(ctx)).activeAdjustmentId).toBeNull();
  });
});

describe('paid online orders (docs/21 §H.4)', () => {
  const previous = { ...env.payments };
  beforeEach(() => Object.assign(env.payments, { provider: 'mock', webhookSecret: 'a-long-test-webhook-secret-123' }));
  afterAll(() => Object.assign(env.payments, previous));

  async function paidOnlineOrder(options = {}) {
    const ctx = await placeOrder({ ...options, method: 'ONLINE_GATEWAY' });
    await Payment.updateOne(
      { orderId: ctx.order._id },
      { $set: { status: 'PAID', paidAt: new Date() } }
    );
    await Order.updateOne({ _id: ctx.order._id }, { $set: { paymentStatus: 'PAID' } });
    ctx.order = await Order.findById(ctx.order._id);
    return ctx;
  }

  it('a lower total is recorded as a refund; the order stays paid', async () => {
    const ctx = await paidOnlineOrder();
    const adjustment = await propose(ctx);

    const result = await respond(ctx, adjustment, 'REMOVE');

    expect(result.refund).toBe(20);
    expect(result.order.total).toBe(10);
    expect(result.order.paymentStatus).toBe('PAID'); // still paid for the final total
    const payment = await Payment.findOne({ orderId: ctx.order._id });
    expect(payment.amount).toBe(30); // what was actually charged stays the record
    expect(payment.refundedAmount).toBe(20);
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    expect(payment.refunds.map((r) => r.amount)).toEqual([20]);
    expect(await Notification.countDocuments({ userId: ctx.user, type: 'REFUND_ISSUED' })).toBe(1);
  });

  it('a higher total is refused and changes nothing', async () => {
    const ctx = await paidOnlineOrder({ qty: 1, price: 10, stock: 2 });
    const expensive = await makeProduct({ brand: ctx.brand, stock: 10, price: 50 });
    const adjustment = await propose(ctx, {
      lines: [lineFor(ctx.order, 0, { productId: expensive._id, quantity: 1 })],
    });

    await expect(respond(ctx, adjustment, 'ACCEPT')).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ADJUSTMENT_INCREASES_TOTAL' },
    });

    expect((await OrderAdjustment.findById(adjustment._id)).status).toBe('PROPOSED');
    expect((await Payment.findOne({ orderId: ctx.order._id })).refundedAmount).toBe(0);
    expect(await stock(expensive)).toEqual({ quantity: 10, reserved: 1 });
    expect((await reload(ctx)).activeAdjustmentId).toEqual(adjustment._id);
  });
});
