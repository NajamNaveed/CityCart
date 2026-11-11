import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class CollectorScreen extends ConsumerStatefulWidget {
  const CollectorScreen({super.key, required this.collectorId, this.initial});

  final String collectorId;
  final CashCollector? initial;

  @override
  ConsumerState<CollectorScreen> createState() => _CollectorScreenState();
}

class _CollectorScreenState extends ConsumerState<CollectorScreen> {
  List<CashPayment> _payments = const [];
  final Set<String> _selected = {};
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final cash = await ref
          .read(staffRepositoryProvider)
          .collectorCash(widget.collectorId);
      if (!mounted) return;
      setState(() {
        _payments = cash.payments;
        _selected.clear();
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

  void _toggle(String paymentId, {bool allowed = true}) {
    if (!allowed) return;
    setState(() {
      if (!_selected.remove(paymentId)) _selected.add(paymentId);
    });
  }

  void _toggleAll({bool allowed = true}) {
    if (!allowed) return;
    setState(() {
      if (_selected.length == _payments.length) {
        _selected.clear();
      } else {
        _selected
          ..clear()
          ..addAll(_payments.map((payment) => payment.paymentId));
      }
    });
  }

  double get _selectedTotal {
    var total = 0.0;
    for (final payment in _payments) {
      if (_selected.contains(payment.paymentId)) total += payment.amount;
    }
    return total;
  }

  Future<void> _settle() async {
    if (_working || _selected.isEmpty) return;
    final count = _selected.length;
    final total = _selectedTotal;
    final confirmed = await confirmAction(
      context,
      title: 'Confirm the hand-over?',
      message:
          'Mark $count ${count == 1 ? 'payment' : 'payments'} totalling '
          '${formatMoney(total)} as handed over and settled?',
      confirmLabel: 'Settle cash',
    );
    if (!confirmed || !mounted) return;

    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(staffRepositoryProvider)
          .settleCash(
            collectorId: widget.collectorId,
            paymentIds: _selected.toList(growable: false),
          );
      if (!mounted) return;
      showAppSnack(
        context,
        '${formatMoney(result.total)} settled across '
        '${result.count} ${result.count == 1 ? 'payment' : 'payments'}.',
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
      if (error.code == 'CASH_CHANGED') await _load();
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(accessProvider);
    final collector = widget.initial;
    final name = collector?.name.trim().isNotEmpty == true
        ? collector!.name
        : 'Cash collector';
    final outstanding = _payments.fold<double>(
      0,
      (sum, payment) => sum + payment.amount,
    );
    final canSettle = access.paymentsManage;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: name,
              subtitle: collector?.role == null
                  ? 'Cash to hand over'
                  : friendlyRole(collector!.role!),
              trailing: IconButton(
                onPressed: _loading ? null : _load,
                tooltip: 'Reload cash',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && _payments.isEmpty
                  ? const LoadingList(count: 4)
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: _load,
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          if (_error != null) ...[
                            ErrorNotice(message: _error!, onRetry: _load),
                            const SizedBox(height: 12),
                          ],
                          Container(
                            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                            decoration: BoxDecoration(
                              color: AppColors.forest,
                              borderRadius: BorderRadius.circular(
                                AppRadius.card,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'OUTSTANDING',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1.1,
                                    color: AppColors.sage.withValues(
                                      alpha: 0.9,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    formatMoney(outstanding),
                                    maxLines: 1,
                                    style: const TextStyle(
                                      fontSize: 32,
                                      height: 1.05,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: -0.8,
                                      color: AppColors.white,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  '${_payments.length} '
                                  '${_payments.length == 1 ? 'payment' : 'payments'}'
                                  '${_selected.isEmpty ? '' : ' · ${formatMoney(_selectedTotal)} selected'}',
                                  maxLines: 2,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    height: 1.35,
                                    color: AppColors.sage.withValues(
                                      alpha: 0.9,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (_payments.isEmpty)
                            const SizedBox(
                              height: 300,
                              child: EmptyState(
                                icon: Icons.check_circle_outline_rounded,
                                title: 'All settled',
                                message:
                                    'There is no cash left to hand over for '
                                    'this person.',
                              ),
                            )
                          else ...[
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    canSettle
                                        ? 'Tick the payments that were handed over.'
                                        : 'Only a manager can confirm a hand-over.',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall,
                                  ),
                                ),
                                if (canSettle)
                                  TextButton(
                                    onPressed: () => _toggleAll(),
                                    child: Text(
                                      _selected.length == _payments.length
                                          ? 'Clear all'
                                          : 'Select all',
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            for (final payment in _payments) ...[
                              _PaymentRow(
                                payment: payment,
                                selected: _selected.contains(payment.paymentId),
                                enabled: canSettle,
                                onChanged: () => _toggle(
                                  payment.paymentId,
                                  allowed: canSettle,
                                ),
                              ),
                              const SizedBox(height: 9),
                            ],
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: canSettle && _payments.isNotEmpty
          ? BottomActionBar(
              child: AppButton(
                label: _selected.isEmpty
                    ? 'Select the cash handed over'
                    : 'Settle ${_selected.length} · ${formatMoney(_selectedTotal)}',
                icon: Icons.check_circle_outline_rounded,
                loading: _working,
                onPressed: _selected.isEmpty || _working ? null : _settle,
              ),
            )
          : null,
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.payment,
    required this.selected,
    required this.enabled,
    required this.onChanged,
  });

  final CashPayment payment;
  final bool selected;
  final bool enabled;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: enabled ? onChanged : null,
      color: selected ? AppColors.sage : null,
      borderColor: selected ? AppColors.sageInk.withValues(alpha: 0.35) : null,
      padding: const EdgeInsets.fromLTRB(10, 8, 14, 8),
      radius: 16,
      child: Row(
        children: [
          Checkbox(
            value: selected,
            onChanged: enabled ? (_) => onChanged() : null,
            activeColor: AppColors.forest,
          ),
          const SizedBox(width: 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payment.orderNumber.isEmpty ? 'Payment' : payment.orderNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (payment.collectedAt != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Collected ${formatDateTime(payment.collectedAt)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 96,
            child: MoneyText(formatMoney(payment.amount), size: 15),
          ),
        ],
      ),
    );
  }
}
