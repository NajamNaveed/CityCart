import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'deliveries_controller.dart';

/// Finished jobs, newest first, grouped by day so a rider can find "that order
/// from yesterday" without reading timestamps.
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  late final DeliveriesController _controller;

  @override
  void initState() {
    super.initState();
    _controller = DeliveriesController(
      ref.read(deliveryRepositoryProvider),
      scope: 'history',
    );
    _controller.addListener(_onChanged);
    _controller.load();
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _open(RiderDelivery delivery) async {
    await context.push('/delivery/${delivery.id}');
    if (mounted) _controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final items = _controller.items;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Past deliveries',
              subtitle: items.isEmpty
                  ? 'Finished jobs show up here'
                  : '${items.length} finished ${items.length == 1 ? 'job' : 'jobs'} loaded',
              onBack: () => Navigator.of(context).maybePop(),
              trailing: IconButton(
                onPressed: () => _controller.refresh(),
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
              child: RefreshIndicator(
                color: AppColors.forest,
                backgroundColor: AppColors.surface,
                onRefresh: _controller.refresh,
                child: _controller.loading && items.isEmpty
                    ? const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.forest,
                        ),
                      )
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          if (_controller.error != null) ...[
                            ErrorNotice(
                              message: _controller.error!,
                              onRetry: _controller.refresh,
                            ),
                            const SizedBox(height: 14),
                          ],
                          if (items.isEmpty)
                            EmptyState(
                              icon: Icons.history_rounded,
                              title: 'No finished jobs yet',
                              message: 'Deliveries you finish will be listed here, grouped by day.',
                              action: AppButton(
                                label: 'Back to today',
                                variant: AppButtonVariant.outline,
                                expand: false,
                                height: 48,
                                onPressed: () => context.go('/today'),
                              ),
                            )
                          else
                            ..._groupedRows(items),
                          if (_controller.hasMore) ...[
                            const SizedBox(height: 18),
                            AppButton(
                              label: 'Load older jobs',
                              variant: AppButtonVariant.outline,
                              height: 48,
                              loading: _controller.loadingMore,
                              onPressed: _controller.loadMore,
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

  List<Widget> _groupedRows(List<RiderDelivery> items) {
    final groups = <String, List<RiderDelivery>>{};
    final dates = <String, DateTime?>{};
    for (final delivery in items) {
      final date = delivery.updatedAt ?? delivery.assignedAt;
      final key = date == null ? 'unknown' : dayKey(date);
      groups.putIfAbsent(key, () => []).add(delivery);
      dates[key] ??= date;
    }

    final widgets = <Widget>[];
    var first = true;
    for (final entry in groups.entries) {
      final date = dates[entry.key];
      if (!first) widgets.add(const SizedBox(height: 20));
      first = false;
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              SectionLabel(date == null ? 'Earlier' : formatDayLabel(date)),
              const Spacer(),
              Text(
                '${entry.value.length} ${entry.value.length == 1 ? 'job' : 'jobs'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      );
      for (final delivery in entry.value) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 9),
            child: _HistoryRow(
              delivery: delivery,
              onTap: () => _open(delivery),
            ),
          ),
        );
      }
    }
    return widgets;
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.delivery, required this.onTap});

  final RiderDelivery delivery;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (background, foreground, icon) = switch (toneForStatus(
      delivery.status,
    )) {
      StatusTone.clay => (
        AppColors.claySoft,
        AppColors.clay,
        Icons.location_on_outlined,
      ),
      StatusTone.sage => (
        AppColors.sage,
        AppColors.sageInk,
        Icons.two_wheeler_rounded,
      ),
      StatusTone.forest => (
        AppColors.sage,
        AppColors.forest,
        Icons.check_rounded,
      ),
      StatusTone.amber => (
        AppColors.amber,
        AppColors.amberInk,
        Icons.inventory_2_outlined,
      ),
      StatusTone.danger => (
        AppColors.dangerSoft,
        AppColors.danger,
        Icons.replay_rounded,
      ),
      StatusTone.muted => (
        AppColors.paperDeep,
        AppColors.muted,
        Icons.receipt_long_outlined,
      ),
    };

    final when = delivery.updatedAt ?? delivery.assignedAt;
    final amount = delivery.netTotal;
    final caption = delivery.cashCollected
        ? 'cash collected'
        : delivery.proofStatus != null
        ? 'photo payment'
        : 'final total';

    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(15, 14, 12, 14),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: background,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 18, color: foreground),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  delivery.orderNumber ?? 'Delivery',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    friendlyStatus(delivery.status),
                    formatTime(when),
                  ].where((part) => part.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (amount != null && amount > 0) ...[
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatMoney(amount, currency: delivery.currency),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  caption,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ],
          const SizedBox(width: 2),
          const Icon(
            Icons.chevron_right_rounded,
            size: 21,
            color: AppColors.muted,
          ),
        ],
      ),
    );
  }
}
