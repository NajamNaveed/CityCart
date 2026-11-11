import 'package:flutter/foundation.dart';

/// Where the API lives.
///
/// A release build bakes the address in with
/// `--dart-define=API_URL=https://api.example.com/api/v1`. When no address was
/// provided (local development), the sign-in screen offers a setup sheet so the
/// app can be pointed at a server without rebuilding it.
class AppConfig {
  const AppConfig._();

  static const String buildApiUrl = String.fromEnvironment('API_URL');

  static bool get hasBuildApiUrl => buildApiUrl.trim().isNotEmpty;

  static String get suggestedDevUrl {
    if (kIsWeb) return 'http://localhost:5000';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5000';
    }
    return 'http://localhost:5000';
  }

  /// Accepts a bare server address or one that already ends in /api/v1.
  static String? normalize(String? raw) {
    final value = (raw ?? '').trim().replaceAll(RegExp(r'/+$'), '');
    if (value.isEmpty) return null;
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return null;
    }
    if (RegExp(r'/api/v\d+$').hasMatch(value)) return value;
    return '$value/api/v1';
  }

  static const String appVersion = '1.0.0';
}
