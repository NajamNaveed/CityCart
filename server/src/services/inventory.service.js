const Inventory = require('../models/inventory.model');
const { DEFAULT_ADJUSTMENT_REASON } = require('../config/inventoryReasons');

class InventoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
// How many times a "set stock" retries when another request changes the
// same record between its read and its write (see setStock below).
const MAX_SET_ATTEMPTS = 3;

/**
 * ---------------------------------------------------------------------
 * ATOMICITY MODEL — read this before changing any stock logic
 * ---------------------------------------------------------------------
 * docs/09 §9 and AGENTS.md §15 forbid read → check → modify → save for
 * stock. Every stock-changing operation here is ONE conditional
 * findOneAndUpdate: the guard ("is there enough stock?") lives in the
 * FILTER and the change lives in the UPDATE, so MongoDB evaluates both
 * atomically on the single inventory document. Two concurrent requests
 * for the last unit can never both match the filter.
 *
 * INVARIANT: availableQuantity is a VIRTUAL on the model
 * (models/inventory.model.js) — quantity and reservedQuantity are the
 * only stored, authoritative numbers. So every atomic update below $incs
 * quantity and/or reservedQuantity ONLY (never availableQuantity, which
 * cannot be $inc'd — it isn't a document field), and every guard that
 * used to compare a stored availableQuantity now compares
 * `quantity - reservedQuantity` via MongoDB's `$expr` in the filter,
 * still evaluated atomically as part of the same findOneAndUpdate. Any
 * future code (checkout, order cancellation) must mutate stock through
 * these functions, never with a direct .save() on a loaded inventory
 * document.
 * ---------------------------------------------------------------------
 */

// $subtract: ['$quantity', '$reservedQuantity'] as a reusable aggregation
// expression, for every $expr-based availableQuantity guard below.
const AVAILABLE_EXPR = { $subtract: ['$quantity', '$reservedQuantity'] };

/**
 * Derived stock state for API responses and filters.
 *   trackInventory=false            -> NOT_TRACKED (docs/04 §18)
 *   availableQuantity <= 0          -> OUT_OF_STOCK (docs/09 §12)
 *   availableQuantity <= threshold  -> LOW_STOCK    (docs/09 §11)
 *   otherwise                       -> IN_STOCK
 * A lowStockThreshold of 0 (the default) therefore never reports LOW_STOCK.
 */
