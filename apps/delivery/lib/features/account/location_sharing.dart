import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/api_exception.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// Sharing the rider's position while delivering (docs/11 §30).
///
/// Rules: it is the rider's choice, off by default; it only works while this
/// app is open (no background tracking); and the server keeps only the last
/// point, and only while a job is out for delivery.
class LocationSharingController extends ChangeNotifier {
  LocationSharingController(this._repository, this._prefs);

  static const _prefKey = 'citycart.delivery.share_location';
  static const _sendEvery = Duration(seconds: 20);
  static const _idleAfterNoJob = Duration(minutes: 1);

  final DeliveryRepository _repository;
  final SharedPreferences _prefs;

  bool _enabled = false;
  bool _busy = false;
  bool _started = false;
  String? _error;
  StreamSubscription<Position>? _subscription;
  DateTime? _lastSentAt;
  DateTime _quietUntil = DateTime.fromMillisecondsSinceEpoch(0);

  bool get enabled => _enabled;
  bool get busy => _busy;
  String? get error => _error;

  /// Reads the saved choice and starts sharing if it was on last time.
  Future<void> restore() async {
    if (_started) return;
    _started = true;
    _enabled = _prefs.getBool(_prefKey) ?? false;
    if (_enabled) {
      await _start();
    }
    notifyListeners();
  }

  Future<void> setEnabled(bool value) async {
    if (_busy || value == _enabled) return;
    _busy = true;
    _error = null;
    notifyListeners();

    if (value) {
      _enabled = true;
      await _prefs.setBool(_prefKey, true);
      _busy = false;
      await _start();
      notifyListeners();
      return;
    }

    _enabled = false;
    await _prefs.setBool(_prefKey, false);
    await _stop();
    _busy = false;
    notifyListeners();
  }

  Future<void> _start() async {
    _error = null;

    final serviceOn = await Geolocator.isLocationServiceEnabled();
    if (!serviceOn) {
      await _turnOff(
        'Turn on location in the phone settings to share your position.',
      );
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      final forever = permission == LocationPermission.deniedForever;
      await _turnOff(
        forever
            ? 'Location is blocked for CityCart Delivery. Allow it in the phone settings.'
            : 'Location permission is needed to share your position while delivering.',
      );
      return;
    }

    _subscription?.cancel();
    _subscription =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 25,
          ),
        ).listen(
          _onPosition,
          onError: (_) {
            _error = 'Your position could not be read. Move somewhere with a clearer signal.';
            notifyListeners();
          },
        );
  }

  Future<void> _onPosition(Position position) async {
    if (!_enabled) return;
    final now = DateTime.now();
    if (now.isBefore(_quietUntil)) return;
    if (_lastSentAt != null && now.difference(_lastSentAt!) < _sendEvery) {
      return;
    }
    _lastSentAt = now;

    try {
      await _repository.shareLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      );
      if (_error != null) {
        _error = null;
        notifyListeners();
      }
    } on ApiException catch (error) {
      if (error.code == 'NO_ACTIVE_DELIVERY') {
        // Nothing is out for delivery: stay quiet for a while.
        _quietUntil = now.add(_idleAfterNoJob);
        return;
      }
      if (error.isUnauthorized) return;
      _error = error.message;
      notifyListeners();
    }
  }

  Future<void> _stop() async {
    await _subscription?.cancel();
    _subscription = null;
    _lastSentAt = null;
    await _repository.stopSharingLocation();
  }

  Future<void> _turnOff(String reason) async {
    _enabled = false;
    _error = reason;
    await _prefs.setBool(_prefKey, false);
    notifyListeners();
  }

  /// Called before signing out, so the server stops showing this rider's point.
  Future<void> stopForSignOut() async {
    if (!_enabled) return;
    _enabled = false;
    await _prefs.setBool(_prefKey, false);
    await _stop();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}

final locationSharingProvider = Provider<LocationSharingController>((ref) {
  final controller = LocationSharingController(
    ref.watch(deliveryRepositoryProvider),
    ref.watch(sharedPreferencesProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});
