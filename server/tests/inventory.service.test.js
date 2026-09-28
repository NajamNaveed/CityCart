const mongoose = require('mongoose');

// The in-memory fake has atomic single-document updates that yield to the
// event loop first (like a real DB round-trip) — see helpers/fakeInventoryStore.js.
jest.mock('../src/models/inventory.model', () =>
  require('./helpers/fakeInventoryStore').createFakeInventoryModel()
);

const Inventory = require('../src/models/inventory.model');
const {
  ensureInventory,
  adjustStock,
  updateInventory,
  reserveStock,
  releaseStock,
  getStockStatus,
  getInventoryForProduct,
  InventoryError,
} = require('../src/services/inventory.service');

function oid() {
  return new mongoose.Types.ObjectId();
}

function makeProduct() {
  return { _id: oid(), brandId: oid(), name: 'Phone X' };
}

// Seeds a consistent inventory row for a product.
function seed(product, { quantity = 0, reservedQuantity = 0, ...rest } = {}) {
  return Inventory.__seed({
    brandId: product.brandId,
    productId: product._id,
    quantity,
    reservedQuantity,
    availableQuantity: quantity - reservedQuantity,
    lowStockThreshold: 0,
    trackInventory: true,
    ...rest,
  });
}

function expectConsistent(productId) {
  const inv = Inventory.__get(productId);
  expect(inv.quantity).toBeGreaterThanOrEqual(0);
  expect(inv.reservedQuantity).toBeGreaterThanOrEqual(0);
  expect(inv.reservedQuantity).toBeLessThanOrEqual(inv.quantity);
  expect(inv.availableQuantity).toBeGreaterThanOrEqual(0);
  expect(inv.availableQuantity).toBe(inv.quantity - inv.reservedQuantity);
  return inv;
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
}

beforeEach(() => {
  Inventory.__reset();
});

describe('getStockStatus', () => {
  const base = { trackInventory: true, availableQuantity: 10, lowStockThreshold: 5 };

  it('is IN_STOCK above the threshold', () => {
    expect(getStockStatus(base)).toBe('IN_STOCK');
  });

  it('is LOW_STOCK at or below the threshold (docs/09 §11)', () => {
    expect(getStockStatus({ ...base, availableQuantity: 4 })).toBe('LOW_STOCK');
    expect(getStockStatus({ ...base, availableQuantity: 5 })).toBe('LOW_STOCK');
  });

  it('is OUT_OF_STOCK when nothing is available (docs/09 §12)', () => {
    expect(getStockStatus({ ...base, availableQuantity: 0 })).toBe('OUT_OF_STOCK');
  });

  it('treats reserved stock as unavailable', () => {
    expect(getStockStatus({ ...base, availableQuantity: 0, quantity: 3 })).toBe('OUT_OF_STOCK');
  });

  it('never reports LOW_STOCK when the threshold is 0 (default)', () => {
    expect(getStockStatus({ ...base, lowStockThreshold: 0, availableQuantity: 1 })).toBe('IN_STOCK');
  });

  it('is NOT_TRACKED when trackInventory is false', () => {
    expect(getStockStatus({ ...base, trackInventory: false, availableQuantity: 0 })).toBe(
      'NOT_TRACKED'
    );
  });
});

describe('ensureInventory (creation / initialization, docs/09 §4)', () => {
  it('creates a zero-stock record using the product brand', async () => {
    const product = makeProduct();

    const inv = await ensureInventory(product);

    expect(String(inv.productId)).toBe(String(product._id));
    expect(String(inv.brandId)).toBe(String(product.brandId));
    expect(inv.quantity).toBe(0);
    expect(inv.reservedQuantity).toBe(0);
    expect(inv.availableQuantity).toBe(0);
    expect(inv.trackInventory).toBe(true);
    expect(Inventory.__count()).toBe(1);
  });

  it('is idempotent and never resets existing stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const inv = await ensureInventory(product);

    expect(inv.quantity).toBe(20);
    expect(Inventory.__count()).toBe(1);
  });

  it('creates exactly one record when called concurrently', async () => {
    const product = makeProduct();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => ensureInventory(product))
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(Inventory.__count()).toBe(1);
  });
});

