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

const _returnTones = <String, StatusTone>{
  'IN_TRANSIT': StatusTone.clay,
  'RECEIVED': StatusTone.sage,
};

const _pickTones = <String, StatusTone>{
  'PICKED': StatusTone.sage,
  'SHORT': StatusTone.amber,
  'UNAVAILABLE': StatusTone.danger,
};

const _verificationTones = <String, StatusTone>{
  'SUBMITTED': StatusTone.amber,
  'VERIFIED': StatusTone.sage,
  'REJECTED': StatusTone.danger,
};

StatusTone toneForOrder(String status) =>
    _orderTones[status] ?? StatusTone.muted;

StatusTone toneForDelivery(String status) =>
    _deliveryTones[status] ?? StatusTone.muted;

StatusTone toneForPayment(String status) =>
    _paymentTones[status] ?? StatusTone.muted;

StatusTone toneForReturn(String status) =>
    _returnTones[status] ?? StatusTone.muted;

StatusTone toneForPick(String? status) =>
    _pickTones[status] ?? StatusTone.muted;

StatusTone toneForVerification(String status) =>
    _verificationTones[status] ?? StatusTone.muted;

String friendlyOrder(String status) => switch (status) {
  'PENDING' => 'New order',
  'CONFIRMED' => 'Accepted',
  'PROCESSING' => 'Being picked',
  'READY_FOR_SHIPMENT' => 'Ready to ship',
  'SHIPPED' => 'On the way',
  'OUT_FOR_DELIVERY' => 'Out for delivery',
  'DELIVERED' => 'Delivered',
  'CANCELLED' => 'Cancelled',
  'REJECTED' => 'Rejected',
  'RETURN_REQUESTED' => 'Return asked',
  'RETURNED' => 'Returned',
  'REFUNDED' => 'Refunded',
  _ => _titleCase(status),
};

String friendlyDelivery(String status) => switch (status) {
  'PENDING' => 'Waiting',
  'PREPARING' => 'Being packed',
  'READY_FOR_PICKUP' => 'Ready for rider',
  'PICKED_UP' => 'Picked up',
  'IN_TRANSIT' => 'In transit',
  'OUT_FOR_DELIVERY' => 'Out for delivery',
  'DELIVERED' => 'Delivered',
  'FAILED' => 'Failed',
  'CANCELLED' => 'Cancelled',
  'RETURNED' => 'Returned',
  _ => _titleCase(status),
};

String friendlyPayment(String status) => switch (status) {
  'PENDING' => 'Not paid yet',
  'PAID' => 'Paid',
  'FAILED' => 'Payment failed',
  'REFUNDED' => 'Refunded',
  'PARTIALLY_REFUNDED' => 'Partly refunded',
  'CANCELLED' => 'Payment cancelled',
  _ => _titleCase(status),
};

String friendlyReturn(String status) => switch (status) {
  'IN_TRANSIT' => 'Coming back',
  'RECEIVED' => 'Received',
  _ => _titleCase(status),
};

String friendlyPick(String? status) => switch (status) {
  'PICKED' => 'Picked',
  'SHORT' => 'Short',
  'UNAVAILABLE' => 'Not found',
  _ => 'Not checked',
};

String friendlyVerification(String status) => switch (status) {
  'SUBMITTED' => 'Waiting for a check',
  'VERIFIED' => 'Checked',
  'REJECTED' => 'Rejected',
  _ => 'No proof',
};

String friendlyCollectionMethod(String method) => switch (method) {
  'CASH' => 'Cash',
  'BANK_TRANSFER' => 'Bank transfer',
  'WALLET' => 'Wallet',
  'CARD_MACHINE' => 'Card machine',
  _ => _titleCase(method),
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

String friendlyWallet(String? wallet) => switch (wallet) {
  'JAZZCASH' => 'JazzCash',
  'EASYPAISA' => 'Easypaisa',
  'OTHER' => 'Other wallet',
  _ => '',
};

String friendlyReturnReason(String reason) => switch (reason) {
  'DAMAGED' => 'Damaged',
  'WRONG_ITEM' => 'Wrong item',
  'NOT_WANTED' => 'Customer did not want it',
  'MISSING' => 'Missing from the bag',
  _ => _titleCase(reason),
};

String friendlyRole(String role) => switch (role) {
  'PICKER' => 'Picker',
  'BRAND_EMPLOYEE' => 'Team member',
  'BRAND_ADMIN' => 'Brand owner',
  'RIDER' => 'Rider',
  'CUSTOMER' => 'Customer',
  'SUPER_ADMIN' => 'Platform admin',
  'ADMIN_PARTNER' => 'Platform partner',
  'SERVICE_PROVIDER' => 'Service provider',
  _ => _titleCase(role),
};

String _titleCase(String raw) {
  final value = raw.replaceAll('_', ' ').toLowerCase().trim();
  if (value.isEmpty) return '';
  return '${value[0].toUpperCase()}${value.substring(1)}';
}
