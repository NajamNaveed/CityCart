import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../core/theme.dart';
import 'route.dart';

const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const _interaction = InteractionOptions(
  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
);

const _distance = Distance();

Widget _tiles() => TileLayer(
  urlTemplate: _tileUrl,
  userAgentPackageName: 'com.citycart.delivery',
  maxZoom: 19,
);

Widget _attribution() => RichAttributionWidget(
  alignment: AttributionAlignment.bottomLeft,
  attributions: [
    TextSourceAttribution('OpenStreetMap contributors', onTap: () {}),
  ],
);

/// The customer pin in the brand green, the way the rest of CityCart draws it.
class _CustomerPin extends StatelessWidget {
  const _CustomerPin();

  @override
  Widget build(BuildContext context) {
    return const Icon(
      Icons.location_on_rounded,
      size: 40,
      color: AppColors.forest,
      shadows: [
        Shadow(color: Color(0x55000000), blurRadius: 5, offset: Offset(0, 2)),
      ],
    );
  }
}

/// A clay badge with a moped that turns to face the way the rider is going.
class _RiderDot extends StatelessWidget {
  const _RiderDot({this.bearing});

  final double? bearing;

  @override
  Widget build(BuildContext context) {
    final angle = (bearing ?? 0) * math.pi / 180;
    return Transform.rotate(
      angle: angle,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.clay,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.white, width: 2.4),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x44000000),
                  blurRadius: 6,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            child: const Icon(
              Icons.two_wheeler_rounded,
              size: 20,
              color: AppColors.white,
            ),
          ),
          if (bearing != null)
            Positioned(
              top: -4,
              child: Icon(
                Icons.navigation_rounded,
                size: 15,
                color: AppColors.clay,
                shadows: const [
                  Shadow(color: Color(0x66000000), blurRadius: 3),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The customer's pin, the rider's own phone position while this screen is
/// open, and — while the parcel is on the way — the road still left to ride.
///
/// The rider's position is read from the phone only for this screen; it is not
/// uploaded here (sharing is a separate, opt-in switch, docs/11 §30).
class RiderLiveMap extends StatefulWidget {
  const RiderLiveMap({
    super.key,
    required this.destination,
    required this.routeToCustomer,
    this.height = 260,
    this.autoRequestLocation = false,
    this.framed = true,
  });

  /// The customer's checkout pin.
  final LatLng destination;

  /// True once the parcel is with the rider, so the road ahead is drawn.
  final bool routeToCustomer;

  final double height;

  /// The full-screen map asks for permission when it opens; a preview waits for
  /// an explicit tap so opening a job does not trigger a permission prompt.
  final bool autoRequestLocation;

  /// A card with a border for the delivery screen; edge-to-edge for the
  /// full-screen map.
  final bool framed;

  @override
  State<RiderLiveMap> createState() => _RiderLiveMapState();
}

class _RiderLiveMapState extends State<RiderLiveMap> {
  final _controller = MapController();
  final List<LatLng> _trail = <LatLng>[];

  StreamSubscription<Position>? _positions;
  LatLng? _me;
  double? _bearing;
  bool _locating = false;
  bool _mapReady = false;
  bool _fitted = false;
  String? _locationMessage;

  List<LatLng>? _road;
  bool _routeFailed = false;
  LatLng? _routeFrom;
  int _routeGeneration = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_locate(ask: widget.autoRequestLocation));
  }

  @override
  void didUpdateWidget(RiderLiveMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.destination != widget.destination) {
      _fitted = false;
      _resetRoute();
      _fitAfterLayout();
    }
    if (oldWidget.routeToCustomer != widget.routeToCustomer) {
      _resetRoute();
      if (widget.routeToCustomer) unawaited(_loadRoute());
    }
  }

  void _resetRoute() {
    _routeGeneration++;
    _road = null;
    _routeFailed = false;
    _routeFrom = null;
  }

  Future<void> _locate({required bool ask}) async {
    if (_locating) return;
    setState(() {
      _locating = true;
      _locationMessage = null;
    });

    try {
      final serviceOn = await Geolocator.isLocationServiceEnabled();
      if (!serviceOn) {
        if (mounted) {
          setState(
            () => _locationMessage =
                'Turn on location to see yourself on the map.',
          );
        }
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && ask) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) {
          setState(
            () => _locationMessage =
                permission == LocationPermission.deniedForever
                ? 'Location is blocked for CityCart Delivery. Allow it in the '
                      'phone settings to see yourself.'
                : 'Tap the target to show yourself on the map.',
          );
        }
        return;
      }

      await _positions?.cancel();
      _positions =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 20,
            ),
          ).listen(
            _onPosition,
            onError: (_) {
              if (!mounted) return;
              setState(
                () => _locationMessage =
                    'Your position could not be read. Move somewhere clearer.',
              );
            },
          );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _onPosition(Position position) {
    if (!mounted) return;
    final point = LatLng(position.latitude, position.longitude);
    final previous = _me;
    setState(() {
      _me = point;
      _locationMessage = null;
      if (previous != null &&
          _distance.as(LengthUnit.Meter, previous, point) >= 8) {
        _bearing = _bearingDegrees(previous, point);
      }
      final last = _trail.isEmpty ? null : _trail.last;
      if (last == null || _distance.as(LengthUnit.Meter, last, point) >= 10) {
        _trail.add(point);
        if (_trail.length > 300) _trail.removeAt(0);
      }
    });
    if (!_fitted) _fitAfterLayout();
    if (widget.routeToCustomer &&
        (_routeFrom == null ||
            _distance.as(LengthUnit.Meter, _routeFrom!, point) >= 60)) {
      unawaited(_loadRoute());
    }
  }

  Future<void> _loadRoute() async {
    final me = _me;
    if (me == null) return;
    final generation = ++_routeGeneration;
    _routeFrom = me;
    final points = await roadRoute(me, widget.destination);
    if (!mounted || generation != _routeGeneration) return;
    setState(() {
      _road = points;
      _routeFailed = points == null;
    });
  }

  void _fitAfterLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_mapReady || _fitted) return;
      final me = _me;
      final points = [widget.destination, ?me];
      _controller.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: const EdgeInsets.all(46),
          maxZoom: 16,
        ),
      );
      _fitted = true;
    });
  }

  void _onMapReady() {
    _mapReady = true;
    _fitAfterLayout();
  }

  void _centreOnMe() {
    final me = _me;
    if (me == null) {
      unawaited(_locate(ask: true));
      return;
    }
    if (!_mapReady) return;
    _controller.move(me, 16.5);
  }

  void _fitBoth() {
    if (!_mapReady) return;
    final me = _me;
    final points = [widget.destination, ?me];
    _controller.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(points),
        padding: const EdgeInsets.all(46),
        maxZoom: 16,
      ),
    );
  }

  @override
  void dispose() {
    _routeGeneration++;
    _positions?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final map = Container(
      height: widget.height,
      decoration: widget.framed
          ? BoxDecoration(border: Border.all(color: AppColors.line))
          : null,
      child: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _controller,
              options: MapOptions(
                initialCenter: widget.destination,
                initialZoom: 15,
                interactionOptions: _interaction,
                onMapReady: _onMapReady,
              ),
              children: [
                _tiles(),
                if (_road != null)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _road!,
                        strokeWidth: 7,
                        color: AppColors.white.withValues(alpha: 0.9),
                      ),
                      Polyline(
                        points: _road!,
                        strokeWidth: 4.5,
                        color: AppColors.forest.withValues(alpha: 0.72),
                      ),
                    ],
                  ),
                if (_routeFailed)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: [me ?? widget.destination, widget.destination],
                        strokeWidth: 3,
                        color: AppColors.muted.withValues(alpha: 0.6),
                        pattern: StrokePattern.dashed(segments: const [6, 9]),
                      ),
                    ],
                  ),
                if (_trail.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _trail,
                        strokeWidth: 4.5,
                        color: AppColors.clay.withValues(alpha: 0.55),
                        borderColor: AppColors.white.withValues(alpha: 0.75),
                        borderStrokeWidth: 1.2,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: widget.destination,
                      width: 40,
                      height: 40,
                      alignment: Alignment.topCenter,
                      child: const IgnorePointer(child: _CustomerPin()),
                    ),
                    if (me != null)
                      Marker(
                        point: me,
                        width: 48,
                        height: 48,
                        child: IgnorePointer(
                          child: _RiderDot(bearing: _bearing),
                        ),
                      ),
                  ],
                ),
                _attribution(),
              ],
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Column(
              children: [
                _MapControl(
                  icon: me == null
                      ? Icons.my_location_rounded
                      : Icons.near_me_rounded,
                  label: me == null
                      ? 'Show my position'
                      : 'Centre the map on me',
                  busy: _locating,
                  onTap: _centreOnMe,
                ),
                const SizedBox(height: 8),
                _MapControl(
                  icon: Icons.center_focus_strong_rounded,
                  label: 'Fit the customer and me',
                  onTap: _fitBoth,
                ),
              ],
            ),
          ),
          if (_locationMessage != null)
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: IgnorePointer(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.surface.withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.location_disabled_rounded,
                        size: 16,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _locationMessage!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.3,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
    return widget.framed
        ? ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.card),
            child: map,
          )
        : map;
  }
}

double _bearingDegrees(LatLng from, LatLng to) {
  final rad = math.pi / 180;
  final lat1 = from.latitude * rad;
  final lat2 = to.latitude * rad;
  final dLng = (to.longitude - from.longitude) * rad;
  final y = math.sin(dLng) * math.cos(lat2);
  final x =
      math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

class _MapControl extends StatelessWidget {
  const _MapControl({
    required this.icon,
    required this.label,
    required this.onTap,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: AppColors.surface,
        elevation: 2,
        shadowColor: const Color(0x33000000),
        shape: const CircleBorder(
          side: BorderSide(color: AppColors.line, width: 1.2),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: busy ? null : onTap,
          child: Tooltip(
            message: label,
            child: SizedBox(
              width: 42,
              height: 42,
              child: busy
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.forest,
                      ),
                    )
                  : Icon(icon, size: 20, color: AppColors.forest),
            ),
          ),
        ),
      ),
    );
  }
}
