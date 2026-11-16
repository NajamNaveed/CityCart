import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:latlong2/latlong.dart';

/// The remaining road route between the rider and the customer's pin.
///
/// It comes from the public OSRM demo router: free, no key, the same family as
/// the OpenStreetMap tiles. It is a courtesy service with no SLA, so every
/// failure is silent and the map falls back to a dashed hint. The answer is
/// cached per leg so a moving rider does not re-ask for the same road.
const _routerUrl = 'https://router.project-osrm.org/route/v1/driving';

final _dio = Dio(
  BaseOptions(
    connectTimeout: const Duration(seconds: 6),
    receiveTimeout: const Duration(seconds: 6),
    headers: const {'User-Agent': 'com.citycart.delivery'},
  ),
);

final LinkedHashMap<String, List<LatLng>> _cache = LinkedHashMap();
const _cacheSize = 12;

String _key(LatLng from, LatLng to) =>
    '${from.latitude.toStringAsFixed(4)},${from.longitude.toStringAsFixed(4)}>'
    '${to.latitude.toStringAsFixed(4)},${to.longitude.toStringAsFixed(4)}';

/// The road polyline from [from] to [to], or null when the router cannot
/// answer. Callers decide how to show the absence; this never throws.
Future<List<LatLng>?> roadRoute(LatLng from, LatLng to) async {
  final key = _key(from, to);
  final cached = _cache[key];
  if (cached != null) return cached;

  try {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_routerUrl/${from.longitude},${from.latitude};'
      '${to.longitude},${to.latitude}',
      queryParameters: const {
        'overview': 'full',
        'geometries': 'geojson',
        'alternatives': 'false',
        'steps': 'false',
      },
    );
    final routes = response.data?['routes'];
    final geometry = routes is List && routes.isNotEmpty
        ? (routes.first as Map)['geometry']
        : null;
    final coordinates = geometry is Map ? geometry['coordinates'] : null;
    if (coordinates is! List || coordinates.length < 2) return null;

    final points = <LatLng>[
      for (final raw in coordinates)
        if (raw is List && raw.length >= 2)
          LatLng((raw[1] as num).toDouble(), (raw[0] as num).toDouble()),
    ];
    if (points.length < 2) return null;

    if (_cache.length >= _cacheSize) _cache.remove(_cache.keys.first);
    _cache[key] = points;
    return points;
  } catch (_) {
    return null;
  }
}
