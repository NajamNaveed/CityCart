import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class DeliveryDetailScreen extends ConsumerStatefulWidget {
  const DeliveryDetailScreen({super.key, required this.deliveryId});

  final String deliveryId;

  @override
  ConsumerState<DeliveryDetailScreen> createState() =>
      _DeliveryDetailScreenState();
}

class _DeliveryDetailScreenState extends ConsumerState<DeliveryDetailScreen> {
  DeliveryRecord? _delivery;
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    setState(() => _error = null);
    try {
      final delivery = await ref
          .read(staffRepositoryProvider)
          .delivery(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = delivery;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _call(String phone) async {
    final digits = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (digits.isEmpty) {
      showAppSnack(context, 'This delivery has no phone number.', error: true);
      return;
    }
    try {
      await launchUrl(Uri(scheme: 'tel', path: digits));
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'This phone cannot start a call. The number is $phone.',
          error: true,
        );
      }
    }
  }

  Future<void> _openMap(ShippingAddress address) async {
    final query = [
      address.oneLine,
      address.city,
      address.state,
    ].whereType<String>().where((part) => part.trim().isNotEmpty).join(', ');
    if (query.trim().isEmpty) {
      showAppSnack(context, 'This delivery has no address.', error: true);
      return;
    }
    final uri = Uri.https('www.google.com', '/maps/search/', {
      'api': '1',
      'query': query,
    });
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          "Couldn't open a map on this phone.",
          error: true,
        );
      }
    }
  }

  Future<void> _assignRider() async {
    final delivery = _delivery;
    if (delivery == null || _working) return;
    final choice = await showAppSheet<_RiderChoice>(
      context,
      title: 'Assign a rider',
      subtitle: 'The rider is notified when a job becomes theirs.',
      child: _RiderSheet(currentRiderId: delivery.riderId),
    );
    if (choice == null || !mounted) return;

    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await ref
          .read(staffRepositoryProvider)
          .assignRider(deliveryId: widget.deliveryId, riderId: choice.riderId);
      if (!mounted) return;
      showAppSnack(
        context,
        choice.riderId == null ? 'Rider removed.' : 'Rider assigned.',
      );
      await _load(quiet: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = _delivery;
    final access = ref.watch(accessProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Delivery',
              subtitle: delivery?.orderNumber,
              trailing: IconButton(
                onPressed: _loading ? null : () => _load(quiet: true),
                tooltip: 'Reload delivery',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && delivery == null
                  ? const LoadingList(count: 4)
                  : delivery == null
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.error_outline_rounded,
                          title: "Couldn't load this delivery",
                          message: _error ?? 'Pull down to try again.',
                          action: AppButton(
                            label: 'Try again',
                            variant: AppButtonVariant.outline,
                            expand: false,
                            height: 48,
                            onPressed: _load,
                          ),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: () => _load(quiet: true),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: [
                              StatusPill(
                                text: friendlyDelivery(delivery.status),
                                tone: toneForDelivery(delivery.status),
                                compact: true,
                              ),
                              if (delivery.trackingReference != null)
                                Pill(
                                  text: delivery.trackingReference!,
                                  background: AppColors.surfaceMuted,
                                  foreground: AppColors.inkSoft,
                                  icon: Icons.tag_rounded,
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            delivery.orderNumber ?? 'Linked order',
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontSize: 23),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            delivery.createdAt == null
                                ? 'Delivery job'
                                : 'Created ${formatDateTime(delivery.createdAt)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                          ],
                          const SizedBox(height: 16),
                          _RiderCard(
                            delivery: delivery,
                            canAssign: access.canAssignRider,
                            busy: _working,
                            onAssign: _assignRider,
                          ),
                          const SizedBox(height: 12),
                          _AddressCard(
                            address: delivery.address,
                            onCall: _call,
                            onMap: () => _openMap(delivery.address),
                          ),
                          const SizedBox(height: 12),
                          SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SectionLabel('Delivery details'),
                                const SizedBox(height: 8),
                                InfoRow(
                                  label: 'Delivery fee',
                                  value: formatMoney(delivery.deliveryFee),
                                ),
                                InfoRow(
                                  label: 'Tracking',
                                  value:
                                      delivery.trackingReference ?? 'Not set',
                                ),
                                if (delivery.failureReason != null)
                                  InfoRow(
                                    label: 'Failure',
                                    value: delivery.failureReason!,
                                    valueColor: AppColors.danger,
                                  ),
                              ],
                            ),
                          ),
                          if (delivery.returnId != null) ...[
                            const SizedBox(height: 12),
                            SurfaceCard(
                              onTap: () =>
                                  context.push('/returns/${delivery.returnId}'),
                              child: Row(
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: AppColors.claySoft,
                                      borderRadius: BorderRadius.circular(13),
                                    ),
                                    child: const Icon(
                                      Icons.keyboard_return_rounded,
                                      size: 21,
                                      color: AppColors.clay,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      'There is a return for this delivery',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall
                                          ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                    ),
                                  ),
                                  const Icon(
                                    Icons.chevron_right_rounded,
                                    color: AppColors.muted,
                                  ),
                                ],
                              ),
                            ),
                          ],
                          if (!access.deliveryManage) ...[
                            const SizedBox(height: 12),
                            Text(
                              'Changing the rider needs delivery management access. '
                              'Your brand manager can grant it.',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RiderCard extends StatelessWidget {
  const _RiderCard({
    required this.delivery,
    required this.canAssign,
    required this.busy,
    required this.onAssign,
  });

  final DeliveryRecord delivery;
  final bool canAssign;
  final bool busy;
  final VoidCallback onAssign;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Rider'),
          const SizedBox(height: 9),
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: delivery.hasRider
                      ? AppColors.infoSoft
                      : AppColors.amber,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  Icons.two_wheeler_outlined,
                  size: 21,
                  color: delivery.hasRider
                      ? AppColors.info
                      : AppColors.amberInk,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      delivery.riderLabel,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (delivery.assignedAt != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Assigned ${formatDateTime(delivery.assignedAt)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (canAssign) ...[
            const SizedBox(height: 12),
            AppButton(
              label: delivery.hasRider ? 'Change rider' : 'Assign a rider',
              icon: Icons.person_add_alt_1_outlined,
              variant: AppButtonVariant.outline,
              height: 46,
              loading: busy,
              onPressed: busy ? null : onAssign,
            ),
          ],
        ],
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({
    required this.address,
    required this.onCall,
    required this.onMap,
  });

  final ShippingAddress address;
  final ValueChanged<String> onCall;
  final VoidCallback onMap;

  @override
  Widget build(BuildContext context) {
    final name = address.name.trim().isEmpty ? 'Customer' : address.name;
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Delivery address'),
          const SizedBox(height: 8),
          Text(
            name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (address.phone.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              address.phone,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (address.oneLine.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              address.oneLine,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          if (address.additionalInstructions != null &&
              address.additionalInstructions!.trim().isNotEmpty) ...[
            const SizedBox(height: 9),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: AppColors.amber,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                address.additionalInstructions!,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: AppColors.amberInk),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Call',
                  icon: Icons.call_outlined,
                  variant: AppButtonVariant.outline,
                  height: 44,
                  onPressed: () => onCall(address.phone),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: AppButton(
                  label: 'Open map',
                  icon: Icons.map_outlined,
                  variant: AppButtonVariant.outline,
                  height: 44,
                  onPressed: onMap,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RiderChoice {
  const _RiderChoice(this.riderId);

  final String? riderId;
}

class _RiderSheet extends ConsumerStatefulWidget {
  const _RiderSheet({required this.currentRiderId});

  final String? currentRiderId;

  @override
  ConsumerState<_RiderSheet> createState() => _RiderSheetState();
}

class _RiderSheetState extends ConsumerState<_RiderSheet> {
  List<Rider> _riders = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final riders = await ref.read(staffRepositoryProvider).riders();
      if (!mounted) return;
      setState(() {
        _riders = riders;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 26),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              color: AppColors.forest,
            ),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[
          ErrorNotice(message: _error!, onRetry: _load),
          const SizedBox(height: 12),
        ],
        if (widget.currentRiderId != null)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person_remove_outlined),
            title: const Text('Remove the current rider'),
            subtitle: const Text('The job goes back to unassigned.'),
            onTap: () => Navigator.of(context).pop(const _RiderChoice(null)),
          ),
        if (_riders.isEmpty && _error == null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Text(
              'No active riders yet. Add riders on the CityCart website.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          )
        else
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: _riders.length,
              separatorBuilder: (context, index) =>
                  const Divider(height: 1, color: AppColors.line),
              itemBuilder: (context, index) {
                final rider = _riders[index];
                final current = rider.id == widget.currentRiderId;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Avatar(name: rider.name, size: 40),
                  title: Text(
                    rider.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    [
                      if (rider.phone != null) rider.phone!,
                      if (rider.email != null) rider.email!,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: current
                      ? const Icon(
                          Icons.check_circle_rounded,
                          color: AppColors.sageInk,
                        )
                      : null,
                  onTap: current
                      ? null
                      : () => Navigator.of(context).pop(_RiderChoice(rider.id)),
                );
              },
            ),
          ),
      ],
    );
  }
}
