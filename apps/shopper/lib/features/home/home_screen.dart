import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../providers.dart';
import '../stores/store_card.dart';

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
                    const SizedBox(height: 12),
                    _ServicesTeaser(onTap: () => context.go('/services')),
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
                          child: StoreCard(
                            brand: brand,
                            onTap: () => context.push('/store/${brand.id}'),
                            onProductTap: (productId) =>
                                context.push('/product/$productId'),
                          ),
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
          Align(
            alignment: Alignment.centerLeft,
            child: LocationPill(
              label: areaLabel ?? 'Choose your area',
              onTap: () => context.push('/area'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServicesTeaser extends StatelessWidget {
  const _ServicesTeaser({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: SurfaceCard(
        onTap: onTap,
        padding: const EdgeInsets.all(16),
        color: AppColors.claySoft,
        borderColor: AppColors.claySoft,
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(13),
              ),
              child: const Icon(
                Icons.home_repair_service_outlined,
                size: 22,
                color: AppColors.clay,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Home services',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppColors.clay,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Cleaning, repairs and more from people nearby',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.clay.withValues(alpha: 0.85),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            const Icon(
              Icons.arrow_forward_rounded,
              size: 19,
              color: AppColors.clay,
            ),
          ],
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
