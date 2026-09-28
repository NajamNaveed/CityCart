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

module.exports = { ADJUSTMENT_REASONS, MANUAL_ADJUSTMENT_REASONS, DEFAULT_ADJUSTMENT_REASON };