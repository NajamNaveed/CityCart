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
const Return = require('../../src/models/return.model');
const InventoryMovement = require('../../src/models/inventoryMovement.model');
const { checkout } = require('../../src/services/order.service');
const { updateBrandOrderStatus } = require('../../src/services/brandOrder.service');
const { updateDeliveryStatus } = require('../../src/services/delivery.service');
const { receiveReturn } = require('../../src/services/return.service');
const { ROLES } = require('../../src/config/roles');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const input = {
  shippingAddress: {
    fullName: 'John Doe', phone: '+923001234567', addressLine: 'Street 1', city: 'Lahore', state: 'Punjab', country: 'Pakistan',
  },
  paymentMethod: 'COD',
};

// One product of quantity 2, price 25, no delivery fee: total 50, checkout
// deducts 2 units from the 10 in stock.
async function outForDelivery() {
  n += 1;
  const brand = await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
  const product = await Product.create({
    brandId: brand._id, catalogProductId: oid(), categoryId: oid(), name: `P${n}`, slug: `p${n}`, sku: `S${n}`,
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
  await move('PICKED_UP');
  await move('OUT_FOR_DELIVERY');
  const reloaded = await Delivery.findById(delivery._id);
  return { brand, product, user, order, delivery: reloaded, staff, move };
}

const reloadOrder = (c) => Order.findById(c.order._id);
const reloadDelivery = (c) => Delivery.findById(c.delivery._id);
const reloadReturn = (c) => Return.findOne({ deliveryId: c.delivery._id });
const stockOf = (c) => Inventory.findOne({ productId: c.product._id });

beforeAll(async () => {
  await connect();
  await Promise.all(
    [Brand, Product, Inventory, Cart, Order, Payment, Counter, Delivery, Return, InventoryMovement].map((m) => m.init())
  );
});
afterAll(disconnect);
beforeEach(clearAll);

describe('door returns (real MongoDB)', () => {
  it('the half-and-half order: final totals, accepted-only payment, and no stock put back yet', async () => {
    const c = await outForDelivery();
    const item = c.order.items[0];

    const completed = await c.move('DELIVERED', {
      lines: [{ itemId: String(item._id), acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED' }],
    });

    expect(completed.status).toBe('DELIVERED');
    const order = await reloadOrder(c);
    expect(order).toMatchObject({ orderStatus: 'DELIVERED', fulfilment: 'PARTIAL', returnedAmount: 25, netTotal: 25, feeRefunded: false });

    const payment = await Payment.findOne({ orderId: c.order._id });
    expect(payment).toMatchObject({ status: 'PAID', amount: 25 });

    const ret = await reloadReturn(c);
    expect(ret).toMatchObject({ status: 'IN_TRANSIT', source: 'DOOR', returnedSubtotal: 25, refundAmount: 0 });
    expect(ret.lines).toHaveLength(1);
    expect(ret.lines[0]).toMatchObject({ quantity: 1, reason: 'DAMAGED', unitPrice: 25 });

    // The goods come back with the rider; they are only restocked when the store says so.
    expect((await stockOf(c)).quantity).toBe(8);
    expect(await InventoryMovement.countDocuments({ orderId: c.order._id, reason: 'RETURN_RESTOCKED' })).toBe(0);
  });

  it('the store receives the goods: restock once, then the second receive is refused', async () => {
    const c = await outForDelivery();
    const item = c.order.items[0];
    await c.move('DELIVERED', { lines: [{ itemId: String(item._id), acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED' }] });
    const ret = await reloadReturn(c);

    const user = { _id: c.staff, role: ROLES.BRAND_ADMIN };
    const received = await receiveReturn({
      user,
      tenantBrandId: String(c.brand._id),
      returnId: ret._id,
      decisions: [{ index: 0, restock: true }],
    });

    expect(received).toMatchObject({ status: 'RECEIVED' });
    expect(received.lines[0]).toMatchObject({ restock: true });
    expect((await stockOf(c)).quantity).toBe(9);

    const movements = await InventoryMovement.find({ orderId: c.order._id, reason: 'RETURN_RESTOCKED' });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantityChange: 1, by: c.staff });

    await expect(
      receiveReturn({ user, tenantBrandId: String(c.brand._id), returnId: ret._id, decisions: [{ index: 0, restock: true }] })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'RETURN_ALREADY_RECEIVED' } });
    expect((await stockOf(c)).quantity).toBe(9);
  });

  it('write-off by default: receiving puts nothing back', async () => {
    const c = await outForDelivery();
    const item = c.order.items[0];
    await c.move('DELIVERED', { lines: [{ itemId: String(item._id), acceptedQty: 0, rejectedQty: 2, reason: 'DAMAGED' }] });
    const ret = await reloadReturn(c);

    await receiveReturn({
      user: { _id: c.staff, role: ROLES.BRAND_ADMIN },
      tenantBrandId: String(c.brand._id),
      returnId: ret._id,
    });

    expect((await stockOf(c)).quantity).toBe(8);
    expect(await InventoryMovement.countDocuments({ orderId: c.order._id, reason: 'RETURN_RESTOCKED' })).toBe(0);
  });

  it('a full store-fault rejection ends the order RETURNED, cancels the unpaid COD, and refreshes nothing until received', async () => {
    const c = await outForDelivery();
    const item = c.order.items[0];

    const completed = await c.move('DELIVERED', {
      lines: [{ itemId: String(item._id), acceptedQty: 0, rejectedQty: 2, reason: 'WRONG_ITEM' }],
    });

    expect(completed.status).toBe('RETURNED');
    const order = await reloadOrder(c);
    expect(order).toMatchObject({ orderStatus: 'RETURNED', fulfilment: 'NONE', returnedAmount: 50, netTotal: 0, paymentStatus: 'CANCELLED' });
    const payment = await Payment.findOne({ orderId: c.order._id });
    expect(payment.status).toBe('CANCELLED');
    expect((await reloadDelivery(c)).status).toBe('RETURNED');

    const ret = await reloadReturn(c);
    await receiveReturn({
      user: { _id: c.staff, role: ROLES.BRAND_ADMIN },
      tenantBrandId: String(c.brand._id),
      returnId: ret._id,
      decisions: [{ index: 0, restock: true }],
    });
    expect((await stockOf(c)).quantity).toBe(10);
  });

  it('refuses a line that returns more than was ordered and leaves the delivery untouched', async () => {
    const c = await outForDelivery();
    const item = c.order.items[0];

    await expect(
      c.move('DELIVERED', { lines: [{ itemId: String(item._id), acceptedQty: 0, rejectedQty: 3, reason: 'DAMAGED' }] })
    ).rejects.toMatchObject({ status: 400, extra: { code: 'INVALID_RETURN_QUANTITY' } });

    expect((await reloadDelivery(c)).status).toBe('OUT_FOR_DELIVERY');
    expect(await Return.countDocuments({})).toBe(0);
    expect((await stockOf(c)).quantity).toBe(8);
  });
});
