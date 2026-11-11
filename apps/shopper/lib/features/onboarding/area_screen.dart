import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart' hide Block;

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Chooses the city and, optionally, the block the shopper wants to browse.
/// The block centre is enough for the server to sort shops by distance, so no
/// device location permission is needed to start shopping.
class AreaScreen extends ConsumerStatefulWidget {
  const AreaScreen({super.key});

  @override
  ConsumerState<AreaScreen> createState() => _AreaScreenState();
}

class _AreaScreenState extends ConsumerState<AreaScreen> {
  String? _selectedCityId;
  bool _busy = false;

  late final bool _hadArea = ref.read(areaProvider).area != null;

  Future<void> _choose(AreaSelection selection) async {
    if (_busy) return;
    setState(() => _busy = true);
    await ref.read(areaProvider).choose(selection);
    ref.invalidate(homeFeedProvider);
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final cities = ref.watch(citiesProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              back: _hadArea,
              title: _hadArea ? 'Change area' : null,
            ),
            Expanded(
              child: cities.when(
                loading: () =>
                    const SingleChildScrollView(child: LoadingList(count: 3)),
                error: (error, stack) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 30, 20, 0),
                  child: ErrorNotice(
                    message: error is ApiException ? error.message : 'We could not load the cities. Check your connection.',
                    onRetry: () => ref.invalidate(citiesProvider),
                  ),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return const EmptyState(
                      icon: Icons.location_city_outlined,
                      title: 'No cities yet',
                      message: 'CityCart is not serving a city right now. Please try again later.',
                    );
                  }
                  final savedCityId = ref.read(areaProvider).area?.cityId;
                  final selectedId =
                      _selectedCityId ??
                      (list.any((city) => city.id == savedCityId)
                          ? savedCityId
                          : list.first.id);
                  final selectedCity = list.firstWhere(
                    (city) => city.id == selectedId,
                    orElse: () => list.first,
                  );
                  return _AreaBody(
                    cities: list,
                    selectedCity: selectedCity,
                    busy: _busy,
                    onCity: (city) => setState(() => _selectedCityId = city.id),
                    onChoose: _choose,
                    onSignOut: () => ref.read(sessionProvider).signOut(),
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

class _AreaBody extends ConsumerWidget {
  const _AreaBody({
    required this.cities,
    required this.selectedCity,
    required this.busy,
    required this.onCity,
    required this.onChoose,
    required this.onSignOut,
  });

  final List<City> cities;
  final City selectedCity;
  final bool busy;
  final ValueChanged<City> onCity;
  final ValueChanged<AreaSelection> onChoose;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocks = ref.watch(blocksProvider(selectedCity.id));

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        Text(
          'Where should we deliver?',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 6),
        Text(
          'Choose your block to see the closest shops first. You can change '
          'this at any time.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 22),
        const SectionLabel('City'),
        const SizedBox(height: 10),
        FilterChips<City>(
          values: cities,
          labelOf: (city) => city.name,
          value: selectedCity,
          onChanged: busy ? (_) {} : onCity,
        ),
        const SizedBox(height: 22),
        blocks.when(
          loading: () => const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(height: 14, width: 80),
              SizedBox(height: 12),
              SkeletonBox(height: 84),
              SizedBox(height: 10),
              SkeletonBox(height: 84),
            ],
          ),
          error: (error, stack) => ErrorNotice(
            message: error is ApiException
                ? error.message
                : 'We could not load the blocks for ${selectedCity.name}.',
            onRetry: () => ref.invalidate(blocksProvider(selectedCity.id)),
          ),
          data: (list) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionLabel('In ${selectedCity.name}'),
              const SizedBox(height: 10),
              _WholeCityCard(
                city: selectedCity,
                busy: busy,
                onChoose: onChoose,
              ),
              if (list.isNotEmpty) ...[
                const SizedBox(height: 20),
                const SectionLabel('Pick your block'),
                const SizedBox(height: 10),
                for (final block in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _BlockCard(
                      city: selectedCity,
                      block: block,
                      busy: busy,
                      onChoose: onChoose,
                    ),
                  ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 22),
        Center(
          child: TextButton(
            onPressed: busy ? null : onSignOut,
            child: const Text('Use a different account'),
          ),
        ),
      ],
    );
  }
}

class _WholeCityCard extends StatelessWidget {
  const _WholeCityCard({
    required this.city,
    required this.busy,
    required this.onChoose,
  });

  final City city;
  final bool busy;
  final ValueChanged<AreaSelection> onChoose;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.sage,
      borderColor: AppColors.sage,
      onTap: busy ? null : () => onChoose(AreaSelection.cityOnly(city)),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.location_city_rounded,
              size: 23,
              color: AppColors.sageInk,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'All of ${city.name}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  'Browse every shop in the city',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (busy)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: AppColors.forest,
              ),
            )
          else
            const Icon(Icons.arrow_forward_rounded, size: 20),
        ],
      ),
    );
  }
}

class _BlockCard extends StatelessWidget {
  const _BlockCard({
    required this.city,
    required this.block,
    required this.busy,
    required this.onChoose,
  });

  final City city;
  final Block block;
  final bool busy;
  final ValueChanged<AreaSelection> onChoose;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: busy
          ? null
          : () => onChoose(AreaSelection.fromBlock(city: city, block: block)),
      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.paperDeep,
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.place_outlined,
              size: 22,
              color: AppColors.inkSoft,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  block.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  block.latitude != null && block.longitude != null
                      ? 'Deliveries use the block centre'
                      : 'Delivery area',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}
