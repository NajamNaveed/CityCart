import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'orders_controller.dart';

/// Every order the shopper has placed, newest first. Each card opens the
/// order's progress, items and receipt.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(ordersProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Your orders',
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/home');
                }
              },
            ),
            Expanded(
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) {
                  if (controller.loading && controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [LoadingList(count: 3)],
                    );
                  }
                  if (controller.error != null && controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                      children: [
                        ErrorNotice(
                          message: controller.error!,
                          onRetry: controller.refresh,
                        ),
                      ],
                    );
                  }
                  if (controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 24),
                        EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: 'No orders yet',
                          message:
                              'When you place an order, you can follow it here '
                              'from the shop to your door.',
                          action: AppButton(
                            label: 'Start shopping',
                            icon: Icons.storefront_outlined,
                            expand: false,
                            onPressed: () => context.go('/home'),
                          ),
                        ),
                      ],
                    );
                  }

                  final items = controller.items;
                  final showFooter =
                      controller.hasMore ||
                      controller.error != null ||
                      controller.loadingMore;
                  return RefreshIndicator(
                    color: AppColors.clay,
                    onRefresh: controller.refresh,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                      itemCount: items.length + (showFooter ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == items.length) {
                          return _Footer(controller: controller);
                        }
                        final order = items[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _OrderCard(
                            order: order,
                            brandName: controller.brandNameFor(order.brandId),
                            onTap: () async {
                              await context.push('/orders/${order.id}');
                              if (context.mounted) controller.refresh();
                            },
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.controller});

  final OrdersController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (controller.error != null) ...[
            ErrorNotice(
              message: controller.error!,
              onRetry: controller.refresh,
            ),
            const SizedBox(height: 12),
          ],
          if (controller.hasMore)
            AppButton(
              label: 'Load more orders',
              icon: Icons.expand_more_rounded,
              variant: AppButtonVariant.outline,
              loading: controller.loadingMore,
              onPressed: controller.loadingMore ? null : controller.loadMore,
            )
          else
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                controller.pagination.total > 0
                    ? '${plural(controller.pagination.total, 'order')} in total.'
                    : '',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.brandName,
    required this.onTap,
  });

  final CustomerOrder order;
  final String? brandName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    order.orderNumber.isEmpty ? 'Order' : order.orderNumber,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 132),
                child: StatusPill(
                  text: friendlyOrder(order.orderStatus),
                  tone: toneForOrder(order.orderStatus),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            brandName ?? 'Shop',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            formatDateTime(order.createdAt),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  itemCountLabel(order.itemCount),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const SizedBox(width: 10),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 124),
                child: MoneyText(
                  formatMoney(order.payableTotal, currency: order.currency),
                  size: 15.5,
                ),
              ),
              const SizedBox(width: 2),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
