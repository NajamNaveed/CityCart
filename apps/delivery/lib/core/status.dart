/// How a delivery state is shown to a rider. Behaviour lives in
/// `features/deliveries/delivery_rules.dart`; this file only decides words and
/// colours, so the same status never reads two different ways on two screens.
enum StatusTone { forest, sage, clay, amber, danger, muted }

String friendlyStatus(String status) => switch (status) {
  'PENDING' => 'Order placed',
  'PREPARING' => 'Being packed',
  'READY_FOR_PICKUP' => 'Ready to pick up',
  'PICKED_UP' => 'Parcel collected',
  'IN_TRANSIT' => 'On the way',
  'OUT_FOR_DELIVERY' => 'At the door',
  'DELIVERED' => 'Delivered',
  'FAILED' => 'Not delivered',
  'CANCELLED' => 'Cancelled',
  'RETURNED' => 'Returned to store',
  _ => 'Delivery',
};

String statusHelper(String status) => switch (status) {
  'PENDING' => 'The store has received the order.',
  'PREPARING' => 'The store is packing the order.',
  'READY_FOR_PICKUP' => 'The parcel is waiting for you at the store.',
  'PICKED_UP' => 'The parcel is with you. Head to the customer.',
  'IN_TRANSIT' => 'You are on the way to the customer.',
  'OUT_FOR_DELIVERY' => 'You are at the customer. Ask for their code.',
  'DELIVERED' => 'This job is complete.',
  'FAILED' => 'This attempt was not delivered. Try again when you can.',
  'CANCELLED' => 'The order was cancelled.',
  'RETURNED' => 'Everything went back to the store.',
  _ => '',
};

StatusTone toneForStatus(String status) => switch (status) {
  'READY_FOR_PICKUP' || 'OUT_FOR_DELIVERY' => StatusTone.clay,
  'PICKED_UP' || 'IN_TRANSIT' => StatusTone.sage,
  'DELIVERED' => StatusTone.forest,
  'FAILED' => StatusTone.danger,
  'PREPARING' || 'RETURNED' => StatusTone.amber,
  _ => StatusTone.muted,
};

const progressLabels = ['Pick up', 'On the way', 'At the door', 'Done'];

int? progressIndexFor(String status) => switch (status) {
  'READY_FOR_PICKUP' => 0,
  'PICKED_UP' || 'IN_TRANSIT' => 1,
  'OUT_FOR_DELIVERY' => 2,
  'DELIVERED' || 'RETURNED' => 3,
  _ => null,
};
