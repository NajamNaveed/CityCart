const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const Cart = require('../../src/models/cart.model');
const Order = require('../../src/models/order.model');
const Payment = require('../../src/models/payment.model');
const Counter = require('../../src/models/counter.model');
const { checkout, cancelMyOrder } = require('../../src/services/order.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const input = {
  shippingAddress: {
    fullName: 'John Doe',
    phone: '+923001234567',
    addressLine: 'Example Street',
    city: 'Lahore',
  },
  paymentMethod: 'COD',
};

async function makeBrand() {
  n += 1;
  return Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
}

async function makeProduct({ brand, stock = 10, price = 10, tracked = true } = {}) {
  n += 1;
  const b = brand || (await makeBrand());
  const product = await Product.create({
    brandId: b._id,
    categoryId: oid(),
    name: `P${n}`,
    slug: `p${n}`,
    sku: `SKU${n}`,
    price,
    status: 'ACTIVE',
    isActive: true,
  });
  if (stock !== null) {
    await Inventory.create({ productId: product._id, brandId: b._id, quantity: stock, trackInventory: tracked });
  }
  return product;
}

// Puts [product, qty] lines in a user's cart.
const fillCart = (userId, lines) =>
  Cart.create({
    userId,
    items: lines.map(([p, quantity]) => ({ productId: p._id, brandId: p.brandId, quantity })),
  });

const stockOf = async (p) => (await Inventory.findOne({ productId: p._id })).quantity;
const ok = (results) => results.filter((r) => r.status === 'fulfilled');
const bad = (results) => results.filter((r) => r.status === 'rejected');

beforeAll(async () => {
  await connect();
  await Promise.all(
    [Brand, Product, Inventory, Cart, Order, Payment, Counter].map((m) => m.init())
  );
});
afterAll(disconnect);
beforeEach(clearAll);

