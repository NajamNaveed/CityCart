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

String friendlyReturnReason(String? reason) => switch ((reason ?? '').trim()) {
  'DAMAGED' => 'Damaged',
  'WRONG_ITEM' => 'Wrong item',
  'MISSING' => 'Missing',
  'NOT_WANTED' => 'Not wanted',
  '' => 'No reason given',
  _ => _titleCase(reason!),
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

/// Why a cart line cannot be bought, in shopper words. Null means it can.
String? cartIssueLabel(String? issue, {int? availableQuantity}) {
  return switch ((issue ?? '').trim()) {
    '' => null,
    'OUT_OF_STOCK' => 'Out of stock',
    'INSUFFICIENT_STOCK' =>
      availableQuantity != null && availableQuantity > 0
          ? 'Only $availableQuantity left'
          : 'Not enough stock',
    'PRODUCT_UNAVAILABLE' => 'No longer sold',
    'BRAND_UNAVAILABLE' => 'Shop is closed',
    _ => _titleCase(issue!),
  };
}

const _serviceBookingTones = <String, StatusTone>{
  'REQUESTED': StatusTone.amber,
  'PROPOSED': StatusTone.amber,
  'ACCEPTED': StatusTone.info,
  'IN_PROGRESS': StatusTone.clay,
  'COMPLETED': StatusTone.amber,
  'CONFIRMED': StatusTone.sage,
  'DECLINED': StatusTone.muted,
  'CANCELLED': StatusTone.muted,
  'DISPUTED': StatusTone.danger,
};

StatusTone toneForServiceBooking(String status) =>
    _serviceBookingTones[status] ?? StatusTone.muted;

/// What the booking state means for the shopper, in one short line.
String friendlyServiceBooking(String status) => switch (status) {
  'REQUESTED' => 'Waiting for reply',
  'PROPOSED' => 'Offer to answer',
  'ACCEPTED' => 'Scheduled',
  'IN_PROGRESS' => 'In progress',
  'COMPLETED' => 'Please confirm',
  'CONFIRMED' => 'Completed',
  'DECLINED' => 'Declined',
  'CANCELLED' => 'Cancelled',
  'DISPUTED' => 'Under review',
  _ => _titleCase(status),
};

String friendlyServiceEvent(String type) => switch (type) {
  'REQUESTED' => 'Request sent',
  'PROPOSED' => 'Provider sent an offer',
  'PROPOSAL_ACCEPTED' => 'You accepted the offer',
  'PROPOSAL_DECLINED' => 'You declined the offer',
  'PROPOSAL_EXPIRED' => 'The offer expired',
  'OFFER_ACCEPTED' => 'Provider accepted your offer',
  'OFFER_DECLINED' => 'Provider declined your offer',
  'ACCEPTED' => 'Booking accepted',
  'STARTED' => 'The provider started the job',
  'COMPLETED' => 'The provider marked it complete',
  'CONFIRMED' => 'You confirmed completion',
  'AUTO_CONFIRMED' => 'Confirmed automatically',
  'CANCELLED' => 'Booking cancelled',
  'DISPUTED' => 'You reported a problem',
  'DISPUTE_RESOLVED' => 'CityCart resolved the report',
  _ => _titleCase(type),
};

String friendlyCancelledBy(String by) => switch (by) {
  'CUSTOMER' => 'You',
  'PROVIDER' => 'The provider',
  'ADMIN' => 'CityCart',
  '' => 'The other side',
  _ => _titleCase(by),
};

String _titleCase(String raw) {
  final value = raw.replaceAll('_', ' ').toLowerCase().trim();
  if (value.isEmpty) return '';
  return '${value[0].toUpperCase()}${value.substring(1)}';
}
