enum StatusTone { clay, sage, forest, amber, danger, muted, info }

const _orderTones = <String, StatusTone>{
  'PENDING': StatusTone.amber,
  'CONFIRMED': StatusTone.info,
  'PROCESSING': StatusTone.clay,
  'READY_FOR_SHIPMENT': StatusTone.clay,
  'SHIPPED': StatusTone.info,
  'OUT_FOR_DELIVERY': StatusTone.clay,
  'DELIVERED': StatusTone.sage,
  'CANCELLED': StatusTone.muted,
  'REJECTED': StatusTone.danger,
  'RETURN_REQUESTED': StatusTone.amber,
  'RETURNED': StatusTone.amber,
  'REFUNDED': StatusTone.muted,
};

const _deliveryTones = <String, StatusTone>{
  'PENDING': StatusTone.muted,
  'PREPARING': StatusTone.amber,
  'READY_FOR_PICKUP': StatusTone.amber,
  'PICKED_UP': StatusTone.info,
  'IN_TRANSIT': StatusTone.info,
  'OUT_FOR_DELIVERY': StatusTone.clay,
  'DELIVERED': StatusTone.sage,
  'FAILED': StatusTone.danger,
  'CANCELLED': StatusTone.muted,
  'RETURNED': StatusTone.amber,
};

const _paymentTones = <String, StatusTone>{
  'PENDING': StatusTone.amber,
  'PAID': StatusTone.sage,
  'FAILED': StatusTone.danger,
  'REFUNDED': StatusTone.muted,
  'PARTIALLY_REFUNDED': StatusTone.muted,
  'CANCELLED': StatusTone.muted,
};

const _availabilityTones = <String, StatusTone>{
  'IN_STOCK': StatusTone.sage,
  'LOW_STOCK': StatusTone.amber,
  'OUT_OF_STOCK': StatusTone.danger,
};

StatusTone toneForOrder(String status) =>
    _orderTones[status] ?? StatusTone.muted;

StatusTone toneForDelivery(String status) =>
    _deliveryTones[status] ?? StatusTone.muted;

StatusTone toneForPayment(String status) =>
    _paymentTones[status] ?? StatusTone.muted;

StatusTone toneForAvailability(String status) =>
    _availabilityTones[status] ?? StatusTone.muted;

String friendlyOrder(String status) => switch (status) {
  'PENDING' => 'Waiting for the store',
  'CONFIRMED' => 'Confirmed',
  'PROCESSING' => 'Being packed',
  'READY_FOR_SHIPMENT' => 'Ready to go',
  'SHIPPED' => 'On the way',
  'OUT_FOR_DELIVERY' => 'Arriving today',
  'DELIVERED' => 'Delivered',
  'CANCELLED' => 'Cancelled',
  'REJECTED' => 'Not accepted',
  'RETURN_REQUESTED' => 'Return in progress',
  'RETURNED' => 'Returned',
  'REFUNDED' => 'Refunded',
  _ => _titleCase(status),
};

String friendlyDelivery(String status) => switch (status) {
  'PENDING' => 'Waiting',
  'PREPARING' => 'Being packed',
  'READY_FOR_PICKUP' => 'Waiting for a rider',
  'PICKED_UP' => 'Picked up',
  'IN_TRANSIT' => 'On the way',
  'OUT_FOR_DELIVERY' => 'Arriving today',
  'DELIVERED' => 'Delivered',
  'FAILED' => 'Delivery failed',
  'CANCELLED' => 'Cancelled',
  'RETURNED' => 'Returned',
  _ => _titleCase(status),
};

String friendlyPayment(String status) => switch (status) {
  'PENDING' => 'Pay on delivery',
  'PAID' => 'Paid',
  'FAILED' => 'Payment failed',
  'REFUNDED' => 'Refunded',
  'PARTIALLY_REFUNDED' => 'Partly refunded',
  'CANCELLED' => 'Payment cancelled',
  _ => _titleCase(status),
};

String friendlyAvailability(String status) => switch (status) {
  'IN_STOCK' => 'In stock',
  'LOW_STOCK' => 'Only a few left',
  'OUT_OF_STOCK' => 'Out of stock',
  _ => _titleCase(status),
};

String friendlyPaymentMethod(String? method) {
  final value = (method ?? '').trim();
  return switch (value) {
    'COD' => 'Cash on delivery',
    'CARD' => 'Card',
    'BANK_TRANSFER' => 'Bank transfer',
    'WALLET' => 'Wallet',
    '' => 'Not set',
    _ => _titleCase(value),
  };
}

String _titleCase(String raw) {
  final value = raw.replaceAll('_', ' ').toLowerCase().trim();
  if (value.isEmpty) return '';
  return '${value[0].toUpperCase()}${value.substring(1)}';
}
