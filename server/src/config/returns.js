/**
 * Door returns (docs/22 §F, docs/08 §41.10). In marketplace v2 a customer can
 * only reject goods at the door, while the rider is there. A customer asking to
 * return something after delivery is out of scope.
 */
const RETURN_SOURCES = Object.freeze(['DOOR']);

// The goods travel back with the rider, then the store takes them in. The store's
// per-line restock/write-off decision is recorded when it marks the return received.
const RETURN_STATUSES = Object.freeze(['IN_TRANSIT', 'RECEIVED']);

const RETURN_REASONS = Object.freeze(['DAMAGED', 'WRONG_ITEM', 'NOT_WANTED', 'MISSING']);

// Reasons that are the store's fault. Used for the one fee rule the owner set:
// the delivery fee comes back only when the WHOLE order is rejected and at
// least one reason is the store's fault.
const STORE_FAULT_REASONS = Object.freeze(['DAMAGED', 'WRONG_ITEM', 'MISSING']);

const FULFILMENTS = Object.freeze(['FULL', 'PARTIAL', 'NONE']);

module.exports = {
  RETURN_SOURCES,
  RETURN_STATUSES,
  RETURN_REASONS,
  STORE_FAULT_REASONS,
  FULFILMENTS,
};
