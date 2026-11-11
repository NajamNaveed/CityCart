import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models.dart';

/// The signed-in session: the token and the small user record shown on the
/// account screen. Both live in the platform keystore, never in plain
/// preferences. If the keystore is unavailable the values are still kept in
/// memory for this run, but they are never written somewhere less safe.
class SessionStore {
  SessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'citycart.delivery.token';
  static const _userKey = 'citycart.delivery.user';

  final FlutterSecureStorage _storage;

  String? _token;
  AppUser? _user;

  String? get token => _token;
  AppUser? get user => _user;

  Future<void> load() async {
    try {
      final token = await _storage.read(key: _tokenKey);
      final rawUser = await _storage.read(key: _userKey);
      if (token == null || rawUser == null) return;
      final decoded = jsonDecode(rawUser);
      if (decoded is! Map) return;
      _token = token;
      _user = AppUser.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      // A broken keystore entry is the same as no entry: sign in again.
      _token = null;
      _user = null;
    }
  }

  Future<void> save({required String token, required AppUser user}) async {
    _token = token;
    _user = user;
    try {
      await _storage.write(key: _tokenKey, value: token);
      await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
    } catch (_) {
      // Keep the session in memory; the next launch simply asks to sign in.
    }
  }

  Future<void> clear() async {
    _token = null;
    _user = null;
    try {
      await _storage.delete(key: _tokenKey);
      await _storage.delete(key: _userKey);
    } catch (_) {
      // Nothing else to clear.
    }
  }
}
