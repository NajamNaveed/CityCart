/**
 * Picking (docs/22 §E) against a real MongoDB: the queue and the picker's
 * order stay inside the brand and carry no money or customer contact details;
 * one picker at a time takes an order; short lines become a customer proposal
 * that says a picker suggested it; packing creates the rider's delivery once.
 */
const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Order = require('../../src/models/order.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const OrderAdjustment = require('../../src/models/orderAdjustment.model');
const Payment = require('../../src/models/payment.model');
const Delivery = require('../../src/models/delivery.model');
const {
  listQueue,
  getPickerOrder,
  claimOrder,
  setLinePick,
  proposeFromPicking,
  packOrder,
  searchProducts,
} = require('../../src/services/picker.service');
const { respondToAdjustment } = require('../../src/services/orderAdjustment.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const line = (overrides = {}) => ({
  _id: oid(),
  productId: oid(),
  productName: 'Printed lawn suit',
  sku: 'LS-1',
  quantity: 2,
  unitPrice: 1200,
  totalPrice: 2400,
  image: 'https://images.example/suit.jpg',
  ...overrides,
});

async function makeOrder({ brandId = oid(), status = 'CONFIRMED', items, pickerId = null, activeAdjustmentId = null } = {}) {
  n += 1;
  const lines = items || [line()];
  const subtotal = lines.reduce((sum, item) => sum + item.totalPrice, 0);
  const chain = {
    PENDING: ['PENDING'],
    CONFIRMED: ['PENDING', 'CONFIRMED'],
    PROCESSING: ['PENDING', 'CONFIRMED', 'PROCESSING'],
    READY_FOR_SHIPMENT: ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT'],
  }[status] || [status];
  const order = await Order.create({
    orderNumber: `CC-2026-${String(n).padStart(6, '0')}`,
    customerId: oid(),
    brandId,
    items: lines,
    // A phone and an address the picker must never see.
    shippingAddress: { name: 'Sana Iqbal', phone: '+92 300 1112223', address: 'House 5, Street 2', city: 'Faisalabad' },
    subtotal,
    deliveryFee: 250,
    discount: 0,
    tax: 0,
    total: subtotal + 250,
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: status,
    statusHistory: chain.map((s) => ({ status: s, by: oid(), at: new Date() })),
    ...(pickerId && { pickerId, pickStartedAt: new Date() }),
    ...(activeAdjustmentId && { activeAdjustmentId }),
  });
  await Payment.create({ orderId: order._id, customerId: order.customerId, amount: order.total, method: 'COD', status: 'PENDING' });
  return order;
}

async function claimedOrder(options = {}) {
  const brandId = options.brandId || oid();
  const pickerId = options.pickerId || oid();
  const order = await makeOrder({ ...options, brandId, status: 'CONFIRMED' });
  await claimOrder({ brandId, pickerId, orderId: order._id });
  return { brandId, pickerId, order: await Order.findById(order._id) };
}

