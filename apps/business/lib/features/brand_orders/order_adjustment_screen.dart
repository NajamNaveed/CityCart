import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not send the proposal. Check the connection and try again.';
}

/// Lets the shop propose a change to an order it cannot fully supply: fewer
/// units of a line, optionally replaced by another live product from the same
/// shop. The server re-checks every rule and computes the new totals; this
/// screen only collects the quantities and a note for the customer.
class BrandOrderAdjustmentScreen extends ConsumerStatefulWidget {
  const BrandOrderAdjustmentScreen({
    super.key,
    required this.orderId,
    this.initial,
  });

  final String orderId;
  final BrandOrder? initial;

  @override
  ConsumerState<BrandOrderAdjustmentScreen> createState() =>
      _BrandOrderAdjustmentScreenState();
}

class _BrandOrderAdjustmentScreenState
    extends ConsumerState<BrandOrderAdjustmentScreen> {
  BrandOrder? _order;
  BrandOrderDetail? _detail;
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  final _note = TextEditingController();
  final _lines = <String, _LineDraft>{};
  List<BrandProduct> _substitutes = const <BrandProduct>[];
  bool _loadingProducts = true;
  String? _productsError;
  bool _restockRemoved = false;
  String? _validationError;

  static const _adjustableStatuses = {'PENDING', 'CONFIRMED', 'PROCESSING'};

  @override
  void initState() {
    super.initState();
    _order = widget.initial;
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final repository = ref.read(businessRepositoryProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await repository.brandOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _applyOrder(detail.order);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _errorSentence(error);
      });
    }

    setState(() {
      _loadingProducts = true;
      _productsError = null;
    });
    try {
      final page = await repository.brandProducts(status: 'ACTIVE', limit: 100);
      if (!mounted) return;
      final ordered = _order?.items ?? const <BrandOrderItem>[];
      final orderedIds = ordered.map((item) => item.productId).toSet();
      setState(() {
        _substitutes = page.items
            .where(
              (product) => product.isLive && !orderedIds.contains(product.id),
            )
            .toList(growable: false);
        _loadingProducts = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingProducts = false;
        _productsError = _errorSentence(error);
      });
    }
  }

  void _applyOrder(BrandOrder order) {
    _order = order;
    _lines.clear();
    for (final item in order.items) {
      _lines[item.id] = _LineDraft(ordered: item.quantity);
    }
  }

  bool get _eligible {
    final order = _order;
    if (order == null) return false;
    final paymentMethod = _detail?.payment?.method ?? order.paymentMethod;
    return _adjustableStatuses.contains(order.orderStatus) &&
        paymentMethod != 'ONLINE_GATEWAY' &&
        _detail?.pendingAdjustment == null;
  }

  List<BrandAdjustmentLine> get _changedLines {
    final order = _order;
    if (order == null) return const <BrandAdjustmentLine>[];
    return [
      for (final item in order.items)
        if (_lines[item.id]?.hasChange ?? false)
          BrandAdjustmentLine(
            orderItemId: item.id,
            supplyQuantity: _lines[item.id]!.supply,
            substituteProductId: _lines[item.id]!.substituteProductId,
            substituteQuantity: _lines[item.id]!.substituteQuantity,
          ),
    ];
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final order = _order;
    if (order == null || !_eligible) return;

    final note = _note.text.trim();
    if (note.isEmpty) {
      setState(() => _validationError = 'Tell the customer what changed.');
      return;
    }
    if (note.length > 500) {
      setState(() => _validationError = 'Keep the note under 500 characters.');
      return;
    }
    final changed = _changedLines;
    if (changed.isEmpty) {
      setState(
        () => _validationError =
            'Lower the supply of at least one item, or add a substitute.',
      );
      return;
    }
    for (final line in changed) {
      final draft = _lines[line.orderItemId];
      final lineError = draft == null ? null : _lineError(draft);
      if (lineError != null) {
        setState(() => _validationError = lineError);
        return;
      }
    }

    setState(() {
      _submitting = true;
      _validationError = null;
    });
    try {
      await ref
          .read(businessRepositoryProvider)
          .proposeBrandAdjustment(
            order.id,
            note: note,
            lines: changed,
            restockRemoved: _restockRemoved,
          );
      if (!mounted) return;
      showAppSnack(context, 'Proposal sent to the customer.');
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _validationError = _errorSentence(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      appBar: AppBar(title: const Text('Propose a change')),
      body: _body(order),
      bottomNavigationBar: order == null || !_eligible
          ? null
          : SafeArea(
              top: false,
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.line)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                child: AppButton(
                  key: const Key('adjustment_submit'),
                  label: 'Send proposal',
                  icon: Icons.send_rounded,
                  loading: _submitting,
                  onPressed: _submitting ? null : _submit,
                ),
              ),
            ),
    );
  }

  Widget _body(BrandOrder? order) {
    if (_loading && order == null) {
      return const LoadingView(label: 'Loading the order');
    }
    if (order == null) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: [
          ErrorPanel(
            message: _error ?? 'This order could not be loaded.',
            onRetry: _load,
          ),
        ],
      );
    }
    if (!_eligible) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: const [
          SizedBox(height: 30),
          EmptyPanel(
            icon: Icons.lock_outline_rounded,
            title: 'This order cannot be changed',
            message:
                'A change can only be proposed while the order is waiting, '
                'confirmed or being prepared, and only when no other proposal '
                'is waiting for the customer.',
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          PageHeader(
            eyebrow: 'Order',
            title: order.orderNumber,
            subtitle:
                'Say what you can actually supply. The customer accepts the '
                'change or removes the missing items, and the server works '
                'out the new total.',
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              18,
              AppSpacing.page,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (order.items.isEmpty)
                  const EmptyPanel(
                    icon: Icons.inventory_2_outlined,
                    title: 'No items recorded',
                    message:
                        'This order has no item lines, so there is nothing to '
                        'change. Check it on the website.',
                  )
                else ...[
                  const SectionTitle('What can you supply?'),
                  for (var i = 0; i < order.items.length; i++) ...[
                    if (i > 0) const SizedBox(height: 10),
                    _ItemCard(
                      item: order.items[i],
                      draft:
                          _lines[order.items[i].id] ?? _LineDraft(ordered: 1),
                      substitutes: _substitutes,
                      loadingSubstitutes: _loadingProducts,
                      substitutesError: _productsError,
                      enabled: !_submitting,
                      onChanged: (draft) =>
                          setState(() => _lines[order.items[i].id] = draft),
                    ),
                  ],
                ],
                const SizedBox(height: 22),
                const SectionTitle('Note for the customer'),
                AppField(
                  key: const Key('adjustment_note'),
                  label: 'What changed?',
                  controller: _note,
                  hint:
                      'For example: only 1 kurta is left, the rest is '
                      'replaced with the printed one.',
                  maxLines: 3,
                  maxLength: 500,
                  enabled: !_submitting,
                ),
                const SizedBox(height: 14),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  child: SwitchListTile(
                    key: const Key('adjustment_restock'),
                    title: const Text('Return unsupplied units to stock'),
                    subtitle: const Text(
                      'Turn this on when the missing units are back on your shelf.',
                    ),
                    value: _restockRemoved,
                    onChanged: _submitting
                        ? null
                        : (value) => setState(() => _restockRemoved = value),
                  ),
                ),
                const SizedBox(height: 14),
                if (_validationError != null) ...[
                  ErrorPanel(
                    key: const Key('adjustment_error'),
                    message: _validationError!,
                  ),
                  const SizedBox(height: 14),
                ],
                Text(
                  'Prices and the new order total are calculated on the '
                  'server. The order cannot be marked ready to ship until the '
                  'customer answers or you withdraw the proposal.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String? _lineError(_LineDraft draft) {
  if (!draft.hasChange) return null;
  if (draft.hasSubstitute && draft.shortage < 1) {
    return 'A substitute only makes sense for units you cannot supply.';
  }
  if (draft.hasSubstitute && draft.substituteQuantity > draft.shortage) {
    return 'A substitute cannot replace more units than are missing.';
  }
  return null;
}

class _LineDraft {
  _LineDraft({required this.ordered, int? supply}) : supply = supply ?? ordered;

  final int ordered;
  int supply;
  String? substituteProductId;
  int substituteQuantity = 1;

  int get shortage => ordered - supply;
  bool get hasSubstitute =>
      substituteProductId != null && substituteProductId!.isNotEmpty;
  bool get hasChange => supply < ordered || (hasSubstitute && shortage > 0);
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({
    required this.item,
    required this.draft,
    required this.substitutes,
    required this.loadingSubstitutes,
    required this.substitutesError,
    required this.enabled,
    required this.onChanged,
  });

  final BrandOrderItem item;
  final _LineDraft draft;
  final List<BrandProduct> substitutes;
  final bool loadingSubstitutes;
  final String? substitutesError;
  final bool enabled;
  final ValueChanged<_LineDraft> onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final error = _lineError(draft);

    return SurfacePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.productName,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text.titleSmall,
          ),
          const SizedBox(height: 2),
          Text(
            '${item.quantity} × ${money(item.unitPricePaisa)} ordered',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.bodySmall,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  'You can supply',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.labelMedium,
                ),
              ),
              const SizedBox(width: 8),
              _Stepper(
                prefix: 'adjustment_item_${item.id}_supply',
                value: draft.supply,
                min: 0,
                max: item.quantity,
                enabled: enabled,
                onChanged: (value) {
                  draft.supply = value;
                  onChanged(draft);
                },
              ),
            ],
          ),
          if (draft.shortage > 0) ...[
            const SizedBox(height: 8),
            Text(
              '${draft.shortage} ${draft.shortage == 1 ? 'unit is' : 'units are'} missing.',
              style: text.bodySmall?.copyWith(
                color: AppColors.clay,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 12),
          _SubstitutePicker(
            prefix: 'adjustment_item_${item.id}_substitute',
            draft: draft,
            substitutes: substitutes,
            loading: loadingSubstitutes,
            error: substitutesError,
            enabled: enabled,
            onChanged: (productId, quantity) {
              draft.substituteProductId = productId;
              if (productId != null) {
                final max = draft.shortage < 1 ? 1 : draft.shortage;
                draft.substituteQuantity = quantity < 1
                    ? 1
                    : (quantity > max ? max : quantity);
              }
              onChanged(draft);
            },
          ),
          if (error != null) ...[
            const SizedBox(height: 8),
            Text(
              error,
              key: Key('adjustment_item_${item.id}_error'),
              style: text.bodySmall?.copyWith(
                color: AppColors.clay,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.prefix,
    required this.value,
    required this.min,
    required this.max,
    required this.enabled,
    required this.onChanged,
  });

  final String prefix;
  final int value;
  final int min;
  final int max;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget button(String suffix, IconData icon, int next, bool active) {
      return IconButton(
        key: Key('${prefix}_$suffix'),
        onPressed: enabled && active ? () => onChanged(next) : null,
        icon: Icon(icon, size: 19),
        visualDensity: VisualDensity.compact,
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.paper,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button('minus', Icons.remove_rounded, value - 1, value > min),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              '$value',
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
          button('plus', Icons.add_rounded, value + 1, value < max),
        ],
      ),
    );
  }
}

