import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'delivery_rules.dart';
import 'live_map.dart';

/// One job on the rider's own map: the customer's pin, this phone's position,
/// and — once the parcel is with the rider — the road still left to ride.
/// Nothing is handed to a separate maps app, so the route and the customer
/// details stay inside CityCart.
class RiderMapScreen extends ConsumerStatefulWidget {
  const RiderMapScreen({super.key, required this.deliveryId});

  final String deliveryId;

  @override
  ConsumerState<RiderMapScreen> createState() => _RiderMapScreenState();
}

class _RiderMapScreenState extends ConsumerState<RiderMapScreen> {
  RiderDelivery? _delivery;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final delivery = await ref
          .read(deliveryRepositoryProvider)
          .get(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = delivery;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error = 'This map could not be loaded. Check your connection.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _call(String phone) async {
    try {
      final opened = await launchUrl(
        Uri.parse(telUrl(phone)),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        showAppSnack(context, 'This phone cannot make a call.', error: true);
      }
    } catch (_) {
      if (mounted) {
        showAppSnack(context, 'This phone cannot make a call.', error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = _delivery;
    final pin = delivery?.deliveryLocation;
    final destination = pin == null
        ? null
        : LatLng(pin.latitude, pin.longitude);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: delivery?.orderNumber ?? 'Map',
              subtitle: delivery == null
                  ? null
                  : friendlyStatus(delivery.status),
              trailing: IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded, size: 21),
                tooltip: 'Refresh',
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(44, 44),
                ),
              ),
            ),
            Expanded(
              child: _loading && delivery == null
                  ? const Center(
                      child: CircularProgressIndicator(color: AppColors.forest),
                    )
                  : destination == null
                  ? _MapProblem(
                      message:
                          _error ??
                          (delivery == null
                              ? 'This map could not be loaded.'
                              : 'This order has no map pin yet.'),
                      onRetry: _load,
                    )
                  : RiderLiveMap(
                      destination: destination,
                      routeToCustomer: isOnTheWay(delivery!.status),
                      height: double.infinity,
                      framed: false,
                      autoRequestLocation: true,
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: delivery != null && destination != null
          ? _MapFooter(delivery: delivery, onCall: _call)
          : null,
    );
  }
}

class _MapProblem extends StatelessWidget {
  const _MapProblem({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 44, color: AppColors.muted),
            const SizedBox(height: 14),
            Text(
              'No map for this job',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Try again',
              expand: false,
              height: 48,
              variant: AppButtonVariant.outline,
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}

class _MapFooter extends StatelessWidget {
  const _MapFooter({required this.delivery, required this.onCall});

  final RiderDelivery delivery;
  final Future<void> Function(String phone) onCall;

  @override
  Widget build(BuildContext context) {
    final address = delivery.address;
    final phone = address?.phone;
    final line = address?.line ?? '';

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.sage,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(
                  Icons.location_on_rounded,
                  size: 21,
                  color: AppColors.forest,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      address?.name ?? 'Customer',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (line.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        line,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              if (phone != null && phone.trim().isNotEmpty) ...[
                const SizedBox(width: 10),
                IconButton.filled(
                  onPressed: () => onCall(phone),
                  icon: const Icon(Icons.call_rounded, size: 20),
                  tooltip: 'Call the customer',
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.forest,
                    foregroundColor: AppColors.white,
                    minimumSize: const Size(44, 44),
                  ),
                ),
              ],
              const SizedBox(width: 6),
              AppButton(
                label: 'Job',
                variant: AppButtonVariant.outline,
                height: 44,
                expand: false,
                onPressed: () => context.pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
