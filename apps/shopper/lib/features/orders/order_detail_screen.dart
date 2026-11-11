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
import '../cart/cart_controller.dart';
import 'order_providers.dart';
import 'order_receipt.dart';
import 'order_reviews.dart';

/// One order from the shop to the door: progress, the delivery code, items,
/// the total, the address, and the actions the shopper can take right now.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  String? _busyAction;

  Future<void> _refresh() async {
    ref.invalidate(orderDetailProvider(widget.orderId));
    try {
      await ref.read(orderDetailProvider(widget.orderId).future);
    } catch (_) {
      // The error state of the provider already explains the failure.
    }
  }

  Future<void> _run(String action, Future<void> Function() work) async {
    if (_busyAction != null) return;
    setState(() => _busyAction = action);
    try {
      await work();
    } finally {
      if (mounted) setState(() => _busyAction = null);
    }
  }

  Future<void> _cancel(CustomerOrder order) async {
    final confirmed = await confirmAction(
      context,
      title: 'Cancel this order?',
      message:
          'The shop has not started this order yet, so you can cancel for '
          'free. The reserved stock goes back on sale.',
      confirmLabel: 'Yes, cancel it',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await _run('cancel', () async {
      try {
        await ref.read(shopperRepositoryProvider).cancelOrder(order.id);
        if (!mounted) return;
        ref.invalidate(orderDetailProvider(widget.orderId));
        showAppSnack(context, 'Your order was cancelled.');
      } on ApiException catch (error) {
        if (mounted) showAppSnack(context, error.message, error: true);
      } catch (_) {
        if (mounted) {
          showAppSnack(
            context,
            'The order could not be cancelled. Try again.',
            error: true,
          );
        }
      }
    });
  }

  Future<void> _respond(
    CustomerOrder order,
    OrderAdjustment adjustment,
    String action,
  ) async {
    if (action == 'CANCEL_ORDER') {
      final confirmed = await confirmAction(
        context,
        title: 'Cancel the whole order?',
        message:
            'The shop cannot send everything you ordered. Cancelling closes '
            'the order and any money you paid comes back.',
        confirmLabel: 'Cancel the order',
        destructive: true,
      );
      if (!confirmed || !mounted) return;
    }
    await _run(action, () async {
      try {
        final outcome = await ref
            .read(shopperRepositoryProvider)
            .respondToAdjustment(order.id, adjustment.id, action);
        if (!mounted) return;
        ref.invalidate(orderDetailProvider(widget.orderId));
        final base = switch (action) {
          'ACCEPT' => 'Change accepted. Your order is updated.',
          'REMOVE' => 'Your order now has only what the shop can send.',
          _ => 'Your order was cancelled.',
        };
        final refund = outcome.refundAmount;
        showAppSnack(
          context,
          refund > 0 ? '$base ${formatMoney(refund)} will be refunded.' : base,
        );
      } on ApiException catch (error) {
        if (mounted) showAppSnack(context, error.message, error: true);
      } catch (_) {
        if (mounted) {
          showAppSnack(
            context,
            'Your answer did not go through. Try again.',
            error: true,
          );
        }
      }
    });
  }

  Future<void> _reorder(CustomerOrder order) async {
    if (_busyAction != null) return;
    setState(() => _busyAction = 'reorder');
    final cart = ref.read(cartProvider);
    var added = 0;
    var failed = 0;
    try {
      for (final item in order.items) {
        final before = cart.itemCount;
        final error = await cart.add(item.productId, quantity: item.quantity);
        if (error == null && cart.itemCount > before) {
          added += item.quantity;
        } else {
          failed += item.quantity;
        }
      }
    } finally {
      if (mounted) setState(() => _busyAction = null);
    }
    if (!mounted) return;
    if (added == 0) {
      showAppSnack(
        context,
        'None of these items are available right now.',
        error: true,
      );
      return;
    }
    showAppSnack(
      context,
      failed == 0
          ? '${plural(added, 'item')} added to your basket.'
          : '${plural(added, 'item')} added. '
                '${plural(failed, 'item')} could not be added.',
      actionLabel: 'View basket',
      onAction: () => context.go('/cart'),
    );
  }

  Future<void> _review(
    CustomerOrder order,
    CustomerOrderItem item,
    MyReview? existing,
  ) async {
    final saved = await showOrderReviewSheet(
      context,
      order: order,
      item: item,
      existing: existing,
    );
    if (saved != true || !mounted) return;
    ref.invalidate(myReviewsProvider(order.id));
    showAppSnack(
      context,
      existing == null
          ? 'Thanks for reviewing this item.'
          : 'Your review was updated.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(orderDetailProvider(widget.orderId));
    final number = detail.asData?.value.order.orderNumber ?? '';

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Order',
              subtitle: number.isEmpty ? null : number,
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/orders');
                }
              },
            ),
            Expanded(
              child: detail.when(
                loading: () => const LoadingList(count: 3),
                error: (error, _) =>
                    _ErrorBody(error: error, onRetry: _refresh),
                data: _buildBody,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(OrderDetail detail) {
    final order = detail.order;
    final delivery = detail.delivery;
    final brand = ref.watch(brandProvider(order.brandId));
    final reviews =
        ref.watch(myReviewsProvider(order.id)).asData?.value ??
        const <MyReview>[];
    final adjustment = detail.adjustment;

    return RefreshIndicator(
      color: AppColors.clay,
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
        children: [
          _HeaderCard(
            order: order,
            payment: detail.payment,
            delivery: delivery,
            brandName: brand.asData?.value.name ?? order.brandName,
            onOpenShop: brand.asData?.value == null
                ? null
                : () => context.push('/store/${order.brandId}'),
          ),
          if (adjustment != null && adjustment.isProposed) ...[
            const SizedBox(height: 16),
            _AdjustmentCard(
              adjustment: adjustment,
              busyAction: _busyAction,
              onRespond: (action) => _respond(order, adjustment, action),
            ),
          ],
          const SizedBox(height: 20),
          _ProgressSection(
            order: order,
            cancelling: _busyAction == 'cancel',
            onCancel: order.canCancel && _busyAction == null
                ? () => _cancel(order)
                : null,
          ),
          if (delivery != null && delivery.codeVisible) ...[
            const SizedBox(height: 20),
            _DeliveryCodeSection(delivery: delivery),
          ],
          if (delivery?.paymentPending == true) ...[
            const SizedBox(height: 16),
            const NoticeCard(
              icon: Icons.payments_outlined,
              tone: StatusTone.info,
              title: 'Payment being checked',
              message:
                  'You paid the rider. The shop is checking the payment; your '
                  'order is complete as soon as it is confirmed.',
            ),
          ],
          if (order.fulfilment != null) ...[
            const SizedBox(height: 20),
            _FulfilmentSection(order: order, returnDoc: detail.returnDoc),
          ],
          const SizedBox(height: 20),
          _ItemsSection(
            order: order,
            reviews: reviews,
            returnDoc: detail.returnDoc,
            onReview: (item, existing) => _review(order, item, existing),
          ),
          const SizedBox(height: 20),
          _TotalsSection(detail: detail),
          const SizedBox(height: 20),
          _AddressSection(address: order.shippingAddress),
          if (delivery != null && delivery.hasTracking) ...[
            const SizedBox(height: 20),
            _TrackingSection(delivery: delivery),
          ],
          const SizedBox(height: 22),
          AppButton(
            label: 'Order again',
            icon: Icons.replay_rounded,
            variant: AppButtonVariant.outline,
            loading: _busyAction == 'reorder',
            onPressed: _busyAction == null ? () => _reorder(order) : null,
          ),
        ],
      ),
    );
  }
}