describe('getInventoryForProduct (read-only)', () => {
  it('returns the stored record', async () => {
    const product = makeProduct();
    seed(product, { quantity: 8 });

    const inv = await getInventoryForProduct(product);

    expect(inv.quantity).toBe(8);
  });

  it('returns a zero default WITHOUT writing when no record exists', async () => {
    const product = makeProduct();

    const inv = await getInventoryForProduct(product);

    expect(inv.quantity).toBe(0);
    expect(inv.availableQuantity).toBe(0);
    expect(Inventory.__count()).toBe(0);
  });
});

describe('adjustStock', () => {
  it('adds stock and returns a traceable adjustment record (docs/09 §6)', async () => {
    const product = makeProduct();
    const userId = oid();
    seed(product, { quantity: 50 });

    const { inventory, adjustment } = await adjustStock(product, {
      change: 20,
      reason: 'STOCK_RECEIVED',
      userId,
    });

    expect(inventory.quantity).toBe(70);
    expect(inventory.availableQuantity).toBe(70);
    expect(adjustment).toEqual(
      expect.objectContaining({
        productId: product._id,
        brandId: product.brandId,
        previousQuantity: 50,
        change: 20,
        newQuantity: 70,
        reason: 'STOCK_RECEIVED',
        userId,
      })
    );
    expect(adjustment.timestamp).toBeInstanceOf(Date);
    expectConsistent(product._id);
  });

  it('defaults the reason to MANUAL_ADJUSTMENT', async () => {
    const product = makeProduct();
    seed(product, { quantity: 5 });

    const { adjustment } = await adjustStock(product, { change: 1, userId: oid() });

    expect(adjustment.reason).toBe('MANUAL_ADJUSTMENT');
  });

  it('removes stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    const { inventory } = await adjustStock(product, { change: -4, reason: 'DAMAGED', userId: oid() });

    expect(inventory.quantity).toBe(6);
    expect(inventory.availableQuantity).toBe(6);
    expectConsistent(product._id);
  });

  it('can remove exactly all available stock down to zero', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    await adjustStock(product, { change: -10, userId: oid() });

    const inv = expectConsistent(product._id);
    expect(inv.quantity).toBe(0);
  });

  it('rejects removing more than the available stock (409) and changes nothing', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    const err = await rejectionOf(adjustStock(product, { change: -11, userId: oid() }));

    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(409);
    expect(Inventory.__get(product._id).quantity).toBe(10);
  });

  it('cannot remove reserved stock — stock cannot go below what is reserved', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 4 });

    const tooMuch = await rejectionOf(adjustStock(product, { change: -7, userId: oid() }));
    expect(tooMuch).toBeInstanceOf(InventoryError);
    expect(tooMuch.status).toBe(409);
    expect(Inventory.__get(product._id).quantity).toBe(10);

    await adjustStock(product, { change: -6, userId: oid() });
    const inv = expectConsistent(product._id);
    expect(inv.quantity).toBe(4);
    expect(inv.reservedQuantity).toBe(4);
    expect(inv.availableQuantity).toBe(0);
  });

  it('cannot make stock negative when there is no inventory yet', async () => {
    const product = makeProduct();

    const err = await rejectionOf(adjustStock(product, { change: -1, userId: oid() }));

    expect(err.status).toBe(409);
    const inv = Inventory.__get(product._id);
    expect(inv.quantity).toBe(0);
  });

  it('creates the record on first positive adjustment', async () => {
    const product = makeProduct();

    const { inventory } = await adjustStock(product, { change: 5, userId: oid() });

    expect(inventory.quantity).toBe(5);
    expect(Inventory.__count()).toBe(1);
  });

  it('scopes the write to the product brand (a mismatched brand record is never touched)', async () => {
    const product = makeProduct();
    const otherBrandRow = Inventory.__seed({
      brandId: oid(),
      productId: product._id,
      quantity: 10,
      reservedQuantity: 0,
      availableQuantity: 10,
      lowStockThreshold: 0,
      trackInventory: true,
    });

    const err = await rejectionOf(adjustStock(product, { change: 5, userId: oid() }));

    expect(err).toBeInstanceOf(Error);
    expect(Inventory.__get(product._id).quantity).toBe(otherBrandRow.quantity);
  });
});

