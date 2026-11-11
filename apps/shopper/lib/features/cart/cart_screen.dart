import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'cart_controller.dart';

/// The basket, grouped by shop so the shopper can see that checkout will
/// produce one order per shop. Quantities and removals are saved on the server
/// immediately; the screen always renders the cart the server returned.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  Future<void> _removeIssues(
    BuildContext context,
    CartController controller,
    CartView cart,
  ) async {
    final broken = [
      for (final group in cart.groups)
        for (final item in group.items)
          if (item.hasIssue) item.productId,
    ];
    for (final productId in broken) {
      final error = await controller.remove(productId);
      if (error != null) {
        if (context.mounted) showAppSnack(context, error, error: true);
        return;
      }
    }
    if (context.mounted) showAppSnack(context, 'Unavailable items removed.');
  }

  Future<void> _emptyBasket(
    BuildContext context,
    CartController controller,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Empty your basket?'),
        content: const Text(
          'Every item will be removed. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep items'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Empty basket'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await controller.clear();
    if (error != null && context.mounted) {
      showAppSnack(context, error, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(cartProvider);

    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => Column(
            children: [
              _Header(
                count: controller.itemCount,
                shops: controller.shopCount,
                showEmpty: !controller.isEmpty && !controller.busy,
                onEmpty: () => _emptyBasket(context, controller),
              ),
              Expanded(child: _body(context, controller)),
              if (!controller.isEmpty && controller.loaded)
                BottomActionBar(
                  child: AppButton(
                    label: 'Continue to checkout',
                    onPressed: controller.hasIssues || controller.busy
                        ? null
                        : () => context.push('/checkout'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, CartController controller) {
    if (controller.loading && !controller.loaded) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [LoadingList(count: 2)],
      );
    }

    if (!controller.loaded && controller.error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        children: [
          ErrorNotice(message: controller.error!, onRetry: controller.load),
        ],
      );
    }

    if (controller.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 30),
        children: [
          EmptyState(
            icon: Icons.shopping_basket_outlined,
            title: 'Your basket is empty',
            message:
                'Browse the shops around you and add something you like. '
                'Your basket is saved here until you check out.',
            action: AppButton(
              label: 'Browse shops',
              icon: Icons.storefront_outlined,
              expand: false,
              onPressed: () => context.go('/home'),
            ),
          ),
        ],
      );
    }

    final cart = controller.cart;
    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: controller.load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 2, 20, 24),
        children: [
          if (cart.hasIssues) ...[
            _IssuesBanner(
              onRemove: controller.busy
                  ? null
                  : () => _removeIssues(context, controller, cart),
            ),
            const SizedBox(height: 12),
          ],
          for (final group in cart.groups) ...[
            _GroupCard(
              group: group,
              controller: controller,
              onShop: () => context.push('/store/${group.brandId}'),
              onQuantity: (item, quantity) async {
                final error = await controller.setQuantity(
                  item.productId,
                  quantity,
                );
                if (error != null && context.mounted) {
                  showAppSnack(context, error, error: true);
                }
              },
              onRemove: (item) async {
                final error = await controller.remove(item.productId);
                if (error != null && context.mounted) {
                  showAppSnack(context, error, error: true);
                }
              },
            ),
            const SizedBox(height: 12),
          ],
          _SummaryCard(cart: cart),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.count,
    required this.shops,
    required this.showEmpty,
    required this.onEmpty,
  });

  final int count;
  final int shops;
  final bool showEmpty;
  final VoidCallback onEmpty;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Ready when you are'),
                const SizedBox(height: 5),
                Text(
                  'Your basket',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                if (count > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${itemCountLabel(count)} from '
                    '${plural(shops, 'shop')}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          if (showEmpty)
            IconButton(
              tooltip: 'Empty basket',
              onPressed: onEmpty,
              icon: const Icon(Icons.delete_sweep_outlined),
              style: IconButton.styleFrom(
                backgroundColor: AppColors.surface,
                side: const BorderSide(color: AppColors.line),
                minimumSize: const Size(44, 44),
              ),
            ),
        ],
      ),
    );
  }
}

