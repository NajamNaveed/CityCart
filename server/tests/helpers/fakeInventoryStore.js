const mongoose = require('mongoose');

/**
 * In-memory stand-in for the Inventory model, used to test stock
 * concurrency without an external MongoDB.
 *
 * What it models faithfully (this is what makes the concurrency tests
 * meaningful):
 *  - findOne / findOneAndUpdate are async and YIELD to the event loop
 *    before doing any work, like a real database round-trip. Concurrent
 *    callers therefore interleave.
 *  - findOneAndUpdate's "match filter + apply update" step runs in one
 *    synchronous block, so it is atomic on a single document — the same
 *    guarantee MongoDB gives. A service that does read -> check -> write
 *    across two awaited calls WILL be caught racing here; a service that
 *    puts its guard in the filter of one findOneAndUpdate will not.
 *  - Supports only the operators the inventory service uses, and throws
 *    on anything else so a new operator can't silently go untested. This
 *    includes a small $expr evaluator (PHASE 8 REVIEW addition) covering
 *    just $subtract/$gte/$lte/$gt/$and and '$field' references, because
 *    every availableQuantity guard now reads `quantity - reservedQuantity`
 *    via $expr instead of a stored field (see models/inventory.model.js
 *    and services/inventory.service.js).
 *  - Unique productId (E11000, code 11000), like the real index.
 *
 * It does NOT verify real MongoDB semantics — it verifies the service's
 * logic against the documented atomic-update contract. In particular,
 * this fake's $expr evaluator is a hand-rolled JS re-implementation of a
 * few aggregation operators, NOT the real MongoDB aggregation engine —
 * passing here does not prove the same $expr queries behave identically
 * against a real MongoDB server. See the Phase 8 review report.
 */

const isPlainOperatorObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !(value instanceof mongoose.Types.ObjectId) &&
  !(value instanceof Date);

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Minimal aggregation-expression evaluator for $expr filters — only the
// operators services/inventory.service.js actually emits.
function evalExpr(doc, expr) {
  if (Array.isArray(expr)) {
    return expr.map((item) => evalExpr(doc, item));
  }
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return doc[expr.slice(1)];
  }
  if (typeof expr !== 'object' || expr === null) {
    return expr;
  }
  const [operator, operands] = Object.entries(expr)[0];
  switch (operator) {
    case '$subtract': {
      const [a, b] = evalExpr(doc, operands);
      return a - b;
    }
    case '$gte': {
      const [a, b] = evalExpr(doc, operands);
      return a >= b;
    }
    case '$lte': {
      const [a, b] = evalExpr(doc, operands);
      return a <= b;
    }
    case '$gt': {
      const [a, b] = evalExpr(doc, operands);
      return a > b;
    }
    case '$and':
      return operands.every((clause) => evalExpr(doc, clause));
    default:
      throw new Error(`fake inventory store: unsupported $expr operator ${operator}`);
  }
}

function matches(doc, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === '$expr') {
      return evalExpr(doc, condition);
    }
    if (field.startsWith('$')) {
      throw new Error(`fake inventory store: unsupported top-level operator ${field}`);
    }
    const value = doc[field];
    if (isPlainOperatorObject(condition)) {
      return Object.entries(condition).every(([operator, operand]) => {
        switch (operator) {
          case '$gte':
            return value >= operand;
          case '$lte':
            return value <= operand;
          case '$gt':
            return value > operand;
          default:
            throw new Error(`fake inventory store: unsupported operator ${operator}`);
        }
      });
    }
    return String(value) === String(condition);
  });
}

function applyUpdate(doc, update, { inserting }) {
  Object.entries(update).forEach(([operator, fields]) => {
    switch (operator) {
      case '$inc':
        Object.entries(fields).forEach(([field, amount]) => {
          doc[field] = (doc[field] || 0) + amount;
        });
        break;
      case '$set':
        Object.assign(doc, fields);
        break;
      case '$setOnInsert':
        if (inserting) {
          Object.assign(doc, fields);
        }
        break;
      default:
        throw new Error(`fake inventory store: unsupported update operator ${operator}`);
    }
  });
}

function createFakeInventoryModel() {
  let docs = [];

  // Mirrors the real model's `availableQuantity` VIRTUAL (see
  // models/inventory.model.js): computed on the way out, never stored or
  // written by $inc — a stale literal `availableQuantity` field that may
  // exist on a seeded fixture is deliberately overwritten here, exactly as
  // Mongoose's virtual getter would shadow it.
  const copy = (doc) =>
    doc ? { ...doc, availableQuantity: doc.quantity - doc.reservedQuantity } : null;

  return {
    async findOne(filter) {
      await yieldToEventLoop();
      return copy(docs.find((doc) => matches(doc, filter)));
    },

    async findOneAndUpdate(filter, update, options = {}) {
      await yieldToEventLoop();

      // ---- atomic section (synchronous) ----
      const existing = docs.find((doc) => matches(doc, filter));
      if (existing) {
        const before = copy(existing);
        applyUpdate(existing, update, { inserting: false });
        return options.new ? copy(existing) : before;
      }

      if (!options.upsert) {
        return null;
      }

      const base = { _id: new mongoose.Types.ObjectId() };
      Object.entries(filter).forEach(([field, condition]) => {
        if (!isPlainOperatorObject(condition)) {
          base[field] = condition;
        }
      });
      if (docs.some((doc) => String(doc.productId) === String(base.productId))) {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      }
      applyUpdate(base, update, { inserting: true });
      docs.push(base);
      return options.new ? copy(base) : null;
      // ---- end atomic section ----
    },

    // Test helpers (not part of the Mongoose API).
    __reset() {
      docs = [];
    },
    __seed(doc) {
      const stored = { _id: new mongoose.Types.ObjectId(), ...doc };
      docs.push(stored);
      return copy(stored);
    },
    __get(productId) {
      return copy(docs.find((doc) => String(doc.productId) === String(productId)));
    },
    __count() {
      return docs.length;
    },
  };
}

module.exports = { createFakeInventoryModel };