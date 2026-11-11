import '../data/models.dart';
import 'widgets.dart';

/// Shared wording for the review state of a shop or service business. The
/// server decides the state; this only names it in the owner's language.
String reviewStatusLabel(String status) {
  return switch (status) {
    'ACTIVE' => 'Live',
    'PENDING' => 'In review',
    'SUSPENDED' => 'Paused',
    'REJECTED' => 'Not approved',
    'TERMINATED' => 'Closed',
    _ => 'Unknown',
  };
}

AppTone reviewStatusTone(String status) {
  return switch (status) {
    'ACTIVE' => AppTone.green,
    'PENDING' => AppTone.amber,
    'SUSPENDED' || 'REJECTED' || 'TERMINATED' => AppTone.red,
    _ => AppTone.neutral,
  };
}

/// One sentence explaining anything other than ACTIVE, or null when the
/// business is live.
String? reviewStatusMessage(String status, {required bool provider}) {
  return switch (status) {
    'ACTIVE' => null,
    'PENDING' =>
      provider
          ? 'Your profile is waiting for CityCart approval. You can look around, '
                'but customers cannot book you yet.'
          : 'Your shop is waiting for CityCart approval. Orders and products '
                'open once it is live.',
    'SUSPENDED' =>
      'This business is paused. Contact CityCart support to reopen it.',
    'REJECTED' =>
      'This shop was not approved. Contact CityCart support for details.',
    'TERMINATED' => 'This business is closed.',
    _ => 'The status of this business could not be read.',
  };
}

/// The booking lifecycle in an owner's words.
String bookingStatusLabel(String status) {
  return switch (status) {
    'REQUESTED' => 'New request',
    'PROPOSED' => 'Offer sent',
    'ACCEPTED' => 'Scheduled',
    'IN_PROGRESS' => 'In progress',
    'COMPLETED' => 'Awaiting customer',
    'CONFIRMED' => 'Done',
    'DECLINED' => 'Declined',
    'CANCELLED' => 'Cancelled',
    'DISPUTED' => 'In dispute',
    _ => 'Unknown',
  };
}

AppTone bookingStatusTone(String status) {
  return switch (status) {
    'REQUESTED' || 'PROPOSED' => AppTone.amber,
    'ACCEPTED' || 'IN_PROGRESS' => AppTone.green,
    'COMPLETED' => AppTone.blue,
    'CONFIRMED' => AppTone.green,
    'DECLINED' || 'CANCELLED' || 'DISPUTED' => AppTone.red,
    _ => AppTone.neutral,
  };
}

/// What the owner should do next, in one plain sentence.
String bookingStatusDetail(String status) {
  return switch (status) {
    'REQUESTED' =>
      'A customer wants this job. Accept it, send your own price, or decline '
          'and let them know why.',
    'PROPOSED' =>
      'Your offer is with the customer. You can send a revised offer while '
          'you wait for their answer.',
    'ACCEPTED' =>
      'The price and time are agreed. The job is on your calendar — start it '
          'when you arrive.',
    'IN_PROGRESS' =>
      'You have started this job. Mark it complete when the work is done and '
          'state the final amount.',
    'COMPLETED' =>
      'The customer has 3 days to confirm the finished job. After that it '
          'confirms automatically.',
    'CONFIRMED' => 'This job is finished and closed.',
    'DECLINED' => 'You declined this request.',
    'CANCELLED' => 'This booking was cancelled.',
    'DISPUTED' =>
      'The customer raised a dispute. CityCart support will review it and '
          'contact both sides.',
    _ => 'The state of this booking could not be read.',
  };
}

/// The order lifecycle in a shop owner's words.
String brandOrderStatusLabel(String status) {
  return switch (status) {
    'PENDING' => 'New order',
    'CONFIRMED' => 'Confirmed',
    'PROCESSING' => 'Preparing',
    'READY_FOR_SHIPMENT' => 'Ready to ship',
    'SHIPPED' => 'On the way',
    'OUT_FOR_DELIVERY' => 'Out for delivery',
    'DELIVERED' => 'Delivered',
    'RETURNED' => 'Returned',
    'REJECTED' => 'Rejected',
    'CANCELLED' => 'Cancelled',
    _ => 'Unknown',
  };
}

AppTone brandOrderStatusTone(String status) {
  return switch (status) {
    'PENDING' => AppTone.amber,
    'CONFIRMED' || 'PROCESSING' => AppTone.blue,
    'READY_FOR_SHIPMENT' || 'DELIVERED' => AppTone.green,
    'SHIPPED' || 'OUT_FOR_DELIVERY' => AppTone.blue,
    'RETURNED' || 'REJECTED' || 'CANCELLED' => AppTone.red,
    _ => AppTone.neutral,
  };
}

