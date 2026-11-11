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

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load this return. Check the connection and try again.';
}

String _countCopy(int count, String singular, String plural) {
  return count == 1 ? '1 $singular' : '$count $plural';
}

/// One returned parcel in full. Every line says why it came back, and the shop
/// decides line by line whether it can be sold again.
class BrandReturnDetailScreen extends ConsumerStatefulWidget {
  const BrandReturnDetailScreen({
    super.key,
    required this.returnId,
    this.initial,
  });

  final String returnId;
  final BrandReturn? initial;

  @override
  ConsumerState<BrandReturnDetailScreen> createState() =>
      _BrandReturnDetailScreenState();
}

class _BrandReturnDetailScreenState
    extends ConsumerState<BrandReturnDetailScreen> {
  BrandReturn? _entry;
  final Map<int, bool> _restock = {};
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    if (widget.initial != null) _apply(widget.initial!);
    Future<void>.microtask(_refresh);
  }

  void _apply(BrandReturn value) {
    setState(() {
      _entry = value;
      if (_restock.isEmpty || value.isReceived) {
        _restock
          ..clear()
          ..addEntries([
            for (var index = 0; index < value.lines.length; index++)
              MapEntry(index, value.lines[index].restock),
          ]);
      }
    });
  }

  Future<void> _refresh() async {
    try {
      final entry = await ref
          .read(businessRepositoryProvider)
          .brandReturn(widget.returnId);
      if (!mounted) return;
      _apply(entry);
      setState(() => _error = null);
    } catch (error) {
      if (!mounted) return;
      final message = _errorSentence(error);
      if (_entry == null) {
        setState(() => _error = message);
      } else {
        showAppSnack(context, message, error: true);
      }
    }
  }

  Future<void> _receive() async {
    final entry = _entry;
    if (entry == null || entry.isReceived || _busy != null) return;
    final restocked = _restock.values.where((value) => value).length;
    final writtenOff = entry.lines.length - restocked;

    final String message;
    if (writtenOff == 0) {
      message = 'Every line goes back into stock. This closes the return.';
    } else if (restocked == 0) {
      message =
          'Every line is written off. No stock will be added. This '
          'closes the return.';
    } else {
      message =
          '${_countCopy(restocked, 'line goes', 'lines go')} back into stock '
          'and ${_countCopy(writtenOff, 'line is', 'lines are')} written off. '
          'This closes the return.';
    }

    final ok = await confirmAction(
      context,
      title: 'Receive these goods?',
      message: message,
      confirmLabel: 'Receive goods',
    );
    if (!ok || !mounted) return;

    setState(() => _busy = 'receive');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .receiveBrandReturn(entry.id, restockByIndex: Map.of(_restock));
      if (!mounted) return;
      _apply(updated);
      setState(() => _busy = null);
      if (mounted) showAppSnack(context, 'Goods received.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final entry = _entry;
    final actions = entry == null || entry.isReceived
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
                key: const Key('return_receive'),
                label: 'Receive these goods',
                icon: Icons.inventory_2_outlined,
                loading: _busy == 'receive',
                onPressed: _busy == null ? _receive : null,
              ),
            ),
          );

    return Scaffold(
      appBar: AppBar(title: const Text('Return details')),
      body: _body(),
      bottomNavigationBar: actions,
    );
  }

  Widget _body() {
    final entry = _entry;
    if (entry == null) {
      final error = _error;
      if (error == null) return const LoadingView(label: 'Loading return');
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

    final orderNumber = entry.orderNumber.isEmpty
        ? 'Door return'
        : entry.orderNumber;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          PageHeader(
            eyebrow: 'Return',
            title: orderNumber,
            subtitle: returnStatusDetail(entry.status),
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
                Align(
                  alignment: Alignment.centerLeft,
                  child: StatusTag(
                    label: returnStatusLabel(entry.status),
                    tone: returnStatusTone(entry.status),
                  ),
                ),
                if (entry.isReceived) ...[
                  const SizedBox(height: 16),
                  NoticeBanner(
                    key: const Key('return_received_notice'),
                    icon: Icons.inventory_2_outlined,
                    tone: AppTone.green,
                    message: entry.receivedAt == null
                        ? 'These goods have been received.'
                        : 'Received on ${dateTimeLabel(entry.receivedAt!)}.',
                  ),
                ] else ...[
                  const SizedBox(height: 16),
                  const NoticeBanner(
                    icon: Icons.fact_check_outlined,
                    message:
                        'Check each line before receiving. Put back only goods '
                        'you can sell again; damaged or missing items are '
                        'usually written off.',
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('What came back'),
                _LinesPanel(
                  entry: entry,
                  restock: _restock,
                  busy: _busy != null,
                  onChanged: (index, value) {
                    setState(() => _restock[index] = value);
                  },
                ),
                const SizedBox(height: 22),
                const SectionTitle('Money'),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        icon: Icons.receipt_long_outlined,
                        label: 'Value of returned items',
                        value: money(entry.returnedSubtotalPaisa),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.local_shipping_outlined,
                        label: 'Delivery fee',
                        value: entry.feeRefunded ? 'Refunded' : 'Not refunded',
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.undo_rounded,
                        label: 'Refunded to customer',
                        value: money(entry.refundAmountPaisa),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Order'),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: InfoRow(
                    key: const Key('return_open_order'),
                    icon: Icons.receipt_long_outlined,
                    label: 'Customer order',
                    value: orderNumber,
                    onTap: entry.orderId.isEmpty
                        ? null
                        : () => context.push('/brand-orders/${entry.orderId}'),
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
}

class _LinesPanel extends StatelessWidget {
  const _LinesPanel({
    required this.entry,
    required this.restock,
    required this.busy,
    required this.onChanged,
  });

  final BrandReturn entry;
  final Map<int, bool> restock;
  final bool busy;
  final void Function(int index, bool value) onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (entry.lines.isEmpty) {
      return const EmptyPanel(
        icon: Icons.inventory_2_outlined,
        title: 'No lines recorded',
        message: 'This return has no item lines. Check it on the website.',
      );
    }

    return SurfacePanel(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var index = 0; index < entry.lines.length; index++) ...[
            if (index > 0) const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              entry.lines[index].productName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: text.titleSmall,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${entry.lines[index].quantity} × '
                              '${money(entry.lines[index].unitPricePaisa)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: text.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        money(entry.lines[index].lineTotalPaisa),
                        maxLines: 1,
                        style: text.titleSmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      StatusTag(
                        label: returnReasonLabel(entry.lines[index].reason),
                        tone: returnReasonTone(entry.lines[index].reason),
                      ),
                      if (entry.lines[index].hasPhoto)
                        const StatusTag(label: 'Photo attached'),
                      if (entry.isReceived)
                        StatusTag(
                          label: entry.lines[index].restock
                              ? 'Back in stock'
                              : 'Written off',
                          tone: entry.lines[index].restock
                              ? AppTone.green
                              : AppTone.neutral,
                        ),
                    ],
                  ),
                  if (entry.isReceived &&
                      entry.lines[index].restockedAt != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'Restocked ${dateTimeLabel(entry.lines[index].restockedAt!)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.labelSmall,
                      ),
                    ),
                  if (!entry.isReceived) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Put back in stock',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: text.bodyMedium?.copyWith(
                                  color: AppColors.ink,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                'Off writes this line off.',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: text.labelSmall,
                              ),
                            ],
                          ),
                        ),
                        Switch(
                          key: Key('return_restock_$index'),
                          value: restock[index] ?? false,
                          onChanged: busy
                              ? null
                              : (value) => onChanged(index, value),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