function getStockStatus(inventory) {
  if (inventory.trackInventory === false) {
    return 'NOT_TRACKED';
  }
  if (inventory.availableQuantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (inventory.availableQuantity <= inventory.lowStockThreshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

function serializeInventory(inventory) {
  const plain = typeof inventory.toObject === 'function' ? inventory.toObject() : { ...inventory };
  return { ...plain, stockStatus: getStockStatus(plain) };
}

/**
 * Mongo filter equivalent of getStockStatus, for the ?stockStatus= list
 * filter. Only tracked inventory is classified (untracked stock has no
 * stock state).
 */
function buildStockStatusFilter(stockStatus) {
  switch (stockStatus) {
    case 'OUT_OF_STOCK':
      return { trackInventory: true, $expr: { $lte: [AVAILABLE_EXPR, 0] } };
    case 'LOW_STOCK':
      return {
        trackInventory: true,
        $expr: { $and: [{ $gt: [AVAILABLE_EXPR, 0] }, { $lte: [AVAILABLE_EXPR, '$lowStockThreshold'] }] },
      };
    case 'IN_STOCK':
      return {
        trackInventory: true,
        $expr: { $and: [{ $gt: [AVAILABLE_EXPR, 0] }, { $gt: [AVAILABLE_EXPR, '$lowStockThreshold'] }] },
      };
    default:
      return {};
  }
}

/**
 * Lists inventory records (docs/05 §13 — "Brand users receive only their
 * brand's inventory"). `brandId` is supplied by the controller: always the
 * authenticated user's brand for brand users, and an optional filter for
 * SUPER_ADMIN only. It is never taken from a brand user's request.
 */
async function listInventory({ brandId, stockStatus, page, limit } = {}) {
  const filter = { ...buildStockStatusFilter(stockStatus) };
  if (brandId) {
    filter.brandId = brandId;
  }

  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [items, total] = await Promise.all([
    Inventory.find(filter)
      .sort({ updatedAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Inventory.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  };
}

/**
 * Read-only fetch for one product. `product` is already loaded and
 * ownership-verified by requireBrandOwnership. If the product has no
 * inventory record yet, a zero-stock default is returned WITHOUT writing
 * anything — a GET (which only needs inventory.view) must not create data.
 * The record itself is created on the first write (ensureInventory).
 */
async function getInventoryForProduct(product) {
  const existing = await Inventory.findOne({ productId: product._id, brandId: product.brandId });
  if (existing) {
    return existing;
  }
  return {
    brandId: product.brandId,
    productId: product._id,
    quantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    lowStockThreshold: 0,
    trackInventory: true,
  };
}

/**
 * Creates the inventory record for a product if it doesn't exist
 * (docs/09 §4 — "created or initialized", quantity = 0). Atomic upsert, so
 * two concurrent first-writes can't create two records; the schema's
 * unique index on productId is the final backstop, and a lost race
 * (E11000) just re-reads the winner's record.
 *
 * brandId comes from the product (docs/09 §2 — "The brandId must match the
 * product's brand"), never from the client.
 */
async function ensureInventory(product) {
  const scope = { productId: product._id, brandId: product.brandId };

  try {
    return await Inventory.findOneAndUpdate(
      scope,
      {
        // availableQuantity is a virtual now (see models/inventory.model.js)
        // — it is never a real field to insert, and is 0 here regardless
        // since quantity and reservedQuantity both start at 0.
        $setOnInsert: {
          quantity: 0,
          reservedQuantity: 0,
          lowStockThreshold: 0,
          trackInventory: true,
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      const existing = await Inventory.findOne(scope);
      if (existing) {
        return existing;
      }
      throw new InventoryError(409, 'Inventory record conflict for this product.');
    }
    throw err;
  }
}

/**
 * Adds (change > 0) or removes (change < 0) stock — docs/09 §5 "Add stock /
 * Remove stock / Adjust stock". One atomic conditional update.
 *
 * Removal is guarded by `(quantity - reservedQuantity) >= |change|` IN THE
 * FILTER (via $expr, since availableQuantity is a computed virtual, not a
 * stored field — see models/inventory.model.js), so stock can never go
 * negative and reserved units can never be removed (available = quantity -
 * reserved, so quantity can't drop below reservedQuantity).
 *
 * Returns the updated inventory plus a traceability record shaped per
 * docs/09 §6. previousQuantity is derived from the document this very
 * update returned, so it is exact even under concurrency. The record is
 * returned to the caller but NOT persisted — see the Phase 8 report
 * (there is no adjustment/audit collection in docs/04 yet, and docs/09 §6
 * only says adjustments "should preferably" be recorded, not that they
 * must be — not an explicit requirement yet).
 */
async function adjustStock(product, { change, reason, userId }) {
  await ensureInventory(product);

  const filter = { productId: product._id, brandId: product.brandId };
  if (change < 0) {
    filter.$expr = { $gte: [AVAILABLE_EXPR, -change] };
  }

  const updated = await Inventory.findOneAndUpdate(
    filter,
    { $inc: { quantity: change } },
    { new: true }
  );

  if (!updated) {
    throw new InventoryError(409, 'Insufficient available stock for this adjustment.');
  }

  return {
    inventory: updated,
    adjustment: {
      productId: product._id,
      brandId: product.brandId,
      previousQuantity: updated.quantity - change,
      change,
      newQuantity: updated.quantity,
      reason: reason || DEFAULT_ADJUSTMENT_REASON,
      userId,
      timestamp: new Date(),
    },
  };
}

/**
 * PATCH /inventory/:productId — sets stock (docs/05 §13, docs/09 §5 "Set
 * stock") and/or updates lowStockThreshold / trackInventory.
 *
 * "Set to N" is relative to whatever the current quantity is, so it can't
 * be a single blind $set. Instead it is an optimistic compare-and-swap:
 * read the current quantity, compute the delta, then apply
 * `$inc: { quantity: delta }` (availableQuantity is a virtual now — it is
 * never $inc'd directly, it just reflects the new quantity automatically)
 * with the observed quantity in the FILTER. If another request changed the
 * quantity in between, the filter no longer matches and we re-read and
 * retry (bounded). The filter also carries `reservedQuantity <= N`, so a
 * set can never push quantity below reserved stock even if a reservation
 * lands mid-flight.
 */
async function updateInventory(product, data) {
  const { quantity, ...settings } = data;
  const scope = { productId: product._id, brandId: product.brandId };
  const hasSettings = Object.keys(settings).length > 0;

  const ensured = await ensureInventory(product);

  if (quantity === undefined) {
    const updated = await Inventory.findOneAndUpdate(scope, { $set: settings }, { new: true });
    if (!updated) {
      throw new InventoryError(404, 'Inventory not found.');
    }
    return updated;
  }

  let current = ensured;
  for (let attempt = 0; attempt < MAX_SET_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      current = await Inventory.findOne(scope);
      if (!current) {
        throw new InventoryError(404, 'Inventory not found.');
      }
    }

    if (quantity < current.reservedQuantity) {
      throw new InventoryError(
        409,
        `Cannot set quantity below the reserved quantity (${current.reservedQuantity}).`
      );
    }

    const delta = quantity - current.quantity;
    const update = {};
    if (hasSettings) {
      update.$set = settings;
    }
    if (delta !== 0) {
      update.$inc = { quantity: delta };
    }
    if (Object.keys(update).length === 0) {
      return current;
    }

    const updated = await Inventory.findOneAndUpdate(
      { ...scope, quantity: current.quantity, reservedQuantity: { $lte: quantity } },
      update,
      { new: true }
    );
    if (updated) {
      return updated;
    }
  }

  throw new InventoryError(409, 'Inventory was modified by another request. Please retry.');
}

function assertPositiveInteger(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InventoryError(400, 'quantity must be a positive integer.');
  }
}

/**
 * INTERNAL (no HTTP route): reserves stock for a future checkout
 * (docs/09 §3, §8-9). Not exposed as an endpoint — cart/checkout/orders are
 * out of scope for Phase 8, and docs/09 §8 says the backend performs
 * deductions, never the client.
 *
 * One atomic conditional update: matches only if
 * (quantity - reservedQuantity) >= qty — via $expr, since availableQuantity
 * is a computed virtual, not a stored field — so reserved stock can never
 * exceed available stock and available can never go negative, even with
 * the last unit requested concurrently.
 *
 * Untracked products (trackInventory=false) are not reserved; the caller is
 * told so and should skip checks for them (docs/04 §18).
 */
async function reserveStock(productId, quantity) {
  assertPositiveInteger(quantity);

  const updated = await Inventory.findOneAndUpdate(
    { productId, trackInventory: true, $expr: { $gte: [AVAILABLE_EXPR, quantity] } },
    { $inc: { reservedQuantity: quantity } },
    { new: true }
  );
  if (updated) {
    return { reserved: true, tracked: true, inventory: updated };
  }

  // The atomic update didn't match. Classify why (this read is only for
  // the error message — it never decides whether stock is reserved).
  const existing = await Inventory.findOne({ productId });
  if (!existing) {
    throw new InventoryError(404, 'Inventory not found.');
  }
  if (existing.trackInventory === false) {
    return { reserved: false, tracked: false, inventory: existing };
  }
  throw new InventoryError(409, 'Insufficient available stock to reserve.');
}

/**
 * INTERNAL (no HTTP route): releases previously reserved stock (e.g. a
 * cancelled checkout). One atomic conditional update matching only if
 * reservedQuantity >= qty, so reservedQuantity can never go negative and
 * available can never exceed quantity.
 */
async function releaseStock(productId, quantity) {
  assertPositiveInteger(quantity);

  const updated = await Inventory.findOneAndUpdate(
    { productId, reservedQuantity: { $gte: quantity } },
    { $inc: { reservedQuantity: -quantity } },
    { new: true }
  );
  if (updated) {
    return updated;
  }

  const existing = await Inventory.findOne({ productId });
  if (!existing) {
    throw new InventoryError(404, 'Inventory not found.');
  }
  throw new InventoryError(409, 'Cannot release more stock than is currently reserved.');
}

module.exports = {
  listInventory,
  getInventoryForProduct,
  ensureInventory,
  adjustStock,
  updateInventory,
  reserveStock,
  releaseStock,
  getStockStatus,
  serializeInventory,
  InventoryError,
};