class _AdjustmentCard extends StatelessWidget {
  const _AdjustmentCard({
    required this.adjustment,
    required this.busyAction,
    required this.onRespond,
  });

  final OrderAdjustment adjustment;
  final String? busyAction;
  final void Function(String action) onRespond;

  @override
  Widget build(BuildContext context) {
    final busy = busyAction != null;
    final totalAfter = adjustment.totalsAfter.total;
    final totalRemoved = adjustment.totalsAfterRemoval.total;
    final before = adjustment.totalsBefore.total;
    final who = adjustment.proposedByLabel == 'a picker'
        ? 'A picker'
        : 'The shop';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.goldSoft,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(
          color: AppColors.gold.withValues(alpha: 0.35),
          width: 1.2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.change_circle_outlined,
                size: 22,
                color: AppColors.goldInk,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '$who needs to change this order',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: AppColors.goldInk),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            adjustment.note.trim().isEmpty
                ? 'Some items are not available exactly as you ordered them. '
                      'Check what can be sent and choose an answer.'
                : adjustment.note.trim(),
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: AppColors.inkSoft),
          ),
          if (adjustment.lines.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final line in adjustment.lines) _AdjustmentLineRow(line: line),
          ],
          if (before != totalAfter || before != totalRemoved) ...[
            const SizedBox(height: 6),
            const Divider(),
            InfoRow(
              label: 'New total',
              value: formatMoney(totalAfter),
              strong: true,
            ),
            if (totalRemoved != totalAfter)
              InfoRow(
                label: 'Without those items',
                value: formatMoney(totalRemoved),
              ),
          ],
          if (adjustment.expiresAt != null) ...[
            const SizedBox(height: 8),
            Text(
              'Answer by ${formatDateTime(adjustment.expiresAt)}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.goldInk,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 14),
          AppButton(
            label: 'Accept the change',
            icon: Icons.check_rounded,
            height: 48,
            loading: busyAction == 'ACCEPT',
            onPressed: busy ? null : () => onRespond('ACCEPT'),
          ),
          const SizedBox(height: 8),
          AppButton(
            label: 'Remove unavailable items',
            variant: AppButtonVariant.outline,
            height: 48,
            loading: busyAction == 'REMOVE',
            onPressed: busy ? null : () => onRespond('REMOVE'),
          ),
          const SizedBox(height: 2),
          TextButton(
            onPressed: busy ? null : () => onRespond('CANCEL_ORDER'),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.danger,
              minimumSize: const Size(44, 48),
            ),
            child: busyAction == 'CANCEL_ORDER'
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.danger,
                    ),
                  )
                : const Text('Cancel the whole order'),
          ),
        ],
      ),
    );
  }
}

