import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'geo.dart';

/// Used only when there is nothing else to centre on.
const _fallbackCenter = LatLng(31.4504, 73.135);

/// OpenStreetMap's public tiles: free, no key, no Google account. The app
/// identifier is sent because OSM's usage policy asks for it.
const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

Widget _tiles() => TileLayer(
  urlTemplate: _tileUrl,
  userAgentPackageName: 'com.citycart.shopper',
  maxZoom: 19,
);

Widget _attribution() => RichAttributionWidget(
  alignment: AttributionAlignment.bottomLeft,
  attributions: [
    TextSourceAttribution(
      'OpenStreetMap contributors',
      onTap: () => launchUrl(
        Uri.parse('https://www.openstreetmap.org/copyright'),
        mode: LaunchMode.externalApplication,
      ),
    ),
  ],
);

const _interaction = InteractionOptions(
  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
);

/// The shopper's own delivery pin: the green teardrop the website uses, with
/// the tip on the exact point.
class _DeliveryPin extends StatelessWidget {
  const _DeliveryPin({this.size = 42});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.location_on_rounded,
      size: size,
      color: AppColors.forest,
      shadows: const [
        Shadow(color: Color(0x55000000), blurRadius: 5, offset: Offset(0, 2)),
      ],
    );
  }
}

/// The city's delivery blocks drawn over a free OpenStreetMap, with a pin the
/// shopper can drop by tapping. The server still decides whether the point is
/// inside an active block (`OUTSIDE_DELIVERY_ZONE` otherwise), so this screen
/// is a hint, never the authority.
class DeliverySpotMap extends StatelessWidget {
  const DeliverySpotMap({
    super.key,
    required this.blocks,
    this.pin,
    this.onPick,
    this.height = 280,
  });

  final List<Block> blocks;
  final LatLng? pin;
  final ValueChanged<LatLng>? onPick;
  final double height;

  @override
  Widget build(BuildContext context) {
    final outlines = [
      for (final block in blocks)
        if (block.outline.length >= 3) block,
    ];
    final chosen = pin == null
        ? const <Block>[]
        : blocksContainingPoint(blocks, pin!);
    final chosenIds = chosen.map((block) => block.id).toSet();

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: Container(
        height: height,
        decoration: BoxDecoration(border: Border.all(color: AppColors.line)),
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(
                initialCenter: pin ?? _fallbackCenter,
                initialZoom: pin == null ? 12.5 : 15,
                initialCameraFit: _fit(outlines, pin),
                interactionOptions: _interaction,
                onTap: onPick == null
                    ? null
                    : (_, point) => onPick!(
                        roundedPin(point.latitude, point.longitude),
                      ),
              ),
              children: [
                _tiles(),
                if (outlines.isNotEmpty)
                  PolygonLayer(
                    polygons: [
                      for (final block in outlines)
                        Polygon(
                          points: block.outline,
                          color: AppColors.forest.withValues(
                            alpha: chosenIds.contains(block.id) ? 0.18 : 0.07,
                          ),
                          borderColor: AppColors.forest.withValues(
                            alpha: chosenIds.contains(block.id) ? 0.8 : 0.45,
                          ),
                          borderStrokeWidth: chosenIds.contains(block.id)
                              ? 2
                              : 1.3,
                        ),
                    ],
                  ),
                if (outlines.isNotEmpty)
                  MarkerLayer(
                    markers: [
                      for (final block in outlines)
                        if (block.center != null)
                          Marker(
                            point: block.center!,
                            width: 118,
                            height: 24,
                            child: IgnorePointer(
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.surface.withValues(
                                      alpha: 0.9,
                                    ),
                                    borderRadius: BorderRadius.circular(7),
                                  ),
                                  child: Text(
                                    block.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.inkSoft,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                    ],
                  ),
                if (pin != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: pin!,
                        width: 42,
                        height: 42,
                        // The teardrop's tip, not its middle, sits on the point.
                        alignment: Alignment.topCenter,
                        child: const IgnorePointer(child: _DeliveryPin()),
                      ),
                    ],
                  ),
                _attribution(),
              ],
            ),
            if (pin == null)
              Positioned(
                left: 10,
                right: 10,
                top: 10,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.94),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: const Text(
                      'Tap inside a shaded area to drop your delivery pin.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static CameraFit? _fit(List<Block> outlines, LatLng? pin) {
    if (pin != null) {
      return CameraFit.coordinates(
        coordinates: [pin],
        padding: const EdgeInsets.all(48),
        maxZoom: 15,
      );
    }
    final points = [
      for (final block in outlines) ...block.outline,
    ];
    if (points.isEmpty) return null;
    return CameraFit.bounds(
      bounds: LatLngBounds.fromPoints(points),
      padding: const EdgeInsets.all(22),
      maxZoom: 15,
    );
  }
}

/// The map plus its legend and errors, shared by the address form and checkout
/// so both choose a delivery spot the same way.
class DeliverySpotPicker extends StatelessWidget {
  const DeliverySpotPicker({
    super.key,
    required this.hasArea,
    required this.blocks,
    required this.pin,
    required this.label,
    required this.error,
    required this.onPick,
    this.onRetry,
    this.height = 280,
  });

