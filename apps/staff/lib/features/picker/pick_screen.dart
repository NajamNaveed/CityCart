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
      final packed = await _repository.packOrder(widget.orderId);
      if (!mounted) return;
      setState(() => _order = packed);
      showAppSnack(context, 'Order packed. It is ready for a rider.');
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

  bool get _packed {
    final order = _order;
    return order != null &&
        (order.orderStatus == 'READY_FOR_SHIPMENT' || order.packedAt != null);
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/queue');
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final active = order?.activeAdjustment;
    final packed = _packed;
    final hasShort =
        order?.lines.any((line) => line.isShort || line.isUnavailable) ?? false;
    final canPack =
        order != null &&
        !packed &&
        order.claimedByMe &&
        order.isComplete &&
        order.lines.every((line) => line.isPicked) &&
        active == null;
    final canPropose =
        order != null &&
        !packed &&
        order.claimedByMe &&
        order.isComplete &&
        hasShort &&
        active == null;

    return Scaffold(
      bottomNavigationBar: order == null
          ? null
          : BottomActionBar(
              child: _PickActionDock(
                order: order,
                active: active,
                packed: packed,
                working: _working,
                canPack: canPack,
                canPropose: canPropose,
                onClaim: _claim,
                onPack: _pack,
                onPropose: _propose,
                onRefresh: () => _load(quiet: true),
                onLeave: _leave,
              ),
            ),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Pick order',
              subtitle: order?.orderNumber,
              onBack: _leave,
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
                          if (packed)
                            const NoticeCard(
                              title: 'Packed and ready for a rider',
                              message: 'This order has left your queue. Go back to the queue for your next one.',
                              icon: Icons.inventory_2_outlined,
                              tone: StatusTone.sage,
                            )
                          else if (!order.claimedByMe)
                            const NoticeCard(
                              title: 'This order is free',
                              message: 'Claim it so another picker cannot take it while you work.',
                              icon: Icons.front_hand_outlined,
                              tone: StatusTone.info,
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
                                locked:
                                    !order.claimedByMe ||
                                    active != null ||
                                    packed,
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
}

/// One pinned action at a time, with the reason it is the next step. The dock
/// replaces the old row of situational buttons so the picker never has to
/// guess which of several controls starts the order moving.
class _PickActionDock extends StatelessWidget {
  const _PickActionDock({
    required this.order,
    required this.active,
    required this.packed,
    required this.working,
    required this.canPack,
    required this.canPropose,
    required this.onClaim,
    required this.onPack,
    required this.onPropose,
    required this.onRefresh,
    required this.onLeave,
  });

  final PickOrder order;
  final ActiveAdjustment? active;
  final bool packed;
  final bool working;
  final bool canPack;
  final bool canPropose;
  final VoidCallback onClaim;
  final VoidCallback onPack;
  final VoidCallback onPropose;
  final VoidCallback onRefresh;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) {
    final total = order.lines.length;
    final decided = order.decidedCount;
    final pending = total - decided;
    final shortCount = order.lines
        .where((line) => line.isShort || line.isUnavailable)
        .length;

    final IconData icon;
    final Color iconBackground;
    final Color iconColor;
    final String title;
    final String detail;
    final Widget button;

    if (packed) {
      icon = Icons.inventory_2_outlined;
      iconBackground = AppColors.sage;
      iconColor = AppColors.sageInk;
      title = 'Order packed';
      detail = 'It is ready for a rider. Your queue has the next order.';
      button = AppButton(
        label: 'Back to queue',
        icon: Icons.arrow_back_rounded,
        height: 50,
        onPressed: onLeave,
      );
    } else if (!order.claimedByMe) {
      icon = Icons.front_hand_outlined;
      iconBackground = AppColors.infoSoft;
      iconColor = AppColors.info;
      title = 'This order is not claimed';
      detail = 'Claiming stops another picker from taking it.';
      button = AppButton(
        label: 'Claim this order',
        icon: Icons.pan_tool_alt_outlined,
        height: 50,
        loading: working,
        onPressed: working ? null : onClaim,
      );
    } else if (active != null) {
      icon = Icons.hourglass_top_rounded;
      iconBackground = AppColors.amber;
      iconColor = AppColors.amberInk;
      title = 'Waiting for the customer';
      detail = 'They are answering your change request.';
      button = AppButton(
        label: 'Check again',
        icon: Icons.refresh_rounded,
        height: 50,
        onPressed: onRefresh,
      );
    } else if (canPack) {
      icon = Icons.inventory_2_outlined;
      iconBackground = AppColors.sage;
      iconColor = AppColors.sageInk;
      title = 'Ready to pack';
      detail = 'All ${plural(total, 'line')} are picked.';
      button = AppButton(
        label: 'Pack order',
        icon: Icons.inventory_2_outlined,
        height: 50,
        loading: working,
        onPressed: working ? null : onPack,
      );
    } else if (canPropose) {
      icon = Icons.swap_horiz_rounded;
      iconBackground = AppColors.amber;
      iconColor = AppColors.amberInk;
      title = 'Change needed';
      detail =
          '${plural(shortCount, 'line')} cannot be supplied in full. '
          'The customer decides before packing.';
      button = AppButton(
        label: 'Send change request',
        icon: Icons.swap_horiz_rounded,
        height: 50,
        loading: working,
        onPressed: working ? null : onPropose,
      );
    } else {
      icon = Icons.playlist_add_check_circle_outlined;
      iconBackground = AppColors.paperDeep;
      iconColor = AppColors.muted;
      title = '$decided of $total checked';
      detail =
          'Mark the remaining ${plural(pending, 'line')} as picked, short or not found.';
      // The disabled button previews the step that unlocks when checking ends.
      button = AppButton(
        label: shortCount > 0 ? 'Send change request' : 'Pack order',
        icon: shortCount > 0
            ? Icons.swap_horiz_rounded
            : Icons.inventory_2_outlined,
        height: 50,
        onPressed: null,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, size: 19, color: iconColor),
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
                    style: const TextStyle(
                      fontSize: 14.5,
                      height: 1.3,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(height: 1.35),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 11),
        button,
      ],
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

class _ProposalSheet extends ConsumerStatefulWidget {
  const _ProposalSheet({required this.order, required this.shortLines});

  final PickOrder order;
  final List<PickLine> shortLines;

  @override
  ConsumerState<_ProposalSheet> createState() => _ProposalSheetState();
}

class _ProposalSheetState extends ConsumerState<_ProposalSheet> {
  final _note = TextEditingController();
  final List<_SubstituteEntry> _entries = [];
  bool _restock = false;
  bool _adding = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _addSuggested(PickLine line) async {
    if (_adding) return;
    setState(() => _adding = true);
    final suggestion = await showAppSheet<SubstitutionSuggestion>(
      context,
      title: 'Suggest a substitute',
      subtitle: 'The closest items in this aisle that are on the shelf now.',
      child: _SuggestionSheet(
        load: () => ref
            .read(staffRepositoryProvider)
            .suggestSubstitutes(orderId: widget.order.id, itemId: line.id),
      ),
    );
    if (!mounted) return;
    setState(() => _adding = false);
    if (suggestion == null) return;
    _takeSubstitute(
      line,
      ProductOption(
        id: suggestion.productId,
        name: suggestion.name,
        sku: suggestion.sku,
        image: suggestion.image,
      ),
    );
  }

  Future<void> _addSubstitute(PickLine line) async {
    if (_adding) return;
    setState(() => _adding = true);
    final product = await showAppSheet<ProductOption>(
      context,
      title: 'Add a substitute',
      subtitle: 'Choose an item already listed in this store, or search for it by name.',
      child: _ProductPickerSheet(suggestedName: line.productName),
    );
    if (!mounted) return;
    setState(() => _adding = false);
    if (product == null) return;
    _takeSubstitute(line, product);
  }

  void _takeSubstitute(PickLine line, ProductOption product) {
    if (!mounted) return;
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
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          AppButton(
                            label: 'Suggest substitutes',
                            icon: Icons.auto_awesome_rounded,
                            variant: AppButtonVariant.cream,
                            expand: false,
                            height: 42,
                            onPressed: _adding ? null : () => _addSuggested(line),
                          ),
                          AppButton(
                            label: 'Choose a substitute',
                            icon: Icons.search_rounded,
                            variant: AppButtonVariant.outline,
                            expand: false,
                            height: 42,
                            onPressed: _adding ? null : () => _addSubstitute(line),
                          ),
                        ],
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

/// Asks the server for the closest in-stock items in the same aisle and lets
/// the picker take one. It only suggests: the picker still sends the change
/// request, and the customer still decides. When suggestions are unavailable
/// the sheet says so plainly and leaves the catalogue search one tap away.
class _SuggestionSheet extends StatefulWidget {
  const _SuggestionSheet({required this.load});

  final Future<SubstitutionPlan> Function() load;

  @override
  State<_SuggestionSheet> createState() => _SuggestionSheetState();
}

class _SuggestionSheetState extends State<_SuggestionSheet> {
  bool _loading = true;
  String? _error;
  SubstitutionPlan? _plan;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final plan = await widget.load();
      if (!mounted) return;
      setState(() {
        _plan = plan;
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
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 28),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    final plan = _plan;
    if (_error != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_error!, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          AppButton(
            label: 'Try again',
            icon: Icons.refresh_rounded,
            variant: AppButtonVariant.outline,
            height: 46,
            onPressed: _fetch,
          ),
        ],
      );
    }

    if (plan == null || plan.suggestions.isEmpty) {
      return Text(
        plan?.note ?? 'Nothing else in this category is on the shelf right now.',
        style: Theme.of(context).textTheme.bodyMedium,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (plan.note != null) ...[
          Text(plan.note!, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 10),
        ],
        for (final suggestion in plan.suggestions)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SurfaceCard(
              padding: const EdgeInsets.all(12),
              color: AppColors.surfaceMuted,
              onTap: () => Navigator.of(context).pop(suggestion),
              child: Row(
                children: [
                  ProductThumb(url: suggestion.image, size: 40),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          suggestion.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        if (suggestion.why != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            suggestion.why!,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.add_circle_outline_rounded, size: 22),
                ],
              ),
            ),
          ),
        Text(
          plan.degraded
              ? 'Ranked from what is on this aisle right now.'
              : 'Choose one, or close this to search the catalogue.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// The store's catalogue, not only a search box: a picker can scroll what the
/// brand actually lists and pick a visible item without knowing its name.
class _ProductPickerSheet extends ConsumerStatefulWidget {
  const _ProductPickerSheet({required this.suggestedName});

  final String suggestedName;

  @override
  ConsumerState<_ProductPickerSheet> createState() =>
      _ProductPickerSheetState();
}

class _ProductPickerSheetState extends ConsumerState<_ProductPickerSheet> {
  final _query = TextEditingController();
  Timer? _debounce;
  int _generation = 0;
  String _term = '';
  List<ProductOption> _items = const [];
  Pagination _pagination = const Pagination();
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _search('');
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

  void _showAll() {
    _debounce?.cancel();
    _query.clear();
    _search('');
  }

  Future<void> _search(String value) async {
    final term = value.trim();
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _loadingMore = false;
      _error = null;
    });
    try {
      final page = await ref.read(staffRepositoryProvider).searchProducts(term);
      if (!mounted || generation != _generation) return;
      setState(() {
        _term = term;
        _items = page.items;
        _pagination = page.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } on ApiException catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_pagination.hasMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(staffRepositoryProvider)
          .searchProducts(_term, page: _pagination.page + 1);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items = [..._items, ...page.items];
        _pagination = page.pagination;
        _loadingMore = false;
      });
    } on ApiException catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = error.message;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = _pagination.total - _items.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSearchField(
          controller: _query,
          hint: 'Search this store’s products',
          onChanged: _onChanged,
          onClear: _showAll,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                _term.isEmpty
                    ? 'Products in this store'
                    : 'Results for “$_term”',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall
                    ?.copyWith(color: AppColors.muted, letterSpacing: 0.6),
              ),
            ),
            if (_term.isNotEmpty)
              TextButton(onPressed: _showAll, child: const Text('Show all')),
          ],
        ),
        if (_term.isEmpty && !_loading)
          Text(
            'Everything this brand lists for sale. Use search to narrow it, '
            'such as “${widget.suggestedName}”.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        const SizedBox(height: 10),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                SkeletonBox(height: 54, radius: 12),
                SizedBox(height: 8),
                SkeletonBox(height: 54, radius: 12),
                SizedBox(height: 8),
                SkeletonBox(height: 54, radius: 12),
              ],
            ),
          )
        else if (_error != null)
          ErrorNotice(message: _error!, onRetry: () => _search(_term))
        else if (_items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Column(
              children: [
                Text(
                  _term.isEmpty
                      ? 'This store has no listed products yet.'
                      : 'No products match “$_term”.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (_term.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'You can still browse everything this store lists.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Show all products',
                    variant: AppButtonVariant.outline,
                    expand: false,
                    height: 44,
                    onPressed: _showAll,
                  ),
                ],
              ],
            ),
          )
        else ...[
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 340),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _items.length,
              separatorBuilder: (context, index) =>
                  const Divider(height: 1, color: AppColors.line),
              itemBuilder: (context, index) {
                final product = _items[index];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 2,
                    vertical: 2,
                  ),
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
                  trailing: const Text(
                    'Use',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.sageInk,
                    ),
                  ),
                  onTap: () => Navigator.of(context).pop(product),
                );
              },
            ),
          ),
          if (remaining > 0)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: AppButton(
                label: 'Show $remaining more',
                variant: AppButtonVariant.outline,
                height: 44,
                loading: _loadingMore,
                onPressed: _loadingMore ? null : _loadMore,
              ),
            ),
        ],
      ],
    );
  }
}
