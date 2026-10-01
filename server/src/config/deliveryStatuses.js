// Single source of truth for delivery statuses (docs/11 §9).
const DELIVERY_STATUSES = [
  'PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'RETURNED',
];

module.exports = { DELIVERY_STATUSES };
