import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';

/// A shop summary used on Home and Explore. Products stay tappable even though
/// the whole card opens the storefront, so either intent is one tap away.
class StoreCard extends StatelessWidget {
  const StoreCard({
    super.key,
    required this.brand,
    required this.onTap,
    this.onProductTap,
  });

  final DiscoverBrand brand;
  final VoidCallback onTap;
  final void Function(String productId)? onProductTap;

  @override
  Widget build(BuildContext context) {
    final place = brand.placeLabel;
    final distance = formatDistance(brand.nearestKm);
    final detail = [
      if (place.isNotEmpty) place,
      if (distance.isNotEmpty) distance,
    ].join(' • ');

    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BrandLogo(name: brand.name, url: brand.logo, size: 52),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      brand.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if (detail.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        detail,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 7),
                    StatusPill(
                      text: brand.acceptingNewOrders
                          ? 'Taking orders'
                          : 'Not taking orders',
                      tone: brand.acceptingNewOrders
                          ? StatusTone.sage
                          : StatusTone.muted,
                      compact: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
          if (brand.products.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Divider(),
            const SizedBox(height: 12),
            for (final product in brand.products.take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ProductRow(
                  product: product,
                  onTap: onProductTap == null || product.id.isEmpty
                      ? null
                      : () => onProductTap!(product.id),
                ),
              ),
          ],
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  brand.products.isEmpty
                      ? 'Open the shop'
                      : '${plural(brand.products.length, 'item')} to start with',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.arrow_forward_rounded,
                size: 17,
                color: AppColors.forest,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({required this.product, this.onTap});

  final ProductSummary product;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final where = product.availableAt;
    final content = Row(
      children: [
        ProductThumb(url: product.image, size: 42, radius: 10),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (!product.inStock)
                Text(
                  'Out of stock',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: AppColors.danger),
                )
              else if (where.isNotEmpty)
                Text(
                  'At ${where.join(', ')}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 96),
          child: MoneyText(
            formatMoney(product.price),
            size: 14,
            color: product.inStock ? AppColors.ink : AppColors.muted,
          ),
        ),
        if (onTap != null) ...[
          const SizedBox(width: 4),
          const Icon(
            Icons.chevron_right_rounded,
            size: 19,
            color: AppColors.muted,
          ),
        ],
      ],
    );

    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: content,
    );
  }
}