describe('updateInventory (set stock / settings)', () => {
  it('sets stock upward and keeps availableQuantity consistent', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const inv = await updateInventory(product, { quantity: 50 });

    expect(inv.quantity).toBe(50);
    expect(inv.reservedQuantity).toBe(3);
    expect(inv.availableQuantity).toBe(47);
    expectConsistent(product._id);
  });

  it('sets stock downward', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const inv = await updateInventory(product, { quantity: 10 });

    expect(inv.quantity).toBe(10);
    expect(inv.availableQuantity).toBe(7);
  });

  it('can set stock to exactly the reserved quantity (available 0)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 5 });

    const inv = await updateInventory(product, { quantity: 5 });

    expect(inv.availableQuantity).toBe(0);
    expectConsistent(product._id);
  });

  it('rejects setting stock below the reserved quantity (409)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 5 });

    const err = await rejectionOf(updateInventory(product, { quantity: 4 }));

    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(409);
    expect(Inventory.__get(product._id).quantity).toBe(20);
  });

  it('creates the record when setting stock on a product with no inventory', async () => {
    const product = makeProduct();

    const inv = await updateInventory(product, { quantity: 12 });

    expect(inv.quantity).toBe(12);
    expect(inv.availableQuantity).toBe(12);
  });

  it('is a no-op when the quantity is unchanged', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const inv = await updateInventory(product, { quantity: 20 });

    expect(inv.quantity).toBe(20);
    expect(expectConsistent(product._id).availableQuantity).toBe(17);
  });

  it('updates lowStockThreshold and trackInventory without touching stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const inv = await updateInventory(product, { lowStockThreshold: 5, trackInventory: false });

    expect(inv.lowStockThreshold).toBe(5);
    expect(inv.trackInventory).toBe(false);
    expect(inv.quantity).toBe(20);
    expect(inv.availableQuantity).toBe(17);
  });

  it('updates quantity and threshold together in one write', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 0 });

    const inv = await updateInventory(product, { quantity: 30, lowStockThreshold: 8 });

    expect(inv.quantity).toBe(30);
    expect(inv.lowStockThreshold).toBe(8);
    expectConsistent(product._id);
  });

  it('applies the threshold even when the quantity is unchanged', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20 });

    const inv = await updateInventory(product, { quantity: 20, lowStockThreshold: 9 });

    expect(inv.lowStockThreshold).toBe(9);
  });
});

describe('reserveStock', () => {
  it('reserves stock and reduces available quantity', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 3 });

    const result = await reserveStock(product._id, 5);

    expect(result.reserved).toBe(true);
    expect(result.inventory.reservedQuantity).toBe(8);
    expect(result.inventory.availableQuantity).toBe(12);
    expect(result.inventory.quantity).toBe(20);
    expectConsistent(product._id);
  });

  it('can reserve exactly the available quantity', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 4 });

    await reserveStock(product._id, 6);

    const inv = expectConsistent(product._id);
    expect(inv.availableQuantity).toBe(0);
    expect(inv.reservedQuantity).toBe(10);
  });

  it('rejects a reservation larger than the available stock (409) and changes nothing', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 4 });

    const err = await rejectionOf(reserveStock(product._id, 7));

    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(409);
    const inv = Inventory.__get(product._id);
    expect(inv.reservedQuantity).toBe(4);
    expect(inv.availableQuantity).toBe(6);
  });

  it('rejects any reservation when stock is 0', async () => {
    const product = makeProduct();
    seed(product, { quantity: 0 });

    const err = await rejectionOf(reserveStock(product._id, 1));

    expect(err.status).toBe(409);
  });

  it('returns 404 for a product with no inventory', async () => {
    const err = await rejectionOf(reserveStock(oid(), 1));
    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(404);
  });

  it('skips untracked inventory without reserving (docs/04 §18)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 0, trackInventory: false });

    const result = await reserveStock(product._id, 3);

    expect(result.reserved).toBe(false);
    expect(result.tracked).toBe(false);
    expect(Inventory.__get(product._id).reservedQuantity).toBe(0);
  });

  it.each([0, -1, 1.5, '3', null, undefined, NaN])(
    'rejects an invalid reservation quantity (%p) with 400',
    async (bad) => {
      const product = makeProduct();
      seed(product, { quantity: 10 });

      const err = await rejectionOf(reserveStock(product._id, bad));

      expect(err).toBeInstanceOf(InventoryError);
      expect(err.status).toBe(400);
      expect(Inventory.__get(product._id).reservedQuantity).toBe(0);
    }
  );
});

