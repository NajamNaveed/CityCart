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
const { checkout, cancelMyOrder } = require('../../src/services/order.service');
const { updateBrandOrderStatus } = require('../../src/services/brandOrder.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const input = {
  shippingAddress: { fullName: 'John Doe', phone: '+923001234567', addressLine: 'Street 1', city: 'Lahore' },
  paymentMethod: 'COD',
};

async function placeOrder({ stock = 10, qty = 4 } = {}) {
  n += 1;
  const brand = await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
  const product = await Product.create({
    brandId: brand._id, categoryId: oid(), name: `P${n}`, slug: `p${n}`, sku: `S${n}`,
    price: 10, status: 'ACTIVE', isActive: true,
  });
  await Inventory.create({ productId: product._id, brandId: brand._id, quantity: stock });
  const user = oid();
  await Cart.create({ userId: user, items: [{ productId: product._id, brandId: brand._id, quantity: qty }] });
  const [order] = await checkout(user, input);
  return { brand, product, user, order, staff: oid() };
}

const setStatus = (ctx, status) =>
  updateBrandOrderStatus({ brandId: ctx.brand._id, orderId: ctx.order._id, status, userId: ctx.staff });
const stockOf = async (p) => (await Inventory.findOne({ productId: p._id })).quantity;
const ok = (r) => r.filter((x) => x.status === 'fulfilled');
const bad = (r) => r.filter((x) => x.status === 'rejected');

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, Product, Inventory, Cart, Order, Payment, Counter, Delivery].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('brand order status (real MongoDB)', () => {
  it('walks the legal chain and records an audit trail', async () => {
    const ctx = await placeOrder();
    await setStatus(ctx, 'CONFIRMED');
    await setStatus(ctx, 'PROCESSING');
    const done = await setStatus(ctx, 'READY_FOR_SHIPMENT');

    expect(done.orderStatus).toBe('READY_FOR_SHIPMENT');
    expect(done.statusHistory.map((h) => h.status)).toEqual([
      'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT',
    ]);
    expect(String(done.statusHistory[1].by)).toBe(String(ctx.staff));
    expect(await stockOf(ctx.product)).toBe(6); // confirming never touches stock
  });

  it('rejects skipping steps and moving backwards', async () => {
    const ctx = await placeOrder();
    await expect(setStatus(ctx, 'PROCESSING')).rejects.toMatchObject({ status: 409 });
    await setStatus(ctx, 'CONFIRMED');
    await expect(setStatus(ctx, 'CONFIRMED')).rejects.toMatchObject({ status: 409 });
    await setStatus(ctx, 'PROCESSING');
    await expect(setStatus(ctx, 'REJECTED')).rejects.toMatchObject({ status: 409 }); // too late
    expect((await Order.findById(ctx.order._id)).orderStatus).toBe('PROCESSING');
  });

  it('REJECT restocks and cancels the payment', async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    expect(await stockOf(ctx.product)).toBe(6);

    const rejected = await setStatus(ctx, 'REJECTED');

    expect(rejected.orderStatus).toBe('REJECTED');
    expect(rejected.paymentStatus).toBe('CANCELLED');
    expect(await stockOf(ctx.product)).toBe(10);
    expect((await Payment.findOne({ orderId: ctx.order._id })).status).toBe('CANCELLED');
  });

  it('a CONFIRMED order can still be rejected (and restocked)', async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    await setStatus(ctx, 'CONFIRMED');
    await setStatus(ctx, 'REJECTED');
    expect(await stockOf(ctx.product)).toBe(10);
  });

  it('5 concurrent rejects restock EXACTLY once', async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => setStatus(ctx, 'REJECTED')));

    expect(ok(results)).toHaveLength(1);
    bad(results).forEach((r) => expect(r.reason.status).toBe(409));
    expect(await stockOf(ctx.product)).toBe(10);
  });

  it('brand REJECT racing customer CANCEL: exactly one wins, stock restored once', async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    const results = await Promise.allSettled([
      setStatus(ctx, 'REJECTED'),
      cancelMyOrder(ctx.user, ctx.order._id),
    ]);

    expect(ok(results)).toHaveLength(1);
    expect(await stockOf(ctx.product)).toBe(10);
    const final = (await Order.findById(ctx.order._id)).orderStatus;
    expect(['REJECTED', 'CANCELLED']).toContain(final);
  });

  it('brand CONFIRM racing customer CANCEL: exactly one wins, and stock matches the winner', async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    const results = await Promise.allSettled([
      setStatus(ctx, 'CONFIRMED'),
      cancelMyOrder(ctx.user, ctx.order._id),
    ]);

    expect(ok(results)).toHaveLength(1);
    const final = (await Order.findById(ctx.order._id)).orderStatus;
    expect(await stockOf(ctx.product)).toBe(final === 'CANCELLED' ? 10 : 6);
  });

  it("a brand cannot touch another brand's order (404) and nothing changes", async () => {
    const ctx = await placeOrder({ stock: 10, qty: 4 });
    await expect(
      updateBrandOrderStatus({ brandId: oid(), orderId: ctx.order._id, status: 'REJECTED', userId: oid() })
    ).rejects.toMatchObject({ status: 404 });
    expect((await Order.findById(ctx.order._id)).orderStatus).toBe('PENDING');
    expect(await stockOf(ctx.product)).toBe(6);
  });
});
