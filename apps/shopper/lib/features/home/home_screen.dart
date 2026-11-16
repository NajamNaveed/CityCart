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
                    _QuickActions(
                      onServices: () => context.go('/services'),
                      onAssistant: () => context.push('/assistant'),
                    ),
                    const SizedBox(height: 16),
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
                        action: result.items.isEmpty
                            ? null
                            : TextButton(
                                onPressed: () => context.go('/explore'),
                                style: TextButton.styleFrom(
                                  foregroundColor: AppColors.forest,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                  ),
                                  minimumSize: const Size(0, 36),
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                                child: const Text('See all'),
                              ),
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
              Expanded(
                child: Text(
                  'CityCart',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                onPressed: () => context.push('/notifications'),
                icon: const Icon(Icons.notifications_none_rounded, size: 21),
                tooltip: 'Notifications',
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(42, 42),
                ),
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
          Row(
            children: [
              Flexible(
                child: LocationPill(
                  label: areaLabel ?? 'Choose your area',
                  onTap: () => context.push('/area'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const _SearchEntry(),
        ],
      ),
    );
  }
}

/// The search entry on home: it looks like a field but opens Explore, where
/// the real search lives.
class _SearchEntry extends StatelessWidget {
  const _SearchEntry();

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: () => context.go('/explore'),
      radius: AppRadius.field,
      padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 21, color: AppColors.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Search shops and items',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: AppColors.muted),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.sage,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: const Text(
              'Go',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: AppColors.sageInk,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onServices, required this.onAssistant});

  final VoidCallback onServices;
  final VoidCallback onAssistant;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _ActionTile(
                icon: Icons.home_repair_service_outlined,
                title: 'Home services',
                subtitle: 'Cleaning, repairs and more',
                background: AppColors.claySoft,
                accent: AppColors.clay,
                onTap: onServices,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ActionTile(
                icon: Icons.auto_awesome_rounded,
                title: 'Ask CityCart',
                subtitle: 'Find a product or a gift',
                background: AppColors.sage,
                accent: AppColors.sageInk,
                onTap: onAssistant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.background,
    required this.accent,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color background;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      color: background,
      borderColor: background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: accent),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(color: accent, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          Text(
            subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: accent.withValues(alpha: 0.85)),
          ),
        ],
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
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.forest, AppColors.forestDeep],
          ),
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -34,
              top: -40,
              child: Container(
                width: 150,
                height: 150,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.surface.withValues(alpha: 0.05),
                ),
              ),
            ),
            Positioned(
              right: 30,
              bottom: -50,
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.surface.withValues(alpha: 0.04),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SectionLabel(
                              'Your neighbourhood',
                              color: AppColors.surface.withValues(alpha: 0.6),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Everything nearby, delivered',
                              style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(color: AppColors.surface),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              storeCount == 0
                                  ? 'Fresh shops and services around ${areaLabel ?? 'you'}.'
                                  : '$storeCount shops around ${areaLabel ?? 'you'} are taking orders.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: AppColors.surface.withValues(
                                      alpha: 0.78,
                                    ),
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
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: const [
                      _HeroBadge(
                        icon: Icons.storefront_rounded,
                        label: 'Local shops',
                      ),
                      _HeroBadge(
                        icon: Icons.delivery_dining_outlined,
                        label: 'At your door',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.surface),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.surface,
            ),
          ),
        ],
      ),
    );
  }
}
