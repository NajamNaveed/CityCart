// Single source of truth for order statuses (docs/08 §14).
const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
];

module.exports = { ORDER_STATUSES };
