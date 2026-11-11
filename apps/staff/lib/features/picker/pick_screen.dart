import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

class PickScreen extends ConsumerStatefulWidget {
  const PickScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<PickScreen> createState() => _PickScreenState();
}

class _PickScreenState extends ConsumerState<PickScreen> {
  PickOrder? _order;
  bool _loading = true;
  bool _working = false;
  String? _error;
  String? _lineBusyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  StaffRepository get _repository => ref.read(staffRepositoryProvider);

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    setState(() => _error = null);
    try {
      final order = await _repository.pickerOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _claim() async {
    if (_working) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final order = await _repository.claimOrder(widget.orderId);
      if (!mounted) return;
      setState(() => _order = order);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      if (error.code == 'PICK_TAKEN') await _load(quiet: true);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _chooseLine(PickLine line) async {
    final order = _order;
    if (order == null || _lineBusyId != null) return;
    if (order.activeAdjustment != null) {
      showAppSnack(
        context,
        'The customer is answering a change request. You can edit again after their answer.',
      );
      return;
    }

    final choice = await showAppSheet<_PickChoice>(
      context,
      title: line.productName,
      subtitle: 'Mark what you found on the shelf.',
      child: _LineChoiceSheet(line: line),
    );
    if (choice == null || !mounted) return;

    if (choice.status == 'SHORT') {
      final quantity = await showAppSheet<int>(
        context,
        title: 'How many were found?',
        subtitle: 'You need ${line.quantity} in total. The rest becomes short.',
        child: _QuantitySheet(max: line.quantity - 1),
      );
      if (quantity == null || !mounted) return;
      await _saveLine(line, 'SHORT', quantity);
      return;
    }
    await _saveLine(line, choice.status, null);
  }

  Future<void> _saveLine(PickLine line, String status, int? pickedQty) async {
    setState(() {
      _lineBusyId = line.id;
      _error = null;
    });
    try {
      final order = await _repository.setLinePick(
        orderId: widget.orderId,
        itemId: line.id,
        pickStatus: status,
        pickedQty: pickedQty,
      );
      if (!mounted) return;
      setState(() => _order = order);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
      if (error.code == 'ORDER_CHANGED' || error.code == 'NOT_PICKING') {
        await _load(quiet: true);
      }
    } finally {
      if (mounted) setState(() => _lineBusyId = null);
    }
  }

  Future<void> _propose() async {
    final order = _order;
    if (order == null) return;
    final shortLines = order.lines
        .where((line) => line.isShort || line.isUnavailable)
        .toList(growable: false);
    if (shortLines.isEmpty) return;

    final result = await showAppSheet<_ProposalResult>(
      context,
      title: 'Send a change request',
      subtitle:
          'The customer chooses whether to accept the change before you pack.',
      child: _ProposalSheet(order: order, shortLines: shortLines),
    );
    if (result == null || !mounted) return;

    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await _repository.proposeChange(
        orderId: widget.orderId,
        note: result.note,
        restockRemoved: result.restockRemoved,
        substitutes: result.substitutes,
      );
      if (!mounted) return;
      showAppSnack(context, 'Change request sent to the customer.');
      await _load(quiet: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _pack() async {
    if (_working) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await _repository.packOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _working = false;
      });
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Order packed'),
          content: const Text(
            'The order is ready. A rider can now be assigned to deliver it.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back to queue'),
            ),
          ],
        ),
      );
      if (mounted && context.canPop()) context.pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
      if (error.code == 'ADJUSTMENT_PENDING' ||
          error.code == 'PICKING_INCOMPLETE' ||
          error.code == 'ORDER_CHANGED') {
        await _load(quiet: true);
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final active = order?.activeAdjustment;
    final hasShort =
        order?.lines.any((line) => line.isShort || line.isUnavailable) ?? false;
    final canPack =
        order != null &&
        order.claimedByMe &&
        order.isComplete &&
        order.lines.every((line) => line.isPicked) &&
        active == null;
    final canPropose =
        order != null &&
        order.claimedByMe &&
        order.isComplete &&
        hasShort &&
        active == null;

    return Scaffold(
      bottomNavigationBar: order == null
          ? null
          : SafeArea(
              top: false,
              child: BottomActionBar(
                child: _buildBottomAction(order, canPack, canPropose),
              ),
            ),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Pick order',
              subtitle: order?.orderNumber,
              trailing: IconButton(
                onPressed: _loading ? null : () => _load(quiet: true),
                tooltip: 'Reload order',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && order == null
                  ? const LoadingList(count: 4)
                  : order == null
                  ? _LoadFailure(message: _error, onRetry: _load)
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: () => _load(quiet: true),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                        children: [
                          _OrderHeadline(order: order),
                          const SizedBox(height: 14),
                          if (_error != null) ...[
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                            const SizedBox(height: 14),
                          ],
                          if (!order.claimedByMe)
                            NoticeCard(
                              title: 'This order is free',
                              message: 'Claim it so another picker cannot take it while you work.',
                              icon: Icons.front_hand_outlined,
                              tone: StatusTone.info,
                              action: AppButton(
                                label: 'Claim this order',
                                icon: Icons.pan_tool_alt_outlined,
                                expand: false,
                                height: 46,
                                loading: _working,
                                onPressed: _working ? null : _claim,
                              ),
                            )
                          else if (active != null)
                            _WaitingNotice(adjustment: active)
                          else
                            _ProgressCard(order: order),
                          const SizedBox(height: 18),
                          Row(
                            children: [
                              const Expanded(
                                child: SectionLabel('Items to pick'),
                              ),
                              Text(
                                '${order.decidedCount}/${order.lines.length} checked',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ...order.lines.map(
                            (line) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _PickLineCard(
                                line: line,
                                busy: _lineBusyId == line.id,
                                locked: !order.claimedByMe || active != null,
                                onTap: () => _chooseLine(line),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          _OrderFootnotes(order: order),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomAction(PickOrder order, bool canPack, bool canPropose) {
    if (!order.claimedByMe) {
      return Text(
        'Claim this order before you start picking.',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall,
      );
    }
    if (order.activeAdjustment != null) {
      return Row(
        children: [
          const Expanded(
            child: Text(
              'Waiting for the customer to answer.',
              style: TextStyle(fontSize: 13, color: AppColors.muted),
            ),
          ),
          const SizedBox(width: 10),
          AppButton(
            label: 'Refresh',
            variant: AppButtonVariant.outline,
            expand: false,
            height: 46,
            onPressed: () => _load(quiet: true),
          ),
        ],
      );
    }
    if (canPack) {
      return AppButton(
        label: 'Pack order',
        icon: Icons.inventory_2_outlined,
        loading: _working,
        onPressed: _working ? null : _pack,
        helper: 'Every line is picked. Packing makes it ready for a rider.',
      );
    }
    if (canPropose) {
      return AppButton(
        label: 'Send change request',
        icon: Icons.swap_horiz_rounded,
        loading: _working,
        onPressed: _working ? null : _propose,
        helper: 'The customer must accept the short or missing items before packing.',
      );
    }
    return Text(
      order.isComplete
          ? 'Packing waits for the customer’s answer.'
          : 'Record every item as picked, short or not found.',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodySmall,
    );
  }
}

class _LoadFailure extends StatelessWidget {
  const _LoadFailure({required this.message, required this.onRetry});

  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: EmptyState(
          icon: Icons.error_outline_rounded,
          title: "Couldn't load this order",
          message: message ?? 'Pull down to try again.',
          action: AppButton(
            label: 'Try again',
            variant: AppButtonVariant.outline,
            expand: false,
            height: 48,
            onPressed: onRetry,
          ),
        ),
      ),
    );
  }
}

class _OrderHeadline extends StatelessWidget {
  const _OrderHeadline({required this.order});

  final PickOrder order;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 7,
          runSpacing: 7,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            StatusPill(
              text: friendlyOrder(order.orderStatus),
              tone: toneForOrder(order.orderStatus),
              compact: true,
            ),
            Pill(
              text: 'For ${order.customerFirstName}',
              background: AppColors.surfaceMuted,
              foreground: AppColors.inkSoft,
              icon: Icons.person_outline_rounded,
            ),
            Pill(
              text: unitsLabel(order.units),
              background: AppColors.surfaceMuted,
              foreground: AppColors.inkSoft,
              icon: Icons.inventory_2_outlined,
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          order.orderNumber,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontSize: 23),
        ),
        if (order.pickStartedAt != null) ...[
          const SizedBox(height: 3),
          Text(
            'Started ${formatAge(order.pickStartedAt)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.order});

  final PickOrder order;

  @override
  Widget build(BuildContext context) {
    final share = order.lines.isEmpty
        ? 0.0
        : order.decidedCount / order.lines.length;
    return SurfaceCard(
      color: AppColors.surfaceMuted,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.pendingCount == 0
                      ? 'Every line is checked'
                      : '${plural(order.pendingCount, 'line')} left',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '${order.decidedCount} of ${order.lines.length}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 10),
          AppProgressBar(value: share),
          const SizedBox(height: 8),
          Text(
            'Tap an item to mark it picked, short or not found.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _WaitingNotice extends StatelessWidget {
  const _WaitingNotice({required this.adjustment});

  final ActiveAdjustment adjustment;

  @override
  Widget build(BuildContext context) {
    return NoticeCard(
      title: 'Change request sent',
      message: 'The customer is deciding whether to accept the change. Refresh to see their answer.',
      icon: Icons.hourglass_top_rounded,
      tone: StatusTone.amber,
    );
  }
}

class _PickLineCard extends StatelessWidget {
  const _PickLineCard({
    required this.line,
    required this.busy,
    required this.locked,
    required this.onTap,
  });

  final PickLine line;
  final bool busy;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = toneForPick(line.pickStatus);
    final (background, foreground) = switch (tone) {
      StatusTone.sage => (AppColors.sage, AppColors.sageInk),
      StatusTone.amber => (AppColors.amber, AppColors.amberInk),
      StatusTone.danger => (AppColors.dangerSoft, AppColors.danger),
      _ => (AppColors.surfaceMuted, AppColors.muted),
    };
    final statusText = line.isShort && line.pickedQty != null
        ? 'Short · ${line.pickedQty} of ${line.quantity} found'
        : line.isUnavailable
        ? 'Not found'
        : friendlyPick(line.pickStatus);

    return SurfaceCard(
      onTap: locked || busy ? null : onTap,
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProductThumb(url: line.image, size: 48),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.productName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontSize: 14.5, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    'Qty ${line.quantity}',
                    if (line.sku != null && line.sku!.trim().isNotEmpty)
                      line.sku!,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: background,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    statusText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: foreground,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          if (busy)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.forest,
                ),
              ),
            )
          else if (!locked)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(
                line.isDecided
                    ? Icons.edit_outlined
                    : Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ),
        ],
      ),
    );
  }
}

class _OrderFootnotes extends StatelessWidget {
  const _OrderFootnotes({required this.order});

  final PickOrder order;

  @override
  Widget build(BuildContext context) {
    final shortCount = order.lines
        .where((line) => line.isShort || line.isUnavailable)
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (shortCount > 0)
          Text(
            '${plural(shortCount, 'line')} cannot be supplied in full. '
            'Send a change request once every line is checked.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        if (order.packedAt != null) ...[
          const SizedBox(height: 6),
          Text(
            'Packed ${formatDateTime(order.packedAt)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

// --- Line action sheets ----------------------------------------------------

class _PickChoice {
  const _PickChoice(this.status);

  final String status;
}

class _LineChoiceSheet extends StatelessWidget {
  const _LineChoiceSheet({required this.line});

  final PickLine line;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'You need ${line.quantity}. What did you find?',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 14),
        _ChoiceTile(
          icon: Icons.check_circle_outline_rounded,
          title: 'All picked',
          subtitle: 'All ${line.quantity} are in the bag',
          tone: AppColors.sage,
          foreground: AppColors.sageInk,
          onTap: () => Navigator.of(context).pop(const _PickChoice('PICKED')),
        ),
        const SizedBox(height: 9),
        _ChoiceTile(
          icon: Icons.remove_circle_outline_rounded,
          title: 'Only some left',
          subtitle: 'Enter how many are actually on the shelf',
          tone: AppColors.amber,
          foreground: AppColors.amberInk,
          onTap: () => Navigator.of(context).pop(const _PickChoice('SHORT')),
        ),
        const SizedBox(height: 9),
        _ChoiceTile(
          icon: Icons.do_not_disturb_on_outlined,
          title: 'Not found',
          subtitle: 'None left for this order',
          tone: AppColors.dangerSoft,
          foreground: AppColors.danger,
          onTap: () =>
              Navigator.of(context).pop(const _PickChoice('UNAVAILABLE')),
        ),
      ],
    );
  }
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.tone,
    required this.foreground,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color tone;
  final Color foreground;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.field),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.field),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(13, 12, 12, 12),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: tone,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 20, color: foreground),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuantitySheet extends StatefulWidget {
  const _QuantitySheet({required this.max});

  final int max;

  @override
  State<_QuantitySheet> createState() => _QuantitySheetState();
}

class _QuantitySheetState extends State<_QuantitySheet> {
  late int _value = widget.max < 1 ? 1 : widget.max;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton.filledTonal(
              onPressed: _value > 1 ? () => setState(() => _value--) : null,
              icon: const Icon(Icons.remove_rounded),
              tooltip: 'One less',
            ),
            Container(
              width: 88,
              alignment: Alignment.center,
              child: Text(
                '$_value',
                style: Theme.of(context).textTheme.displaySmall
                    ?.copyWith(fontSize: 34),
              ),
            ),
            IconButton.filledTonal(
              onPressed: _value < widget.max
                  ? () => setState(() => _value++)
                  : null,
              icon: const Icon(Icons.add_rounded),
              tooltip: 'One more',
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Between 1 and ${widget.max}',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 18),
        AppButton(
          label: 'Save quantity',
          icon: Icons.check_rounded,
          onPressed: () => Navigator.of(context).pop(_value),
        ),
      ],
    );
  }
}