describe('releaseStock', () => {
  it('releases reserved stock back to available', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 5 });

    const inv = await releaseStock(product._id, 3);

    expect(inv.reservedQuantity).toBe(2);
    expect(inv.availableQuantity).toBe(18);
    expectConsistent(product._id);
  });

  it('can release exactly the reserved quantity', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 5 });

    await releaseStock(product._id, 5);

    const inv = expectConsistent(product._id);
    expect(inv.reservedQuantity).toBe(0);
    expect(inv.availableQuantity).toBe(20);
  });

  it('rejects releasing more than is reserved (409) — reservedQuantity never goes negative', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 2 });

    const err = await rejectionOf(releaseStock(product._id, 3));

    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(409);
    const inv = Inventory.__get(product._id);
    expect(inv.reservedQuantity).toBe(2);
    expect(inv.availableQuantity).toBe(18);
  });

  it('rejects any release when nothing is reserved', async () => {
    const product = makeProduct();
    seed(product, { quantity: 20, reservedQuantity: 0 });

    const err = await rejectionOf(releaseStock(product._id, 1));

    expect(err.status).toBe(409);
    expect(Inventory.__get(product._id).availableQuantity).toBe(20);
  });

  it('returns 404 for a product with no inventory', async () => {
    const err = await rejectionOf(releaseStock(oid(), 1));
    expect(err.status).toBe(404);
  });

  it.each([0, -2, 0.5, 'x'])('rejects an invalid release quantity (%p) with 400', async (bad) => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 5 });

    const err = await rejectionOf(releaseStock(product._id, bad));

    expect(err.status).toBe(400);
    expect(Inventory.__get(product._id).reservedQuantity).toBe(5);
  });

  it('a double release cannot free more stock than was reserved (duplicate-restock protection)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 3 });

    const results = await Promise.allSettled([
      releaseStock(product._id, 3),
      releaseStock(product._id, 3),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const inv = expectConsistent(product._id);
    expect(inv.reservedQuantity).toBe(0);
    expect(inv.availableQuantity).toBe(10);
  });
});

