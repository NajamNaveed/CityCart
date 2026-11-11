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
import 'delivery_rules.dart';
import 'payment_capture.dart';

class DeliveryScreen extends ConsumerStatefulWidget {
  const DeliveryScreen({super.key, required this.deliveryId});

  final String deliveryId;

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  RiderDelivery? _delivery;
  bool _loading = true;
  bool _busy = false;
  String? _loadError;
  String? _notice;
  bool _noticeIsError = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && _delivery == null) {
      setState(() => _loading = true);
    }
    try {
      final delivery = await ref
          .read(deliveryRepositoryProvider)
          .get(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = delivery;
        _loadError = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _loadError = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _loadError = 'This job could not be loaded. Check your connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setNotice(String message, {bool error = false}) {
    setState(() {
      _notice = message;
      _noticeIsError = error;
    });
  }

  Future<void> _move(NextAction action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .updateStatus(widget.deliveryId, action.status);
      if (!mounted) return;
      setState(() => _delivery = updated);
      _setNotice(switch (action.status) {
        'PICKED_UP' => 'Parcel collected. Head to the customer.',
        'OUT_FOR_DELIVERY' => "You're on the way. The customer can see it.",
        _ => 'Job updated.',
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
      if (error.status == 409) await _load(silent: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openDoorFlow() async {
    final delivery = _delivery;
    if (delivery == null) return;
    await context.push('/delivery/${delivery.id}/complete');
    if (mounted) await _load(silent: true);
  }

  Future<void> _markFailed() async {
    final reason = await showAppSheet<String>(
      context,
      title: 'What happened?',
      child: const _FailurePicker(),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;

    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .updateStatus(widget.deliveryId, 'FAILED', failureReason: reason);
      if (!mounted) return;
      setState(() => _delivery = updated);
      _setNotice('Marked as not delivered. The store can see the reason.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _collectAgain() async {
    final delivery = _delivery;
    if (delivery == null) return;
    final updated = await showAppSheet<RiderDelivery>(
      context,
      title: 'Collect the payment again',
      child: _RetryPaymentSheet(delivery: delivery),
    );
    if (updated == null || !mounted) return;

    if (updated.status == 'DELIVERED') {
      showAppSnack(context, 'Delivered. The cash is now in your cash balance.');
      if (mounted) context.go('/today');
      return;
    }
    setState(() => _delivery = updated);
    _setNotice('Payment sent. The job finishes when the store checks it.');
  }

  Future<void> _openLink(String? url, {required String failure}) async {
    if (url == null) return;
    try {
      final opened = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) showAppSnack(context, failure, error: true);
    } catch (_) {
      if (mounted) showAppSnack(context, failure, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = _delivery;
    final closed = delivery != null && isClosedStatus(delivery.status);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: delivery?.orderNumber ?? 'Delivery',
              subtitle: delivery == null
                  ? 'Loading…'
                  : friendlyStatus(delivery.status),
              trailing: IconButton(
                onPressed: () => _load(silent: true),
                icon: const Icon(Icons.refresh_rounded, size: 21),
                tooltip: 'Refresh',
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(44, 44),
                ),
              ),
            ),
            Expanded(
              child: _loading && delivery == null
                  ? const Center(
                      child: CircularProgressIndicator(color: AppColors.forest),
                    )
                  : delivery == null
                  ? _LoadFailure(
                      message: _loadError ?? 'This job could not be loaded.',
                      onRetry: _load,
                    )
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: () => _load(silent: true),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          if (_notice != null) ...[
                            _noticeIsError
                                ? ErrorNotice(
                                    message: _notice!,
                                    onDismiss: () =>
                                        setState(() => _notice = null),
                                  )
                                : _SuccessNotice(message: _notice!),
                            const SizedBox(height: 14),
                          ],
                          _StatusCard(delivery: delivery),
                          if (delivery.paymentPending) ...[
                            const SizedBox(height: 12),
                            _WaitingCard(
                              title: 'Waiting for the store',
                              message: 'The store is checking the payment you sent. This job finishes when they approve it. Nothing more to collect.',
                              onRefresh: () => _load(silent: true),
                            ),
                          ],
                          if (delivery.status == 'FAILED' &&
                              delivery.failureReason != null) ...[
                            const SizedBox(height: 12),
                            _ProblemCard(
                              title: 'Last attempt was not delivered',
                              message: delivery.failureReason!,
                            ),
                          ],
                          if (delivery.status == 'PENDING' ||
                              delivery.status == 'PREPARING') ...[
                            const SizedBox(height: 12),
                            _WaitingCard(
                              title: 'Still with the store',
                              message: 'This order is being prepared. You can stay on other jobs; it will move to your route when it is ready.',
                              onRefresh: () => _load(silent: true),
                            ),
                          ],
                          if (delivery.address != null) ...[
                            const SizedBox(height: 16),
                            _CustomerCard(
                              delivery: delivery,
                              onCall: _openLink,
                            ),
                          ],
                          const SizedBox(height: 16),
                          _MoneyCard(delivery: delivery),
                          if (delivery.items.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            _ItemsCard(delivery: delivery),
                          ],
                          if (closed && delivery.fulfilment != null) ...[
                            const SizedBox(height: 16),
                            _OutcomeCard(delivery: delivery),
                          ],
                          if (closed) ...[
                            const SizedBox(height: 16),
                            SurfaceCard(
                              color: AppColors.paperDeep,
                              borderColor: AppColors.paperDeep,
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.lock_outline_rounded,
                                    size: 18,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      'Customer details are hidden after a job closes.',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            AppButton(
                              label: 'Back to my deliveries',
                              variant: AppButtonVariant.outline,
                              height: 50,
                              onPressed: () => context.canPop()
                                  ? context.pop()
                                  : context.go('/today'),
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: delivery == null || closed
          ? null
          : _BottomActions(
              delivery: delivery,
              busy: _busy,
              onMove: _move,
              onComplete: _openDoorFlow,
              onFailed: _markFailed,
              onCollectAgain: _collectAgain,
              onRefresh: () => _load(silent: true),
            ),
    );
  }
}

class _LoadFailure extends StatelessWidget {
  const _LoadFailure({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              size: 44,
              color: AppColors.muted,
            ),
            const SizedBox(height: 14),
            Text(
              'Could not load this job',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Try again',
              expand: false,
              height: 48,
              variant: AppButtonVariant.outline,
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessNotice extends StatelessWidget {
  const _SuccessNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.sage,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.check_circle_rounded,
            size: 20,
            color: AppColors.sageInk,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13.5,
                height: 1.4,
                color: AppColors.sageInk,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.delivery});

  final RiderDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final progress = progressIndexFor(delivery.status);
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusPill(status: delivery.status),
              const Spacer(),
              if (delivery.address?.area.isNotEmpty == true)
                Flexible(
                  child: Text(
                    delivery.address!.area,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            statusHelper(delivery.status),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (progress != null) ...[
            const SizedBox(height: 18),
            StepRail(index: progress),
          ],
        ],
      ),
    );
  }
}

class _WaitingCard extends StatelessWidget {
  const _WaitingCard({
    required this.title,
    required this.message,
    this.onRefresh,
  });

  final String title;
  final String message;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.amber,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.amberInk.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.hourglass_top_rounded,
                size: 18,
                color: AppColors.amberInk,
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.amberInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            message,
            style: const TextStyle(
              fontSize: 13.5,
              height: 1.45,
              color: AppColors.amberInk,
            ),
          ),
          if (onRefresh != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: onRefresh,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.amberInk,
                  padding: const EdgeInsets.only(top: 4, bottom: 4),
                  minimumSize: const Size(0, 36),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Check again'),
              ),
            ),
        ],
      ),
    );
  }
}

class _ProblemCard extends StatelessWidget {
  const _ProblemCard({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.claySoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.clay.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 18,
                color: AppColors.clay,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.clay,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: const TextStyle(
              fontSize: 13.5,
              height: 1.45,
              color: AppColors.clay,
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.delivery, required this.onCall});

  final RiderDelivery delivery;
  final Future<void> Function(String? url, {required String failure}) onCall;

  @override
  Widget build(BuildContext context) {
    final address = delivery.address!;
    final phone = address.phone;
    final pin = delivery.deliveryLocation;
    final mapUrl = pin != null ? locationMapUrl(pin) : mapsUrl(address);

    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Deliver to'),
          const SizedBox(height: 10),
          Text(
            address.name ?? 'Customer',
            style: Theme.of(context).textTheme.headlineSmall
                ?.copyWith(fontSize: 19),
          ),
          if (address.line.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(address.line, style: Theme.of(context).textTheme.bodyMedium),
          ],
          if (address.additionalInstructions?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.paper,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Note from the customer',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                      color: AppColors.muted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    address.additionalInstructions!.trim(),
                    style: const TextStyle(
                      fontSize: 13.5,
                      height: 1.4,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              if (phone != null && phone.trim().isNotEmpty) ...[
                Expanded(
                  child: AppButton(
                    label: 'Call',
                    variant: AppButtonVariant.outline,
                    icon: Icons.call_outlined,
                    height: 48,
                    onPressed: () => onCall(
                      telUrl(phone),
                      failure: 'This phone cannot make a call.',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              if (mapUrl != null)
                Expanded(
                  child: AppButton(
                    label: 'Navigate',
                    variant: AppButtonVariant.outline,
                    icon: Icons.near_me_outlined,
                    height: 48,
                    onPressed: () => onCall(
                      mapUrl,
                      failure: 'A map app could not be opened.',
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({required this.delivery});

  final RiderDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final line = cashLineFor(delivery);
    final currency = delivery.currency;

    if (line.kind == CashKind.collect || line.kind == CashKind.rejected) {
      final rejected = line.kind == CashKind.rejected;
      return SurfaceCard(
        color: rejected ? AppColors.claySoft : AppColors.surface,
        borderColor: rejected
            ? AppColors.clay.withValues(alpha: 0.25)
            : AppColors.line,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: rejected ? AppColors.clay : AppColors.forest,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    rejected ? Icons.replay_rounded : Icons.payments_outlined,
                    size: 19,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rejected
                            ? 'Collect the payment again'
                            : 'Cash to collect',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        rejected
                            ? 'The store could not verify the last payment.'
                            : 'Ask for this amount at the door.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              formatMoney(line.amount, currency: currency),
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                fontSize: 40,
                color: rejected ? AppColors.clay : AppColors.forest,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (rejected && delivery.paymentNote != null) ...[
              const SizedBox(height: 8),
              Text(
                'Store note: ${delivery.paymentNote}',
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: AppColors.clay,
                ),
              ),
            ],
          ],
        ),
      );
    }

    final (background, icon, title, message) = switch (line.kind) {
      CashKind.waiting => (
        AppColors.amber,
        Icons.hourglass_top_rounded,
        'Payment with the store',
        'There is nothing to collect until the store checks it.',
      ),
      CashKind.prepaid => (
        AppColors.sage,
        Icons.check_circle_outline_rounded,
        'Already paid online',
        'Collect nothing from the customer.',
      ),
      CashKind.collected => (
        AppColors.sage,
        Icons.check_circle_outline_rounded,
        'Cash collected',
        'This job is in your cash balance.',
      ),
      CashKind.proof => (
        AppColors.sage,
        Icons.verified_outlined,
        'Paid at the door',
        friendlyProofStatus(line.proofStatus),
      ),
      _ => (
        AppColors.paperDeep,
        Icons.inventory_2_outlined,
        'Nothing to collect',
        'Everything was returned to the store.',
      ),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 19, color: AppColors.forest),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  message,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: AppColors.inkSoft),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.delivery});

  final RiderDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final count = delivery.items.fold<int>(
      0,
      (sum, item) => sum + item.quantity,
    );
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const SectionLabel('Items to hand over'),
              const Spacer(),
              Text(
                '$count ${count == 1 ? 'item' : 'items'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < delivery.items.length; i++) ...[
            if (i > 0) const Divider(height: 20),
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.paper,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '×${delivery.items[i].quantity}',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    delivery.items[i].productName,
                    style: const TextStyle(
                      fontSize: 14.5,
                      height: 1.35,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                if (delivery.items[i].lineTotal > 0) ...[
                  const SizedBox(width: 10),
                  Text(
                    formatMoney(
                      delivery.items[i].lineTotal,
                      currency: delivery.currency,
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _OutcomeCard extends StatelessWidget {
  const _OutcomeCard({required this.delivery});

  final RiderDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final title = switch (delivery.fulfilment) {
      'FULL' => 'Everything was delivered',
      'NONE' => 'Everything went back',
      _ => 'Part of the order went back',
    };
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('What happened at the door'),
          const SizedBox(height: 8),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (delivery.returnedAmount > 0) ...[
            const SizedBox(height: 6),
            Text(
              '${formatMoney(delivery.returnedAmount, currency: delivery.currency)} of goods came back'
              '${delivery.feeRefunded ? ', and the delivery fee was refunded' : ''}.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (delivery.netTotal != null) ...[
            const SizedBox(height: 6),
            Text(
              '${delivery.paymentMethod == 'COD' ? 'Collected' : 'Final total'}: ${formatMoney(delivery.netTotal, currency: delivery.currency)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _BottomActions extends StatelessWidget {
  const _BottomActions({
    required this.delivery,
    required this.busy,
    required this.onMove,
    required this.onComplete,
    required this.onFailed,
    required this.onCollectAgain,
    required this.onRefresh,
  });

  final RiderDelivery delivery;
  final bool busy;
  final Future<void> Function(NextAction action) onMove;
  final VoidCallback onComplete;
  final VoidCallback onFailed;
  final VoidCallback onCollectAgain;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final action = nextActionFor(delivery.status);
    final atDoor = delivery.status == 'OUT_FOR_DELIVERY';
    final waiting =
        delivery.status == 'PENDING' || delivery.status == 'PREPARING';

    final Widget primary;
    String? helper;

    if (delivery.paymentPending) {
      primary = AppButton(
        label: 'Check status',
        variant: AppButtonVariant.outline,
        icon: Icons.refresh_rounded,
        onPressed: onRefresh,
      );
      helper = 'The store completes this job after checking the payment.';
    } else if (delivery.paymentRejected) {
      primary = AppButton(
        label: 'Collect payment again',
        icon: Icons.payments_outlined,
        onPressed: busy ? null : onCollectAgain,
      );
      helper =
          'Cash finishes the job now. Another method waits for a store check.';
    } else if (atDoor) {
      primary = AppButton(
        label: 'Complete delivery',
        icon: Icons.check_rounded,
        onPressed: busy ? null : onComplete,
      );
      helper = "You'll need the customer's 6-digit code.";
    } else if (action != null) {
      primary = AppButton(
        label: action.label,
        loading: busy,
        onPressed: busy ? null : () => onMove(action),
      );
      helper = action.helper;
    } else if (waiting) {
      primary = const AppButton(
        label: 'Waiting for the store',
        variant: AppButtonVariant.outline,
        onPressed: null,
      );
      helper = 'Pull down to check for an update.';
    } else {
      primary = AppButton(
        label: 'Check status',
        variant: AppButtonVariant.outline,
        onPressed: onRefresh,
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              primary,
              if (helper != null) ...[
                const SizedBox(height: 7),
                Text(
                  helper,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if (atDoor && !delivery.paymentPending)
                TextButton(
                  onPressed: busy ? null : onFailed,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    minimumSize: const Size(0, 40),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Could not deliver this order'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FailurePicker extends StatefulWidget {
  const _FailurePicker();

  @override
  State<_FailurePicker> createState() => _FailurePickerState();
}

class _FailurePickerState extends State<_FailurePicker> {
  String? _selected;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String? get _result {
    final choice = _selected;
    if (choice == null) return null;
    final note = _note.text.trim();
    if (choice == 'Something else' && note.isEmpty) return null;
    return note.isEmpty ? choice : '$choice — $note';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'The job stays on your list so you can try again later.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: failureReasons
              .map(
                (reason) => GestureDetector(
                  onTap: () => setState(() => _selected = reason),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: _selected == reason
                          ? AppColors.forest
                          : AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      border: Border.all(
                        color: _selected == reason
                            ? AppColors.forest
                            : AppColors.lineStrong,
                        width: 1.2,
                      ),
                    ),
                    child: Text(
                      reason,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _selected == reason
                            ? AppColors.white
                            : AppColors.inkSoft,
                      ),
                    ),
                  ),
                ),
              )
              .toList(growable: false),
        ),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: () => setState(() => _selected = 'Something else'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              'Something else',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: _selected == 'Something else'
                    ? AppColors.forest
                    : AppColors.muted,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _note,
          maxLength: 200,
          maxLines: 3,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Add a note (optional)',
            hintText:
                'For example: gate was locked, no answer after 10 minutes',
            counterText: '',
          ),
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Mark as not delivered',
          variant: AppButtonVariant.danger,
          onPressed: _result == null
              ? null
              : () => Navigator.of(context).pop(_result),
        ),
        const SizedBox(height: 8),
        AppButton(
          label: 'Cancel',
          variant: AppButtonVariant.text,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class _RetryPaymentSheet extends ConsumerStatefulWidget {
  const _RetryPaymentSheet({required this.delivery});

  final RiderDelivery delivery;

  @override
  ConsumerState<_RetryPaymentSheet> createState() => _RetryPaymentSheetState();
}

class _RetryPaymentSheetState extends ConsumerState<_RetryPaymentSheet> {
  DoorPayment _payment = const DoorPayment();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    if (_busy || !paymentReady(_payment) || _payment.busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .retryPayment(
            id: widget.delivery.id,
            collection: collectionPayload(_payment),
          );
      if (mounted) Navigator.of(context).pop(updated);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'The payment was not sent. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final amount = widget.delivery.amountToCollect;
    final options = methodsFor(widget.delivery);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.claySoft,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'AMOUNT TO COLLECT',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: AppColors.clay,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                formatMoney(amount, currency: widget.delivery.currency),
                style: Theme.of(context).textTheme.displayMedium?.copyWith(
                  color: AppColors.clay,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              if (widget.delivery.paymentNote != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Store note: ${widget.delivery.paymentNote}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    color: AppColors.clay,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 18),
        const SectionLabel('How is the customer paying?'),
        const SizedBox(height: 10),
        PaymentCapture(
          options: options,
          value: _payment,
          enabled: !_busy,
          onChanged: (value) => setState(() => _payment = value),
          uploadProof: (bytes, filename) => ref
              .read(deliveryRepositoryProvider)
              .uploadProofPhoto(
                deliveryId: widget.delivery.id,
                bytes: bytes,
                filename: filename,
              ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          ErrorNotice(message: _error!),
        ],
        const SizedBox(height: 18),
        AppButton(
          label: _payment.isCash
              ? 'Collected in cash'
              : 'Send for the store to check',
          loading: _busy,
          onPressed: paymentReady(_payment) && !_payment.busy ? _submit : null,
        ),
        const SizedBox(height: 8),
        Text(
          _payment.isCash
              ? 'Cash finishes the job straight away.'
              : 'The job finishes after the store checks the payment.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