class _AdjustmentLineRow extends StatelessWidget {
  const _AdjustmentLineRow({required this.line});

  final AdjustmentLine line;

  @override
  Widget build(BuildContext context) {
    final sending = line.supplyQuantity;
    final substitute = line.substitute;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            line.productName,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
          ),
          Text(
            sending <= 0
                ? 'You ordered ${line.orderedQuantity}; none can be sent'
                : 'You ordered ${line.orderedQuantity}; '
                      '${plural(sending, 'item')} can be sent',
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: AppColors.goldInk),
          ),
          if (substitute != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                'Instead: ${substitute.productName} '
                '× ${substitute.quantity}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.error, required this.onRetry});

  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final api = error is ApiException ? error as ApiException : null;
    if (api?.isNotFound == true) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 24),
          EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'Order not found',
            message:
                'It may belong to a different account, or it no longer exists.',
            action: AppButton(
              label: 'My orders',
              icon: Icons.receipt_long_rounded,
              expand: false,
              onPressed: () => context.go('/orders'),
            ),
          ),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      children: [
        ErrorNotice(
          message: api?.message ?? 'We could not load this order.',
          onRetry: () => onRetry(),
        ),
      ],
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.order,
    required this.payment,
    required this.delivery,
    required this.brandName,
    required this.onOpenShop,
  });

  final CustomerOrder order;
  final OrderPayment? payment;
  final OrderDelivery? delivery;
  final String? brandName;
  final VoidCallback? onOpenShop;

  @override
  Widget build(BuildContext context) {
    final storeRow = Row(
      children: [
        const Icon(Icons.storefront_outlined, size: 17, color: AppColors.muted),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            brandName ?? 'Shop',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
          ),
        ),
        if (onOpenShop != null)
          const Icon(
            Icons.chevron_right_rounded,
            size: 19,
            color: AppColors.muted,
          ),
      ],
    );

    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    order.orderNumber.isEmpty ? 'Order' : order.orderNumber,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 132),
                child: StatusPill(
                  text: friendlyOrder(order.orderStatus),
                  tone: toneForOrder(order.orderStatus),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (onOpenShop == null)
            storeRow
          else
            Semantics(
              button: true,
              label: 'Visit ${brandName ?? 'the shop'}',
              child: InkWell(
                onTap: onOpenShop,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: storeRow,
                ),
              ),
            ),
          Text(
            'Placed ${formatDateTime(order.createdAt)}',
            maxLines: 2,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (payment != null || delivery != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (payment != null)
                  StatusPill(
                    text: friendlyPayment(payment!.status),
                    tone: toneForPayment(payment!.status),
                    compact: true,
                  ),
                if (delivery != null)
                  StatusPill(
                    text: friendlyDelivery(delivery!.status),
                    tone: toneForDelivery(delivery!.status),
                    compact: true,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ProgressSection extends StatelessWidget {
  const _ProgressSection({
    required this.order,
    required this.cancelling,
    required this.onCancel,
  });

  final CustomerOrder order;
  final bool cancelling;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Progress'),
        const SizedBox(height: 10),
        if (order.isProblem)
          _ProblemNotice(status: order.orderStatus)
        else
          SurfaceCard(child: _Timeline(order: order)),
        if (onCancel != null) ...[
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: onCancel,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.danger,
              minimumSize: const Size(44, 48),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            icon: cancelling
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.danger,
                    ),
                  )
                : const Icon(Icons.close_rounded, size: 18),
            label: Text(cancelling ? 'Cancelling…' : 'Cancel order'),
          ),
        ],
      ],
    );
  }
}