class _SubstitutePicker extends StatelessWidget {
  const _SubstitutePicker({
    required this.prefix,
    required this.draft,
    required this.substitutes,
    required this.loading,
    required this.error,
    required this.enabled,
    required this.onChanged,
  });

  final String prefix;
  final _LineDraft draft;
  final List<BrandProduct> substitutes;
  final bool loading;
  final String? error;
  final bool enabled;
  final void Function(String? productId, int quantity) onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (loading) {
      return Text('Loading your live products…', style: text.bodySmall);
    }
    if (error != null) {
      return Text(
        'Substitutes could not be loaded. You can still propose fewer units.',
        style: text.bodySmall?.copyWith(color: AppColors.clay),
      );
    }
    if (substitutes.isEmpty) {
      return Text(
        'No other live products to swap in. You can still propose fewer units.',
        style: text.bodySmall,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String?>(
          key: Key('${prefix}_picker'),
          initialValue: draft.substituteProductId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Substitute (optional)'),
          items: [
            const DropdownMenuItem<String?>(
              value: null,
              child: Text('No substitute'),
            ),
            for (final product in substitutes)
              DropdownMenuItem<String?>(
                value: product.id,
                child: Text(
                  '${product.name} · ${money(product.pricePaisa)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: enabled
              ? (value) => onChanged(value, draft.substituteQuantity)
              : null,
        ),
        if (draft.hasSubstitute) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Swap in',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.labelMedium,
                ),
              ),
              const SizedBox(width: 8),
              _Stepper(
                prefix: '${prefix}_qty',
                value: draft.substituteQuantity,
                min: 1,
                max: draft.shortage < 1 ? 1 : draft.shortage,
                enabled: enabled,
                onChanged: (value) =>
                    onChanged(draft.substituteProductId, value),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
