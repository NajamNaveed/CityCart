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

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  OrderDetailBundle? _bundle;
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
      final bundle = await ref
          .read(staffRepositoryProvider)
          .brandOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _bundle = bundle;
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

  Future<void> _call(String phone) async {
    final digits = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (digits.isEmpty) {
      showAppSnack(context, 'This order has no phone number.', error: true);
      return;
    }
    try {
      final opened = await launchUrl(Uri(scheme: 'tel', path: digits));
      if (!opened && mounted) {
        showAppSnack(
          context,
          'This phone cannot start a call. The number is $phone.',
          error: true,
        );
      }
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'This phone cannot start a call. The number is $phone.',
          error: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bundle = _bundle;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Order',
              subtitle: bundle?.order.orderNumber,
              trailing: IconButton(
                onPressed: _loading ? null : () => _load(quiet: true),
                tooltip: 'Reload order',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && bundle == null
                  ? const LoadingList(count: 4)
                  : bundle == null
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.error_outline_rounded,
                          title: "Couldn't load this order",
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
                          _Headline(order: bundle.order),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                          ],
                          const SizedBox(height: 16),
                          _CustomerCard(
                            address: bundle.order.address,
                            onCall: _call,
                          ),
                          const SizedBox(height: 12),
                          _ItemsCard(order: bundle.order),
                          const SizedBox(height: 12),
                          _MoneyCard(
                            order: bundle.order,
                            payment: bundle.payment,
                            onReceipt: () => context.push(
                              '/receipts/order/${bundle.order.id}',
                            ),
                          ),
                          if (bundle.delivery != null) ...[
                            const SizedBox(height: 12),
                            _DeliveryLink(
                              delivery: bundle.delivery!,
                              onOpen: () => context.push(
                                '/deliveries/${bundle.delivery!.id}',
                              ),
                            ),
                          ],
                          if (bundle.adjustments.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            _AdjustmentsCard(adjustments: bundle.adjustments),
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

class _Headline extends StatelessWidget {
  const _Headline({required this.order});

  final OrderRecord order;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 7,
          runSpacing: 7,
          children: [
            StatusPill(
              text: friendlyOrder(order.orderStatus),
              tone: toneForOrder(order.orderStatus),
              compact: true,
            ),
            if (order.paymentStatus != null)
              StatusPill(
                text: friendlyPayment(order.paymentStatus!),
                tone: toneForPayment(order.paymentStatus!),
                compact: true,
              ),
          ],
        ),
        const SizedBox(height: 9),
        Text(
          order.orderNumber,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontSize: 23),
        ),
        const SizedBox(height: 3),
        Text(
          'Placed ${formatDateTime(order.createdAt)}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.address, required this.onCall});

  final ShippingAddress address;
  final ValueChanged<String> onCall;

  @override
  Widget build(BuildContext context) {
    final name = address.name.trim().isEmpty ? 'Customer' : address.name;
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Avatar(name: name, size: 40),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (address.phone.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        address.phone,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (address.phone.isNotEmpty)
                IconButton.outlined(
                  onPressed: () => onCall(address.phone),
                  tooltip: 'Call customer',
                  icon: const Icon(Icons.call_outlined, size: 20),
                ),
            ],
          ),
          if (address.oneLine.isNotEmpty) ...[
            const SizedBox(height: 13),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(
                    Icons.location_on_outlined,
                    size: 17,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    address.oneLine,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ],
          if (address.additionalInstructions != null &&
              address.additionalInstructions!.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: AppColors.amber,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                address.additionalInstructions!,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: AppColors.amberInk),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.order});

  final OrderRecord order;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Row(
              children: [
                const Expanded(child: SectionLabel('Items')),
                Text(
                  plural(order.lines.length, 'line'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          for (var i = 0; i < order.lines.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.line),
            _ItemRow(line: order.lines[i]),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.line});

  final OrderLine line;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProductThumb(url: line.image, size: 44),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.productName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  '${line.quantity} × ${formatMoney(line.unitPrice)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          MoneyText(formatMoney(line.totalPrice), size: 14),
        ],
      ),
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({
    required this.order,
    required this.payment,
    required this.onReceipt,
  });

  final OrderRecord order;
  final PaymentRecord? payment;
  final VoidCallback onReceipt;

  @override
  Widget build(BuildContext context) {
    final paid =
        payment != null &&
        const [
          'PAID',
          'PARTIALLY_REFUNDED',
          'REFUNDED',
        ].contains(payment!.status);
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Payment'),
          const SizedBox(height: 9),
          InfoRow(label: 'Subtotal', value: formatMoney(order.subtotal)),
          InfoRow(label: 'Delivery', value: formatMoney(order.deliveryFee)),
          if (order.discount > 0)
            InfoRow(
              label: 'Discount',
              value: '− ${formatMoney(order.discount)}',
              valueColor: AppColors.sageInk,
            ),
          if (order.tax > 0)
            InfoRow(label: 'Tax', value: formatMoney(order.tax)),
          const Divider(height: 20, color: AppColors.line),
          InfoRow(
            label: 'Total',
            value: formatMoney(order.total, currency: order.currency),
            strong: true,
          ),
          if (payment != null) ...[
            const Divider(height: 20, color: AppColors.line),
            InfoRow(
              label: 'Payment',
              value: friendlyPayment(payment!.status),
              valueColor: switch (toneForPayment(payment!.status)) {
                StatusTone.sage => AppColors.sageInk,
                StatusTone.danger => AppColors.danger,
                StatusTone.amber => AppColors.amberInk,
                _ => AppColors.muted,
              },
              strong: true,
            ),
            if (payment!.method != null)
              InfoRow(
                label: 'Method',
                value: friendlyCollectionMethod(payment!.method!),
              ),
            if (payment!.collectionReference != null)
              InfoRow(label: 'Reference', value: payment!.collectionReference!),
          ],
          if (paid) ...[
            const SizedBox(height: 10),
            AppButton(
              label: 'View receipt',
              icon: Icons.receipt_long_outlined,
              variant: AppButtonVariant.outline,
              height: 46,
              onPressed: onReceipt,
            ),
          ],
        ],
      ),
    );
  }
}

