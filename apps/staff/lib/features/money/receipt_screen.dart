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

class ReceiptScreen extends ConsumerStatefulWidget {
  const ReceiptScreen({super.key, this.receiptId, this.orderId});

  final String? receiptId;
  final String? orderId;

  @override
  ConsumerState<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends ConsumerState<ReceiptScreen> {
  ReceiptRecord? _receipt;
  bool _loading = true;
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
      final repository = ref.read(staffRepositoryProvider);
      final receipt = widget.receiptId != null
          ? await repository.receipt(widget.receiptId!)
          : await repository.receiptForOrder(widget.orderId!);
      if (!mounted) return;
      setState(() {
        _receipt = receipt;
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
    final receipt = _receipt;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(title: 'Receipt', subtitle: receipt?.receiptNumber),
            Expanded(
              child: _loading && receipt == null
                  ? const LoadingList(count: 3)
                  : receipt == null
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: "Couldn't load this receipt",
                          message: _error ?? 'Try again in a moment.',
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
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
                        children: [
                          if (_error != null) ...[
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                            const SizedBox(height: 12),
                          ],
                          _ReceiptPaper(receipt: receipt),
                          const SizedBox(height: 12),
                          SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SectionLabel('Payment record'),
                                const SizedBox(height: 8),
                                InfoRow(
                                  label: 'Method',
                                  value: friendlyPaymentMethod(receipt.method),
                                ),
                                if (receipt.collectionMethod != null)
                                  InfoRow(
                                    label: 'Handed over',
                                    value:
                                        [
                                              friendlyCollectionMethod(
                                                receipt.collectionMethod!,
                                              ),
                                              if (receipt.collectionWallet !=
                                                  null)
                                                friendlyWallet(
                                                  receipt.collectionWallet,
                                                ),
                                            ]
                                            .where((part) => part.isNotEmpty)
                                            .join(' · '),
                                  ),
                                if (receipt.collectionReference != null)
                                  InfoRow(
                                    label: 'Reference',
                                    value: receipt.collectionReference!,
                                  ),
                                if (receipt.transactionReference != null)
                                  InfoRow(
                                    label: 'Transaction',
                                    value: receipt.transactionReference!,
                                  ),
                                if (receipt.provider != null)
                                  InfoRow(
                                    label: 'Provider',
                                    value: receipt.provider!,
                                  ),
                                if (receipt.collectedByName != null)
                                  InfoRow(
                                    label: 'Collected by',
                                    value: receipt.collectedByName!,
                                  ),
                                if (receipt.proofVerification != null)
                                  InfoRow(
                                    label: 'Proof check',
                                    value: friendlyVerification(
                                      receipt.proofVerification!,
                                    ),
                                    valueColor:
                                        receipt.proofVerification == 'REJECTED'
                                        ? AppColors.danger
                                        : null,
                                  ),
                              ],
                            ),
                          ),
                          if (receipt.orderId != null) ...[
                            const SizedBox(height: 12),
                            AppButton(
                              label: 'See the order',
                              icon: Icons.receipt_outlined,
                              variant: AppButtonVariant.outline,
                              height: 48,
                              onPressed: () =>
                                  context.push('/orders/${receipt.orderId}'),
                            ),
                          ],
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

class _ReceiptPaper extends StatelessWidget {
  const _ReceiptPaper({required this.receipt});

  final ReceiptRecord receipt;

  @override
  Widget build(BuildContext context) {
    final currency = receipt.currency;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.line),
      ),
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
                      receipt.brandName?.trim().isNotEmpty == true
                          ? receipt.brandName!
                          : 'CityCart',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      receipt.receiptNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (receipt.issuedAt != null) ...[
                const SizedBox(width: 10),
                Text(
                  formatDate(receipt.issuedAt),
                  maxLines: 1,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          _DashedLine(),
          const SizedBox(height: 14),
          if (receipt.billedTo != null &&
              receipt.billedTo!.trim().isNotEmpty) ...[
            Text('Billed to', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 2),
            Text(
              receipt.billedTo!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
          ],
          if (receipt.orderNumber != null)
            Text(
              'Order ${receipt.orderNumber}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 14),
          for (var index = 0; index < receipt.lines.length; index++) ...[
            _ReceiptLineRow(line: receipt.lines[index], currency: currency),
            if (index < receipt.lines.length - 1)
              const Divider(height: 18, color: AppColors.line),
          ],
          const SizedBox(height: 14),
          _DashedLine(),
          const SizedBox(height: 12),
          if (receipt.subtotal > 0)
            InfoRow(
              label: 'Subtotal',
              value: formatMoney(receipt.subtotal, currency: currency),
            ),
          if (receipt.deliveryFee > 0)
            InfoRow(
              label: 'Delivery',
              value: formatMoney(receipt.deliveryFee, currency: currency),
            ),
          if (receipt.discount > 0)
            InfoRow(
              label: 'Discount',
              value: '-${formatMoney(receipt.discount, currency: currency)}',
            ),
          if (receipt.tax > 0)
            InfoRow(
              label: 'Tax',
              value: formatMoney(receipt.tax, currency: currency),
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Paid',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 10),
              MoneyText(
                formatMoney(receipt.amount, currency: currency),
                size: 22,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            receipt.issuedAt == null
                ? 'Issued by CityCart'
                : 'Issued ${formatDateTime(receipt.issuedAt)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (receipt.proofVerification != null) ...[
            const SizedBox(height: 10),
            StatusPill(
              text: friendlyVerification(receipt.proofVerification!),
              tone: toneForVerification(receipt.proofVerification!),
              compact: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _ReceiptLineRow extends StatelessWidget {
  const _ReceiptLineRow({required this.line, required this.currency});

  final ReceiptLine line;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Row(
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
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
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
        MoneyText(formatMoney(line.totalPrice, currency: currency), size: 14),
      ],
    );
  }
}

class _DashedLine extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final count = (constraints.maxWidth / 9).floor();
        return Row(
          children: [
            for (var i = 0; i < count; i++)
              Container(
                width: 5,
                height: 1,
                margin: const EdgeInsets.only(right: 4),
                color: AppColors.line,
              ),
          ],
        );
      },
    );
  }
}
