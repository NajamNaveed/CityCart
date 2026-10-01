const { legalSourcesFor } = require('./orderTransitions');

/**
 * Legal delivery status transitions (docs/11 §9, §17). Delivery status is a
 * separate field from order and payment status (docs/11 §10); this table is
 * the single source of truth for the delivery lifecycle.
 *
 * FAILED -> OUT_FOR_DELIVERY is a re-attempt. A failed delivery never
 * automatically refunds or cancels anything (docs/11 §16). RETURNED and
 * CANCELLED exist in the schema but are not reachable yet (returns are not
 * part of this step).
 */
const DELIVERY_TRANSITIONS = {
  READY_FOR_PICKUP: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  FAILED: ['OUT_FOR_DELIVERY'],
};

// Statuses a brand user may set via PATCH /deliveries/:id/status.
const DELIVERY_SETTABLE_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'];

// Delivery status that is final: nothing may edit it any more.
const DELIVERY_FINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

/**
 * Which ORDER status each delivery status drives (docs/11 §10, §18). The
 * order must currently be in a legal source status for the move (reusing the
 * order transition table), otherwise the whole change is rejected.
 *   IN_TRANSIT / FAILED leave the order where it is.
 */
const ORDER_STATUS_FOR_DELIVERY = {
  PICKED_UP: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};

function legalDeliverySourcesFor(target) {
  return Object.keys(DELIVERY_TRANSITIONS).filter((from) => DELIVERY_TRANSITIONS[from].includes(target));
}

function nextDeliveryStatuses(from) {
  return DELIVERY_TRANSITIONS[from] || [];
}

module.exports = {
  DELIVERY_TRANSITIONS,
  DELIVERY_SETTABLE_STATUSES,
  DELIVERY_FINAL_STATUSES,
  ORDER_STATUS_FOR_DELIVERY,
  legalDeliverySourcesFor,
  nextDeliveryStatuses,
  legalOrderSourcesFor: legalSourcesFor,
};