describe('concurrency / overselling prevention', () => {
  it('CONTROL: a naive read-check-write DOES oversell in this harness (proves the tests can catch a race)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    async function naiveReserve(productId, qty) {
      const doc = await Inventory.findOne({ productId });
      if (doc.availableQuantity < qty) {
        throw new Error('insufficient');
      }
      await Inventory.findOneAndUpdate(
        { productId },
        {
          $set: {
            reservedQuantity: doc.reservedQuantity + qty,
            availableQuantity: doc.availableQuantity - qty,
          },
        },
        { new: true }
      );
    }

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => naiveReserve(product._id, 1))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBeGreaterThan(10);
  });

  it('30 concurrent reservations of 1 against 10 units: exactly 10 succeed, 20 are rejected', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => reserveStock(product._id, 1))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(20);
    rejected.forEach((r) => {
      expect(r.reason).toBeInstanceOf(InventoryError);
      expect(r.reason.status).toBe(409);
    });

    const inv = expectConsistent(product._id);
    expect(inv.reservedQuantity).toBe(10);
    expect(inv.availableQuantity).toBe(0);
  });

  it('two customers racing for the final unit: only one wins (docs/09 §9)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 1 });

    const results = await Promise.allSettled([
      reserveStock(product._id, 1),
      reserveStock(product._id, 1),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(expectConsistent(product._id).availableQuantity).toBe(0);
  });

  it('concurrent multi-unit reservations never exceed available stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    // 8 requests of 3 units = 24 requested against 10 available -> at most 3 fit.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => reserveStock(product._id, 3))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const inv = expectConsistent(product._id);
    expect(inv.reservedQuantity).toBe(9);
    expect(inv.availableQuantity).toBe(1);
  });

  it('30 concurrent stock removals of 1 against 10 units: exactly 10 succeed, never negative', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => adjustStock(product, { change: -1, userId: oid() }))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const inv = expectConsistent(product._id);
    expect(inv.quantity).toBe(0);
  });

  it('concurrent removals cannot dip into reserved stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 6 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => adjustStock(product, { change: -1, userId: oid() }))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const inv = expectConsistent(product._id);
    expect(inv.quantity).toBe(6);
    expect(inv.reservedQuantity).toBe(6);
    expect(inv.availableQuantity).toBe(0);
  });

  it('concurrent reservations and removals compete fairly for the same units', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10 });

    const operations = [
      ...Array.from({ length: 10 }, () => reserveStock(product._id, 1)),
      ...Array.from({ length: 10 }, () => adjustStock(product, { change: -1, userId: oid() })),
    ];
    const results = await Promise.allSettled(operations);

    // 20 operations each want 1 of the 10 units: exactly 10 win in total.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expectConsistent(product._id);
  });

  it('concurrent reserve + release keeps reserved between 0 and quantity', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 5 });

    const operations = [
      ...Array.from({ length: 20 }, () => reserveStock(product._id, 1)),
      ...Array.from({ length: 20 }, () => releaseStock(product._id, 1)),
    ];
    const results = await Promise.allSettled(operations);

    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => expect(r.reason).toBeInstanceOf(InventoryError));
    expectConsistent(product._id);
  });

  it('a mixed storm of 200 random operations always leaves consistent, non-negative stock', async () => {
    const product = makeProduct();
    seed(product, { quantity: 25, reservedQuantity: 5 });

    // Deterministic pseudo-random sequence (no flaky randomness).
    let state = 12345;
    const next = (max) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % max;
    };

    const operations = Array.from({ length: 200 }, () => {
      switch (next(5)) {
        case 0:
          return reserveStock(product._id, 1 + next(3));
        case 1:
          return releaseStock(product._id, 1 + next(3));
        case 2:
          return adjustStock(product, { change: 1 + next(5), userId: oid() });
        case 3:
          return adjustStock(product, { change: -(1 + next(5)), userId: oid() });
        default:
          return updateInventory(product, { quantity: next(40) });
      }
    });
    const results = await Promise.allSettled(operations);

    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => expect(r.reason).toBeInstanceOf(InventoryError));
    expectConsistent(product._id);
  });

  it('concurrent "set stock" requests never corrupt state (compare-and-swap)', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 2 });

    const targets = [20, 30, 15, 40, 25];
    const results = await Promise.allSettled(
      targets.map((quantity) => updateInventory(product, { quantity }))
    );

    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => {
        expect(r.reason).toBeInstanceOf(InventoryError);
        expect(r.reason.status).toBe(409);
      });
    const inv = expectConsistent(product._id);
    expect(targets).toContain(inv.quantity);
  });

  it('set-stock: a reservation landing between its read and its write cannot leave quantity below reserved', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 0 });

    // Deterministic interleaving: right before set-stock's compare-and-swap
    // write, another request reserves 8 units. The read set-stock already
    // did saw reserved = 0, so only the `reservedQuantity <= N` guard in the
    // write's FILTER can stop quantity 5 from being written under 8 reserved.
    const original = Inventory.findOneAndUpdate;
    let injected = false;
    Inventory.findOneAndUpdate = async (filter, update, options) => {
      if (!injected && update.$inc && filter.quantity !== undefined) {
        injected = true;
        await original.call(
          Inventory,
          { productId: product._id },
          { $inc: { reservedQuantity: 8, availableQuantity: -8 } },
          { new: true }
        );
      }
      return original.call(Inventory, filter, update, options);
    };

    let err;
    try {
      await updateInventory(product, { quantity: 5 });
    } catch (e) {
      err = e;
    } finally {
      Inventory.findOneAndUpdate = original;
    }

    expect(injected).toBe(true);
    expect(err).toBeInstanceOf(InventoryError);
    expect(err.status).toBe(409);
    const inv = expectConsistent(product._id);
    expect(inv.quantity).toBe(10);
    expect(inv.reservedQuantity).toBe(8);
  });

  it('a set-stock racing a reservation can never push quantity below reserved', async () => {
    const product = makeProduct();
    seed(product, { quantity: 10, reservedQuantity: 0 });

    const results = await Promise.allSettled([
      reserveStock(product._id, 8),
      updateInventory(product, { quantity: 5 }),
    ]);

    const inv = expectConsistent(product._id);
    expect(inv.reservedQuantity).toBeLessThanOrEqual(inv.quantity);
    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => expect(r.reason).toBeInstanceOf(InventoryError));
  });
});