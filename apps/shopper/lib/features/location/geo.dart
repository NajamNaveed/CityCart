import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../../data/models.dart';

/// The pin rounded the way the website rounds it (~1 m), so the stored point
/// matches what the shopper tapped without keeping sensor-level precision.
LatLng roundedPin(double latitude, double longitude) {
  double round(double value) => (value * 1e5).roundToDouble() / 1e5;
  return LatLng(round(latitude), round(longitude));
}

/// Ray casting over an open [lat, lng] ring, mirroring the server's polygon
/// check. This is only a hint for the screen — the server decides at save time.
bool pointInRing(LatLng point, List<LatLng> ring) {
  if (ring.length < 3) return false;
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final latI = ring[i].latitude;
    final lngI = ring[i].longitude;
    final latJ = ring[j].latitude;
    final lngJ = ring[j].longitude;
    if ((latI > point.latitude) != (latJ > point.latitude) &&
        point.longitude <
            (lngJ - lngI) *
                    (point.latitude - latI) /
                    (latJ - latI) +
                lngI) {
      inside = !inside;
    }
  }
  return inside;
}

/// The active blocks whose drawn boundary holds this pin. Centre-only legacy
/// blocks never match, exactly like the server.
List<Block> blocksContainingPoint(List<Block> blocks, LatLng point) {
  return blocks
      .where((block) => pointInRing(point, block.outline))
      .toList(growable: false);
}

/// Compass bearing in degrees (0 = north, 90 = east) from one point to another.
double bearingDegrees(LatLng from, LatLng to) {
  final lat1 = _radians(from.latitude);
  final lat2 = _radians(to.latitude);
  final dLng = _radians(to.longitude - from.longitude);
  final y = math.sin(dLng) * math.cos(lat2);
  final x =
      math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

double _radians(double degrees) => degrees * math.pi / 180;

const _distance = Distance();

/// A polled point only joins the trail once the rider has actually moved, so a
/// parked phone does not pile up identical points.
bool hasMoved(LatLng from, LatLng to, {double metres = 8}) {
  return _distance.as(LengthUnit.Meter, from, to) >= metres;
}