// --- Change proposal -------------------------------------------------------

class _SubstituteEntry {
  _SubstituteEntry({
    required this.line,
    required this.product,
    required this.quantity,
  });

  final PickLine line;
  final ProductOption product;
  int quantity;
}

class _ProposalResult {
  const _ProposalResult({
    required this.note,
    required this.restockRemoved,
    required this.substitutes,
  });

  final String? note;
  final bool restockRemoved;
  final List<Map<String, dynamic>> substitutes;
}

class _ProposalSheet extends StatefulWidget {
  const _ProposalSheet({required this.order, required this.shortLines});

  final PickOrder order;
  final List<PickLine> shortLines;

  @override
  State<_ProposalSheet> createState() => _ProposalSheetState();
}

class _ProposalSheetState extends State<_ProposalSheet> {
  final _note = TextEditingController();
  final List<_SubstituteEntry> _entries = [];
  bool _restock = false;
  bool _adding = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _addSubstitute(PickLine line) async {
    if (_adding) return;
    setState(() => _adding = true);
    final product = await showAppSheet<ProductOption>(
      context,
      title: 'Find a substitute',
      subtitle: 'Search this brand’s products for “${line.productName}”.',
      child: _ProductSearchSheet(initialQuery: line.productName),
    );
    if (!mounted) return;
    setState(() => _adding = false);
    if (product == null) return;
    if (_entries.any((entry) => entry.line.id == line.id)) {
      showAppSnack(context, 'This line already has a substitute.');
      return;
    }
    setState(() {
      _entries.add(
        _SubstituteEntry(
          line: line,
          product: product,
          quantity: line.shortfall < 1 ? 1 : line.shortfall,
        ),
      );
    });
  }

