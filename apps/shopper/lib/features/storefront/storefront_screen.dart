import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// A shop's public page: who they are, what they sell, and a few products to
/// start from. Product detail and the full catalogue arrive in the next phase;
/// this page never invents a product that the server did not send.
class StorefrontScreen extends ConsumerWidget {
  const StorefrontScreen({super.key, required this.brandId});

  final String brandId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storefront = ref.watch(storefrontProvider(brandId));
    final loaded = storefront.asData?.value;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: loaded?.brand.name,
              subtitle: loaded?.storeName,
            ),
            Expanded(
              child: storefront.when(
                loading: () => const LoadingList(count: 2),
                error: (error, stack) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                  child: ErrorNotice(
                    message: error is ApiException
                        ? error.message
                        : 'We could not open this shop. Check your connection.',
                    onRetry: () => ref.invalidate(storefrontProvider(brandId)),
                  ),
                ),
                data: (data) => _StorefrontBody(data: data),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StorefrontBody extends StatelessWidget {
  const _StorefrontBody({required this.data});

  final Storefront data;

  @override
  Widget build(BuildContext context) {
    final brand = data.brand;
    final categories = _flatten(data.categories);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
      children: [
        _BrandHero(storefront: data),
        if ((brand.description ?? '').isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            brand.description!,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 22),
          const SectionLabel('Categories'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final category in categories.take(10))
                Pill(
                  text: category,
                  background: AppColors.surface,
                  foreground: AppColors.inkSoft,
                ),
            ],
          ),
        ],
        const SizedBox(height: 24),
        SectionHeader(
          title: 'Fresh in store',
          subtitle: data.featuredProducts.isEmpty
              ? null
              : plural(data.featuredProducts.length, 'new arrival'),
        ),
        const SizedBox(height: 12),
        if (data.featuredProducts.isEmpty)
          SurfaceCard(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                const Icon(
                  Icons.inventory_2_outlined,
                  size: 24,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'This shop has not published products yet. Check back soon.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          )
        else
          for (final product in data.featuredProducts)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _ProductCard(product: product),
            ),
        if (data.featuredProducts.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            'The full catalogue and product pages are coming next.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }

  List<String> _flatten(List<CategoryNode> nodes) {
    final names = <String>[];
    void visit(CategoryNode node) {
      if (node.name.isNotEmpty) names.add(node.name);
      for (final child in node.children) {
        visit(child);
      }
    }

    for (final node in nodes) {
      visit(node);
    }
    return names;
  }
}

class _BrandHero extends StatelessWidget {
  const _BrandHero({required this.storefront});

  final Storefront storefront;

  @override
  Widget build(BuildContext context) {
    final brand = storefront.brand;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.forest,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BrandLogo(name: brand.name, url: brand.logo, size: 62),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      brand.name,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(color: AppColors.surface),
                    ),
                    if ((storefront.storeName ?? '').isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        storefront.storeName!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.surface.withValues(alpha: 0.75),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.storefront_rounded,
                  size: 15,
                  color: AppColors.surface,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Local shop on CityCart',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.surface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final compareAt = product.compareAtPrice;
    final discounted =
        compareAt != null &&
        product.price != null &&
        compareAt > product.price!;

    return SurfaceCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProductThumb(url: product.image, size: 84, radius: 14),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if ((product.description ?? '').isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    product.description!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      formatMoney(product.price),
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(color: AppColors.clay),
                    ),
                    if (discounted)
                      Text(
                        formatMoney(compareAt),
                        style: Theme.of(context).textTheme.bodySmall
                            ?.copyWith(decoration: TextDecoration.lineThrough),
                      ),
                  ],
                ),
                const SizedBox(height: 7),
                StatusPill(
                  text: friendlyAvailability(product.availability),
                  tone: toneForAvailability(product.availability),
                  compact: true,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
