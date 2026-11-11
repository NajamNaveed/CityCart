import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  return 'We could not load this delivery. Check the connection and try again.';
}

({String title, String message, String confirm, String done}) _moveCopy(
  String from,
  String to,
) {
  return switch (to) {
    'PICKED_UP' => (
      title: 'Mark picked up?',
      message:
          'The parcel has left your shop with the rider. The customer will '
          'see that it is on the way.',
      confirm: 'Mark picked up',
      done: 'Delivery marked picked up.',
    ),
    'IN_TRANSIT' => (
      title: 'Mark on the way?',
      message: 'The rider is travelling to the customer now.',
      confirm: 'Mark on the way',
      done: 'Delivery is on the way.',
    ),
    'OUT_FOR_DELIVERY' when from == 'FAILED' => (
      title: 'Send it out again?',
      message:
          'The rider will try this delivery again. The order was not '
          'cancelled or refunded when the first attempt failed.',
      confirm: 'Try again',
      done: 'Delivery is out again.',
    ),
    'OUT_FOR_DELIVERY' => (
      title: 'Mark out for delivery?',
      message: 'The rider is at the customer’s door now.',
      confirm: 'Mark out for delivery',
      done: 'Delivery is out for delivery.',
    ),
    'DELIVERED' => (
      title: 'Mark delivered?',
      message:
          'Only do this when the customer has the full order. This closes the '
          'order and records every item as delivered.',
      confirm: 'Mark delivered',
      done: 'Delivery completed.',
    ),
    _ => (
      title: 'Update this delivery?',
      message: 'The customer will see the new state.',
      confirm: 'Update',
      done: 'Delivery updated.',
    ),
  };
}

const _journey = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

int _progressFor(String status) {
  return switch (status) {
    'PICKED_UP' => 1,
    'IN_TRANSIT' => 2,
    'OUT_FOR_DELIVERY' || 'FAILED' => 3,
    'DELIVERED' || 'RETURNED' => 4,
    _ => 0,
  };
}

/// One delivery in full: where it is, who has it, where it goes, and the one
/// move the shop can make next.
class BrandDeliveryDetailScreen extends ConsumerStatefulWidget {
  const BrandDeliveryDetailScreen({
    super.key,
    required this.deliveryId,
    this.initial,
  });

  final String deliveryId;
  final BrandDelivery? initial;

  @override
  ConsumerState<BrandDeliveryDetailScreen> createState() =>
      _BrandDeliveryDetailScreenState();
}