/// What the shop should do next, in one plain sentence.
String brandOrderStatusDetail(String status) {
  return switch (status) {
    'PENDING' =>
      'Confirm this order to keep the stock reserved, or reject it and return '
          'the items to your inventory.',
    'CONFIRMED' =>
      'The stock is reserved. Start preparing the items when you are ready.',
    'PROCESSING' =>
      'Pack the order, then mark it ready so the delivery team can collect it.',
    'READY_FOR_SHIPMENT' =>
      'The delivery team will collect this from your shop. Nothing else is '
          'needed from you.',
    'SHIPPED' || 'OUT_FOR_DELIVERY' => 'This order is with the delivery team.',
    'DELIVERED' => 'This order was delivered and is closed.',
    'RETURNED' => 'This order came back to the shop.',
    'REJECTED' =>
      'You rejected this order. The stock was returned and the payment was '
          'cancelled.',
    'CANCELLED' => 'The customer cancelled this order.',
    _ => 'The state of this order could not be read.',
  };
}

/// Payment wording. Payment is separate from the order state, so it is always
/// shown on its own.
String paymentStatusLabel(String status) {
  return switch (status) {
    'PENDING' => 'Unpaid',
    'PAID' => 'Paid',
    'FAILED' => 'Payment failed',
    'REFUNDED' => 'Refunded',
    'PARTIALLY_REFUNDED' => 'Partly refunded',
    'CANCELLED' => 'Payment cancelled',
    _ => 'Unknown',
  };
}

String paymentMethodLabel(String method) {
  return switch (method) {
    'COD' => 'Cash on delivery',
    'CARD' => 'Card',
    'BANK_TRANSFER' => 'Bank transfer',
    'WALLET' => 'Mobile wallet',
    _ => 'Payment',
  };
}

/// The delivery leg, after the shop hands the order over.
String brandDeliveryStatusLabel(String status) {
  return switch (status) {
    'PENDING' => 'Waiting for a rider',
    'PREPARING' => 'Being prepared',
    'READY_FOR_PICKUP' => 'Ready for pickup',
    'PICKED_UP' => 'Picked up',
    'IN_TRANSIT' => 'On the way',
    'OUT_FOR_DELIVERY' => 'Out for delivery',
    'DELIVERED' => 'Delivered',
    'FAILED' => 'Delivery failed',
    'CANCELLED' => 'Delivery cancelled',
    'RETURNED' => 'Returned to the shop',
    _ => 'Unknown',
  };
}

AppTone brandDeliveryStatusTone(String status) {
  return switch (status) {
    'PENDING' || 'PREPARING' || 'READY_FOR_PICKUP' => AppTone.amber,
    'PICKED_UP' || 'IN_TRANSIT' || 'OUT_FOR_DELIVERY' => AppTone.blue,
    'DELIVERED' => AppTone.green,
    'FAILED' || 'CANCELLED' || 'RETURNED' => AppTone.red,
    _ => AppTone.neutral,
  };
}

/// What the shop should do next with this delivery, in one plain sentence.
String brandDeliveryStatusDetail(String status) {
  return switch (status) {
    'PENDING' =>
      'The delivery team is arranging a rider. Nothing is needed from you.',
    'PREPARING' =>
      'Your order is being prepared for pickup. Nothing is needed from you.',
    'READY_FOR_PICKUP' =>
      'The parcel is waiting for a rider. Mark it picked up once it leaves '
          'your shop.',
    'PICKED_UP' =>
      'The rider has the parcel. Mark it on the way when the ride starts.',
    'IN_TRANSIT' =>
      'The parcel is on its way. Mark it out for delivery when the rider is '
          'near the customer.',
    'OUT_FOR_DELIVERY' =>
      'The customer is getting the parcel now. Mark it delivered when they '
          'have it, or record a failed attempt.',
    'DELIVERED' => 'The customer has this order. This delivery is closed.',
    'FAILED' =>
      'The last attempt failed. Send it out again when the customer is ready.',
    'CANCELLED' => 'This delivery was cancelled.',
    'RETURNED' =>
      'Every item was refused at the door and came back to your shop.',
    _ => 'The delivery state could not be read.',
  };
}

/// The moves a shop may make from here. The server checks the same steps and
/// remains the authority; an empty list means the shop has nothing to do.
List<String> brandDeliveryNextStatuses(String status) {
  return switch (status) {
    'READY_FOR_PICKUP' => const ['PICKED_UP'],
    'PICKED_UP' => const ['IN_TRANSIT'],
    'IN_TRANSIT' => const ['OUT_FOR_DELIVERY'],
    'OUT_FOR_DELIVERY' => const ['DELIVERED', 'FAILED'],
    'FAILED' => const ['OUT_FOR_DELIVERY'],
    _ => const [],
  };
}

String brandDeliveryActionLabel(String status) {
  return switch (status) {
    'PICKED_UP' => 'Mark picked up',
    'IN_TRANSIT' => 'Mark on the way',
    'OUT_FOR_DELIVERY' => 'Mark out for delivery',
    'DELIVERED' => 'Mark delivered',
    'FAILED' => 'Record failed attempt',
    _ => 'Update delivery',
  };
}

