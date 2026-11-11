import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../providers.dart';
import 'service_widgets.dart';
import 'services_controller.dart';

/// Services around the chosen area: cleaning, repairs, tuition and more. The
/// server decides which approved providers are in range; this screen presents
/// them with one clear search, category row and sort.
class ServicesScreen extends ConsumerStatefulWidget {
  const ServicesScreen({super.key});

  @override
  ConsumerState<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends ConsumerState<ServicesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) ref.read(servicesProvider).search(value);
    });
  }

  void _submit(String value) {
    _debounce?.cancel();
    ref.read(servicesProvider).search(value);
  }

  void _clear() {
    _debounce?.cancel();
    _search.clear();
    ref.read(servicesProvider).search('');
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(servicesProvider);
    final area = ref.read(areaProvider).area?.label ?? 'your area';
    final categories = ref.watch(serviceCategoriesProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionLabel('Around you'),
                  const SizedBox(height: 5),
                  Text(
                    'Services',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Flexible(
                        child: LocationPill(
                          label: area,
                          onTap: () => context.push('/area'),
                        ),
                      ),
                      const SizedBox(width: 6),
                      TextButton.icon(
                        onPressed: () => context.push('/bookings'),
                        icon: const Icon(
                          Icons.event_available_outlined,
                          size: 18,
                        ),
                        label: const Text('Bookings'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.forest,
                          textStyle: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          minimumSize: const Size(0, 40),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: AppSearchField(
                controller: _search,
                hint: 'Search services or helpers',
                onChanged: _onChanged,
                onSubmitted: _submit,
                onClear: _clear,
              ),
            ),
            categories.when(
              data: (list) {
                final names = {for (final item in list) item.id: item.name};
                return FilterChips<String>(
                  values: ['', ...names.keys],
                  labelOf: (id) =>
                      id.isEmpty ? 'All services' : names[id] ?? 'Service',
                  value: controller.categoryId,
                  onChanged: controller.chooseCategory,
                );
              },
              loading: () => const SizedBox(height: 38),
              error: (_, _) => const SizedBox.shrink(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: SegmentedControl<ServiceSort>(
                values: ServiceSort.values,
                labelOf: (sort) => sort.label,
                value: controller.sort,
                onChanged: controller.chooseSort,
              ),
            ),
            Expanded(
              child: AnimatedBuilder(
                animation: controller,
                builder: (context, _) => _Results(
                  controller: controller,
                  onClearFilters: () {
                    _search.clear();
                    controller.clearFilters();
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.controller, required this.onClearFilters});

  final ServicesController controller;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    if (controller.loading && controller.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [LoadingList(count: 2)],
      );
    }

    if (controller.items.isEmpty) {
      if (controller.error != null) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
          children: [
            ErrorNotice(message: controller.error!, onRetry: controller.retry),
          ],
        );
      }
      final query = controller.query;
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 18),
        children: [
          EmptyState(
            icon: controller.hasFilters
                ? Icons.search_off_rounded
                : Icons.home_repair_service_outlined,
            title: controller.hasFilters
                ? 'No providers match'
                : 'No services here yet',
            message: controller.hasFilters
                ? query.isEmpty
                      ? 'Try another category, or show everything again.'
                      : 'Nothing matches "$query". Try another category or '
                            'a simpler word.'
                : 'We are still signing up service providers in this area. '
                      'Try another block or the whole city.',
            action: controller.hasFilters
                ? AppButton(
                    label: 'Show all services',
                    icon: Icons.restart_alt_rounded,
                    expand: false,
                    onPressed: onClearFilters,
                  )
                : AppButton(
                    label: 'Change area',
                    icon: Icons.edit_location_alt_outlined,
                    expand: false,
                    onPressed: () => context.push('/area'),
                  ),
          ),
        ],
      );
    }

    final total = controller.pagination.total;
    final query = controller.query;
    final summary = query.isEmpty
        ? '${plural(total, 'provider')} nearby'
        : total == 1
        ? '1 provider matches "$query"'
        : '$total providers match "$query"';

    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: controller.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Text(summary, style: Theme.of(context).textTheme.bodySmall),
          ),
          for (final provider in controller.items)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: ServiceProviderCard(
                provider: provider,
                onTap: () =>
                    context.push('/services/provider/${provider.slug}'),
              ),
            ),
          if (controller.hasMore)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: AppButton(
                label: controller.loadingMore
                    ? 'Loading more providers'
                    : 'Show more providers',
                variant: AppButtonVariant.outline,
                loading: controller.loadingMore,
                onPressed: controller.loadingMore ? null : controller.loadMore,
              ),
            ),
        ],
      ),
    );
  }
}
