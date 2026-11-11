import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  return 'We could not load this order. Check the connection and try again.';
}

({String title, String message, String confirm, String done}) _moveCopy(
  String status,
) {
  return switch (status) {
    'CONFIRMED' => (
      title: 'Confirm this order?',
      message: 'The stock stays reserved for this customer.',
      confirm: 'Confirm order',
      done: 'Order confirmed.',
    ),
    'PROCESSING' => (
      title: 'Start preparing?',
      message:
          'Pack the items, then mark the order ready for the delivery team.',
      confirm: 'Start preparing',
      done: 'Order is being prepared.',
    ),
    'READY_FOR_SHIPMENT' => (
      title: 'Mark ready to ship?',
      message: 'The delivery team will be asked to collect the order from your shop.',
      confirm: 'Mark ready',
      done: 'Order is ready for pickup.',
    ),
    'REJECTED' => (
      title: 'Reject this order?',
      message:
          'Every item goes back into stock and the pending payment is '
          'cancelled. The customer will be told.',
      confirm: 'Reject order',
      done: 'Order rejected and stock returned.',
    ),
    _ => (
      title: 'Update this order?',
      message: 'The customer will see the new state.',
      confirm: 'Update',
      done: 'Order updated.',
    ),
  };
}

/// One order in full: what to do next, what was ordered, where it goes and
/// what has happened so far.
class BrandOrderDetailScreen extends ConsumerStatefulWidget {
  const BrandOrderDetailScreen({
    super.key,
    required this.orderId,
    this.initial,
  });

  final String orderId;
  final BrandOrder? initial;

  @override
  ConsumerState<BrandOrderDetailScreen> createState() =>
      _BrandOrderDetailScreenState();
}

