/**
 * Inventory adjustment reasons, per docs/09-inventory-management.md §7
 * (Adjustment Reasons — "Additional reasons may be introduced later").
 *
 * ADJUSTMENT_REASONS is the full documented list. Two of them —
 * ORDER_DEDUCTION and ORDER_CANCELLATION — describe stock movements that
 * are produced by the order flow (docs/09 §8, §14), not by a person
 * typing a manual adjustment. They are kept in the full list so future
 * order code can reuse it, but a client calling the adjust endpoint may
 * only choose from MANUAL_ADJUSTMENT_REASONS, so a brand user can't
 * label a manual change as an order event.
 */
const ADJUSTMENT_REASONS = Object.freeze([
  'STOCK_RECEIVED',
  'MANUAL_ADJUSTMENT',
  'DAMAGED',
  'LOST',
  'RETURNED',
  'ORDER_DEDUCTION',
  'ORDER_CANCELLATION',
  'CORRECTION',
]);

const MANUAL_ADJUSTMENT_REASONS = Object.freeze([
  'STOCK_RECEIVED',
  'MANUAL_ADJUSTMENT',
  'DAMAGED',
  'LOST',
  'RETURNED',
  'CORRECTION',
]);

const DEFAULT_ADJUSTMENT_REASON = 'MANUAL_ADJUSTMENT';

/**
 * Stock movements produced by an accepted/proposed order adjustment
 * (docs/21 §H.4, docs/09 §6). These are system reasons: a client can never
 * choose them on the manual adjustment endpoint.
 */
const ADJUSTMENT_STOCK_REASONS = Object.freeze([
  'SUBSTITUTION_RESERVED',
  'SUBSTITUTION_RELEASED',
  'SUBSTITUTION_FULFILLED',
  'ADJUSTMENT_RESTOCKED',
]);

module.exports = {
  ADJUSTMENT_REASONS,
  MANUAL_ADJUSTMENT_REASONS,
  DEFAULT_ADJUSTMENT_REASON,
  ADJUSTMENT_STOCK_REASONS,
};