  final bool hasArea;
  final AsyncValue<List<Block>>? blocks;
  final LatLng? pin;
  final String? label;
  final bool error;
  final ValueChanged<LatLng> onPick;
  final VoidCallback? onRetry;
  final double height;

  @override
  Widget build(BuildContext context) {
    final async = blocks;
    final list = async?.asData?.value;
    final hasOutlines =
        list != null && list.any((block) => block.outline.length >= 3);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Delivery spot', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          'Tap the map to put the pin where the rider should come. '
          'Shaded areas are where we deliver.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        if (!hasArea || async == null)
          const NoticeCard(
            icon: Icons.map_outlined,
            tone: StatusTone.info,
            title: 'Choose your city first',
            message:
                'Pick your delivery area from the You tab, then come back to '
                'place this address on the map.',
          )
        else if (async.isLoading)
          SkeletonBox(height: height)
        else if (async.hasError)
          SurfaceCard(
            borderColor: error ? AppColors.danger : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'We could not load the delivery areas.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (onRetry != null)
                  TextButton(onPressed: onRetry, child: const Text('Try again')),
              ],
            ),
          )
        else if (!hasOutlines)
          const NoticeCard(
            icon: Icons.location_off_outlined,
            tone: StatusTone.amber,
            title: 'No delivery areas here yet',
            message:
                'This city has no drawn delivery areas, so a pin cannot be '
                'checked. Choose another city or ask the shop where they '
                'deliver.',
          )
        else ...[
          DeliverySpotMap(
            blocks: list,
            pin: pin,
            onPick: onPick,
            height: height,
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                pin == null
                    ? Icons.add_location_alt_outlined
                    : Icons.place_rounded,
                size: 19,
                color: error
                    ? AppColors.danger
                    : pin == null
                    ? AppColors.muted
                    : AppColors.forest,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  pin == null
                      ? 'No spot chosen yet.'
                      : 'Delivering to ${label ?? 'the pinned spot'}.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: error
                        ? AppColors.danger
                        : pin == null
                        ? AppColors.muted
                        : AppColors.inkSoft,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
        if (error && hasOutlines)
          const Padding(
            padding: EdgeInsets.only(top: 7, left: 4),
            child: Text(
              'Drop the pin inside a shaded delivery area to continue.',
              style: TextStyle(
                fontSize: 12.5,
                color: AppColors.danger,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

/// The rider's last shared position, the shopper's pin, and the trail of every
/// position this screen has seen while it stayed open. The server keeps only
/// the last point (docs/11 §30), so the trail is deliberately screen-local.
class RiderTrackingMap extends StatefulWidget {
  const RiderTrackingMap({
    super.key,
    required this.rider,
    required this.trail,
    this.destination,
    this.bearing,
    this.height = 240,
  });

  final LatLng rider;
  final List<LatLng> trail;
  final LatLng? destination;

  /// Degrees clockwise from north, or null while the rider has not moved yet.
  final double? bearing;
  final double height;

  @override
  State<RiderTrackingMap> createState() => _RiderTrackingMapState();
}

class _RiderTrackingMapState extends State<RiderTrackingMap> {
  final _controller = MapController();
  bool _fitted = false;

  @override
  void initState() {
    super.initState();
    _fitAfterLayout();
  }

  @override
  void didUpdateWidget(RiderTrackingMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_fitted) _fitAfterLayout();
  }

  void _fitAfterLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _fitted) return;
      final points = [
        widget.rider,
        if (widget.destination != null) widget.destination!,
        ...widget.trail,
      ];
      _controller.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: const EdgeInsets.all(42),
          maxZoom: 16,
        ),
      );
      _fitted = true;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final destination = widget.destination;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(border: Border.all(color: AppColors.line)),
        child: FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: widget.rider,
            initialZoom: 15,
            interactionOptions: _interaction,
          ),
          children: [
            _tiles(),
            if (widget.trail.length >= 2)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: widget.trail,
                    strokeWidth: 4.5,
                    color: AppColors.clay.withValues(alpha: 0.55),
                    borderColor: AppColors.white.withValues(alpha: 0.75),
                    borderStrokeWidth: 1.2,
                  ),
                ],
              ),
            MarkerLayer(
              markers: [
                if (destination != null)
                  Marker(
                    point: destination,
                    width: 38,
                    height: 38,
                    alignment: Alignment.topCenter,
                    child: const IgnorePointer(child: _DeliveryPin(size: 38)),
                  ),
                Marker(
                  point: widget.rider,
                  width: 48,
                  height: 48,
                  child: IgnorePointer(
                    child: _RiderMarker(bearing: widget.bearing),
                  ),
                ),
              ],
            ),
            _attribution(),
          ],
        ),
      ),
    );
  }
}

/// A moped badge that turns to face the way the rider is travelling.
class _RiderMarker extends StatelessWidget {
  const _RiderMarker({this.bearing});

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