class _IssuesBanner extends StatelessWidget {
  const _IssuesBanner({required this.onRemove});

  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.goldSoft,
      borderColor: AppColors.goldSoft,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.info_outline_rounded,
                size: 20,
                color: AppColors.goldInk,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Some items cannot be bought right now',
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(color: AppColors.goldInk),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Remove them to continue, or come back later if the shop restocks.',
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: AppColors.goldInk),
          ),
          const SizedBox(height: 10),
          AppButton(
            label: 'Remove unavailable items',
            variant: AppButtonVariant.cream,
            height: 46,
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({
    required this.group,
    required this.controller,
    required this.onShop,
    required this.onQuantity,
    required this.onRemove,
  });

  final CartGroup group;
  final CartController controller;
  final VoidCallback onShop;
  final void Function(CartItem item, int quantity) onQuantity;
  final void Function(CartItem item) onRemove;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onShop,
            borderRadius: BorderRadius.circular(10),
            child: Row(
              children: [
                BrandLogo(
                  name: group.brandName ?? 'Shop',
                  url: group.brandLogo,
                  size: 34,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    group.brandName ?? 'Shop',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 96),
                  child: MoneyText(
                    formatMoney(group.subtotal),
                    size: 14,
                    color: AppColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          const Divider(),
          for (var index = 0; index < group.items.length; index++) ...[
            if (index > 0) const Divider(height: 18),
            _Line(
              item: group.items[index],
              controller: controller,
              onQuantity: onQuantity,
              onRemove: onRemove,
            ),
          ],
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.item,
    required this.controller,
    required this.onQuantity,
    required this.onRemove,
  });

  final CartItem item;
  final CartController controller;
  final void Function(CartItem item, int quantity) onQuantity;
  final void Function(CartItem item) onRemove;

  @override
  Widget build(BuildContext context) {
    final issue = cartIssueLabel(
      item.issue,
      availableQuantity: item.availableQuantity,
    );
    final name = item.name ?? 'Item';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProductThumb(url: item.image, size: 56, radius: 12),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              if (issue != null) ...[
                const SizedBox(height: 4),
                StatusPill(
                  text: issue,
                  tone:
                      item.issue == 'PRODUCT_UNAVAILABLE' ||
                          item.issue == 'BRAND_UNAVAILABLE'
                      ? StatusTone.muted
                      : StatusTone.danger,
                  compact: true,
                ),
              ],
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.unitPrice == null
                          ? 'Price at checkout'
                          : '${formatMoney(item.unitPrice)} each',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  const SizedBox(width: 6),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 96),
                    child: MoneyText(
                      formatMoney(item.lineTotal),
                      size: 14,
                      color: item.hasIssue ? AppColors.muted : AppColors.ink,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  QuantityStepper(
                    value: item.quantity,
                    busy: controller.busy,
                    onChanged: (quantity) => onQuantity(item, quantity),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Remove $name',
                    onPressed: controller.busy ? null : () => onRemove(item),
                    icon: const Icon(Icons.delete_outline_rounded, size: 21),
                    style: IconButton.styleFrom(
                      minimumSize: const Size(44, 44),
                      foregroundColor: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.cart});

  final CartView cart;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.sage,
      borderColor: AppColors.sage,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        children: [
          InfoRow(label: 'Items', value: itemCountLabel(cart.itemCount)),
          InfoRow(label: 'Shops', value: storeCountLabel(cart.groups.length)),
          const Divider(),
          InfoRow(
            label: 'Subtotal',
            value: formatMoney(cart.subtotal),
            strong: true,
          ),
          const SizedBox(height: 6),
          Text(
            'Checkout creates one order per shop. You pay cash when your '
            'order arrives.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