describe('checkout (real MongoDB transactions)', () => {
  it('multi-brand cart -> one order per brand, stock deducted, payments created, cart cleared', async () => {
    const user = oid();
    const a1 = await makeProduct({ price: 19.99, stock: 10 });
    const a2 = await makeProduct({ brand: await Brand.findById(a1.brandId), price: 5, stock: 10 });
    const b1 = await makeProduct({ price: 7.5, stock: 10 });
    await fillCart(user, [[a1, 3], [a2, 1], [b1, 2]]);

    const orders = await checkout(user, input);

    expect(orders).toHaveLength(2);
    const orderA = orders.find((o) => String(o.brandId) === String(a1.brandId));
    expect(orderA.items).toHaveLength(2);
    expect(orderA.subtotal).toBe(64.97);
    expect(orderA.total).toBe(64.97);
    expect(orders.find((o) => String(o.brandId) === String(b1.brandId)).total).toBe(15);
    expect(new Set(orders.map((o) => o.orderNumber)).size).toBe(2);
    orders.forEach((o) => expect(o.orderNumber).toMatch(/^CC-\d{4}-\d{6}$/));

    expect(await stockOf(a1)).toBe(7);
    expect(await stockOf(a2)).toBe(9);
    expect(await stockOf(b1)).toBe(8);

    const payments = await Payment.find({});
    expect(payments).toHaveLength(2);
    payments.forEach((p) => expect(p).toMatchObject({ method: 'COD', status: 'PENDING', currency: 'PKR' }));

    expect((await Cart.findOne({ userId: user })).items).toHaveLength(0);
  });

  it('ROLLS BACK everything when a late step fails (stock, orders, payments, cart)', async () => {
    const user = oid();
    const p1 = await makeProduct({ stock: 10 });
    const p2 = await makeProduct({ stock: 10 });
    await fillCart(user, [[p1, 2], [p2, 3]]);

    const spy = jest.spyOn(Payment, 'create').mockRejectedValueOnce(new Error('payment store down'));
    await expect(checkout(user, input)).rejects.toThrow('payment store down');
    spy.mockRestore();

    expect(await stockOf(p1)).toBe(10); // deductions undone
    expect(await stockOf(p2)).toBe(10);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);
    expect((await Cart.findOne({ userId: user })).items).toHaveLength(2); // cart intact
  });

  it('rejects the whole checkout when any line is unavailable, changing nothing', async () => {
    const user = oid();
    const good = await makeProduct({ stock: 10 });
    const scarce = await makeProduct({ stock: 1 });
    await fillCart(user, [[good, 2], [scarce, 5]]);

    await expect(checkout(user, input)).rejects.toMatchObject({ status: 409, extra: { code: 'CHECKOUT_ISSUES' } });

    expect(await stockOf(good)).toBe(10);
    expect(await stockOf(scarce)).toBe(1);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Cart.findOne({ userId: user })).items).toHaveLength(2);
  });

  it('400 for an empty cart', async () => {
    await expect(checkout(oid(), input)).rejects.toMatchObject({ status: 400 });
  });

  it('two customers racing for the LAST unit: exactly one order, stock never negative', async () => {
    const product = await makeProduct({ stock: 1 });
    const u1 = oid();
    const u2 = oid();
    await fillCart(u1, [[product, 1]]);
    await fillCart(u2, [[product, 1]]);

    const results = await Promise.allSettled([checkout(u1, input), checkout(u2, input)]);

    expect(ok(results)).toHaveLength(1);
    bad(results).forEach((r) => expect(r.reason.status).toBe(409));
    expect(await stockOf(product)).toBe(0);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('12 customers x 1 unit against stock of 5: exactly 5 succeed, stock ends at 0', async () => {
    const product = await makeProduct({ stock: 5 });
    const users = Array.from({ length: 12 }, () => oid());
    await Promise.all(users.map((u) => fillCart(u, [[product, 1]])));

    const results = await Promise.allSettled(users.map((u) => checkout(u, input)));

    expect(ok(results)).toHaveLength(5);
    expect(await stockOf(product)).toBe(0);
    expect(await Order.countDocuments()).toBe(5);
    expect(await Payment.countDocuments()).toBe(5);
  });

  it('the same customer double-submitting concurrently creates ONE order and deducts once', async () => {
    const user = oid();
    const product = await makeProduct({ stock: 10 });
    await fillCart(user, [[product, 2]]);

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => checkout(user, input)));

    expect(ok(results)).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(product)).toBe(8);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it('concurrent checkouts get unique order numbers', async () => {
    const product = await makeProduct({ stock: 100 });
    const users = Array.from({ length: 10 }, () => oid());
    await Promise.all(users.map((u) => fillCart(u, [[product, 1]])));

    const results = await Promise.allSettled(users.map((u) => checkout(u, input)));

    expect(ok(results)).toHaveLength(10);
    const numbers = (await Order.find({})).map((o) => o.orderNumber);
    expect(new Set(numbers).size).toBe(10);
  });

  it('untracked products are ordered without touching stock', async () => {
    const user = oid();
    const product = await makeProduct({ stock: 0, tracked: false });
    await fillCart(user, [[product, 3]]);

    const orders = await checkout(user, input);

    expect(orders).toHaveLength(1);
    expect(await stockOf(product)).toBe(0);
  });
});

describe('cancel (real MongoDB transactions)', () => {
  async function placed(stock = 10, qty = 4) {
    const user = oid();
    const product = await makeProduct({ stock });
    await fillCart(user, [[product, qty]]);
    const [order] = await checkout(user, input);
    return { user, product, order };
  }

  it('cancels a PENDING order, restocks, and cancels the payment', async () => {
    const { user, product, order } = await placed(10, 4);
    expect(await stockOf(product)).toBe(6);

    const cancelled = await cancelMyOrder(user, order._id);

    expect(cancelled.orderStatus).toBe('CANCELLED');
    expect(await stockOf(product)).toBe(10);
    expect((await Payment.findOne({ orderId: order._id })).status).toBe('CANCELLED');
  });

  it('5 concurrent cancels restock EXACTLY once', async () => {
    const { user, product, order } = await placed(10, 4);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => cancelMyOrder(user, order._id))
    );

    expect(ok(results)).toHaveLength(1);
    bad(results).forEach((r) => expect(r.reason.status).toBe(409));
    expect(await stockOf(product)).toBe(10); // not 14, 18, ...
  });

  it('cannot cancel a non-PENDING order, and stock is untouched', async () => {
    const { user, product, order } = await placed(10, 4);
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: 'SHIPPED' } });

    await expect(cancelMyOrder(user, order._id)).rejects.toMatchObject({ status: 409 });
    expect(await stockOf(product)).toBe(6);
  });

  it("cannot cancel another customer's order (404)", async () => {
    const { product, order } = await placed(10, 4);
    await expect(cancelMyOrder(oid(), order._id)).rejects.toMatchObject({ status: 404 });
    expect(await stockOf(product)).toBe(6);
  });
});