/// A returned parcel, in the shop's words.
String returnStatusLabel(String status) {
  return switch (status) {
    'IN_TRANSIT' => 'On the way back',
    'RECEIVED' => 'Received',
    _ => 'Unknown',
  };
}

AppTone returnStatusTone(String status) {
  return switch (status) {
    'IN_TRANSIT' => AppTone.amber,
    'RECEIVED' => AppTone.green,
    _ => AppTone.neutral,
  };
}

String returnStatusDetail(String status) {
  return switch (status) {
    'IN_TRANSIT' =>
      'The refused items are coming back to your shop. Receive them when they '
          'arrive and choose what goes back into stock.',
    'RECEIVED' =>
      'These goods have been received. Restocked lines are back in your '
          'inventory; the rest were written off.',
    _ => 'The state of this return could not be read.',
  };
}

String returnReasonLabel(String reason) {
  return switch (reason) {
    'DAMAGED' => 'Damaged',
    'WRONG_ITEM' => 'Wrong item',
    'NOT_WANTED' => 'Not wanted',
    'MISSING' => 'Missing',
    _ => 'Refused',
  };
}

AppTone returnReasonTone(String reason) {
  return switch (reason) {
    'DAMAGED' || 'MISSING' => AppTone.red,
    'WRONG_ITEM' || 'NOT_WANTED' => AppTone.amber,
    _ => AppTone.neutral,
  };
}

String productStatusLabel(String status) {
  return switch (status) {
    'ACTIVE' => 'Live',
    'DRAFT' => 'Draft',
    'INACTIVE' => 'Hidden',
    'ARCHIVED' => 'Archived',
    _ => 'Unknown',
  };
}

AppTone productStatusTone(String status) {
  return switch (status) {
    'ACTIVE' => AppTone.green,
    'DRAFT' => AppTone.amber,
    'INACTIVE' => AppTone.neutral,
    'ARCHIVED' => AppTone.red,
    _ => AppTone.neutral,
  };
}

String productStatusDetail(String status) {
  return switch (status) {
    'ACTIVE' => 'Customers can find this product in your shop right now.',
    'DRAFT' =>
      'This product is not in the shop yet. Publish it when it is ready.',
    'INACTIVE' =>
      'You hid this product. Customers cannot see it until you show it again.',
    'ARCHIVED' =>
      'This product is archived. Its past orders keep their record.',
    _ => 'The product state is not known.',
  };
}

String stockStatusLabel(String status) {
  return switch (status) {
    'IN_STOCK' => 'In stock',
    'LOW_STOCK' => 'Running low',
    'OUT_OF_STOCK' => 'Out of stock',
    'NOT_TRACKED' => 'Stock not tracked',
    _ => 'Unknown',
  };
}

AppTone stockStatusTone(String status) {
  return switch (status) {
    'IN_STOCK' => AppTone.green,
    'LOW_STOCK' => AppTone.amber,
    'OUT_OF_STOCK' => AppTone.red,
    _ => AppTone.neutral,
  };
}

/// The quantity sentence on a product card: "6 left", "Out of stock".
String stockQuantityLabel(BrandStock? stock) {
  if (stock == null) return 'Out of stock';
  if (!stock.trackInventory) return 'Stock not tracked';
  if (stock.availableQuantity <= 0) return 'Out of stock';
  final unit = stock.availableQuantity == 1 ? 'item' : 'items';
  return '${stock.availableQuantity} $unit left';
}

String stockAdjustmentReasonLabel(String reason) {
  return switch (reason) {
    'STOCK_RECEIVED' => 'Stock received',
    'MANUAL_ADJUSTMENT' => 'Manual correction',
    'DAMAGED' => 'Damaged',
    'LOST' => 'Lost',
    'RETURNED' => 'Customer return',
    'CORRECTION' => 'Counting correction',
    _ => 'Manual correction',
  };
}

/// One line for an entry in the booking history.
String bookingEventLabel(String type) {
  return switch (type) {
    'REQUESTED' => 'Customer sent the request',
    'ACCEPTED' => 'You accepted the request',
    'OFFER_ACCEPTED' => 'You accepted the customer’s offer',
    'OFFER_DECLINED' => 'You declined the request',
    'PROPOSED' => 'You sent a price proposal',
    'PROPOSAL_EXPIRED' => 'The proposal expired',
    'PROPOSAL_ACCEPTED' => 'Customer accepted your proposal',
    'PROPOSAL_DECLINED' => 'Customer declined your proposal',
    'STARTED' => 'You started the job',
    'COMPLETED' => 'You marked the job complete',
    'CONFIRMED' => 'Customer confirmed the job',
    'AUTO_CONFIRMED' => 'The job confirmed automatically',
    'DISPUTED' => 'Customer raised a dispute',
    'CANCELLED' => 'Booking cancelled',
    'DISPUTE_RESOLVED' => 'CityCart resolved the dispute',
    _ => 'Booking updated',
  };
}
