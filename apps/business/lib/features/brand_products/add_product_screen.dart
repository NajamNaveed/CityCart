import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'product_thumb.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load the catalogue. Check the connection and try again.';
}

/// Adds an item the CityCart catalogue already knows. The owner only sets the
/// shop price, an optional code and whether it goes live now.
class AddProductScreen extends ConsumerStatefulWidget {
  const AddProductScreen({super.key});

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  final _search = TextEditingController();
  var _items = const <CatalogItem>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  var _creating = false;
  String? _error;
  var _request = 0;

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
          .catalogItems(
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

  Future<void> _pick(CatalogItem item) async {
    if (_creating) return;
    final draft = await showFormSheet<_AddDraft>(
      context,
      title: 'Set your price',
      subtitle:
          'Customers see "${item.name}" exactly as it is in the CityCart '
          'catalogue. You choose what your shop charges.',
      child: _AddSheet(item: item),
    );
    if (draft == null || !mounted) return;

    setState(() => _creating = true);
    try {
      final product = await ref
          .read(businessRepositoryProvider)
          .addBrandProduct(
            catalogProductId: item.id,
            pricePaisa: draft.pricePaisa,
            compareAtPricePaisa: draft.compareAtPaisa,
            sku: draft.sku,
            status: draft.status,
          );
      if (!mounted) return;
      Navigator.of(context).pop(product);
    } catch (error) {
      if (!mounted) return;
      setState(() => _creating = false);
      showAppSnack(
        context,
        error is ApiException
            ? error.message
            : 'We could not add this product. Please try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add a product')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'CityCart catalogue',
              title: 'Add a product',
              subtitle:
                  'Pick an item CityCart already knows, then set the price for '
                  'your shop.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                16,
                AppSpacing.page,
                0,
              ),
              child: TextField(
                key: const Key('catalog_search'),
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Search the catalogue',
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
            if (_creating) ...[
              const SizedBox(height: 12),
              const LinearProgressIndicator(minHeight: 2),
            ],
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
    if (_loading) return const LoadingView(label: 'Loading the catalogue');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      final searched = _search.text.trim().isNotEmpty;
      return EmptyPanel(
        icon: Icons.search_off_rounded,
        title: searched ? 'No matching items' : 'The catalogue is empty',
        message: searched
            ? 'Try a shorter name, or clear the search to browse everything.'
            : 'Ask CityCart to add the item to the shared catalogue first.',
        action: searched
            ? AppButton(
                label: 'Clear search',
                variant: AppButtonVariant.outline,
                onPressed: () {
                  _search.clear();
                  _load();
                },
              )
            : null,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _CatalogRow(
            key: Key('catalog_item_${_items[i].id}'),
            item: _items[i],
            onTap: _creating ? null : () => _pick(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more items',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }
}

class _CatalogRow extends StatelessWidget {
  const _CatalogRow({super.key, required this.item, required this.onTap});

  final CatalogItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final details = [
      if (item.manufacturer.isNotEmpty) item.manufacturer,
      if (item.sizeLabel.isNotEmpty) item.sizeLabel,
    ].join(' · ');
    return SurfacePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          ProductThumb(image: item.image),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall,
                ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    details,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Icon(
            Icons.chevron_right_rounded,
            size: 22,
            color: AppColors.muted,
          ),
        ],
      ),
    );
  }
}

class _AddDraft {
  const _AddDraft({
    required this.pricePaisa,
    required this.compareAtPaisa,
    required this.sku,
    required this.status,
  });

  final int pricePaisa;
  final int compareAtPaisa;
  final String sku;
  final String status;
}

class _AddSheet extends StatefulWidget {
  const _AddSheet({required this.item});

  final CatalogItem item;

  @override
  State<_AddSheet> createState() => _AddSheetState();
}

class _AddSheetState extends State<_AddSheet> {
  final _formKey = GlobalKey<FormState>();
  final _price = TextEditingController();
  final _compare = TextEditingController();
  final _sku = TextEditingController();
  bool _showInShop = true;

  @override
  void dispose() {
    _price.dispose();
    _compare.dispose();
    _sku.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(
      _AddDraft(
        pricePaisa: paisaFromRupees(_price.text)!,
        compareAtPaisa: _compare.text.trim().isEmpty
            ? 0
            : paisaFromRupees(_compare.text)!,
        sku: _sku.text.trim(),
        status: _showInShop ? 'ACTIVE' : 'DRAFT',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('add_price'),
            label: 'Selling price',
            controller: _price,
            prefixText: 'Rs ',
            hint: '2500',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            validator: (value) {
              final paisa = paisaFromRupees(value ?? '');
              if (paisa == null) return 'Enter a price in rupees.';
              if (paisa <= 0) return 'Enter a price greater than zero.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('add_compare'),
            label: 'Compare-at price (optional)',
            controller: _compare,
            prefixText: 'Rs ',
            hint: '3000',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            validator: (value) {
              if ((value ?? '').trim().isEmpty) return null;
              final paisa = paisaFromRupees(value!);
              if (paisa == null) {
                return 'Enter an amount in rupees, or leave it empty.';
              }
              final selling = paisaFromRupees(_price.text);
              if (selling != null && paisa > 0 && paisa <= selling) {
                return 'Use an amount higher than the selling price, or leave '
                    'it empty.';
              }
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('add_sku'),
            label: 'Product code (optional)',
            controller: _sku,
            hint: 'GHEE-1KG',
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) => (value ?? '').trim().length > 40
                ? 'Keep the code under 40 characters.'
                : null,
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('add_publish_switch'),
            contentPadding: EdgeInsets.zero,
            value: _showInShop,
            onChanged: (value) => setState(() => _showInShop = value),
            title: const Text('Show in my shop'),
            subtitle: const Text(
              'Turn off to save it as a draft and publish it later.',
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            key: const Key('add_save'),
            label: _showInShop ? 'Add product' : 'Save as draft',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