class _BrandOrderDetailScreenState
    extends ConsumerState<BrandOrderDetailScreen> {
  BrandOrder? _order;
  BrandOrderDetail? _detail;
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _order = widget.initial;
    Future<void>.microtask(_refresh);
  }

  Future<void> _refresh() async {
    try {
      final detail = await ref
          .read(businessRepositoryProvider)
          .brandOrder(widget.orderId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _order = detail.order;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      final message = _errorSentence(error);
      if (_order == null) {
        setState(() => _error = message);
      } else {
        showAppSnack(context, message, error: true);
      }
    }
  }

  Future<void> _move(String status) async {
    final order = _order;
    if (order == null || _busy != null) return;
    final copy = _moveCopy(status);
    final ok = await confirmAction(
      context,
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirm,
      destructive: status == 'REJECTED',
    );
    if (!ok || !mounted) return;

    setState(() => _busy = 'status');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .updateBrandOrderStatus(order.id, status);
      if (!mounted) return;
      setState(() {
        _order = updated;
        _busy = null;
      });
      await _refresh();
      if (mounted) showAppSnack(context, copy.done);
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _withdraw() async {
    final order = _order;
    final pending = _detail?.pendingAdjustment;
    if (order == null || pending == null || _busy != null) return;
    final ok = await confirmAction(
      context,
      title: 'Withdraw the change proposal?',
      message:
          'The order keeps its original items. Mark it ready once you have '
          'everything.',
      confirmLabel: 'Withdraw',
    );
    if (!ok || !mounted) return;

    setState(() => _busy = 'withdraw');
    try {
      await ref
          .read(businessRepositoryProvider)
          .withdrawBrandAdjustment(order.id, pending.id);
      if (!mounted) return;
      setState(() => _busy = null);
      await _refresh();
      if (mounted) showAppSnack(context, 'Proposal withdrawn.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _copyPhone(String phone) async {
    if (phone.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: phone));
    if (mounted) showAppSnack(context, 'Phone number copied.');
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final actions = order == null ? null : _actionBar(order);

    return Scaffold(
      appBar: AppBar(title: const Text('Order details')),
      body: _body(),
      bottomNavigationBar: actions == null
          ? null
          : SafeArea(
              top: false,
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.line)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                child: actions,
              ),
            ),
    );
  }

  Widget _body() {
    final order = _order;
    if (order == null) {
      final error = _error;
      if (error == null) return const LoadingView(label: 'Loading order');
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

    final detail = _detail;
    final pending = detail?.pendingAdjustment;
    final paymentStatus = detail?.payment?.status ?? order.paymentStatus;
    final paymentMethod = detail?.payment?.method ?? order.paymentMethod;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          PageHeader(
            eyebrow: 'Order',
            title: order.orderNumber,
            subtitle: brandOrderStatusDetail(order.orderStatus),
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
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusTag(
                      label: brandOrderStatusLabel(order.orderStatus),
                      tone: brandOrderStatusTone(order.orderStatus),
                    ),
                    StatusTag(
                      label: paymentStatusLabel(paymentStatus),
                      tone: paymentStatus == 'PAID'
                          ? AppTone.green
                          : AppTone.neutral,
                    ),
                  ],
                ),
                if (pending != null) ...[
                  const SizedBox(height: 16),
                  NoticeBanner(
                    key: const Key('order_adjustment_notice'),
                    icon: Icons.sync_problem_rounded,
                    message:
                        'A change proposal is waiting for the customer. This '
                        'order cannot be marked ready to ship until they answer '
                        'or you withdraw it.',
                    action: TextButton(
                      key: const Key('order_withdraw_adjustment'),
                      onPressed: _busy == null ? _withdraw : null,
                      child: const Text('Withdraw'),
                    ),
                  ),
                ],
                if (order.orderStatus == 'REJECTED') ...[
                  const SizedBox(height: 16),
                  const NoticeBanner(
                    icon: Icons.undo_rounded,
                    message:
                        'This order was rejected. Every item went back into '
                        'your inventory and the pending payment was cancelled.',
                    tone: AppTone.red,
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('Summary'),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        icon: Icons.event_outlined,
                        label: 'Placed',
                        value: order.createdAt == null
                            ? 'Date not recorded'
                            : dateTimeLabel(order.createdAt!),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.inventory_2_outlined,
                        label: 'Items',
                        value: order.itemCount == 1
                            ? '1 item'
                            : '${order.itemCount} items',
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.payments_outlined,
                        label: 'Payment',
                        value:
                            '${paymentMethodLabel(paymentMethod)} · '
                            '${paymentStatusLabel(paymentStatus)}',
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.receipt_long_outlined,
                        label: 'Order total',
                        value: money(order.totalPaisa),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Items'),
                _ItemsPanel(order: order),
                const SizedBox(height: 12),
                _TotalsPanel(order: order),
                const SizedBox(height: 22),
                const SectionTitle('Deliver to'),
                _DeliveryAddressPanel(
                  address: order.shippingAddress,
                  onCopy: _copyPhone,
                ),
                if (detail?.delivery != null) ...[
                  const SizedBox(height: 22),
                  const SectionTitle('Delivery'),
                  _DeliveryPanel(delivery: detail!.delivery!),
                ],
                if (order.statusHistory.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const SectionTitle('History'),
                  _HistoryPanel(events: order.statusHistory),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget? _actionBar(BrandOrder order) {
    final pending = _detail?.pendingAdjustment;
    final working = _busy != null;

    Widget rejectButton() {
      return TextButton(
        key: const Key('order_reject'),
        onPressed: working ? null : () => _move('REJECTED'),
        style: TextButton.styleFrom(foregroundColor: AppColors.clay),
        child: const Text('Reject order'),
      );
    }

    switch (order.orderStatus) {
      case 'PENDING':
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppButton(
              key: const Key('order_confirm'),
              label: 'Confirm order',
              icon: Icons.check_circle_outline_rounded,
              loading: _busy == 'status',
              onPressed: working ? null : () => _move('CONFIRMED'),
            ),
            const SizedBox(height: 2),
            rejectButton(),
          ],
        );
      case 'CONFIRMED':
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppButton(
              key: const Key('order_process'),
              label: 'Start preparing',
              icon: Icons.inventory_2_outlined,
              loading: _busy == 'status',
              onPressed: working ? null : () => _move('PROCESSING'),
            ),
            const SizedBox(height: 2),
            rejectButton(),
          ],
        );
      case 'PROCESSING':
        final blocked = pending != null;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppButton(
              key: const Key('order_ready'),
              label: 'Mark ready to ship',
              icon: Icons.local_shipping_outlined,
              loading: _busy == 'status',
              onPressed: working || blocked
                  ? null
                  : () => _move('READY_FOR_SHIPMENT'),
            ),
            if (blocked)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Answer or withdraw the change proposal first.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.clay,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        );
      default:
        return null;
    }
  }
}

class _ItemsPanel extends StatelessWidget {
  const _ItemsPanel({required this.order});