class _BrandDeliveryDetailScreenState
    extends ConsumerState<BrandDeliveryDetailScreen> {
  BrandDelivery? _delivery;
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _delivery = widget.initial;
    Future<void>.microtask(_refresh);
  }

  Future<void> _refresh() async {
    try {
      final delivery = await ref
          .read(businessRepositoryProvider)
          .brandDelivery(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = delivery;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      final message = _errorSentence(error);
      if (_delivery == null) {
        setState(() => _error = message);
      } else {
        showAppSnack(context, message, error: true);
      }
    }
  }

  Future<void> _move(String status) async {
    final delivery = _delivery;
    if (delivery == null || _busy != null) return;

    if (status == 'FAILED') {
      final reason = await showFormSheet<String>(
        context,
        title: 'What went wrong?',
        subtitle:
            'The customer will see this reason. A failed attempt does not '
            'cancel or refund the order.',
        child: const _FailureSheet(),
      );
      if (reason == null || !mounted) return;
      await _applyStatus(status, failureReason: reason);
      return;
    }

    final copy = _moveCopy(delivery.status, status);
    final ok = await confirmAction(
      context,
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirm,
    );
    if (!ok || !mounted) return;
    await _applyStatus(status, done: copy.done);
  }

  Future<void> _applyStatus(
    String status, {
    String? failureReason,
    String? done,
  }) async {
    final delivery = _delivery;
    if (delivery == null) return;
    setState(() => _busy = 'status');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .updateBrandDeliveryStatus(
            delivery.id,
            status,
            failureReason: failureReason,
          );
      if (!mounted) return;
      setState(() {
        _delivery = updated;
        _busy = null;
      });
      if (mounted) {
        showAppSnack(
          context,
          done ??
              (status == 'FAILED'
                  ? 'Failed attempt recorded.'
                  : 'Delivery updated.'),
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _assignRider() async {
    final delivery = _delivery;
    if (delivery == null || _busy != null) return;

    setState(() => _busy = 'riders');
    List<BrandRider> riders;
    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .brandRiders(isActive: true, limit: 50);
      riders = page.items;
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
      return;
    }
    if (!mounted) return;
    setState(() => _busy = null);

    if (riders.isEmpty) {
      final add = await confirmAction(
        context,
        title: 'No riders yet',
        message:
            'Add a rider first, then you can assign this delivery to them.',
        confirmLabel: 'Add a rider',
      );
      if (add && mounted) context.push('/brand-riders');
      return;
    }

    final choice = await showFormSheet<_RiderChoice>(
      context,
      title: 'Who will deliver?',
      subtitle:
          'The rider gets this delivery in the rider app and is told when you '
          'assign it.',
      child: _RiderPicker(delivery: delivery, riders: riders),
    );
    if (choice == null || !mounted) return;

    setState(() => _busy = 'rider');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .assignBrandDeliveryRider(delivery.id, choice.riderId);
      if (!mounted) return;
      setState(() {
        _delivery = updated;
        _busy = null;
      });
      if (mounted) {
        showAppSnack(
          context,
          choice.riderId == null ? 'Rider removed.' : 'Rider assigned.',
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _editDetails() async {
    final delivery = _delivery;
    if (delivery == null || _busy != null) return;
    final draft = await showFormSheet<_DetailsDraft>(
      context,
      title: 'Tracking and contact',
      subtitle:
          'Use these when another courier is carrying the parcel outside the '
          'rider app.',
      child: _DetailsSheet(delivery: delivery),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'details');
    try {
      final updated = await ref
          .read(businessRepositoryProvider)
          .updateBrandDeliveryDetails(
            delivery.id,
            trackingReference: draft.trackingReference,
            assignedAgent: draft.assignedAgent,
          );
      if (!mounted) return;
      setState(() {
        _delivery = updated;
        _busy = null;
      });
      if (mounted) showAppSnack(context, 'Delivery details saved.');
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
    final delivery = _delivery;
    final actions = delivery == null ? null : _actionBar(delivery);

    return Scaffold(
      appBar: AppBar(title: const Text('Delivery details')),
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
    final delivery = _delivery;
    if (delivery == null) {
      final error = _error;
      if (error == null) return const LoadingView(label: 'Loading delivery');
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

    final orderNumber = delivery.orderNumber.isEmpty
        ? 'Delivery'
        : delivery.orderNumber;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          PageHeader(
            eyebrow: 'Delivery',
            title: orderNumber,
            subtitle: brandDeliveryStatusDetail(delivery.status),
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
                      label: brandDeliveryStatusLabel(delivery.status),
                      tone: brandDeliveryStatusTone(delivery.status),
                    ),
                    if (delivery.deliveryFeePaisa > 0)
                      StatusTag(
                        label: 'Fee ${money(delivery.deliveryFeePaisa)}',
                        tone: AppTone.neutral,
                      ),
                  ],
                ),
                if (delivery.status == 'FAILED') ...[
                  const SizedBox(height: 16),
                  NoticeBanner(
                    key: const Key('delivery_failure_notice'),
                    icon: Icons.report_gmailerrorred_rounded,
                    tone: AppTone.red,
                    message: delivery.failureReason.isEmpty
                        ? 'The last attempt failed. Send the parcel out again '
                              'when the customer is ready.'
                        : 'Last attempt failed: ${delivery.failureReason}',
                  ),
                ],
                if (!delivery.hasRider && !delivery.isFinal) ...[
                  const SizedBox(height: 16),
                  const NoticeBanner(
                    icon: Icons.sports_motorsports_outlined,
                    message:
                        'No rider is assigned yet. Assign one so they see this '
                        'parcel in the rider app.',
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('Where it is'),
                SurfacePanel(child: _Journey(status: delivery.status)),
                const SizedBox(height: 22),
                const SectionTitle('Deliver to'),
                _AddressPanel(address: delivery.address, onCopy: _copyPhone),
                const SizedBox(height: 22),
                const SectionTitle('Delivery details'),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        key: const Key('delivery_open_order'),
                        icon: Icons.receipt_long_outlined,
                        label: 'Customer order',
                        value: orderNumber,
                        onTap: delivery.orderId.isEmpty
                            ? null
                            : () => context.push(
                                '/brand-orders/${delivery.orderId}',
                              ),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.local_shipping_outlined,
                        label: 'Delivery fee',
                        value: delivery.deliveryFeePaisa == 0
                            ? 'Free'
                            : money(delivery.deliveryFeePaisa),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        icon: Icons.sports_motorsports_outlined,
                        label: 'Rider',
                        value: delivery.assignedAgent.isEmpty
                            ? 'None assigned'
                            : delivery.assignedAgent,
                      ),
                      if (delivery.trackingReference.isNotEmpty) ...[
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.pin_outlined,
                          label: 'Tracking reference',
                          value: delivery.trackingReference,
                        ),
                      ],
                      if (delivery.createdAt != null) ...[
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.event_outlined,
                          label: 'Created',
                          value: dateTimeLabel(delivery.createdAt!),
                        ),
                      ],
                    ],
                  ),
                ),
                if (!delivery.isFinal) ...[
                  const SizedBox(height: 12),
                  AppButton(
                    key: const Key('delivery_assign_rider'),
                    label: delivery.hasRider
                        ? 'Change rider'
                        : 'Assign a rider',
                    icon: Icons.sports_motorsports_outlined,
                    variant: AppButtonVariant.outline,
                    loading: _busy == 'riders' || _busy == 'rider',
                    onPressed: _busy == null ? _assignRider : null,
                  ),
                  const SizedBox(height: 8),
                  AppButton(
                    key: const Key('delivery_edit_details'),
                    label: 'Tracking and contact',
                    icon: Icons.tune_rounded,
                    variant: AppButtonVariant.outline,
                    loading: _busy == 'details',
                    onPressed: _busy == null ? _editDetails : null,
                  ),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget? _actionBar(BrandDelivery delivery) {
    final next = brandDeliveryNextStatuses(delivery.status);
    if (next.isEmpty) return null;
    final working = _busy != null;
    final primary = next.first;
    final primaryLabel =
        delivery.status == 'FAILED' && primary == 'OUT_FOR_DELIVERY'
        ? 'Send it out again'
        : brandDeliveryActionLabel(primary);
    final hasFailure = next.contains('FAILED');

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppButton(
          key: Key('delivery_move_${primary.toLowerCase()}'),
          label: primaryLabel,
          icon: primary == 'DELIVERED'
              ? Icons.check_circle_outline_rounded
              : Icons.arrow_forward_rounded,
          loading: _busy == 'status',
          onPressed: working ? null : () => _move(primary),
        ),
        if (hasFailure) ...[
          const SizedBox(height: 2),
          TextButton(
            key: const Key('delivery_fail'),
            onPressed: working ? null : () => _move('FAILED'),
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
            child: const Text('Delivery failed'),
          ),
        ],
      ],
    );
  }
}

class _Journey extends StatelessWidget {
  const _Journey({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final progress = _progressFor(status);
    return Column(
      children: [
        for (var index = 0; index < _journey.length; index++) ...[
          if (index > 0) const SizedBox(height: 10),
          Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: index < progress ? AppColors.forest : AppColors.paper,
                  shape: BoxShape.circle,
                ),
                child: index < progress
                    ? const Icon(
                        Icons.check_rounded,
                        size: 15,
                        color: AppColors.white,
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  brandDeliveryStatusLabel(_journey[index]),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodyMedium?.copyWith(
                    color: index < progress ? AppColors.ink : AppColors.muted,
                    fontWeight: index == progress - 1
                        ? FontWeight.w700
                        : FontWeight.w500,
                  ),
                ),
              ),
              if (index == progress - 1 && status != 'DELIVERED')
                Text(
                  'Now',
                  style: text.labelSmall?.copyWith(color: AppColors.forest),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _AddressPanel extends StatelessWidget {
  const _AddressPanel({required this.address, required this.onCopy});

  final BrandShippingAddress? address;
  final ValueChanged<String> onCopy;

  @override
  Widget build(BuildContext context) {
    final address = this.address;
    if (address == null) {
      return const EmptyPanel(
        icon: Icons.local_shipping_outlined,
        title: 'No address recorded',
        message:
            'This delivery has no address. Check the order on the website.',
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
                  key: const Key('delivery_copy_phone'),
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

class _RiderChoice {
  const _RiderChoice(this.riderId);

  final String? riderId;
}

class _RiderPicker extends StatelessWidget {
  const _RiderPicker({required this.delivery, required this.riders});

  final BrandDelivery delivery;
  final List<BrandRider> riders;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final rider in riders) ...[
          SurfacePanel(
            key: Key('rider_choice_${rider.id}'),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            onTap: () => Navigator.of(context).pop(_RiderChoice(rider.id)),
            child: Row(
              children: [
                AvatarBadge(name: rider.name, size: 38),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rider.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.titleSmall,
                      ),
                      if (rider.phone.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          rider.phone,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
                if (delivery.riderId == rider.id) ...[
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.check_circle_rounded,
                    size: 20,
                    color: AppColors.forest,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        if (delivery.hasRider)
          TextButton.icon(
            key: const Key('rider_choice_none'),
            onPressed: () =>
                Navigator.of(context).pop(const _RiderChoice(null)),
            icon: const Icon(Icons.person_off_outlined, size: 19),
            label: const Text('Remove the rider'),
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
          ),
      ],
    );
  }
}

class _DetailsDraft {
  const _DetailsDraft({
    required this.trackingReference,
    required this.assignedAgent,
  });

  final String trackingReference;
  final String assignedAgent;
}

class _DetailsSheet extends StatefulWidget {
  const _DetailsSheet({required this.delivery});

  final BrandDelivery delivery;

  @override
  State<_DetailsSheet> createState() => _DetailsSheetState();
}

class _DetailsSheetState extends State<_DetailsSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _tracking;
  late final TextEditingController _agent;

  bool get _hasRider => widget.delivery.hasRider;

  @override
  void initState() {
    super.initState();
    _tracking = TextEditingController(text: widget.delivery.trackingReference);
    _agent = TextEditingController(text: widget.delivery.assignedAgent);
  }

  @override
  void dispose() {
    _tracking.dispose();
    _agent.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final tracking = _tracking.text.trim();
    final agent = _hasRider ? '' : _agent.text.trim();
    if (tracking.isEmpty && agent.isEmpty) {
      showAppSnack(
        context,
        'Add a tracking reference or a contact name.',
        error: true,
      );
      return;
    }
    Navigator.of(context)
        .pop(_DetailsDraft(trackingReference: tracking, assignedAgent: agent));
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('delivery_tracking'),
            label: 'Tracking reference (optional)',
            controller: _tracking,
            hint: 'Courier tracking number',
            textInputAction: TextInputAction.next,
            validator: (value) => (value ?? '').trim().length > 100
                ? 'Keep the reference under 100 characters.'
                : null,
          ),
          if (!_hasRider) ...[
            const SizedBox(height: 13),
            AppField(
              key: const Key('delivery_agent'),
              label: 'Delivery contact (optional)',
              controller: _agent,
              hint: 'Name of the person carrying it',
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              validator: (value) => (value ?? '').trim().length > 100
                  ? 'Keep the name under 100 characters.'
                  : null,
            ),
          ] else ...[
            const SizedBox(height: 12),
            Text(
              'The assigned rider is already recorded. Change the rider above '
              'if someone else is carrying this parcel.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 20),
          AppButton(
            key: const Key('delivery_details_save'),
            label: 'Save details',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _FailureSheet extends StatefulWidget {
  const _FailureSheet();

  @override
  State<_FailureSheet> createState() => _FailureSheetState();
}

class _FailureSheetState extends State<_FailureSheet> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(_reason.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('delivery_failure_reason'),
            label: 'Reason',
            controller: _reason,
            hint: 'Nobody home, wrong address, customer refused…',
            maxLines: 3,
            maxLength: 300,
            textInputAction: TextInputAction.done,
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Say what went wrong so the shop can try again.'
                : null,
          ),
          const SizedBox(height: 20),
          AppButton(
            key: const Key('delivery_failure_save'),
            label: 'Record failed attempt',
            icon: Icons.report_gmailerrorred_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