class _ProblemNotice extends StatelessWidget {
  const _ProblemNotice({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (title, message, tone, icon) = switch (status) {
      'CANCELLED' => (
        'Order cancelled',
        'This order was cancelled and the reserved stock went back on sale. '
            'You were not charged.',
        StatusTone.muted,
        Icons.cancel_outlined,
      ),
      'REJECTED' => (
        'Not accepted',
        'The shop could not accept this order. You were not charged.',
        StatusTone.danger,
        Icons.info_outline_rounded,
      ),
      'RETURN_REQUESTED' => (
        'Return in progress',
        'The shop is arranging the return. Your refund follows once it is '
            'received.',
        StatusTone.amber,
        Icons.assignment_return_outlined,
      ),
      'RETURNED' => (
        'Order returned',
        'The goods went back to the shop and your refund has been recorded.',
        StatusTone.amber,
        Icons.assignment_return_outlined,
      ),
      _ => (
        'Order refunded',
        'Your payment was returned to you.',
        StatusTone.muted,
        Icons.payments_outlined,
      ),
    };
    return NoticeCard(icon: icon, tone: tone, title: title, message: message);
  }
}

class _Stage {
  const _Stage(this.label, this.icon);

  final String label;
  final IconData icon;
}

const _stages = [
  _Stage('Placed', Icons.receipt_long_outlined),
  _Stage('Confirmed', Icons.check_circle_outline_rounded),
  _Stage('Packing', Icons.inventory_2_outlined),
  _Stage('On the way', Icons.local_shipping_outlined),
  _Stage('Delivered', Icons.home_rounded),
];

int _stageIndex(String status) => switch (status) {
  'CONFIRMED' => 1,
  'PROCESSING' || 'READY_FOR_SHIPMENT' => 2,
  'SHIPPED' || 'OUT_FOR_DELIVERY' => 3,
  'DELIVERED' => 4,
  _ => 0,
};

class _Timeline extends StatelessWidget {
  const _Timeline({required this.order});

  final CustomerOrder order;

  @override
  Widget build(BuildContext context) {
    var reached = _stageIndex(order.orderStatus);
    for (final event in order.statusHistory) {
      final index = _stageIndex(event.status);
      if (index > reached) reached = index;
    }

    return Column(
      children: [
        for (var i = 0; i < _stages.length; i++)
          _TimelineRow(
            stage: _stages[i],
            done: i <= reached,
            current: i == reached,
            at: _timeFor(i),
            last: i == _stages.length - 1,
          ),
      ],
    );
  }

  DateTime? _timeFor(int index) {
    DateTime? found;
    for (final event in order.statusHistory) {
      if (_stageIndex(event.status) == index) found = event.at;
    }
    return found;
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.stage,
    required this.done,
    required this.current,
    required this.at,
    required this.last,
  });

