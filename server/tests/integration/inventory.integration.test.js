const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Inventory = require('../../src/models/inventory.model');
const Store = require('../../src/models/store.model');
const {
  ensureInventory,
  adjustStock,
  updateInventory,
  reserveStock,
  releaseStock,
  getAvailabilityMap,
} = require('../../src/services/inventory.service');

const oid = () => new mongoose.Types.ObjectId();
const makeProduct = () => ({ _id: oid(), brandId: oid() });

// Seeds an inventory doc directly (bypasses the service under test).
async function seed(product, fields = {}) {
  return Inventory.create({
    productId: product._id,
    brandId: product.brandId,
    quantity: 0,
    reservedQuantity: 0,
    ...fields,
  });
}

const reload = (product) => Inventory.findOne({ productId: product._id });
const ok = (results) => results.filter((r) => r.status === 'fulfilled').length;
const failed = (results) => results.filter((r) => r.status === 'rejected');

beforeAll(async () => {
  await connect();
  await Inventory.init(); // build indexes + create collections up front
  await Store.init();
});
afterAll(disconnect);
beforeEach(clearAll);

describe('reserveStock (real MongoDB)', () => {
  it('reserves exactly one unit when 10 requests race for the last unit', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 1 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveStock(product._id, 1))
    );

    expect(ok(results)).toBe(1);
    failed(results).forEach((r) => expect(r.reason.status).toBe(409));
    expect((await reload(product)).reservedQuantity).toBe(1);
  });

  it('never reserves more than available: 20 x 1 against quantity 5', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserveStock(product._id, 1))
    );

    expect(ok(results)).toBe(5);
    expect(failed(results)).toHaveLength(15);
    expect((await reload(product)).reservedQuantity).toBe(5);
  });

  it('accounts for already-reserved stock (available = quantity - reserved)', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 5, reservedQuantity: 4 });

    await expect(reserveStock(product._id, 2)).rejects.toMatchObject({ status: 409 });
    await expect(reserveStock(product._id, 1)).resolves.toMatchObject({ reserved: true });
  });

  it('skips untracked products without reserving', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 0, trackInventory: false });

    const result = await reserveStock(product._id, 3);
    expect(result).toMatchObject({ reserved: false, tracked: false });
    expect((await reload(product)).reservedQuantity).toBe(0);
  });

  it('404 when the product has no inventory record', async () => {
    await expect(reserveStock(oid(), 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('releaseStock (real MongoDB)', () => {
  it('releases reserved stock and never goes negative', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 5, reservedQuantity: 2 });

    await releaseStock(product._id, 2);
    expect((await reload(product)).reservedQuantity).toBe(0);
    await expect(releaseStock(product._id, 1)).rejects.toMatchObject({ status: 409 });
  });

  it('concurrent releases cannot over-release', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 10, reservedQuantity: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => releaseStock(product._id, 1))
    );

    expect(ok(results)).toBe(3);
    expect((await reload(product)).reservedQuantity).toBe(0);
  });
});

describe('adjustStock (real MongoDB)', () => {
  it('creates the record on first add and increments atomically', async () => {
    const product = makeProduct();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => adjustStock(product, { change: 2, reason: 'restock' }))
    );

    expect(ok(results)).toBe(10);
    expect(await Inventory.countDocuments({ productId: product._id })).toBe(1);
    expect((await reload(product)).quantity).toBe(20);
  });

  it('cannot remove reserved units', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 5, reservedQuantity: 3 });

    await expect(adjustStock(product, { change: -3 })).rejects.toMatchObject({ status: 409 });
    await adjustStock(product, { change: -2 });
    expect((await reload(product)).quantity).toBe(3);
  });

  it('concurrent removals cannot drive stock negative', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => adjustStock(product, { change: -1 }))
    );

    expect(ok(results)).toBe(5);
    expect((await reload(product)).quantity).toBe(0);
  });

  it('reports the exact previousQuantity', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 7 });

    const { adjustment } = await adjustStock(product, { change: 3 });
    expect(adjustment).toMatchObject({ previousQuantity: 7, newQuantity: 10, change: 3 });
  });
});

