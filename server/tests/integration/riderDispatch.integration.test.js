/**
 * Automatic rider dispatch (docs/11 §11a) against a real MongoDB: a freshly
 * packed order goes to the brand's active rider with the fewest deliveries in
 * progress (ties to whoever was idle longest). Riders of another brand and
 * inactive riders are never chosen, and a rider a brand admin already picked is
 * never replaced.
 */
const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const Order = require('../../src/models/order.model');
const Delivery = require('../../src/models/delivery.model');
const Notification = require('../../src/models/notification.model');
const { dispatchRiderForOrder } = require('../../src/services/delivery.service');
const { updateBrandOrderStatus } = require('../../src/services/brandOrder.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const address = { name: 'Sana Iqbal', phone: '+923001112223', address: 'House 5, Street 2', city: 'Faisalabad' };

const makeBrand = () => {
  n += 1;
  return Brand.create({ name: `Brand${n}`, slug: `brand${n}`, cityId: oid(), status: 'ACTIVE' });
};

const makeRider = (brandId, { isActive = true } = {}) => {
  n += 1;
  return User.create({
    name: `Rider ${n}`,
    email: `rider${n}@x.com`,
    passwordHash: 'x',
    role: 'RIDER',
    brandId,
    isActive,
  });
};

async function makeOrder(brandId, status = 'READY_FOR_SHIPMENT') {
  n += 1;
  return Order.create({
    orderNumber: `CC-2026-${String(n).padStart(6, '0')}`,
    customerId: oid(),
    brandId,
    items: [{ productId: oid(), productName: 'Printed lawn suit', quantity: 1, unitPrice: 100, totalPrice: 100 }],
    shippingAddress: address,
    subtotal: 100,
    deliveryFee: 0,
    discount: 0,
    tax: 0,
    total: 100,
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: status,
  });
}

async function makeDelivery({ brandId, riderId, status = 'READY_FOR_PICKUP', assignedAt, order }) {
  const ownOrder = order || (await makeOrder(brandId));
  return Delivery.create({
    orderId: ownOrder._id,
    brandId,
    customerId: ownOrder.customerId,
    status,
    address,
    deliveryFee: 0,
    ...(riderId && { riderId, assignedAgent: 'Rider', assignedAt: assignedAt || new Date() }),
  });
}

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, User, Order, Delivery, Notification].map((model) => model.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('automatic rider dispatch', () => {
  it('gives a new delivery to the least-busy active rider in the same brand', async () => {
    const brand = await makeBrand();
    const otherBrand = await makeBrand();
    const busy = await makeRider(brand._id);
    const free = await makeRider(brand._id);
    const inactive = await makeRider(brand._id, { isActive: false });
    const foreign = await makeRider(otherBrand._id);

    await makeDelivery({ brandId: brand._id, riderId: busy._id });
    await makeDelivery({ brandId: brand._id, riderId: busy._id, status: 'OUT_FOR_DELIVERY' });
    await makeDelivery({ brandId: otherBrand._id, riderId: foreign._id });

    const order = await makeOrder(brand._id);
    await makeDelivery({ brandId: brand._id, order });

    const assigned = await dispatchRiderForOrder({ brandId: brand._id, orderId: order._id });

    expect(String(assigned.riderId)).toBe(String(free._id));
    expect(assigned.assignedAgent).toBe(free.name);
    expect(assigned.assignedAt).toBeTruthy();
    expect(await Notification.countDocuments({ userId: free._id, type: 'DELIVERY_ASSIGNED' })).toBe(1);
    expect(await Notification.countDocuments({ userId: busy._id, type: 'DELIVERY_ASSIGNED' })).toBe(0);
    expect(await Notification.countDocuments({ userId: inactive._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: foreign._id })).toBe(0);
  });

  it('breaks a tie in favour of the rider who has gone longest without a job', async () => {
    const brand = await makeBrand();
    const recent = await makeRider(brand._id);
    const idle = await makeRider(brand._id);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await makeDelivery({ brandId: brand._id, riderId: recent._id, status: 'PICKED_UP', assignedAt: new Date() });
    await makeDelivery({ brandId: brand._id, riderId: idle._id, status: 'PICKED_UP', assignedAt: hourAgo });

    const order = await makeOrder(brand._id);
    await makeDelivery({ brandId: brand._id, order });

    const assigned = await dispatchRiderForOrder({ brandId: brand._id, orderId: order._id });
    expect(String(assigned.riderId)).toBe(String(idle._id));
  });

  it('does not count finished deliveries against a rider', async () => {
    const brand = await makeBrand();
    // If delivered/returned deliveries counted as load, `done` would look
    // busier than the rider with one live delivery and would never be chosen.
    const done = await makeRider(brand._id);
    const oneOpen = await makeRider(brand._id);

    await makeDelivery({ brandId: brand._id, riderId: done._id, status: 'DELIVERED' });
    await makeDelivery({ brandId: brand._id, riderId: done._id, status: 'RETURNED' });
    await makeDelivery({ brandId: brand._id, riderId: oneOpen._id, status: 'OUT_FOR_DELIVERY' });

    const order = await makeOrder(brand._id);
    await makeDelivery({ brandId: brand._id, order });

    const assigned = await dispatchRiderForOrder({ brandId: brand._id, orderId: order._id });
    expect(String(assigned.riderId)).toBe(String(done._id));
  });

  it('never replaces a rider the brand already chose', async () => {
    const brand = await makeBrand();
    const chosen = await makeRider(brand._id);
    const free = await makeRider(brand._id);
    const order = await makeOrder(brand._id);
    await makeDelivery({ brandId: brand._id, order, riderId: chosen._id });

    expect(await dispatchRiderForOrder({ brandId: brand._id, orderId: order._id })).toBeNull();

    const stored = await Delivery.findOne({ orderId: order._id });
    expect(String(stored.riderId)).toBe(String(chosen._id));
    expect(await Notification.countDocuments({ userId: free._id })).toBe(0);
  });

  it('leaves the delivery for manual assignment when the brand has no active rider', async () => {
    const brand = await makeBrand();
    await makeRider(brand._id, { isActive: false });
    const order = await makeOrder(brand._id);
    await makeDelivery({ brandId: brand._id, order });

    expect(await dispatchRiderForOrder({ brandId: brand._id, orderId: order._id })).toBeNull();
    expect((await Delivery.findOne({ orderId: order._id })).riderId).toBeUndefined();
  });

  it('dispatches when a brand admin moves an order to READY_FOR_SHIPMENT', async () => {
    const brand = await makeBrand();
    const rider = await makeRider(brand._id);
    const order = await makeOrder(brand._id, 'PROCESSING');

    await updateBrandOrderStatus({ brandId: brand._id, orderId: order._id, status: 'READY_FOR_SHIPMENT', userId: oid() });

    const delivery = await Delivery.findOne({ orderId: order._id });
    expect(delivery).toBeTruthy();
    expect(String(delivery.riderId)).toBe(String(rider._id));
  });
});
