import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load this product. Check the connection and try again.';
}

const _addReasons = ['STOCK_RECEIVED', 'RETURNED', 'CORRECTION'];
const _removeReasons = ['DAMAGED', 'LOST', 'CORRECTION', 'MANUAL_ADJUSTMENT'];

/// One product in full: what customers pay, what is left, and whether it is
/// visible. Every action says in plain words what will change.
class BrandProductDetailScreen extends ConsumerStatefulWidget {
  const BrandProductDetailScreen({
    super.key,
    required this.productId,
    this.initial,
  });

  final String productId;
  final BrandProduct? initial;

  @override
  ConsumerState<BrandProductDetailScreen> createState() =>
      _BrandProductDetailScreenState();
}

class _BrandProductDetailScreenState
    extends ConsumerState<BrandProductDetailScreen> {
  BrandProduct? _product;
  BrandStock? _stock;
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _product = widget.initial;
    _stock = widget.initial?.stock;
    Future<void>.microtask(_refresh);
  }

  Future<void> _refresh() async {
    try {
      final detail = await ref
          .read(businessRepositoryProvider)
          .brandProduct(widget.productId);
      if (!mounted) return;
      setState(() {
        _product = detail.product;
        _stock = detail.stock;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      final message = _errorSentence(error);
      if (_product == null) {
        setState(() => _error = message);
      } else {
        showAppSnack(context, message, error: true);
      }
    }
  }

  void _applyProduct(BrandProduct product) {
    setState(() {
      _product = product;
      if (product.stock != null) _stock = product.stock;
    });
  }

  void _applyStock(BrandStock stock) {
    setState(() {
      _stock = stock;
      final product = _product;
      if (product != null) _product = product.copyWith(stock: stock);
    });
  }

  Future<void> _editPrice() async {
    final product = _product;
    if (product == null || _busy != null) return;
    final draft = await showFormSheet<_PriceDraft>(
      context,
      title: 'Price and code',
      subtitle:
          'The selling price is what customers pay. A compare-at price is '
          'shown crossed out beside it.',
      child: _PriceSheet(product: product),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'price');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .updateBrandProduct(
            product.id,
            pricePaisa: draft.pricePaisa,
            compareAtPricePaisa: draft.compareAtPaisa,
            sku: draft.sku,
          );
      if (!mounted) return;
      _applyProduct(updated.copyWith(stock: _stock));
      setState(() => _busy = null);
      await _refresh();
      if (mounted) showAppSnack(context, 'Price updated.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _changeVisibility() async {
    final product = _product;
    if (product == null || _busy != null) return;

    final restoring = product.isArchived;
    final hiding = product.isLive;
    final title = restoring
        ? 'Put this product back?'
        : hiding
        ? 'Hide this product?'
        : 'Show this product?';
    final message = restoring
        ? 'It returns to your shop as a live product. Past orders are not '
              'affected.'
        : hiding
        ? 'Customers will not see it in your shop. You can show it again any '
              'time.'
        : 'Customers can find this product and buy it right away.';
    final ok = await confirmAction(
      context,
      title: title,
      message: message,
      confirmLabel: restoring
          ? 'Put back'
          : hiding
          ? 'Hide product'
          : 'Show product',
      destructive: hiding,
    );
    if (!ok || !mounted) return;

    final status = hiding ? 'INACTIVE' : 'ACTIVE';
    setState(() => _busy = 'visibility');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .updateBrandProduct(
            product.id,
            status: status,
            isActive: status == 'ACTIVE',
          );
      if (!mounted) return;
      _applyProduct(updated.copyWith(stock: _stock));
      setState(() => _busy = null);
      showAppSnack(
        context,
        hiding
            ? 'Product hidden.'
            : restoring
            ? 'Product is back in your shop.'
            : 'Product is live.',
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _archive() async {
    final product = _product;
    if (product == null || _busy != null) return;
    final ok = await confirmAction(
      context,
      title: 'Archive this product?',
      message:
          'It leaves your shop for good. Past orders keep their record, but '
          'you cannot sell it again from this page.',
      confirmLabel: 'Archive product',
      destructive: true,
    );
    if (!ok || !mounted) return;

    setState(() => _busy = 'archive');
    try {
      await ref
          .read(businessRepositoryProvider)
          .archiveBrandProduct(product.id);
      if (!mounted) return;
      final archived = product.copyWith(status: 'ARCHIVED', isActive: false);
      _applyProduct(archived);
      setState(() => _busy = null);
      showAppSnack(context, 'Product archived.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _changeStock({required bool add}) async {
    final product = _product;
    if (product == null || _busy != null) return;
    final draft = await showFormSheet<_StockDraft>(
      context,
      title: add ? 'Add stock' : 'Remove stock',
      subtitle: add
          ? 'How many items arrived? Stock becomes available for customers to buy.'
          : 'How many items are leaving? Reserved items cannot be removed.',
      child: _StockSheet(add: add, available: _stock?.availableQuantity),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = add ? 'add' : 'remove');
    try {
      final stock = await ref
          .read(businessRepositoryProvider)
          .adjustBrandStock(
            product.id,
            change: draft.change,
            reason: draft.reason,
          );
      if (!mounted) return;
      _applyStock(stock);
      setState(() => _busy = null);
      showAppSnack(
        context,
        add
            ? '${draft.change} added to stock.'
            : '${-draft.change} removed from stock.',
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _editStockSettings() async {
    final product = _product;
    final stock = _stock;
    if (product == null || _busy != null) return;
    final draft = await showFormSheet<_StockSettingsDraft>(
      context,
      title: 'Stock settings',
      subtitle:
          'Tell the app when to warn you that stock is running low, or stop '
          'tracking stock for this product.',
      child: _StockSettingsSheet(
        threshold: stock?.lowStockThreshold ?? 0,
        trackInventory: stock?.trackInventory ?? true,
      ),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'settings');
    try {
      final saved = await ref
          .read(businessRepositoryProvider)
          .setBrandStock(
            product.id,
            lowStockThreshold: draft.threshold,
            trackInventory: draft.trackInventory,
          );
      if (!mounted) return;
      _applyStock(saved);
      setState(() => _busy = null);
      showAppSnack(context, 'Stock settings saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _turnOnTracking() async {
    final product = _product;
    if (product == null || _busy != null) return;
    setState(() => _busy = 'settings');
    try {
      final saved = await ref
          .read(businessRepositoryProvider)
          .setBrandStock(product.id, trackInventory: true);
      if (!mounted) return;
      _applyStock(saved);
      setState(() => _busy = null);
      showAppSnack(context, 'Stock tracking turned on.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Product details')),
      body: _body(),
    );
  }

  Widget _body() {
    final product = _product;
    if (product == null) {
      final error = _error;
      if (error == null) return const LoadingView(label: 'Loading product');
      return ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.page,
          20,
          AppSpacing.page,
          24,
        ),
        children: [ErrorPanel(message: error, onRetry: _refresh)],
      );
    }

    final stock = _stock;
    final working = _busy != null;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          PageHeader(
            eyebrow: 'Product',
            title: product.name,
            subtitle: productStatusDetail(product.status),
          ),
          if (product.image != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                18,
                AppSpacing.page,
                0,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.lg),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.network(
                    product.image!,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      color: AppColors.paper,
                      alignment: Alignment.center,
                      child: const Icon(
                        Icons.inventory_2_outlined,
                        size: 34,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              16,
              AppSpacing.page,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusTag(
                      label: productStatusLabel(product.status),
                      tone: productStatusTone(product.status),
                    ),
                    if (stock != null)
                      StatusTag(
                        label: stockStatusLabel(stock.stockStatus),
                        tone: stockStatusTone(stock.stockStatus),
                      ),
                  ],
                ),
                const SizedBox(height: 22),
                const SectionTitle('Price'),
                SurfacePanel(
                  child: Column(
                    children: [
                      _DetailLine(
                        label: 'Selling price',
                        value: money(product.pricePaisa),
                        strong: true,
                      ),
                      if (product.compareAtPricePaisa > 0) ...[
                        const SizedBox(height: 8),
                        _DetailLine(
                          label: 'Compare at',
                          value: money(product.compareAtPricePaisa),
                        ),
                      ],
                      const SizedBox(height: 8),
                      _DetailLine(
                        label: 'Product code',
                        value: product.sku.isEmpty ? 'Not set' : product.sku,
                      ),
                      const SizedBox(height: 14),
                      AppButton(
                        key: const Key('product_edit_price'),
                        label: 'Edit price and code',
                        icon: Icons.edit_outlined,
                        variant: AppButtonVariant.outline,
                        compact: true,
                        onPressed: working ? null : _editPrice,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Stock'),
                _StockPanel(
                  stock: stock,
                  busyAction: _busy,
                  onAdd: working ? null : () => _changeStock(add: true),
                  onRemove:
                      working ||
                          stock == null ||
                          !stock.trackInventory ||
                          stock.availableQuantity <= 0
                      ? null
                      : () => _changeStock(add: false),
                  onSettings: working ? null : _editStockSettings,
                  onTrack: working ? null : _turnOnTracking,
                ),
                const SizedBox(height: 22),
                const SectionTitle('Visibility'),
                SurfacePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _visibilitySentence(product),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 14),
                      AppButton(
                        key: const Key('product_visibility'),
                        label: product.isArchived
                            ? 'Put back in shop'
                            : product.isLive
                            ? 'Hide from shop'
                            : 'Show in shop',
                        icon: product.isLive
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        variant: product.isLive
                            ? AppButtonVariant.outline
                            : AppButtonVariant.primary,
                        loading: _busy == 'visibility',
                        onPressed: working ? null : _changeVisibility,
                      ),
                      if (!product.isArchived) ...[
                        const SizedBox(height: 2),
                        TextButton(
                          key: const Key('product_archive'),
                          onPressed: working ? null : _archive,
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.clay,
                          ),
                          child: Text(
                            _busy == 'archive'
                                ? 'Archiving…'
                                : 'Archive product',
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _visibilitySentence(BrandProduct product) {
    if (product.isArchived) {
      return 'This product is archived. Put it back if you want to sell it '
          'again.';
    }
    if (product.isLive) {
      return 'Customers can see and buy this product right now.';
    }
    if (product.status == 'DRAFT') {
      return 'This is a draft. It only becomes visible once you show it in '
          'your shop.';
    }
    return 'This product is hidden. Customers cannot see it until you show it '
        'again.';
  }
}

class _StockPanel extends StatelessWidget {
  const _StockPanel({
    required this.stock,
    required this.busyAction,
    required this.onAdd,
    required this.onRemove,
    required this.onSettings,
    required this.onTrack,
  });

  final BrandStock? stock;
  final String? busyAction;
  final VoidCallback? onAdd;
  final VoidCallback? onRemove;
  final VoidCallback? onSettings;
  final VoidCallback? onTrack;

  @override
  Widget build(BuildContext context) {
    final stock = this.stock;
    if (stock == null) {
      return SurfacePanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const NoticeBanner(
              icon: Icons.inventory_2_outlined,
              message:
                  'No stock has been recorded yet. Add the first batch so '
                  'customers can buy this product.',
            ),
            const SizedBox(height: 14),
            AppButton(
              key: const Key('stock_add'),
              label: 'Add stock',
              icon: Icons.add_rounded,
              onPressed: onAdd,
            ),
          ],
        ),
      );
    }

    if (!stock.trackInventory) {
      return SurfacePanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const NoticeBanner(
              icon: Icons.all_inclusive_rounded,
              message:
                  'Stock is not tracked for this product. Customers can order '
                  'it without a limited count.',
              tone: AppTone.blue,
            ),
            const SizedBox(height: 12),
            AppButton(
              key: const Key('product_track_stock'),
              label: 'Track stock again',
              icon: Icons.visibility_outlined,
              variant: AppButtonVariant.outline,
              compact: true,
              onPressed: onTrack,
            ),
          ],
        ),
      );
    }

    final available = stock.availableQuantity;
    return SurfacePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _DetailLine(
            label: 'Available to sell',
            value: available <= 0 ? 'Out of stock' : '$available items',
            strong: true,
          ),
          const SizedBox(height: 8),
          _DetailLine(label: 'On hand', value: '${stock.quantity} items'),
          if (stock.reservedQuantity > 0) ...[
            const SizedBox(height: 8),
            _DetailLine(
              label: 'Reserved for orders',
              value: '${stock.reservedQuantity} items',
            ),
          ],
          const SizedBox(height: 8),
          _DetailLine(
            label: 'Low-stock warning',
            value: stock.lowStockThreshold == 0
                ? 'Not set'
                : 'At ${stock.lowStockThreshold} items',
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  key: const Key('stock_add'),
                  label: 'Add stock',
                  icon: Icons.add_rounded,
                  compact: true,
                  loading: busyAction == 'add',
                  onPressed: onAdd,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: AppButton(
                  key: const Key('stock_remove'),
                  label: 'Remove',
                  icon: Icons.remove_rounded,
                  variant: AppButtonVariant.outline,
                  compact: true,
                  loading: busyAction == 'remove',
                  onPressed: onRemove,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          TextButton(
            key: const Key('product_stock_settings'),
            onPressed: onSettings,
            child: const Text('Stock settings'),
          ),
        ],
      ),
    );
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text.bodySmall,
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.right,
            style: strong
                ? text.titleMedium?.copyWith(fontSize: 17)
                : text.titleSmall,
          ),
        ),
      ],
    );
  }
}

class _PriceDraft {
  const _PriceDraft({
    required this.pricePaisa,
    required this.compareAtPaisa,
    required this.sku,
  });

  final int pricePaisa;
  final int compareAtPaisa;
  final String sku;
}

class _PriceSheet extends StatefulWidget {
  const _PriceSheet({required this.product});

  final BrandProduct product;

  @override
  State<_PriceSheet> createState() => _PriceSheetState();
}

class _PriceSheetState extends State<_PriceSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _price;
  late final TextEditingController _compare;
  late final TextEditingController _sku;

  @override
  void initState() {
    super.initState();
    _price = TextEditingController(
      text: rupeesField(widget.product.pricePaisa),
    );
    _compare = TextEditingController(
      text: widget.product.compareAtPricePaisa > 0
          ? rupeesField(widget.product.compareAtPricePaisa)
          : '',
    );
    _sku = TextEditingController(text: widget.product.sku);
  }

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
      _PriceDraft(
        pricePaisa: paisaFromRupees(_price.text)!,
        compareAtPaisa: _compare.text.trim().isEmpty
            ? 0
            : paisaFromRupees(_compare.text)!,
        sku: _sku.text.trim(),
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
            key: const Key('product_price'),
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
            key: const Key('product_compare'),
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
                return 'Use an amount higher than the selling price, or leave it empty.';
              }
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('product_sku'),
            label: 'Product code (optional)',
            controller: _sku,
            hint: 'KURTA-BLUE-M',
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) => (value ?? '').trim().length > 40
                ? 'Keep the code under 40 characters.'
                : null,
          ),
          const SizedBox(height: 20),
          AppButton(
            key: const Key('product_save'),
            label: 'Save changes',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _StockDraft {
  const _StockDraft({required this.change, required this.reason});

  final int change;
  final String reason;
}

class _StockSheet extends StatefulWidget {
  const _StockSheet({required this.add, required this.available});

  final bool add;
  final int? available;

  @override
  State<_StockSheet> createState() => _StockSheetState();
}

class _StockSheetState extends State<_StockSheet> {
  final _formKey = GlobalKey<FormState>();
  final _quantity = TextEditingController();
  late String _reason = widget.add ? _addReasons.first : _removeReasons.first;

  @override
  void dispose() {
    _quantity.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final quantity = int.parse(_quantity.text.trim());
    Navigator.of(context).pop(
      _StockDraft(change: widget.add ? quantity : -quantity, reason: _reason),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reasons = widget.add ? _addReasons : _removeReasons;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('stock_quantity'),
            label: widget.add ? 'Items received' : 'Items leaving',
            controller: _quantity,
            hint: '12',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) {
              final quantity = int.tryParse((value ?? '').trim());
              if (quantity == null) return 'Enter a whole number.';
              if (quantity <= 0) return 'Enter at least one item.';
              final available = widget.available;
              if (!widget.add && available != null && quantity > available) {
                return 'Only $available items are available to remove.';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          Text(
            'What is the reason?',
            style: Theme.of(context).textTheme.labelMedium
                ?.copyWith(color: AppColors.inkSoft),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final reason in reasons)
                ChoiceChip(
                  key: Key('stock_reason_$reason'),
                  label: Text(
                    stockAdjustmentReasonLabel(reason),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  selected: reason == _reason,
                  onSelected: (_) => setState(() => _reason = reason),
                ),
            ],
          ),
          const SizedBox(height: 20),
          AppButton(
            key: const Key('stock_save'),
            label: widget.add ? 'Add stock' : 'Remove stock',
            icon: widget.add ? Icons.add_rounded : Icons.remove_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _StockSettingsDraft {
  const _StockSettingsDraft({
    required this.threshold,
    required this.trackInventory,
  });

  final int threshold;
  final bool trackInventory;
}

class _StockSettingsSheet extends StatefulWidget {
  const _StockSettingsSheet({
    required this.threshold,
    required this.trackInventory,
  });

  final int threshold;
  final bool trackInventory;

  @override
  State<_StockSettingsSheet> createState() => _StockSettingsSheetState();
}

class _StockSettingsSheetState extends State<_StockSettingsSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _threshold;
  late bool _track;

  @override
  void initState() {
    super.initState();
    _threshold = TextEditingController(
      text: widget.threshold == 0 ? '' : '${widget.threshold}',
    );
    _track = widget.trackInventory;
  }

  @override
  void dispose() {
    _threshold.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final raw = _threshold.text.trim();
    Navigator.of(context).pop(
      _StockSettingsDraft(
        threshold: raw.isEmpty ? 0 : int.parse(raw),
        trackInventory: _track,
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
            key: const Key('stock_threshold'),
            label: 'Warn me when stock reaches',
            controller: _threshold,
            hint: '5',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) {
              final raw = (value ?? '').trim();
              if (raw.isEmpty) return null;
              final number = int.tryParse(raw);
              if (number == null) {
                return 'Enter a whole number, or leave it empty.';
              }
              if (number < 0) return 'Use zero or more.';
              return null;
            },
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('stock_track_switch'),
            contentPadding: EdgeInsets.zero,
            value: _track,
            onChanged: (value) => setState(() => _track = value),
            title: const Text('Track stock'),
            subtitle: const Text(
              'When off, customers can order this product without a stock count.',
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            key: const Key('stock_settings_save'),
            label: 'Save settings',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