beforeAll(async () => {
  await connect();
  await Promise.all([Order, Product, Inventory, OrderAdjustment, Payment, Delivery].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('the pick queue', () => {
  it('shows the brand’s accepted work only, and never a price or contact detail', async () => {
    const brandA = oid();
    const brandB = oid();
    const picker = oid();
    const otherPicker = oid();

    const accepted = await makeOrder({ brandId: brandA, status: 'CONFIRMED' });
    const started = await makeOrder({ brandId: brandA, status: 'PROCESSING' });
    const mine = await makeOrder({ brandId: brandA, status: 'PROCESSING', pickerId: picker });
    await makeOrder({ brandId: brandB, status: 'CONFIRMED' });
    await makeOrder({ brandId: brandA, status: 'PROCESSING', pickerId: otherPicker });
    await makeOrder({ brandId: brandA, status: 'PENDING' });
    await makeOrder({ brandId: brandA, status: 'CONFIRMED', activeAdjustmentId: oid() });

    const { items } = await listQueue(brandA, picker);
    expect(items.map((o) => String(o._id)).sort()).toEqual([accepted, started, mine].map((o) => String(o._id)).sort());
    expect(items.find((o) => String(o._id) === String(accepted._id))).toMatchObject({ customerFirstName: 'Sana', claimedByMe: false });
    expect(items.find((o) => String(o._id) === String(mine._id))).toMatchObject({ claimedByMe: true });

    const json = JSON.stringify(items);
    expect(json).not.toContain('+92 300');
    expect(json).not.toContain('unitPrice');
    expect(json).not.toContain('total');
    expect(json).not.toContain('shippingAddress');
  });

  it('keeps its own waiting order in the queue, but hides an unclaimed one', async () => {
    const brandId = oid();
    const picker = oid();
    const mine = await makeOrder({ brandId, status: 'PROCESSING', pickerId: picker, activeAdjustmentId: oid() });
    await makeOrder({ brandId, status: 'CONFIRMED', activeAdjustmentId: oid() });

    const { items } = await listQueue(brandId, picker);
    expect(items).toHaveLength(1);
    expect(String(items[0]._id)).toBe(String(mine._id));
    expect(items[0].waitingForCustomer).toBe(true);
  });
});

describe('one order to pick', () => {
  it('is never another brand’s or another picker’s to see', async () => {
    const brandA = oid();
    const brandB = oid();
    const pickerA = oid();
    const pickerB = oid();
    const otherBrand = await makeOrder({ brandId: brandB, status: 'CONFIRMED' });
    const otherPicker = await makeOrder({ brandId: brandA, status: 'PROCESSING', pickerId: pickerB });

    await expect(getPickerOrder({ brandId: brandA, pickerId: pickerA, orderId: otherBrand._id })).rejects.toMatchObject({ status: 404 });
    await expect(getPickerOrder({ brandId: brandA, pickerId: pickerA, orderId: otherPicker._id })).rejects.toMatchObject({ status: 404 });
    await expect(getPickerOrder({ brandId: brandA, pickerId: pickerB, orderId: otherPicker._id })).resolves.toMatchObject({ claimedByMe: true });
  });

  it('carries names, quantities and pick state, but no phone, address or money', async () => {
    const order = await makeOrder({ brandId: oid(), status: 'CONFIRMED' });
    const view = await getPickerOrder({ brandId: order.brandId, pickerId: oid(), orderId: order._id });

    expect(view.customerFirstName).toBe('Sana');
    expect(view.items[0]).toMatchObject({ productName: 'Printed lawn suit', quantity: 2, pickStatus: null, pickedQty: null });
    expect(view).not.toHaveProperty('shippingAddress');
    expect(view).not.toHaveProperty('total');
    expect(view.items[0]).not.toHaveProperty('unitPrice');
    expect(view.items[0]).not.toHaveProperty('totalPrice');
    const json = JSON.stringify(view);
    expect(json).not.toContain('+92 300');
    expect(json).not.toContain('House 5');
  });
});

describe('claiming', () => {
  it('moves CONFIRMED to PROCESSING, starts the clock and is safe to repeat', async () => {
    const brandId = oid();
    const pickerId = oid();
    const order = await makeOrder({ brandId, status: 'CONFIRMED' });

    const claimed = await claimOrder({ brandId, pickerId, orderId: order._id });
    expect(claimed.orderStatus).toBe('PROCESSING');
    expect(claimed.claimedByMe).toBe(true);
    expect(claimed.pickStartedAt).toBeTruthy();

    const again = await claimOrder({ brandId, pickerId, orderId: order._id });
    expect(again.claimedByMe).toBe(true);

    const stored = await Order.findById(order._id);
    expect(stored.statusHistory.filter((h) => h.status === 'PROCESSING')).toHaveLength(1);
  });

  it('lets exactly one of two pickers take the order', async () => {
    const brandId = oid();
    const first = oid();
    const second = oid();
    const order = await makeOrder({ brandId, status: 'CONFIRMED' });

    const results = await Promise.allSettled([
      claimOrder({ brandId, pickerId: first, orderId: order._id }),
      claimOrder({ brandId, pickerId: second, orderId: order._id }),
    ]);

    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason.status).toBe(409);
    expect(losers[0].reason.extra.code).toBe('PICK_TAKEN');

    const stored = await Order.findById(order._id);
    expect([String(first), String(second)]).toContain(String(stored.pickerId));
  });

  it('refuses an order whose change proposal is waiting', async () => {
    const order = await makeOrder({ brandId: oid(), status: 'CONFIRMED', activeAdjustmentId: oid() });
    await expect(claimOrder({ brandId: order.brandId, pickerId: oid(), orderId: order._id })).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ADJUSTMENT_PENDING' },
    });
  });
});

