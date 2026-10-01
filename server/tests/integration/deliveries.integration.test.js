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
const { updateBrandOrderStatus } = require('../../src/services/brandOrder.service');
const {
  updateDeliveryStatus,
  updateDelivery,
  getDeliveryForUser,
} = require('../../src/services/delivery.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const input = {
  shippingAddress: {
    fullName: 'John Doe', phone: '+923001234567', addressLine: 'Street 1',
    city: 'Lahore', state: 'Punjab', country: 'Pakistan',
  },
  paymentMethod: 'COD',
};

// An order driven all the way to READY_FOR_SHIPMENT (delivery exists).
async function readyOrder() {
  n += 1;
  const brand = await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
  const product = await Product.create({
    brandId: brand._id, categoryId: oid(), name: `P${n}`, slug: `p${n}`, sku: `S${n}`,
    price: 25, status: 'ACTIVE', isActive: true,
  });
  await Inventory.create({ productId: product._id, brandId: brand._id, quantity: 10 });
  const user = oid();
  await Cart.create({ userId: user, items: [{ productId: product._id, brandId: brand._id, quantity: 2 }] });
  const [order] = await checkout(user, input);
  const staff = oid();
  const step = (status) => updateBrandOrderStatus({ brandId: brand._id, orderId: order._id, status, userId: staff });
  await step('CONFIRMED');
  await step('PROCESSING');
  await step('READY_FOR_SHIPMENT');
  const delivery = await Delivery.findOne({ orderId: order._id });
  const move = (status, extra = {}) =>
    updateDeliveryStatus({ brandId: brand._id, deliveryId: delivery._id, status, userId: staff, ...extra });
  return { brand, product, user, order, delivery, staff, move };
}

