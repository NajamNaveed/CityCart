import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// The shopper's home: a calm list of the shops around the chosen area, each
/// showing a few real products so the first screen already feels like a shop.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(homeFeedProvider);
    try {
      await ref.read(homeFeedProvider.future);
    } on ApiException {
      // The error state in the body already explains what happened.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final areaController = ref.watch(areaProvider);

    return ListenableBuilder(
      listenable: Listenable.merge([session, areaController]),
      builder: (context, _) {
        final area = areaController.area;
        final feed = ref.watch(homeFeedProvider);

        return Scaffold(
          body: SafeArea(
            child: RefreshIndicator(
              color: AppColors.forest,
              onRefresh: () => _refresh(ref),
              child: feed.when(
                loading: () => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    _HomeHeader(
                      name: session.user?.name,
                      areaLabel: area?.label,
                    ),
                    const LoadingList(count: 3),
                  ],
                ),
                error: (error, stack) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 28),
                  children: [
                    _HomeHeader(
                      name: session.user?.name,
                      areaLabel: area?.label,
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                      child: ErrorNotice(
                        message: error is ApiException ? error.message : 'We could not reach CityCart. Check your connection.',
                        onRetry: () => ref.invalidate(homeFeedProvider),
                      ),
                    ),
                  ],
                ),
                data: (result) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 28),
                  children: [
                    _HomeHeader(
                      name: session.user?.name,
                      areaLabel: area?.label,
                    ),
                    _NeighbourhoodBanner(
                      areaLabel: area?.label,
                      storeCount: result.pagination.total,
                    ),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: SectionHeader(
                        title: 'Shops near you',
                        subtitle: result.items.isEmpty
                            ? null
                            : '${storeCountLabel(result.pagination.total)} • closest first',
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (result.items.isEmpty)
                      EmptyState(
                        icon: Icons.storefront_outlined,
                        title: 'No shops here yet',
                        message:
                            'We are still signing up shops in this area. Try '
                            'another block or the whole city.',
                        action: AppButton(
                          label: 'Change area',
                          icon: Icons.edit_location_alt_outlined,
                          expand: false,
                          onPressed: () => context.push('/area'),
                        ),
                      )
                    else
                      for (final brand in result.items)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                          child: _StoreCard(brand: brand),
                        ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({this.name, this.areaLabel});

  final String? name;
  final String? areaLabel;

  @override
  Widget build(BuildContext context) {
    final greeting = greetingFor(DateTime.now());
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.forest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.shopping_bag_rounded,
                  size: 20,
                  color: AppColors.surface,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                'CityCart',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            '$greeting, ${firstNameOf(name)}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          _AreaChip(label: areaLabel),
        ],
      ),
    );
  }
}

class _AreaChip extends StatelessWidget {
  const _AreaChip({this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
          side: const BorderSide(color: AppColors.line),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.pill),
          onTap: () => context.push('/area'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.place_rounded,
                  size: 17,
                  color: AppColors.clay,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label ?? 'Choose your area',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 19,
                  color: AppColors.muted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NeighbourhoodBanner extends StatelessWidget {
  const _NeighbourhoodBanner({this.areaLabel, required this.storeCount});

  final String? areaLabel;
  final int storeCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.forest,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your neighbourhood, delivered',
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(color: AppColors.surface),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    storeCount == 0
                        ? 'Fresh shops and services around ${areaLabel ?? 'you'}.'
                        : '$storeCount shops around ${areaLabel ?? 'you'} are taking orders.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.surface.withValues(alpha: 0.78),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: AppColors.surface.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(
                Icons.local_mall_outlined,
                size: 25,
                color: AppColors.surface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.brand});

  final DiscoverBrand brand;

  @override
  Widget build(BuildContext context) {
    final place = brand.placeLabel;
    final distance = formatDistance(brand.nearestKm);
    final detail = [
      if (place.isNotEmpty) place,
      if (distance.isNotEmpty) distance,
    ].join(' • ');

    return SurfaceCard(
      onTap: () => context.push('/store/${brand.id}'),
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
                child: _ProductRow(product: product),
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
  const _ProductRow({required this.product});

  final ProductSummary product;

  @override
  Widget build(BuildContext context) {
    return Row(
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
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        MoneyText(
          formatMoney(product.price),
          size: 14,
          color: product.inStock ? AppColors.ink : AppColors.muted,
        ),
      ],
    );
  }
}