describe('marking lines', () => {
  it('means the whole quantity when picked, records a short count, and zero when unavailable', async () => {
    const { brandId, pickerId, order } = await claimedOrder({ items: [line({ quantity: 3, totalPrice: 3600 })] });
    const itemId = String(order.items[0]._id);

    let view = await setLinePick({ brandId, pickerId, orderId: order._id, itemId, pickStatus: 'PICKED' });
    expect(view.items[0]).toMatchObject({ pickStatus: 'PICKED', pickedQty: 3 });

    view = await setLinePick({ brandId, pickerId, orderId: order._id, itemId, pickStatus: 'SHORT', pickedQty: 2 });
    expect(view.items[0]).toMatchObject({ pickStatus: 'SHORT', pickedQty: 2 });

    view = await setLinePick({ brandId, pickerId, orderId: order._id, itemId, pickStatus: 'UNAVAILABLE' });
    expect(view.items[0]).toMatchObject({ pickStatus: 'UNAVAILABLE', pickedQty: 0 });
  });

  it('refuses a short count that is not below the ordered quantity', async () => {
    const { brandId, pickerId, order } = await claimedOrder({ items: [line({ quantity: 2 })] });
    const itemId = String(order.items[0]._id);

    await expect(setLinePick({ brandId, pickerId, orderId: order._id, itemId, pickStatus: 'SHORT', pickedQty: 2 })).rejects.toMatchObject({
      status: 400,
      extra: { code: 'INVALID_PICKED_QUANTITY' },
    });
    await expect(setLinePick({ brandId, pickerId, orderId: order._id, itemId, pickStatus: 'SHORT' })).rejects.toMatchObject({ status: 400 });
  });

  it('needs a claim, and refuses another brand or another picker', async () => {
    const brandId = oid();
    const choose = oid();
    const wait = await makeOrder({ brandId, status: 'CONFIRMED' });
    const itemId = String(wait.items[0]._id);
    await expect(
      setLinePick({ brandId, pickerId: choose, orderId: wait._id, itemId, pickStatus: 'PICKED' })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'CLAIM_REQUIRED' } });

    await claimOrder({ brandId, pickerId: choose, orderId: wait._id });
    await expect(
      setLinePick({ brandId, pickerId: oid(), orderId: wait._id, itemId, pickStatus: 'PICKED' })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      setLinePick({ brandId: oid(), pickerId: choose, orderId: wait._id, itemId, pickStatus: 'PICKED' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('a short line becomes a customer proposal', () => {
  async function shortOrderWithSubstitute() {
    const brandId = oid();
    const pickerId = oid();
    const substitute = await Product.create({
      brandId,
      catalogProductId: oid(),
      categoryId: oid(),
      name: 'Embroidered lawn suit',
      slug: 'embroidered-lawn-suit',
      sku: 'LS-9',
      price: 1500,
      status: 'ACTIVE',
      isActive: true,
      images: ['https://images.example/sub.jpg'],
    });
    await Inventory.create({ brandId, productId: substitute._id, quantity: 5 });

    const order = await makeOrder({
      brandId,
      status: 'CONFIRMED',
      items: [line({ quantity: 2 }), line({ quantity: 1, productName: 'Silk scarf', sku: 'SC-2', unitPrice: 900, totalPrice: 900 })],
    });
    await claimOrder({ brandId, pickerId, orderId: order._id });
    const [first, second] = (await Order.findById(order._id)).items;
    await setLinePick({ brandId, pickerId, orderId: order._id, itemId: String(first._id), pickStatus: 'SHORT', pickedQty: 1 });
    await setLinePick({ brandId, pickerId, orderId: order._id, itemId: String(second._id), pickStatus: 'PICKED' });

    return { brandId, pickerId, order, first, substitute };
  }

  it('says a picker suggested it, and freezes the order until the customer answers', async () => {
    const { brandId, pickerId, order, first, substitute } = await shortOrderWithSubstitute();

    const adjustment = await proposeFromPicking({
      brandId,
      pickerId,
      orderId: order._id,
      note: 'Only one suit was on the shelf. I can send a similar one instead.',
      substitutes: [{ orderItemId: String(first._id), productId: substitute._id, quantity: 1 }],
    });

    expect(adjustment.status).toBe('PROPOSED');
    expect(adjustment.proposedByRole).toBe('PICKER');
    expect(String(adjustment.proposedBy)).toBe(String(pickerId));
    const hours = (adjustment.expiresAt.getTime() - adjustment.createdAt.getTime()) / 3600000;
    expect(hours).toBeGreaterThan(23.99);
    expect(hours).toBeLessThanOrEqual(24);

    const stored = await Order.findById(order._id);
    expect(String(stored.activeAdjustmentId)).toBe(String(adjustment._id));
    expect((await Inventory.findOne({ productId: substitute._id })).reservedQuantity).toBe(1);

    await expect(
      setLinePick({ brandId, pickerId, orderId: order._id, itemId: String(first._id), pickStatus: 'PICKED' })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'ADJUSTMENT_PENDING' } });
    await expect(packOrder({ brandId, pickerId, orderId: order._id })).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ADJUSTMENT_PENDING' },
    });
  });

  it('after the customer accepts, packs once and creates one ready-for-pickup delivery', async () => {
    const { brandId, pickerId, order, first, substitute } = await shortOrderWithSubstitute();
    const adjustment = await proposeFromPicking({
      brandId,
      pickerId,
      orderId: order._id,
      note: 'Only one suit was on the shelf. I can send a similar one instead.',
      substitutes: [{ orderItemId: String(first._id), productId: substitute._id, quantity: 1 }],
    });

    await respondToAdjustment({
      customerId: order.customerId,
      orderId: order._id,
      adjustmentId: adjustment._id,
      action: 'ACCEPT',
      userId: order.customerId,
    });

    const answering = await Order.findById(order._id);
    expect(answering.activeAdjustmentId).toBeNull();
    expect(answering.orderStatus).toBe('PROCESSING');
    expect(answering.items).toHaveLength(3); // one remaining suit + one substitute + the scarf
    expect(answering.items.every((item) => item.pickStatus === 'PICKED' && item.pickedQty === item.quantity)).toBe(true);

    const packed = await packOrder({ brandId, pickerId, orderId: order._id });
    expect(packed.orderStatus).toBe('READY_FOR_SHIPMENT');
    expect(packed.packedAt).toBeTruthy();
    expect(await Delivery.countDocuments({ orderId: order._id })).toBe(1);
    expect((await Delivery.findOne({ orderId: order._id })).status).toBe('READY_FOR_PICKUP');

    await expect(packOrder({ brandId, pickerId, orderId: order._id })).rejects.toMatchObject({ status: 409 });
    expect(await Delivery.countDocuments({ orderId: order._id })).toBe(1);
  });

  it('refuses a proposal when every line is picked in full', async () => {
    const { brandId, pickerId, order } = await claimedOrder();
    for (const item of order.items) {
      await setLinePick({ brandId, pickerId, orderId: order._id, itemId: String(item._id), pickStatus: 'PICKED' });
    }
    await expect(
      proposeFromPicking({ brandId, pickerId, orderId: order._id, note: 'Nothing is missing at all.' })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'NOTHING_TO_PROPOSE' } });
  });
});

