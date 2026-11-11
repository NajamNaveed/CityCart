import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class ReturnDetailScreen extends ConsumerStatefulWidget {
  const ReturnDetailScreen({super.key, required this.returnId});

  final String returnId;

  @override
  ConsumerState<ReturnDetailScreen> createState() => _ReturnDetailScreenState();
}

class _ReturnDetailScreenState extends ConsumerState<ReturnDetailScreen> {
  ReturnRecord? _record;
  bool _loading = true;
  bool _working = false;
  int? _openingPhoto;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    setState(() => _error = null);
    try {
      final record = await ref
          .read(staffRepositoryProvider)
          .returnDetail(widget.returnId);
      if (!mounted) return;
      setState(() {
        _record = record;
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

  Future<void> _showPhoto(int index) async {
    if (_openingPhoto != null) return;
    setState(() => _openingPhoto = index);
    try {
      final url = await ref
          .read(staffRepositoryProvider)
          .returnPhotoUrl(widget.returnId, index);
      if (!mounted) return;
      if (url.isEmpty) {
        showAppSnack(context, 'This photo is not available.', error: true);
        return;
      }
      await showDialog<void>(
        context: context,
        builder: (context) => _PhotoDialog(url: url),
      );
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _openingPhoto = null);
    }
  }

  Future<void> _receive() async {
    final record = _record;
    if (record == null || _working) return;
    final plan = await showAppSheet<_ReceivePlan>(
      context,
      title: 'Receive the goods',
      subtitle: 'Choose what goes back on the shelf.',
      child: _ReceiveSheet(record: record),
    );
    if (plan == null || !mounted) return;

    final restock = plan.unitsToRestock;
    final writeOff = record.units - restock;
    final message = restock == 0
        ? 'All $writeOff ${writeOff == 1 ? 'unit is' : 'units are'} written off. '
              'Stock will not change.'
        : '$restock ${restock == 1 ? 'unit goes' : 'units go'} back into stock. '
              '$writeOff ${writeOff == 1 ? 'unit is' : 'units are'} written off.';
    final confirmed = await confirmAction(
      context,
      title: 'Receive this return?',
      message: '$message\n\nThis cannot be undone.',
      confirmLabel: 'Receive goods',
    );
    if (!confirmed || !mounted) return;

    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(staffRepositoryProvider)
          .receiveReturn(returnId: widget.returnId, decisions: plan.decisions);
      if (!mounted) return;
      setState(() => _record = updated);
      showAppSnack(context, 'Return received.');
      await _load(quiet: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final record = _record;
    final access = ref.watch(accessProvider);
    final canReceive = record != null && record.isOpen && access.deliveryManage;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Return',
              subtitle: record?.orderNumber,
              trailing: IconButton(
                onPressed: _loading ? null : () => _load(quiet: true),
                tooltip: 'Reload return',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && record == null
                  ? const LoadingList(count: 4)
                  : record == null
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.error_outline_rounded,
                          title: "Couldn't load this return",
                          message: _error ?? 'Pull down to try again.',
                          action: AppButton(
                            label: 'Try again',
                            variant: AppButtonVariant.outline,
                            expand: false,
                            height: 48,
                            onPressed: _load,
                          ),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: () => _load(quiet: true),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: [
                              StatusPill(
                                text: friendlyReturn(record.status),
                                tone: toneForReturn(record.status),
                                compact: true,
                              ),
                              if (record.feeRefunded)
                                const Pill(
                                  text: 'Delivery fee refunded',
                                  background: AppColors.sage,
                                  foreground: AppColors.sageInk,
                                ),
                              if (record.source != null)
                                Pill(
                                  text: record.source == 'DOOR'
                                      ? 'Refused at the door'
                                      : 'Return',
                                  background: AppColors.surfaceMuted,
                                  foreground: AppColors.inkSoft,
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            record.orderNumber ?? 'Returned goods',
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontSize: 23),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            record.createdAt == null
                                ? 'Return record'
                                : 'Started ${formatDateTime(record.createdAt)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                          ],
                          const SizedBox(height: 16),
                          SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SectionLabel('What came back'),
                                const SizedBox(height: 8),
                                InfoRow(
                                  label: 'Units',
                                  value:
                                      '${record.units} in ${record.lines.length} ${record.lines.length == 1 ? 'line' : 'lines'}',
                                ),
                                InfoRow(
                                  label: 'Return value',
                                  value: formatMoney(
                                    record.returnedSubtotal,
                                    currency: record.currency,
                                  ),
                                ),
                                InfoRow(
                                  label: 'Refund value',
                                  value: formatMoney(
                                    record.refundAmount,
                                    currency: record.currency,
                                  ),
                                  strong: true,
                                ),
                                InfoRow(
                                  label: 'Delivery fee',
                                  value: record.feeRefunded
                                      ? 'Refunded'
                                      : 'Not refunded',
                                ),
                                if (record.receivedAt != null)
                                  InfoRow(
                                    label: 'Received',
                                    value: formatDateTime(record.receivedAt),
                                  ),
                              ],
                            ),
                          ),
                          if (record.orderId != null) ...[
                            const SizedBox(height: 12),
                            SurfaceCard(
                              onTap: () =>
                                  context.push('/orders/${record.orderId}'),
                              child: Row(
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: AppColors.sage,
                                      borderRadius: BorderRadius.circular(13),
                                    ),
                                    child: const Icon(
                                      Icons.receipt_long_outlined,
                                      size: 21,
                                      color: AppColors.sageInk,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      'See the order',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall
                                          ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                    ),
                                  ),
                                  const Icon(
                                    Icons.chevron_right_rounded,
                                    color: AppColors.muted,
                                  ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 20),
                          const SectionLabel('Items coming back'),
                          const SizedBox(height: 8),
                          for (
                            var index = 0;
                            index < record.lines.length;
                            index++
                          ) ...[
                            _LineCard(
                              line: record.lines[index],
                              currency: record.currency,
                              received: !record.isOpen,
                              openingPhoto: _openingPhoto == index,
                              onPhoto: record.lines[index].hasPhoto
                                  ? () => _showPhoto(index)
                                  : null,
                            ),
                            if (index < record.lines.length - 1)
                              const SizedBox(height: 9),
                          ],
                          const SizedBox(height: 16),
                          if (record.isOpen)
                            NoticeCard(
                              icon: Icons.inventory_2_outlined,
                              title: canReceive
                                  ? 'Take the goods in'
                                  : 'Waiting for the brand owner',
                              message: canReceive
                                  ? 'Receiving closes this return. Decide per item '
                                        'whether it can be sold again, or write it off.'
                                  : 'Receiving a return changes stock, so it needs '
                                        'delivery management access. Ask your brand '
                                        'owner to take it in.',
                              tone: canReceive
                                  ? StatusTone.amber
                                  : StatusTone.muted,
                            )
                          else
                            NoticeCard(
                              icon: Icons.check_circle_outline_rounded,
                              title: 'This return is closed',
                              message: record.receivedAt == null
                                  ? 'The goods have been taken in.'
                                  : 'Taken in ${formatDateTime(record.receivedAt)}.',
                              tone: StatusTone.sage,
                            ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: canReceive
          ? BottomActionBar(
              child: AppButton(
                label: 'Receive goods',
                icon: Icons.inventory_2_outlined,
                loading: _working,
                onPressed: _working ? null : _receive,
              ),
            )
          : null,
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.line,
    required this.currency,
    required this.received,
    required this.openingPhoto,
    required this.onPhoto,
  });

  final ReturnLine line;
  final String currency;
  final bool received;
  final bool openingPhoto;
  final VoidCallback? onPhoto;

  @override
  Widget build(BuildContext context) {
    final reason = line.reason == null
        ? null
        : friendlyReturnReason(line.reason!);
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
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
                    Text(
                      line.productName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${line.quantity} × ${formatMoney(line.unitPrice, currency: currency)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              MoneyText(
                formatMoney(line.quantity * line.unitPrice, currency: currency),
                size: 14.5,
              ),
            ],
          ),
          const SizedBox(height: 9),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              if (reason != null)
                Pill(
                  text: reason,
                  background: AppColors.amber,
                  foreground: AppColors.amberInk,
                ),
              if (received)
                line.restock
                    ? const Pill(
                        text: 'Back in stock',
                        background: AppColors.sage,
                        foreground: AppColors.sageInk,
                        icon: Icons.inventory_2_outlined,
                      )
                    : const Pill(
                        text: 'Written off',
                        background: AppColors.paperDeep,
                        foreground: AppColors.muted,
                        icon: Icons.delete_outline_rounded,
                      ),
            ],
          ),
          if (onPhoto != null) ...[
            const SizedBox(height: 9),
            AppButton(
              label: openingPhoto ? 'Getting photo…' : 'See the photo',
              icon: Icons.photo_outlined,
              variant: AppButtonVariant.outline,
              expand: false,
              height: 42,
              loading: openingPhoto,
              onPressed: openingPhoto ? null : onPhoto,
            ),
          ],
        ],
      ),
    );
  }
}

