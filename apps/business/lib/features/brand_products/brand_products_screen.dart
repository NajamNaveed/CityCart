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
import 'product_thumb.dart';

class _ProductFilter {
  const _ProductFilter(this.label, this.key, this.status);

  final String label;
  final String key;
  final String? status;
}

const _filters = [
  _ProductFilter('All', 'all', null),
  _ProductFilter('Live', 'live', 'ACTIVE'),
  _ProductFilter('Draft', 'draft', 'DRAFT'),
  _ProductFilter('Hidden', 'hidden', 'INACTIVE'),
  _ProductFilter('Archived', 'archived', 'ARCHIVED'),
];

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your products. Check the connection and try again.';
}

/// Everything the shop sells: price, stock and what customers can currently
/// see. Search and the five state filters stay on one screen.
class BrandProductsScreen extends ConsumerStatefulWidget {
  const BrandProductsScreen({super.key, this.initialStatus});

  final String? initialStatus;

  @override
  ConsumerState<BrandProductsScreen> createState() =>
      _BrandProductsScreenState();
}

class _BrandProductsScreenState extends ConsumerState<BrandProductsScreen> {
  late int _filterIndex = _indexFor(widget.initialStatus);
  final _search = TextEditingController();
  var _items = const <BrandProduct>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  var _request = 0;

  static int _indexFor(String? status) {
    if (status == null) return 0;
    final index = _filters.indexWhere((filter) => filter.status == status);
    return index < 0 ? 0 : index;
  }

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = true}) async {
    final token = ++_request;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      setState(() => _loadingMore = true);
    }

    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .brandProducts(
            status: _filters[_filterIndex].status,
            search: _search.text,
            page: reset ? 1 : _pagination.page + 1,
          );
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _pagination = page.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted || token != _request) return;
      final message = _errorSentence(error);
      setState(() {
        _loading = false;
        _loadingMore = false;
        if (reset) _error = message;
      });
      if (!reset) showAppSnack(context, message, error: true);
    }
  }

  void _selectFilter(int index) {
    if (index == _filterIndex) return;
    setState(() => _filterIndex = index);
    _load();
  }

  Future<void> _open(BrandProduct product) async {
    await context.push('/brand-products/${product.id}', extra: product);
    if (mounted) _load();
  }

  Future<void> _add() async {
    final added = await context.push<BrandProduct>('/brand-products/add');
    if (added == null || !mounted) return;
    _search.clear();
    setState(() => _filterIndex = 0);
    await _load();
    if (mounted) showAppSnack(context, 'Product added to your shop.');
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Products')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            PageHeader(
              eyebrow: 'Shop owner',
              title: 'Your products',
              subtitle:
                  'Set prices, watch stock and decide what customers can buy.',
              action: IconButton(
                key: const Key('product_add'),
                onPressed: _add,
                tooltip: 'Add a product',
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.forest,
                  foregroundColor: AppColors.white,
                  minimumSize: const Size(46, 46),
                ),
                icon: const Icon(Icons.add_rounded),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                16,
                AppSpacing.page,
                0,
              ),
              child: TextField(
                key: const Key('product_search'),
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Search your products',
                  prefixIcon: const Icon(Icons.search_rounded, size: 21),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          onPressed: () {
                            _search.clear();
                            _load();
                          },
                          icon: const Icon(Icons.close_rounded, size: 19),
                        ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _filters[index];
                  return FilterPill(
                    key: Key('brand_product_filter_${filter.key}'),
                    label: filter.label,
                    selected: index == _filterIndex,
                    onTap: () => _selectFilter(index),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: _content(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading) return const LoadingView(label: 'Loading products');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      final searched = _search.text.trim().isNotEmpty;
      return EmptyPanel(
        icon: Icons.inventory_2_outlined,
        title: searched ? 'No matching products' : _emptyTitle,
        message: searched
            ? 'Try a different name, or clear the search to see everything.'
            : _emptyMessage,
        action: searched
            ? AppButton(
                label: 'Clear search',
                variant: AppButtonVariant.outline,
                onPressed: () {
                  _search.clear();
                  _load();
                },
              )
            : AppButton(
                label: 'Add a product',
                icon: Icons.add_rounded,
                onPressed: _add,
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _ProductCard(
            key: Key('product_card_${_items[i].id}'),
            product: _items[i],
            onTap: () => _open(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more products',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }

  String get _emptyTitle => switch (_filters[_filterIndex].status) {
    null => 'No products yet',
    'ACTIVE' => 'Nothing live yet',
    'DRAFT' => 'No drafts',
    'INACTIVE' => 'Nothing hidden',
    'ARCHIVED' => 'Nothing archived',
    _ => 'Nothing here',
  };

  String get _emptyMessage => switch (_filters[_filterIndex].status) {
    null => 'Add an item from the CityCart catalogue and set the price for your shop.',
    'ACTIVE' => 'Publish a product and customers can start buying it.',
    'DRAFT' =>
      'Products you are still preparing wait here until you publish them.',
    'INACTIVE' =>
      'When you hide a product it moves here. You can show it again any time.',
    'ARCHIVED' =>
      'Archived products keep their past orders but stay out of the shop.',
    _ => 'Try another filter.',
  };
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({super.key, required this.product, required this.onTap});

  final BrandProduct product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final compare = product.compareAtPricePaisa > product.pricePaisa;
    return SurfacePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ProductThumb(image: product.image, size: 64),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: text.titleSmall,
                      ),
                    ),
                    const SizedBox(width: 8),
                    StatusTag(
                      label: productStatusLabel(product.status),
                      tone: productStatusTone(product.status),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Wrap(
                  spacing: 7,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      money(product.pricePaisa),
                      maxLines: 1,
                      style: text.titleSmall?.copyWith(fontSize: 16),
                    ),
                    if (compare)
                      Text(
                        money(product.compareAtPricePaisa),
                        maxLines: 1,
                        style: text.bodySmall?.copyWith(
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(
                      Icons.inventory_2_outlined,
                      size: 15,
                      color: AppColors.muted,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        [
                          stockQuantityLabel(product.stock),
                          if (product.sku.isNotEmpty) product.sku,
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Products')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Products',
            title: 'For shop owners',
            subtitle: 'Service accounts manage services, not shop products.',
          ),
          SizedBox(height: 20),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: EmptyPanel(
              icon: Icons.storefront_outlined,
              title: 'This is a shop screen',
              message:
                  'Products belong to shop accounts. Service work is under '
                  'Bookings and Services.',
            ),
          ),
        ],
      ),
    );
  }
}