  final BrandOrder order;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (order.items.isEmpty) {
      return const EmptyPanel(
        icon: Icons.inventory_2_outlined,
        title: 'No items recorded',
        message: 'This order has no item lines. Check it on the website.',
      );
    }

    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          for (var index = 0; index < order.items.length; index++) ...[
            if (index > 0) const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.paper,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: const Icon(
                      Icons.inventory_2_outlined,
                      size: 19,
                      color: AppColors.inkSoft,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.items[index].productName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: text.titleSmall,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${order.items[index].quantity} × '
                          '${money(order.items[index].unitPricePaisa)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                        ),
                        if (order.items[index].sku.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            'SKU ${order.items[index].sku}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: text.labelSmall,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    money(order.items[index].totalPricePaisa),
                    maxLines: 1,
                    style: text.titleSmall,
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TotalsPanel extends StatelessWidget {
  const _TotalsPanel({required this.order});

  final BrandOrder order;

  @override
  Widget build(BuildContext context) {
    return SurfacePanel(
      child: Column(
        children: [
          _TotalLine(label: 'Subtotal', paisa: order.subtotalPaisa),
          if (order.deliveryFeePaisa > 0) ...[
            const SizedBox(height: 8),
            _TotalLine(label: 'Delivery', paisa: order.deliveryFeePaisa),
          ],
          if (order.discountPaisa > 0) ...[
            const SizedBox(height: 8),
            _TotalLine(label: 'Discount', paisa: -order.discountPaisa),
          ],
          if (order.taxPaisa > 0) ...[
            const SizedBox(height: 8),
            _TotalLine(label: 'Tax', paisa: order.taxPaisa),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(),
          ),
          _TotalLine(label: 'Total', paisa: order.totalPaisa, strong: true),
        ],
      ),
    );
  }
}

class _TotalLine extends StatelessWidget {
  const _TotalLine({
    required this.label,
    required this.paisa,
    this.strong = false,
  });

  final String label;
  final int paisa;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: strong ? text.titleMedium : text.bodyMedium,
          ),
        ),
        Text(
          money(paisa),
          maxLines: 1,
          style: strong
              ? text.titleMedium?.copyWith(fontSize: 17)
              : text.bodyMedium?.copyWith(color: AppColors.ink),
        ),
      ],
    );
  }
}

class _DeliveryAddressPanel extends StatelessWidget {
  const _DeliveryAddressPanel({required this.address, required this.onCopy});

  final BrandShippingAddress? address;
  final ValueChanged<String> onCopy;

  @override
  Widget build(BuildContext context) {
    final address = this.address;
    if (address == null) {
      return const EmptyPanel(
        icon: Icons.local_shipping_outlined,
        title: 'No address recorded',
        message: 'This order has no delivery address. Check it on the website.',
      );
    }

    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            address.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text.titleSmall,
          ),
          const SizedBox(height: 4),
          Text(
            address.address,
            style: text.bodyMedium?.copyWith(color: AppColors.ink),
          ),
          if (address.cityLine.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(address.cityLine, style: text.bodySmall),
          ],
          if (address.phone.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(
                  Icons.call_outlined,
                  size: 17,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    address.phone,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodyMedium?.copyWith(color: AppColors.ink),
                  ),
                ),
                IconButton(
                  key: const Key('order_copy_phone'),
                  onPressed: () => onCopy(address.phone),
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  tooltip: 'Copy phone number',
                ),
              ],
            ),
          ],
          if (address.additionalInstructions.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.paper,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Note from customer', style: text.labelSmall),
                  const SizedBox(height: 4),
                  Text(
                    address.additionalInstructions,
                    style: text.bodySmall?.copyWith(color: AppColors.inkSoft),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DeliveryPanel extends StatelessWidget {
  const _DeliveryPanel({required this.delivery});

  final BrandDeliverySummary delivery;

  @override
  Widget build(BuildContext context) {
    final rider = delivery.assignedAgent.trim();
    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          InfoRow(
            icon: Icons.local_shipping_outlined,
            label: 'Delivery',
            value: brandDeliveryStatusLabel(delivery.status),
          ),
          if (rider.isNotEmpty) ...[
            const Divider(indent: 66),
            InfoRow(
              icon: Icons.sports_motorsports_outlined,
              label: 'Rider',
              value: rider,
            ),
          ],
          if (delivery.trackingReference.isNotEmpty) ...[
            const Divider(indent: 66),
            InfoRow(
              icon: Icons.pin_outlined,
              label: 'Tracking',
              value: delivery.trackingReference,
            ),
          ],
        ],
      ),
    );
  }
}

class _HistoryPanel extends StatelessWidget {
  const _HistoryPanel({required this.events});

  final List<BrandOrderEvent> events;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final ordered = events.reversed.toList(growable: false);
    return SurfacePanel(
      child: Column(
        children: [
          for (var index = 0; index < ordered.length; index++) ...[
            if (index > 0) const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppColors.forest,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        brandOrderStatusLabel(ordered[index].status),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodyMedium?.copyWith(color: AppColors.ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        ordered[index].at == null
                            ? 'Time not recorded'
                            : dateTimeLabel(ordered[index].at!),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