  void _submit() {
    final substitutes = _entries
        .map(
          (entry) => <String, dynamic>{
            'orderItemId': entry.line.id,
            'productId': entry.product.id,
            'quantity': entry.quantity,
          },
        )
        .toList(growable: false);
    Navigator.of(context).pop(
      _ProposalResult(
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        restockRemoved: _restock,
        substitutes: substitutes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...widget.shortLines.map((line) {
          _SubstituteEntry? entry;
          for (final item in _entries) {
            if (item.line.id == line.id) {
              entry = item;
              break;
            }
          }
          final maxQuantity = line.shortfall < 1 ? 1 : line.shortfall;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SurfaceCard(
              color: AppColors.surfaceMuted,
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    line.productName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    line.isUnavailable
                        ? 'None found — all ${line.quantity} removed'
                        : '${line.pickedQty ?? 0} of ${line.quantity} found — '
                              '${line.shortfall} removed',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 9),
                  if (entry == null)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: AppButton(
                        label: 'Add substitute',
                        icon: Icons.add_rounded,
                        variant: AppButtonVariant.outline,
                        expand: false,
                        height: 42,
                        onPressed: _adding ? null : () => _addSubstitute(line),
                      ),
                    )
                  else
                    _SubstituteRow(
                      entry: entry,
                      maxQuantity: maxQuantity,
                      onQuantity: (value) => setState(() {
                        final selected = entry;
                        if (selected != null) selected.quantity = value;
                      }),
                      onRemove: () => setState(() {
                        final selected = entry;
                        if (selected != null) _entries.remove(selected);
                      }),
                    ),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 2),
        TextField(
          controller: _note,
          maxLines: 3,
          maxLength: 300,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Note for the customer (optional)',
            hintText:
                'For example: the large pack was out, here is the same size.',
            alignLabelWithHint: true,
          ),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _restock,
          onChanged: (value) => setState(() => _restock = value),
          title: const Text('Put removed units back in stock'),
          subtitle: const Text(
            'Leave this off if the goods are damaged or cannot be sold.',
          ),
        ),
        const SizedBox(height: 12),
        AppButton(
          label: 'Send to customer',
          icon: Icons.send_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _SubstituteRow extends StatelessWidget {
  const _SubstituteRow({
    required this.entry,
    required this.maxQuantity,
    required this.onQuantity,
    required this.onRemove,
  });

  final _SubstituteEntry entry;
  final int maxQuantity;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 6, 9),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.field),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          ProductThumb(url: entry.product.image, size: 36),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  'Substitute',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: entry.quantity > 1
                ? () => onQuantity(entry.quantity - 1)
                : null,
            icon: const Icon(Icons.remove_rounded, size: 18),
            tooltip: 'One less',
          ),
          Text(
            '${entry.quantity}',
            style: Theme.of(context).textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: entry.quantity < maxQuantity
                ? () => onQuantity(entry.quantity + 1)
                : null,
            icon: const Icon(Icons.add_rounded, size: 18),
            tooltip: 'One more',
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded, size: 18),
            tooltip: 'Remove substitute',
          ),
        ],
      ),
    );
  }
}

