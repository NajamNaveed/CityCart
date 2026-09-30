const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Cart = require('../../src/models/cart.model');
const Brand = require('../../src/models/brand.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const { addItem, updateItem, removeItem, clearCart, getCartView } = require('../../src/services/cart.service');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

async function makeProduct({ stock = 100, price = 10, brand } = {}) {
  n += 1;
  const b = brand || (await Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' }));
  const p = await Product.create({
    brandId: b._id,
    categoryId: oid(),
    name: `P${n}`,
    slug: `p${n}`,
    price,
    sku: `SKU${n}`,
    status: 'ACTIVE',
    isActive: true,
  });
  if (stock !== null) {
    await Inventory.create({ productId: p._id, brandId: b._id, quantity: stock });
  }
  return { product: p, brand: b };
}

const rawCart = (userId) => Cart.findOne({ userId });

beforeAll(async () => {
  await connect();
  await Promise.all([Cart.init(), Inventory.init(), Product.init(), Brand.init()]);
});
afterAll(disconnect);
beforeEach(clearAll);

describe('cart (real MongoDB)', () => {
  it('concurrent first adds of the SAME product create one line with the right total', async () => {
    const userId = oid();
    const { product } = await makeProduct();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => addItem(userId, { productId: product._id, quantity: 2 }))
    );

    const cart = await rawCart(userId);
    expect(cart.items).toHaveLength(1); // never duplicate lines
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(cart.items[0].quantity).toBe(succeeded * 2); // no lost or phantom increments
    expect(succeeded).toBeGreaterThan(0);
  });

  it('concurrent adds of DIFFERENT products all land', async () => {
    const userId = oid();
    const made = await Promise.all(Array.from({ length: 6 }, () => makeProduct()));

    const results = await Promise.allSettled(
      made.map(({ product }) => addItem(userId, { productId: product._id, quantity: 1 }))
    );

    const cart = await rawCart(userId);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(cart.items).toHaveLength(succeeded);
    expect(new Set(cart.items.map((i) => String(i.productId))).size).toBe(cart.items.length);
  });

  it('enforces the 99-per-product cap atomically under concurrency', async () => {
    const userId = oid();
    const { product } = await makeProduct({ stock: 1000 });

    await Promise.allSettled(
      Array.from({ length: 8 }, () => addItem(userId, { productId: product._id, quantity: 20 }))
    );

    expect((await rawCart(userId)).items[0].quantity).toBeLessThanOrEqual(99);
  });

  it('brandId is taken from the product, and price/name come from the database', async () => {
    const userId = oid();
    const { product, brand } = await makeProduct({ price: 19.99 });

    const view = await addItem(userId, { productId: product._id, quantity: 3 });

    expect(String((await rawCart(userId)).items[0].brandId)).toBe(String(brand._id));
    expect(view.groups[0].items[0]).toMatchObject({ unitPrice: 19.99, lineTotal: 59.97 });
    expect(view.subtotal).toBe(59.97);
  });

  it('groups a multi-brand cart and totals each brand separately', async () => {
    const userId = oid();
    const a = await makeProduct({ price: 5 });
    const b = await makeProduct({ price: 7 });
    await addItem(userId, { productId: a.product._id, quantity: 2 });
    const view = await addItem(userId, { productId: b.product._id, quantity: 1 });

    expect(view.groups).toHaveLength(2);
    expect(view.subtotal).toBe(17);
    expect(view.groups.map((g) => g.subtotal).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it('rejects stock overruns and out-of-stock, and flags lines that later go stale', async () => {
    const userId = oid();
    const { product } = await makeProduct({ stock: 3 });
    await expect(addItem(userId, { productId: product._id, quantity: 4 })).rejects.toMatchObject({ status: 409 });

    await addItem(userId, { productId: product._id, quantity: 3 });
    await Inventory.updateOne({ productId: product._id }, { $set: { quantity: 1 } });
    const view = await getCartView(userId);
    expect(view.groups[0].items[0]).toMatchObject({ issue: 'INSUFFICIENT_STOCK', availableQuantity: 1 });
    expect(view.subtotal).toBe(0);

    const none = await makeProduct({ stock: null });
    await expect(addItem(userId, { productId: none.product._id, quantity: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('update, remove and clear work', async () => {
    const userId = oid();
    const { product } = await makeProduct();
    await addItem(userId, { productId: product._id, quantity: 1 });

    let view = await updateItem(userId, product._id, { quantity: 5 });
    expect(view.itemCount).toBe(5);
    await expect(updateItem(userId, oid(), { quantity: 1 })).rejects.toMatchObject({ status: 404 });

    view = await removeItem(userId, product._id);
    expect(view.groups).toEqual([]);
    await expect(removeItem(userId, product._id)).rejects.toMatchObject({ status: 404 });

    await addItem(userId, { productId: product._id, quantity: 1 });
    view = await clearCart(userId);
    expect(view.groups).toEqual([]);
  });

  it('carts are isolated per user', async () => {
    const { product } = await makeProduct();
    const u1 = oid();
    const u2 = oid();
    await addItem(u1, { productId: product._id, quantity: 2 });

    expect((await getCartView(u2)).groups).toEqual([]);
    expect(await Cart.countDocuments()).toBe(1);
  });
});