  final _Stage stage;
  final bool done;
  final bool current;
  final DateTime? at;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 30,
          child: Column(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: done ? AppColors.forest : AppColors.surfaceMuted,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: done ? AppColors.forest : AppColors.lineStrong,
                  ),
                ),
                child: Icon(
                  stage.icon,
                  size: 14,
                  color: done ? AppColors.white : AppColors.muted,
                ),
              ),
              if (!last)
                Container(
                  width: 2,
                  height: 26,
                  color: done ? AppColors.forest : AppColors.line,
                ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stage.label,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: done ? AppColors.ink : AppColors.muted,
                    fontWeight: current ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                if (at != null)
                  Text(
                    formatDateTime(at),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _DeliveryCodeSection extends ConsumerWidget {
  const _DeliveryCodeSection({required this.delivery});

  final OrderDelivery delivery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = ref.watch(deliveryCodeProvider(delivery.id));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Your delivery code'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: code.when(
            loading: () => Row(
              children: [
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.forest,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Getting your code…',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            error: (_, _) => Text(
              'We could not load the code. Pull down to try again.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            data: (value) => Column(
              children: [
                Semantics(
                  label: 'Delivery code ${value.split('').join(' ')}',
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      value,
                      maxLines: 1,
                      style: const TextStyle(
                        fontSize: 34,
                        height: 1.15,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 8,
                        color: AppColors.forest,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Read this code to the rider when your order arrives. '
                  'Please do not share it earlier.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FulfilmentSection extends StatelessWidget {
  const _FulfilmentSection({required this.order, required this.returnDoc});

  final CustomerOrder order;
  final OrderReturn? returnDoc;

  @override
  Widget build(BuildContext context) {
    final title = switch (order.fulfilment) {
      'FULL' => 'Everything arrived',
      'NONE' => 'Your whole order went back',
      _ => 'Part of your order came back',
    };
    final message = switch (order.fulfilment) {
      'FULL' => 'All the items you ordered were delivered.',
      'NONE' =>
        'The rider took every item back. You are only charged for goods you '
            'kept.',
      _ =>
        '${formatMoney(order.returnedAmount, currency: order.currency)} of '
            'goods went back with the rider. You pay only for what you kept.',
    };
    final refund = returnDoc?.refundAmount ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'What arrived'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(message, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 8),
              if (order.returnedAmount > 0)
                InfoRow(
                  label: 'Goods returned',
                  value: formatMoney(
                    order.returnedAmount,
                    currency: order.currency,
                  ),
                ),
              if (order.feeRefunded)
                InfoRow(
                  label: 'Delivery fee refunded',
                  value: formatMoney(
                    order.deliveryFee,
                    currency: order.currency,
                  ),
                ),
              if (refund > 0)
                InfoRow(
                  label: 'Refunded to you',
                  value: formatMoney(refund, currency: order.currency),
                ),
              const SizedBox(height: 4),
              const Divider(),
              InfoRow(
                label: 'Final total',
                value: formatMoney(
                  order.payableTotal,
                  currency: order.currency,
                ),
                strong: true,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ItemsSection extends StatelessWidget {
  const _ItemsSection({
    required this.order,
    required this.reviews,
    required this.returnDoc,
    required this.onReview,
  });

  final CustomerOrder order;
  final List<MyReview> reviews;
  final OrderReturn? returnDoc;
  final void Function(CustomerOrderItem, MyReview?) onReview;

  MyReview? _reviewFor(String productId) {
    for (final review in reviews) {
      if (review.productId == productId) return review;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final returned = returnDoc?.byItem() ?? const <String, OrderReturnLine>{};
    final delivered = order.orderStatus == 'DELIVERED';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Items',
          subtitle: itemCountLabel(order.itemCount),
        ),
        const SizedBox(height: 10),
        SurfaceCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < order.items.length; i++) ...[
                if (i > 0) const Divider(),
                _ItemRow(
                  item: order.items[i],
                  currency: order.currency,
                  returned: returned[order.items[i].id],
                  review: delivered
                      ? _reviewFor(order.items[i].productId)
                      : null,
                  showReview: delivered,
                  onReview: onReview,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    required this.item,
    required this.currency,
    required this.returned,
    required this.review,
    required this.showReview,
    required this.onReview,
  });

  final CustomerOrderItem item;
  final String currency;
  final OrderReturnLine? returned;
  final MyReview? review;
  final bool showReview;
  final void Function(CustomerOrderItem, MyReview?) onReview;

  @override
  Widget build(BuildContext context) {
    final back = returned;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductThumb(url: item.image, size: 52),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.productName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${item.quantity} × '
                      '${formatMoney(item.unitPrice, currency: currency)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (back != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          '${back.quantity} returned — '
                          '${friendlyReturnReason(back.reason)}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppColors.clay),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 92),
                child: MoneyText(
                  formatMoney(item.totalPrice, currency: currency),
                  size: 14,
                  color: AppColors.inkSoft,
                ),
              ),
            ],
          ),
          if (showReview)
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                if (review != null)
                  StarRating(rating: review!.rating.toDouble(), size: 15),
                TextButton(
                  onPressed: () => onReview(item, review),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(44, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                  ),
                  child: Text(review == null ? 'Rate' : 'Edit review'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _TotalsSection extends StatelessWidget {
  const _TotalsSection({required this.detail});

  final OrderDetail detail;

  @override
  Widget build(BuildContext context) {
    final order = detail.order;
    final currency = order.currency;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Payment'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InfoRow(
                label: 'Subtotal',
                value: formatMoney(order.subtotal, currency: currency),
              ),
              if (order.deliveryFee > 0)
                InfoRow(
                  label: 'Delivery',
                  value: formatMoney(order.deliveryFee, currency: currency),
                ),
              if (order.discount > 0)
                InfoRow(
                  label: 'Discount',
                  value: '− ${formatMoney(order.discount, currency: currency)}',
                ),
              if (order.tax > 0)
                InfoRow(
                  label: 'Tax',
                  value: formatMoney(order.tax, currency: currency),
                ),
              if (order.returnedAmount > 0)
                InfoRow(
                  label: 'Returned goods',
                  value:
                      '− ${formatMoney(order.returnedAmount, currency: currency)}',
                ),
              if (order.feeRefunded)
                InfoRow(
                  label: 'Delivery fee refunded',
                  value:
                      '− ${formatMoney(order.deliveryFee, currency: currency)}',
                ),
              const SizedBox(height: 4),
              const Divider(),
              InfoRow(
                label: order.fulfilment == null ? 'Total' : 'Final total',
                value: formatMoney(order.payableTotal, currency: currency),
                strong: true,
              ),
              const SizedBox(height: 6),
              Text(
                _paymentNote(detail),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (detail.payment?.status == 'PAID')
                _ReceiptEntry(orderId: order.id),
            ],
          ),
        ),
      ],
    );
  }
}

String _paymentNote(OrderDetail detail) {
  final payment = detail.payment;
  if (payment?.status == 'PAID') {
    final method = payment!.collectionMethod ?? payment.method;
    return 'Paid with ${friendlyPaymentMethod(method).toLowerCase()}.';
  }
  if (detail.delivery?.paymentPending == true) {
    return 'Paid to the rider; the shop is checking the payment.';
  }
  return switch (detail.order.paymentStatus) {
    'CANCELLED' => 'No payment was collected.',
    'REFUNDED' => 'Your payment was refunded.',
    'PARTIALLY_REFUNDED' => 'Part of your payment was refunded.',
    _ =>
      (payment?.method ?? detail.order.paymentMethod) == 'COD'
          ? 'Pay in cash when your order arrives.'
          : 'Pay with '
                '${friendlyPaymentMethod(payment?.method ?? detail.order.paymentMethod).toLowerCase()} '
                'when your order arrives.',
  };
}

class _ReceiptEntry extends ConsumerWidget {
  const _ReceiptEntry({required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final receipt = ref.watch(receiptProvider(orderId)).asData?.value;
    if (receipt == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Receipt ${receipt.receiptNumber}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          TextButton(
            onPressed: () => showOrderReceipt(context, receipt),
            style: TextButton.styleFrom(
              minimumSize: const Size(44, 44),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            child: const Text('View'),
          ),
        ],
      ),
    );
  }
}

class _AddressSection extends StatelessWidget {
  const _AddressSection({required this.address});

  final OrderAddress address;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Delivering to'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                address.name.isEmpty ? 'Delivery address' : address.name,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 3),
              Text(address.address),
              if (address.placeLine.isNotEmpty)
                Text(
                  address.placeLine,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              if (address.phone.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  address.phone,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if ((address.additionalInstructions ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Notes: ${address.additionalInstructions}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _TrackingSection extends StatelessWidget {
  const _TrackingSection({required this.delivery});

  final OrderDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final failed = delivery.status == 'FAILED';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Delivery'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((delivery.trackingReference ?? '').isNotEmpty)
                InfoRow(
                  label: 'Tracking number',
                  value: delivery.trackingReference!,
                ),
              if ((delivery.assignedAgent ?? '').isNotEmpty)
                InfoRow(label: 'Courier', value: delivery.assignedAgent!),
              if (failed && (delivery.failureReason ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Delivery problem: ${delivery.failureReason}',
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: AppColors.danger),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
