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
const { checkout } = require('../../src/services/order.service');
const { getPaymentForOrder, updatePaymentStatus } = require('../../src/services/payment.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const input = {
  shippingAddress: { fullName: 'John Doe', phone: '+923001234567', addressLine: 'Street 1', city: 'Lahore', additionalInstructions: 'Gate 2, ring the bell.' },
  paymentMethod: 'COD',
};

// A real checkout (2 x 25 = 50). `delivered: true` simulates a delivered,
// cash-collected order by writing the end state directly.
async function setup({ delivered = false } = {}) {
  n += 1;
  const brand = await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
  const product = await Product.create({
    brandId: brand._id, categoryId: oid(), name: `P${n}`, slug: `p${n}`, sku: `S${n}`, price: 25, status: 'ACTIVE', isActive: true,
  });
  await Inventory.create({ productId: product._id, brandId: brand._id, quantity: 10 });
  const user = oid();
  await Cart.create({ userId: user, items: [{ productId: product._id, brandId: brand._id, quantity: 2 }] });
  const [order] = await checkout(user, input);
  if (delivered) {
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: 'DELIVERED', paymentStatus: 'PAID' } });
    await Payment.updateOne({ orderId: order._id }, { $set: { status: 'PAID', paidAt: new Date() } });
  }
  const payment = await Payment.findOne({ orderId: order._id });
  const staff = oid();
  const call = (body, over = {}) =>
    updatePaymentStatus({ userId: staff, tenantBrandId: brand._id, paymentId: payment._id, ...body, ...over });
  return { brand, user, order, payment, staff, call };
}

const reloadPayment = (c) => Payment.findById(c.payment._id);
const reloadOrder = (c) => Order.findById(c.order._id);
const ok = (r) => r.filter((x) => x.status === 'fulfilled');
const reason = 'Customer returned item';

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, Product, Inventory, Cart, Order, Payment, Counter, Delivery].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('payments (real MongoDB)', () => {
  it('customer, owning brand and super admin can read; others get 404', async () => {
    const c = await setup();
    expect((await getPaymentForOrder({ role: 'CUSTOMER', _id: c.user }, null, c.order._id)).amount).toBe(50);
    expect(await getPaymentForOrder({ role: 'BRAND_ADMIN', _id: oid() }, c.brand._id, c.order._id)).toBeTruthy();
    expect(await getPaymentForOrder({ role: 'SUPER_ADMIN', _id: oid() }, null, c.order._id)).toBeTruthy();

    await expect(getPaymentForOrder({ role: 'CUSTOMER', _id: oid() }, null, c.order._id)).rejects.toMatchObject({ status: 404 });
    await expect(getPaymentForOrder({ role: 'BRAND_ADMIN', _id: oid() }, oid(), c.order._id)).rejects.toMatchObject({ status: 404 });
  });

  it('manual PAID is refused before delivery and works after it', async () => {
    const early = await setup();
    await expect(early.call({ status: 'PAID' })).rejects.toMatchObject({ status: 409, extra: { code: 'PAYMENT_NOT_COLLECTABLE' } });
    expect((await reloadPayment(early)).status).toBe('PENDING');

    const late = await setup();
    await Order.updateOne({ _id: late.order._id }, { $set: { orderStatus: 'DELIVERED' } }); // payment missed -> safety net
    const paid = await late.call({ status: 'PAID' });
    expect(paid.status).toBe('PAID');
    expect(String(paid.confirmedBy)).toBe(String(late.staff));
    expect((await reloadOrder(late)).paymentStatus).toBe('PAID');
  });

  it('a pending payment cannot be refunded', async () => {
    const c = await setup();
    await expect(c.call({ status: 'REFUNDED', refundReason: reason })).rejects.toMatchObject({ status: 409 });
  });

  it('partial then full refund: cumulative total, audit log and order status stay in sync', async () => {
    const c = await setup({ delivered: true }); // amount 50

    const partial = await c.call({ status: 'PARTIALLY_REFUNDED', refundAmount: 12.5, refundReason: reason });
    expect(partial).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedAmount: 12.5 });
    expect((await reloadOrder(c)).paymentStatus).toBe('PARTIALLY_REFUNDED');

    const full = await c.call({ status: 'REFUNDED', refundReason: 'Rest of order refunded' });
    expect(full).toMatchObject({ status: 'REFUNDED', refundedAmount: 50 });
    expect(full.refunds.map((r) => r.amount)).toEqual([12.5, 37.5]);
    expect(String(full.refunds[0].by)).toBe(String(c.staff));
    expect((await reloadOrder(c)).paymentStatus).toBe('REFUNDED');
  });

  it('cannot refund more than was paid, and a REFUNDED payment is final', async () => {
    const c = await setup({ delivered: true });
    await c.call({ status: 'PARTIALLY_REFUNDED', refundAmount: 40, refundReason: reason });

    await expect(c.call({ status: 'PARTIALLY_REFUNDED', refundAmount: 20, refundReason: reason }))
      .rejects.toMatchObject({ status: 409, extra: { code: 'REFUND_EXCEEDS_REMAINING', remaining: 10 } });

    await c.call({ status: 'REFUNDED', refundReason: reason });
    await expect(c.call({ status: 'REFUNDED', refundReason: reason })).rejects.toMatchObject({ status: 409 });
    await expect(c.call({ status: 'PAID' })).rejects.toMatchObject({ status: 409 });
    expect((await reloadPayment(c)).refundedAmount).toBe(50);
  });

  it('5 concurrent FULL refunds: exactly one succeeds, refunded total equals the amount', async () => {
    const c = await setup({ delivered: true });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => c.call({ status: 'REFUNDED', refundReason: reason })));

    expect(ok(results)).toHaveLength(1);
    const payment = await reloadPayment(c);
    expect(payment.refundedAmount).toBe(50);
    expect(payment.refunds).toHaveLength(1);
  });

  it('10 concurrent partial refunds of 30 against 50: total never exceeds the amount', async () => {
    const c = await setup({ delivered: true });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => c.call({ status: 'PARTIALLY_REFUNDED', refundAmount: 30, refundReason: reason }))
    );

    const payment = await reloadPayment(c);
    expect(payment.refundedAmount).toBe(ok(results).length * 30);
    expect(payment.refundedAmount).toBeLessThanOrEqual(50);
    expect(ok(results)).toHaveLength(1); // a second 30 would exceed 50
  });

  it("a brand cannot touch another brand's payment (404, nothing changes)", async () => {
    const c = await setup({ delivered: true });
    await expect(c.call({ status: 'REFUNDED', refundReason: reason }, { tenantBrandId: oid() })).rejects.toMatchObject({ status: 404 });
    expect((await reloadPayment(c)).status).toBe('PAID');
  });

  it('SUPER_ADMIN (no tenant) can refund any payment', async () => {
    const c = await setup({ delivered: true });
    const refunded = await c.call({ status: 'REFUNDED', refundReason: reason }, { tenantBrandId: null });
    expect(refunded.status).toBe('REFUNDED');
  });

  it('rolls back when the order update fails (payment and order never disagree)', async () => {
    const c = await setup({ delivered: true });
    const spy = jest.spyOn(Order, 'updateOne').mockRejectedValueOnce(new Error('order write failed'));
    await expect(c.call({ status: 'REFUNDED', refundReason: reason })).rejects.toThrow('order write failed');
    spy.mockRestore();

    const payment = await reloadPayment(c);
    expect(payment.status).toBe('PAID'); // payment change was rolled back
    expect(payment.refundedAmount).toBe(0);
  });
});
