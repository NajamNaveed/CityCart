import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../providers.dart';
import '../stores/store_card.dart';
import 'explore_controller.dart';

/// Search shops and items around the chosen area. The server decides which
/// shops are in range; this screen only presents what comes back.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
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
      if (mounted) ref.read(exploreProvider).search(value);
    });
  }

  void _submit(String value) {
    _debounce?.cancel();
    ref.read(exploreProvider).search(value);
  }

  void _clear() {
    _debounce?.cancel();
    _search.clear();
    ref.read(exploreProvider).search('');
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(exploreProvider);
    final area = ref.read(areaProvider).area?.label ?? 'your area';

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
                    'Explore',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: LocationPill(
                      label: area,
                      onTap: () => context.push('/area'),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: AppSearchField(
                controller: _search,
                hint: 'Search shops or items',
                onChanged: _onChanged,
                onSubmitted: _submit,
                onClear: _clear,
              ),
            ),
            Expanded(
              child: AnimatedBuilder(
                animation: controller,
                builder: (context, _) => _Results(controller: controller),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.controller});

  final ExploreController controller;

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
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          children: [
            ErrorNotice(message: controller.error!, onRetry: controller.retry),
          ],
        );
      }
      final query = controller.query;
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 24),
        children: [
          EmptyState(
            icon: query.isEmpty
                ? Icons.storefront_outlined
                : Icons.search_off_rounded,
            title: query.isEmpty
                ? 'No shops here yet'
                : 'Nothing matches "$query"',
            message: query.isEmpty
                ? 'Try another block or browse the whole city.'
                : 'Check the spelling, or try a shop name like the one on '
                      'the sign.',
            action: query.isEmpty
                ? AppButton(
                    label: 'Change area',
                    icon: Icons.edit_location_alt_outlined,
                    expand: false,
                    onPressed: () => context.push('/area'),
                  )
                : null,
          ),
        ],
      );
    }

    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: controller.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Text(
              controller.query.isEmpty
                  ? '${storeCountLabel(controller.pagination.total)} nearby'
                  : controller.pagination.total == 1
                  ? '1 match for "${controller.query}"'
                  : '${controller.pagination.total} matches for '
                        '"${controller.query}"',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          for (final brand in controller.items)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: StoreCard(
                brand: brand,
                onTap: () => context.push('/store/${brand.id}'),
                onProductTap: (productId) =>
                    context.push('/product/$productId'),
              ),
            ),
          if (controller.hasMore)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: AppButton(
                label: controller.loadingMore
                    ? 'Loading more shops'
                    : 'Show more shops',
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