class _PhotoDialog extends StatelessWidget {
  const _PhotoDialog({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.surface,
      insetPadding: const EdgeInsets.all(18),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Returned item',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'Close',
                ),
              ],
            ),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 420),
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  loadingBuilder: (context, child, progress) => progress == null
                      ? child
                      : const SizedBox(
                          height: 240,
                          child: Center(
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: AppColors.forest,
                            ),
                          ),
                        ),
                  errorBuilder: (context, error, stack) => const SizedBox(
                    height: 200,
                    child: Center(
                      child: Text(
                        'The photo could not be loaded. The link may have expired.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.muted),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Open in browser',
              icon: Icons.open_in_new_rounded,
              variant: AppButtonVariant.outline,
              height: 46,
              onPressed: () async {
                final uri = Uri.tryParse(url);
                if (uri == null) return;
                try {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                } catch (_) {
                  if (context.mounted) {
                    showAppSnack(
                      context,
                      "Couldn't open a browser on this phone.",
                      error: true,
                    );
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ReceivePlan {
  const _ReceivePlan({required this.decisions, required this.unitsToRestock});

  final List<Map<String, dynamic>> decisions;
  final int unitsToRestock;
}

class _ReceiveSheet extends StatefulWidget {
  const _ReceiveSheet({required this.record});

  final ReturnRecord record;

  @override
  State<_ReceiveSheet> createState() => _ReceiveSheetState();
}

class _ReceiveSheetState extends State<_ReceiveSheet> {
  late final List<bool> _restock = List<bool>.filled(
    widget.record.lines.length,
    false,
  );

  int get _unitsToRestock {
    var total = 0;
    for (var i = 0; i < _restock.length; i++) {
      if (_restock[i]) total += widget.record.lines[i].quantity;
    }
    return total;
  }

  void _submit() {
    final decisions = <Map<String, dynamic>>[
      for (var i = 0; i < _restock.length; i++)
        {'index': i, 'restock': _restock[i]},
    ];
    Navigator.of(
      context,
    ).pop(_ReceivePlan(decisions: decisions, unitsToRestock: _unitsToRestock));
  }

  @override
  Widget build(BuildContext context) {
    final units = widget.record.units;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < widget.record.lines.length; i++) ...[
          _DecisionRow(
            line: widget.record.lines[i],
            restock: _restock[i],
            onChanged: (value) => setState(() => _restock[i] = value),
          ),
          if (i < widget.record.lines.length - 1) const SizedBox(height: 9),
        ],
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: AppColors.surfaceMuted,
            borderRadius: BorderRadius.circular(13),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.inventory_2_outlined,
                size: 18,
                color: AppColors.inkSoft,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '$_unitsToRestock of $units ${units == 1 ? 'unit goes' : 'units go'} '
                  'back on the shelf.',
                  maxLines: 2,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: AppColors.inkSoft),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        AppButton(
          label: 'Continue',
          icon: Icons.arrow_forward_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _DecisionRow extends StatelessWidget {
  const _DecisionRow({
    required this.line,
    required this.restock,
    required this.onChanged,
  });

  final ReturnLine line;
  final bool restock;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 7, 11),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: restock
              ? AppColors.sageInk.withValues(alpha: 0.4)
              : AppColors.line,
        ),
      ),
      child: Row(
        children: [
          Expanded(
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
                const SizedBox(height: 2),
                Text(
                  '${line.quantity} ${line.quantity == 1 ? 'unit' : 'units'} · '
                  '${restock ? 'sellable again' : 'write off'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch(
            value: restock,
            onChanged: onChanged,
            activeTrackColor: AppColors.forest,
          ),
        ],
      ),
    );
  }
}
