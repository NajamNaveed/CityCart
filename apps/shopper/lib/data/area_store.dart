import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// The shopper's chosen city and block, kept on the device. Reading preferences
/// is synchronous, so the app knows the area before the first frame and never
/// flashes the chooser.
class AreaStore {
  AreaStore(this._prefs);

  static const _cityId = 'citycart.shopper.area.cityId';
  static const _cityName = 'citycart.shopper.area.cityName';
  static const _blockId = 'citycart.shopper.area.blockId';
  static const _blockName = 'citycart.shopper.area.blockName';
  static const _latitude = 'citycart.shopper.area.latitude';
  static const _longitude = 'citycart.shopper.area.longitude';

  final SharedPreferences _prefs;

  AreaSelection? read() {
    final cityId = _prefs.getString(_cityId);
    final cityName = _prefs.getString(_cityName);
    if (cityId == null || cityName == null) return null;
    return AreaSelection(
      cityId: cityId,
      cityName: cityName,
      blockId: _prefs.getString(_blockId),
      blockName: _prefs.getString(_blockName),
      latitude: _prefs.getDouble(_latitude),
      longitude: _prefs.getDouble(_longitude),
    );
  }

  Future<void> write(AreaSelection area) async {
    await _prefs.setString(_cityId, area.cityId);
    await _prefs.setString(_cityName, area.cityName);
    await _writeOptional(_blockId, area.blockId);
    await _writeOptional(_blockName, area.blockName);
    await _writeOptionalDouble(_latitude, area.latitude);
    await _writeOptionalDouble(_longitude, area.longitude);
  }

  Future<void> clear() async {
    await _prefs.remove(_cityId);
    await _prefs.remove(_cityName);
    await _prefs.remove(_blockId);
    await _prefs.remove(_blockName);
    await _prefs.remove(_latitude);
    await _prefs.remove(_longitude);
  }

  Future<void> _writeOptional(String key, String? value) async {
    if (value == null || value.isEmpty) {
      await _prefs.remove(key);
    } else {
      await _prefs.setString(key, value);
    }
  }

  Future<void> _writeOptionalDouble(String key, double? value) async {
    if (value == null) {
      await _prefs.remove(key);
    } else {
      await _prefs.setDouble(key, value);
    }
  }
}

/// The chosen area, shared with the whole app. A plain [ChangeNotifier] so the
/// router can move to the area chooser the moment one is needed.
class AreaController extends ChangeNotifier {
  AreaController(this._store) : _area = _store.read();

  final AreaStore _store;
  AreaSelection? _area;

  AreaSelection? get area => _area;
  bool get isReady => _area != null;

  Future<void> choose(AreaSelection area) async {
    _area = area;
    notifyListeners();
    await _store.write(area);
  }

  Future<void> clear() async {
    _area = null;
    notifyListeners();
    await _store.clear();
  }
}
