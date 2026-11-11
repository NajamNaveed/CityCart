import 'dart:async';

import 'package:intl/date_symbol_data_local.dart';

/// Mirrors `main()`: the date formatting helpers need the locale data before
/// any screen is built.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  await initializeDateFormatting('en');
  await testMain();
}
