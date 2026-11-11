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