class _ProductSearchSheet extends ConsumerStatefulWidget {
  const _ProductSearchSheet({required this.initialQuery});

  final String initialQuery;

  @override
  ConsumerState<_ProductSearchSheet> createState() =>
      _ProductSearchSheetState();
}

class _ProductSearchSheetState extends ConsumerState<_ProductSearchSheet> {
  late final TextEditingController _query = TextEditingController(
    text: widget.initialQuery,
  );
  Timer? _debounce;
  List<ProductOption> _results = const [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _search(widget.initialQuery);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _search(value);
    });
  }

  Future<void> _search(String value) async {
    final term = value.trim();
    if (term.isEmpty) {
      setState(() {
        _results = const [];
        _loading = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await ref
          .read(staffRepositoryProvider)
          .searchProducts(term);
      if (!mounted) return;
      setState(() {
        _results = results;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSearchField(
          controller: _query,
          hint: 'Search products',
          onChanged: _onChanged,
          onClear: () => _search(''),
        ),
        const SizedBox(height: 10),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: AppColors.forest,
                ),
              ),
            ),
          )
        else if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ErrorNotice(
              message: _error!,
              onRetry: () => _search(_query.text),
            ),
          )
        else if (_results.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Text(
              'No products match that search. Try a shorter word.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          )
        else
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 330),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: _results.length,
              separatorBuilder: (context, index) =>
                  const Divider(height: 1, color: AppColors.line),
              itemBuilder: (context, index) {
                final product = _results[index];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: 2),
                  leading: ProductThumb(url: product.image, size: 40),
                  title: Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: product.sku == null
                      ? null
                      : Text(
                          product.sku!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                  trailing: const Icon(Icons.add_circle_outline_rounded),
                  onTap: () => Navigator.of(context).pop(product),
                );
              },
            ),
          ),
      ],
    );
  }
}
