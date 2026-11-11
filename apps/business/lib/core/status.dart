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