class _DeliveryLink extends StatelessWidget {
  const _DeliveryLink({required this.delivery, required this.onOpen});

  final DeliveryRecord delivery;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: onOpen,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.infoSoft,
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.local_shipping_outlined,
              size: 21,
              color: AppColors.info,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delivery',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  '${friendlyDelivery(delivery.status)} · ${delivery.riderLabel}',
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
    );
  }
}

class _AdjustmentsCard extends StatelessWidget {
  const _AdjustmentsCard({required this.adjustments});

  final List<OrderAdjustmentView> adjustments;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Change proposals'),
          const SizedBox(height: 4),
          Text(
            'These are read-only here. The customer answers from their app.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          for (final adjustment in adjustments) ...[
            const Divider(height: 20, color: AppColors.line),
            Row(
              children: [
                Expanded(
                  child: Text(
                    adjustment.status == 'PROPOSED'
                        ? 'Waiting for the customer'
                        : adjustment.status == 'ACCEPTED'
                        ? 'Accepted by the customer'
                        : 'Change proposal',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: StatusPill(
                    text: adjustment.status == 'PROPOSED'
                        ? 'Waiting'
                        : adjustment.status == 'ACCEPTED'
                        ? 'Accepted'
                        : adjustment.status == 'DECLINED'
                        ? 'Declined'
                        : adjustment.status,
                    tone: adjustment.status == 'PROPOSED'
                        ? StatusTone.amber
                        : adjustment.status == 'ACCEPTED'
                        ? StatusTone.sage
                        : StatusTone.muted,
                    compact: true,
                  ),
                ),
              ],
            ),
            if (adjustment.note.trim().isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(
                adjustment.note,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 7),
            for (final line in adjustment.lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '${line.productName}: ${line.supplyQuantity} of '
                  '${line.orderedQuantity}'
                  '${line.substituteName == null ? '' : ' → ${line.substituteName}'}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            if (adjustment.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                formatDateTime(adjustment.createdAt),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ],
      ),
    );
  }
}