describe('packing', () => {
  it('will not pack while a line has not been checked, and creates no delivery', async () => {
    const { brandId, pickerId, order } = await claimedOrder({
      items: [line({ quantity: 1 }), line({ quantity: 1, productName: 'Silk scarf', sku: 'SC-2' })],
    });
    await setLinePick({ brandId, pickerId, orderId: order._id, itemId: String(order.items[0]._id), pickStatus: 'PICKED' });

    await expect(packOrder({ brandId, pickerId, orderId: order._id })).rejects.toMatchObject({
      status: 409,
      extra: { code: 'PICKING_INCOMPLETE' },
    });
    expect(await Delivery.countDocuments({ orderId: order._id })).toBe(0);
  });

  it('is only for the picker holding the order', async () => {
    const { brandId, order } = await claimedOrder();
    await expect(packOrder({ brandId, pickerId: oid(), orderId: order._id })).rejects.toMatchObject({ status: 409 });
    await expect(packOrder({ brandId: oid(), pickerId: oid(), orderId: order._id })).rejects.toMatchObject({ status: 404 });
  });
});

describe('substitute search', () => {
  it('offers only this brand’s active listings, and no prices', async () => {
    const brandA = oid();
    const brandB = oid();
    const make = (brandId, name, status = 'ACTIVE') =>
      Product.create({ brandId, catalogProductId: oid(), categoryId: oid(), name, slug: name.toLowerCase().replace(/\W+/g, '-'), sku: name.slice(0, 3), price: 900, status, isActive: status === 'ACTIVE' });

    const mine = await make(brandA, 'Embroidered lawn suit');
    await make(brandA, 'Archived suit', 'ARCHIVED');
    await make(brandB, 'Other brand suit');

    const { items } = await searchProducts(brandA, { q: 'suit' });
    expect(items.map((p) => String(p._id))).toEqual([String(mine._id)]);
    expect(items[0].name).toBe('Embroidered lawn suit');
    expect(items[0]).not.toHaveProperty('price');
  });

  it('treats a typed search as text, not as a pattern', async () => {
    const brandId = oid();
    await Product.create({ brandId, catalogProductId: oid(), categoryId: oid(), name: 'Suit (new)', slug: 'suit-new', sku: 'S1', price: 900, status: 'ACTIVE', isActive: true });
    await Product.create({ brandId, catalogProductId: oid(), categoryId: oid(), name: 'Suit plain', slug: 'suit-plain', sku: 'S2', price: 900, status: 'ACTIVE', isActive: true });

    const { items } = await searchProducts(brandId, { q: '(new)' });
    expect(items.map((p) => p.name)).toEqual(['Suit (new)']);
  });
});
