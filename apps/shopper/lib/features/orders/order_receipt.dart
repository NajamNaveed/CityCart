import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';

/// The receipt the server issued when the payment became PAID. Read only: it
/// is a snapshot of the order as it was paid.
Future<void> showOrderReceipt(BuildContext context, OrderReceipt receipt) {
  return showAppSheet<void>(
    context,
    title: 'Receipt',
    subtitle: receipt.brandName.isEmpty
        ? receipt.receiptNumber
        : '${receipt.receiptNumber} · ${receipt.brandName}',
    child: _ReceiptView(receipt: receipt),
  );
}

class _ReceiptView extends StatelessWidget {
  const _ReceiptView({required this.receipt});

  final OrderReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InfoRow(label: 'Order', value: receipt.orderNumber),
        if (receipt.issuedAt != null)
          InfoRow(label: 'Issued', value: formatDateTime(receipt.issuedAt)),
        InfoRow(label: 'Paid with', value: _paidWith(receipt)),
        const SizedBox(height: 8),
        const Divider(),
        const SizedBox(height: 10),
        if (receipt.items.isEmpty)
          Text(
            'The items are listed on your order.',
            style: Theme.of(context).textTheme.bodySmall,
          )
        else
          for (final item in receipt.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${item.productName} × ${item.quantity}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 106),
                    child: MoneyText(
                      formatMoney(item.totalPrice, currency: receipt.currency),
                      size: 14,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
        const SizedBox(height: 8),
        const Divider(),
        const SizedBox(height: 6),
        InfoRow(
          label: 'Subtotal',
          value: formatMoney(receipt.subtotal, currency: receipt.currency),
        ),
        if (receipt.deliveryFee > 0)
          InfoRow(
            label: 'Delivery',
            value: formatMoney(receipt.deliveryFee, currency: receipt.currency),
          ),
        if (receipt.discount > 0)
          InfoRow(
            label: 'Discount',
            value:
                '− ${formatMoney(receipt.discount, currency: receipt.currency)}',
          ),
        if (receipt.tax > 0)
          InfoRow(
            label: 'Tax',
            value: formatMoney(receipt.tax, currency: receipt.currency),
          ),
        const SizedBox(height: 4),
        const Divider(),
        InfoRow(
          label: 'Total paid',
          value: formatMoney(receipt.amount, currency: receipt.currency),
          strong: true,
        ),
        const SizedBox(height: 14),
        Text(
          'Issued automatically by CityCart when the payment was recorded. '
          'Keep it for your records.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

String _paidWith(OrderReceipt receipt) {
  final wallet = receipt.collectionWallet;
  if (wallet != null && wallet.isNotEmpty) {
    return '${friendlyPaymentMethod(receipt.collectionMethod ?? receipt.method)} '
        '(${_walletLabel(wallet)})';
  }
  return friendlyPaymentMethod(receipt.collectionMethod ?? receipt.method);
}

String _walletLabel(String wallet) => switch (wallet) {
  'JAZZCASH' => 'JazzCash',
  'EASYPAISA' => 'Easypaisa',
  'OTHER' => 'Other wallet',
  _ => wallet,
};
