import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../records/paged_controller.dart';

const _deliveryFilters = <(String?, String)>[
  (null, 'All'),
  ('PENDING', 'Waiting'),
  ('READY_FOR_PICKUP', 'Ready for rider'),
  ('OUT_FOR_DELIVERY', 'Out now'),
  ('DELIVERED', 'Delivered'),
  ('FAILED', 'Failed'),
];

class DeliveriesScreen extends ConsumerStatefulWidget {
  const DeliveriesScreen({super.key});

  @override
  ConsumerState<DeliveriesScreen> createState() => _DeliveriesScreenState();
}

class _DeliveriesScreenState extends ConsumerState<DeliveriesScreen> {
  PagedController<DeliveryRecord>? _controller;
  String? _status;

  @override
  void initState() {
    super.initState();
    _bind();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    super.dispose();
  }

  void _bind() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    final repository = ref.read(staffRepositoryProvider);
    _controller = PagedController(
      (page) => repository.deliveries(status: _status, page: page),
    )..addListener(_onChanged);
    _controller!.load();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  void _filter(String? status) {
    if (_status == status) return;
    setState(() => _status = status);
    _bind();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final items = controller?.items ?? const <DeliveryRecord>[];
    final user = ref.watch(sessionProvider).user;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.forest,
          backgroundColor: AppColors.surface,
          onRefresh: () async {
            await controller?.refresh();
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(
                child: PageHeader(
                  eyebrow: 'Records',
                  title: 'Deliveries',
                  subtitle: 'Track every job and its rider.',
                  trailing: GestureDetector(
                    onTap: () => context.push('/account'),
                    child: Avatar(name: user?.name ?? 'Team'),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: FilterChips<String?>(
                    values: _deliveryFilters
                        .map((filter) => filter.$1)
                        .toList(growable: false),
                    labelOf: (status) => _deliveryFilters
                        .firstWhere((filter) => filter.$1 == status)
                        .$2,
                    value: _status,
                    onChanged: _filter,
                  ),
                ),
              ),
              if (controller?.error != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: ErrorNotice(
                      message: controller!.error!,
                      onRetry: controller.refresh,
                    ),
                  ),
                ),
              if (controller == null || (controller.loading && items.isEmpty))
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 20),
                    child: LoadingList(count: 4),
                  ),
                )
              else if (items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.local_shipping_outlined,
                    title: 'No deliveries here',
                    message: _status == null
                        ? 'Delivery jobs appear here once an order is packed.'
                        : 'No delivery has this status right now.',
                  ),
                )
              else ...[
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final delivery = items[index];
                      return _DeliveryCard(
                        delivery: delivery,
                        onTap: () => context.push('/deliveries/${delivery.id}'),
                      );
                    },
                  ),
                ),
                if (controller.hasMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                      child: AppButton(
                        label: 'Load more deliveries',
                        variant: AppButtonVariant.outline,
                        height: 48,
                        loading: controller.loadingMore,
                        onPressed: controller.loadMore,
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 26)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({required this.delivery, required this.onTap});

  final DeliveryRecord delivery;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final customer = delivery.address.name.trim();
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 13, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  delivery.orderNumber ?? 'Delivery',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: StatusPill(
                  text: friendlyDelivery(delivery.status),
                  tone: toneForDelivery(delivery.status),
                  compact: true,
                ),
              ),
            ],
          ),
          if (customer.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(
              customer,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (delivery.address.oneLine.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              delivery.address.oneLine,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              Pill(
                text: delivery.hasRider ? delivery.riderLabel : 'No rider yet',
                background: delivery.hasRider
                    ? AppColors.infoSoft
                    : AppColors.amber,
                foreground: delivery.hasRider
                    ? AppColors.info
                    : AppColors.amberInk,
                icon: Icons.two_wheeler_outlined,
              ),
              if (delivery.createdAt != null)
                Pill(
                  text: formatDateTime(delivery.createdAt),
                  background: AppColors.surfaceMuted,
                  foreground: AppColors.inkSoft,
                ),
              if (delivery.failureReason != null)
                Pill(
                  text: 'Failed delivery',
                  background: AppColors.dangerSoft,
                  foreground: AppColors.danger,
                  icon: Icons.error_outline_rounded,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
