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

const _orderFilters = <(String?, String)>[
  (null, 'All'),
  ('CONFIRMED', 'Accepted'),
  ('PROCESSING', 'Picking'),
  ('READY_FOR_SHIPMENT', 'Ready'),
  ('OUT_FOR_DELIVERY', 'On the way'),
  ('DELIVERED', 'Delivered'),
  ('CANCELLED', 'Cancelled'),
];

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  PagedController<OrderRecord>? _controller;
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
      (page) => repository.brandOrders(status: _status, page: page),
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
    final items = controller?.items ?? const <OrderRecord>[];
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
                  title: 'Orders',
                  subtitle: 'Every order your brand has taken.',
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
                    values: _orderFilters
                        .map((filter) => filter.$1)
                        .toList(growable: false),
                    labelOf: (status) => _orderFilters
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
                    icon: Icons.receipt_long_outlined,
                    title: 'No orders here',
                    message: _status == null
                        ? 'Orders appear here as soon as customers pay.'
                        : 'No order has this status right now.',
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
                      final order = items[index];
                      return _OrderCard(
                        order: order,
                        onTap: () => context.push('/orders/${order.id}'),
                      );
                    },
                  ),
                ),
                if (controller.hasMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                      child: AppButton(
                        label: 'Load more orders',
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

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});

  final OrderRecord order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
                  order.orderNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: StatusPill(
                  text: friendlyOrder(order.orderStatus),
                  tone: toneForOrder(order.orderStatus),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            order.address.name.isEmpty ? 'Customer' : order.address.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    Pill(
                      text: plural(order.lines.length, 'item'),
                      background: AppColors.surfaceMuted,
                      foreground: AppColors.inkSoft,
                    ),
                    if (order.createdAt != null)
                      Pill(
                        text: formatDateTime(order.createdAt),
                        background: AppColors.surfaceMuted,
                        foreground: AppColors.inkSoft,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              MoneyText(
                formatMoney(order.total, currency: order.currency),
                size: 17,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
