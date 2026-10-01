/**
 * Legal order status transitions (docs/08 §16). The backend rejects
 * anything not listed. Keep this the single source of truth.
 */
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['READY_FOR_SHIPMENT'],
  READY_FOR_SHIPMENT: ['SHIPPED'],
  SHIPPED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

/**
 * Statuses a brand user may set through PATCH /brand/orders/:id/status.
 * SHIPPED -> DELIVERED belong to the delivery flow (roadmap Phase 10);
 * CANCELLED is the customer's own action. REJECTED is the brand's exit.
 */
const BRAND_SETTABLE_STATUSES = ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'REJECTED'];

// Statuses from which `target` is a legal next step (used as the atomic
// update filter: only a legal source status can be moved to `target`).
function legalSourcesFor(target) {
  return Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(target));
}

// What a brand user could do next from `from` (for helpful 409 messages).
function brandNextStatuses(from) {
  return (TRANSITIONS[from] || []).filter((s) => BRAND_SETTABLE_STATUSES.includes(s));
}

module.exports = { TRANSITIONS, BRAND_SETTABLE_STATUSES, legalSourcesFor, brandNextStatuses };