const reloadOrder = (c) => Order.findById(c.order._id);
const reloadPayment = (c) => Payment.findOne({ orderId: c.order._id });
const ok = (r) => r.filter((x) => x.status === 'fulfilled');

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, Product, Inventory, Cart, Order, Payment, Counter, Delivery].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('delivery lifecycle (real MongoDB)', () => {
  it('creates exactly one delivery at READY_FOR_SHIPMENT from the order snapshot', async () => {
    const c = await readyOrder();
    expect(await Delivery.countDocuments({ orderId: c.order._id })).toBe(1);
    expect(c.delivery).toMatchObject({ status: 'READY_FOR_PICKUP', deliveryFee: 0 });
    expect(String(c.delivery.brandId)).toBe(String(c.brand._id));
    expect(String(c.delivery.customerId)).toBe(String(c.user));
    expect(c.delivery.address).toMatchObject({ name: 'John Doe', address: 'Street 1', city: 'Lahore', state: 'Punjab', country: 'Pakistan' });
  });

  it('concurrent READY_FOR_SHIPMENT requests create only one delivery', async () => {
    n += 1;
    const brand = await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
    const product = await Product.create({
      brandId: brand._id, categoryId: oid(), name: `P${n}`, slug: `p${n}`, sku: `S${n}`, price: 5, status: 'ACTIVE', isActive: true,
    });
    await Inventory.create({ productId: product._id, brandId: brand._id, quantity: 5 });
    const user = oid();
    await Cart.create({ userId: user, items: [{ productId: product._id, brandId: brand._id, quantity: 1 }] });
    const [order] = await checkout(user, input);
    const step = (status) => updateBrandOrderStatus({ brandId: brand._id, orderId: order._id, status, userId: oid() });
    await step('CONFIRMED');
    await step('PROCESSING');

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => step('READY_FOR_SHIPMENT')));

    expect(ok(results)).toHaveLength(1);
    expect(await Delivery.countDocuments({ orderId: order._id })).toBe(1);
  });

  it('full happy path: order and COD payment follow the delivery', async () => {
    const c = await readyOrder();

    await c.move('PICKED_UP');
    expect((await reloadOrder(c)).orderStatus).toBe('SHIPPED');

    await c.move('IN_TRANSIT');
    expect((await reloadOrder(c)).orderStatus).toBe('SHIPPED'); // unchanged

    await c.move('OUT_FOR_DELIVERY');
    expect((await reloadOrder(c)).orderStatus).toBe('OUT_FOR_DELIVERY');
    expect((await reloadPayment(c)).status).toBe('PENDING'); // cash not yet collected

    const delivered = await c.move('DELIVERED');
    expect(delivered.status).toBe('DELIVERED');

    const order = await reloadOrder(c);
    expect(order.orderStatus).toBe('DELIVERED');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.statusHistory.map((h) => h.status)).toEqual([
      'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
    ]);

    const payment = await reloadPayment(c);
    expect(payment.status).toBe('PAID');
    expect(payment.paidAt).toBeInstanceOf(Date);
    expect(String(payment.confirmedBy)).toBe(String(c.staff));
  });

  it('rejects skipping steps and changes nothing', async () => {
    const c = await readyOrder();
    await expect(c.move('DELIVERED')).rejects.toMatchObject({ status: 409, extra: { code: 'INVALID_TRANSITION' } });
    await expect(c.move('OUT_FOR_DELIVERY')).rejects.toMatchObject({ status: 409 });

    expect((await Delivery.findById(c.delivery._id)).status).toBe('READY_FOR_PICKUP');
    expect((await reloadOrder(c)).orderStatus).toBe('READY_FOR_SHIPMENT');
    expect((await reloadPayment(c)).status).toBe('PENDING');
  });

  it('a final DELIVERED delivery cannot move again', async () => {
    const c = await readyOrder();
    await c.move('PICKED_UP');
    await c.move('OUT_FOR_DELIVERY');
    await c.move('DELIVERED');
    await expect(c.move('FAILED', { failureReason: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(c.move('OUT_FOR_DELIVERY')).rejects.toMatchObject({ status: 409 });
  });

  it('FAILED keeps order and payment as they were, then a re-attempt can still succeed', async () => {
    const c = await readyOrder();
    await c.move('PICKED_UP');
    await c.move('OUT_FOR_DELIVERY');

    const failed = await c.move('FAILED', { failureReason: 'Customer unavailable' });
    expect(failed).toMatchObject({ status: 'FAILED', failureReason: 'Customer unavailable' });
    expect((await reloadOrder(c)).orderStatus).toBe('OUT_FOR_DELIVERY');
    expect((await reloadPayment(c)).status).toBe('PENDING'); // no refund / no payment change

    const retry = await c.move('OUT_FOR_DELIVERY'); // re-attempt
    expect(retry.failureReason).toBeUndefined(); // stale reason cleared
    expect((await reloadOrder(c)).orderStatus).toBe('OUT_FOR_DELIVERY');

    await c.move('DELIVERED');
    expect((await reloadPayment(c)).status).toBe('PAID');
  });

  it('5 concurrent DELIVERED requests: one wins, payment is marked PAID exactly once', async () => {
    const c = await readyOrder();
    await c.move('PICKED_UP');
    await c.move('OUT_FOR_DELIVERY');

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => c.move('DELIVERED')));

    expect(ok(results)).toHaveLength(1);
    expect((await reloadOrder(c)).orderStatus).toBe('DELIVERED');
    expect(await Payment.countDocuments({ orderId: c.order._id, status: 'PAID' })).toBe(1);
    const history = (await reloadOrder(c)).statusHistory.filter((h) => h.status === 'DELIVERED');
    expect(history).toHaveLength(1);
  });

  it('rolls back the delivery change when the order is out of sync', async () => {
    const c = await readyOrder();
    await c.move('PICKED_UP');
    // Simulate drift: order is no longer SHIPPED, so OUT_FOR_DELIVERY is illegal for it.
    await Order.updateOne({ _id: c.order._id }, { $set: { orderStatus: 'READY_FOR_SHIPMENT' } });

    await expect(c.move('OUT_FOR_DELIVERY')).rejects.toMatchObject({ status: 409, extra: { code: 'ORDER_OUT_OF_SYNC' } });

    expect((await Delivery.findById(c.delivery._id)).status).toBe('PICKED_UP'); // undone
  });

  it("a brand cannot change another brand's delivery (404)", async () => {
    const c = await readyOrder();
    await expect(
      updateDeliveryStatus({ brandId: oid(), deliveryId: c.delivery._id, status: 'PICKED_UP', userId: oid() })
    ).rejects.toMatchObject({ status: 404 });
    expect((await Delivery.findById(c.delivery._id)).status).toBe('READY_FOR_PICKUP');
  });
});

describe('delivery details and access (real MongoDB)', () => {
  it('updates tracking info until the delivery is final', async () => {
    const c = await readyOrder();
    const updated = await updateDelivery({
      brandId: c.brand._id, deliveryId: c.delivery._id, trackingReference: 'TRK-9', assignedAgent: 'Ali',
    });
    expect(updated).toMatchObject({ trackingReference: 'TRK-9', assignedAgent: 'Ali' });

    await c.move('PICKED_UP');
    await c.move('OUT_FOR_DELIVERY');
    await c.move('DELIVERED');
    await expect(
      updateDelivery({ brandId: c.brand._id, deliveryId: c.delivery._id, assignedAgent: 'Bob' })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateDelivery({ brandId: oid(), deliveryId: c.delivery._id, assignedAgent: 'Bob' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('only the owning customer, owning brand or super admin can read a delivery', async () => {
    const c = await readyOrder();
    const id = c.delivery._id;

    expect(await getDeliveryForUser({ role: 'CUSTOMER', _id: c.user }, null, id)).toBeTruthy();
    expect(await getDeliveryForUser({ role: 'BRAND_ADMIN', _id: oid() }, c.brand._id, id)).toBeTruthy();
    expect(await getDeliveryForUser({ role: 'SUPER_ADMIN', _id: oid() }, null, id)).toBeTruthy();

    await expect(getDeliveryForUser({ role: 'CUSTOMER', _id: oid() }, null, id)).rejects.toMatchObject({ status: 404 });
    await expect(getDeliveryForUser({ role: 'BRAND_ADMIN', _id: oid() }, oid(), id)).rejects.toMatchObject({ status: 404 });
  });
});