describe('updateInventory / set stock (real MongoDB)', () => {
  it('sets quantity and settings', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 4 });

    const updated = await updateInventory(product, { quantity: 9, lowStockThreshold: 2 });
    expect(updated).toMatchObject({ quantity: 9, lowStockThreshold: 2 });
  });

  it('refuses to set quantity below the reserved quantity', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 10, reservedQuantity: 6 });

    await expect(updateInventory(product, { quantity: 5 })).rejects.toMatchObject({ status: 409 });
    expect((await reload(product)).quantity).toBe(10);
  });

  it('concurrent sets end in one of the requested values, never a blend', async () => {
    const product = makeProduct();
    await seed(product, { quantity: 1 });

    const values = [10, 20, 30, 40, 50];
    await Promise.allSettled(values.map((quantity) => updateInventory(product, { quantity })));

    expect(values).toContain((await reload(product)).quantity);
  });
});

describe('ensureInventory (real MongoDB)', () => {
  it('concurrent first calls create exactly one record', async () => {
    const product = makeProduct();
    await Promise.all(Array.from({ length: 15 }, () => ensureInventory(product)));
    expect(await Inventory.countDocuments({ productId: product._id })).toBe(1);
  });
});

describe('indexes (real MongoDB)', () => {
  it('rejects a second inventory record for the same product', async () => {
    const product = makeProduct();
    await seed(product);
    await expect(seed(product)).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects a second store for the same brand (A1 unique brandId)', async () => {
    const brandId = oid();
    await Store.create({ brandId, name: 'One', slug: 'one' });
    await expect(Store.create({ brandId, name: 'Two', slug: 'two' })).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('transactions (groundwork for checkout)', () => {
  it('rolls back all writes when the transaction throws', async () => {
    const a = makeProduct();
    const b = makeProduct();
    const session = await mongoose.startSession();

    await expect(
      session.withTransaction(async () => {
        await Inventory.create([{ productId: a._id, brandId: a.brandId, quantity: 1 }], { session });
        await Inventory.create([{ productId: b._id, brandId: b.brandId, quantity: 1 }], { session });
        throw new Error('checkout failed midway');
      })
    ).rejects.toThrow('checkout failed midway');
    await session.endSession();

    expect(await Inventory.countDocuments()).toBe(0);
  });

  it('commits all writes when the transaction succeeds', async () => {
    const a = makeProduct();
    const session = await mongoose.startSession();

    await session.withTransaction(async () => {
      await Inventory.create([{ productId: a._id, brandId: a.brandId, quantity: 3 }], { session });
    });
    await session.endSession();

    expect((await reload(a)).quantity).toBe(3);
  });
});

describe('getAvailabilityMap (real MongoDB, uses the availableQuantity virtual)', () => {
  it('maps stock states from real documents in one query', async () => {
    const inStock = makeProduct();
    const low = makeProduct();
    const out = makeProduct();
    const reservedOut = makeProduct();
    const untracked = makeProduct();
    const noRecord = makeProduct();

    await seed(inStock, { quantity: 10, lowStockThreshold: 2 });
    await seed(low, { quantity: 3, lowStockThreshold: 3 });
    await seed(out, { quantity: 0 });
    await seed(reservedOut, { quantity: 5, reservedQuantity: 5 });
    await seed(untracked, { quantity: 0, trackInventory: false });

    const map = await getAvailabilityMap(
      [inStock, low, out, reservedOut, untracked, noRecord].map((p) => p._id)
    );

    expect(map.get(String(inStock._id))).toBe('IN_STOCK');
    expect(map.get(String(low._id))).toBe('LOW_STOCK');
    expect(map.get(String(out._id))).toBe('OUT_OF_STOCK');
    expect(map.get(String(reservedOut._id))).toBe('OUT_OF_STOCK'); // all units reserved
    expect(map.get(String(untracked._id))).toBe('IN_STOCK');
    expect(map.has(String(noRecord._id))).toBe(false); // caller defaults to OUT_OF_STOCK
  });
});
