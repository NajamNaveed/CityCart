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

String _whenLabel(BusinessBooking booking) {
  final when = booking.whenStart;
  if (when == null) return 'Time not set';
  if (booking.scheduledStart != null) {
    return '${dayRelation(when)} · ${timeLabel(when)}';
  }
  return 'Requested ${dateTimeLabel(when)}';
}

String _fullWhenLabel(BusinessBooking booking) {
  final when = booking.whenStart;
  if (when == null) return 'Time not set';
  return '${fullDay(when)} · ${timeLabel(when)}';
}

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load this booking. Check the connection and try again.';
}

class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId, this.initial});

  final String bookingId;
  final BusinessBooking? initial;

  @override
  ConsumerState<BookingDetailScreen> createState() =>
      _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  BusinessBooking? _booking;
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _booking = widget.initial;
    Future<void>.microtask(_refresh);
  }

  Future<void> _refresh() async {
    try {
      final booking = await ref
          .read(businessRepositoryProvider)
          .providerBooking(widget.bookingId);
      if (!mounted) return;
      setState(() {
        _booking = booking;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      final message = _errorSentence(error);
      if (_booking == null) {
        setState(() => _error = message);
      } else {
        showAppSnack(context, message, error: true);
      }
    }
  }

  Future<void> _run(
    String key,
    Future<BusinessBooking> Function() action,
    String message,
  ) async {
    if (_busy != null) return;
    setState(() => _busy = key);
    try {
      final updated = await action();
      if (!mounted) return;
      setState(() {
        _booking = updated;
        _busy = null;
      });
      showAppSnack(context, message);
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  bool get _working => _busy != null;

  Future<void> _copyPhone(String phone) async {
    if (phone.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: phone));
    if (mounted) showAppSnack(context, 'Phone number copied.');
  }

  Future<void> _accept() async {
    final booking = _booking;
    if (booking == null) return;
    final choice = await showFormSheet<_AcceptChoice>(
      context,
      title: 'Accept this request',
      subtitle: '${booking.offering.title} · ${_whenLabel(booking)}',
      child: _AcceptSheet(booking: booking),
    );
    if (choice == null || !mounted) return;
    final repository = ref.read(businessRepositoryProvider);
    if (choice.useCustomerOffer) {
      await _run(
        'accept',
        () => repository.acceptProviderOffer(booking.id),
        'Customer offer accepted.',
      );
    } else {
      await _run(
        'accept',
        () => repository.acceptProviderBooking(
          booking.id,
          pricePaisa: choice.pricePaisa!,
        ),
        'Request accepted.',
      );
    }
  }

  Future<void> _propose() async {
    final booking = _booking;
    if (booking == null) return;
    final draft = await showFormSheet<_ProposalDraft>(
      context,
      title: booking.activeProposal == null
          ? 'Send a price proposal'
          : 'Change your proposal',
      subtitle: 'The customer accepts or declines your offer.',
      child: _ProposalSheet(booking: booking),
    );
    if (draft == null || !mounted) return;
    await _run(
      'propose',
      () => ref
          .read(businessRepositoryProvider)
          .proposeProviderBooking(
            booking.id,
            pricePaisa: draft.pricePaisa,
            scope: draft.scope,
            scheduledStart: draft.scheduledStart,
          ),
      'Proposal sent.',
    );
  }

  Future<void> _decline() async {
    final booking = _booking;
    if (booking == null) return;
    final reason = await showFormSheet<String>(
      context,
      title: 'Decline this request?',
      subtitle:
          'The customer will be told. A short reason helps them find someone '
          'else.',
      child: const _ReasonSheet(
        label: 'Reason (optional)',
        hint: 'For example: I am fully booked that day.',
        submitLabel: 'Decline request',
        requiredReason: false,
      ),
    );
    if (reason == null || !mounted) return;
    await _run(
      'decline',
      () => ref
          .read(businessRepositoryProvider)
          .declineProviderBooking(booking.id, reason: reason),
      'Request declined.',
    );
  }

  Future<void> _cancel() async {
    final booking = _booking;
    if (booking == null) return;
    final reason = await showFormSheet<String>(
      context,
      title: 'Cancel this booking?',
      subtitle:
          'The customer will be told. Late cancellations affect how customers '
          'see your business.',
      child: const _ReasonSheet(
        label: 'Reason',
        hint: 'For example: an emergency came up.',
        submitLabel: 'Cancel booking',
        requiredReason: true,
      ),
    );
    if (reason == null || !mounted) return;
    await _run(
      'cancel',
      () => ref
          .read(businessRepositoryProvider)
          .cancelProviderBooking(booking.id, reason: reason),
      'Booking cancelled.',
    );
  }

  Future<void> _start() async {
    final booking = _booking;
    if (booking == null) return;
    await _run(
      'start',
      () =>
          ref.read(businessRepositoryProvider).startProviderBooking(booking.id),
      'Job started.',
    );
  }

  Future<void> _complete() async {
    final booking = _booking;
    if (booking == null) return;
    final draft = await showFormSheet<_CompletionDraft>(
      context,
      title: 'Complete this job',
      subtitle: 'State the amount the customer should pay.',
      child: _CompleteSheet(booking: booking),
    );
    if (draft == null || !mounted) return;
    await _run(
      'complete',
      () => ref
          .read(businessRepositoryProvider)
          .completeProviderBooking(
            booking.id,
            finalAmountPaisa: draft.finalAmountPaisa,
            completionNote: draft.note,
          ),
      'Job marked complete.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final booking = _booking;
    final actions = booking == null ? null : _actionBar(booking);

    return Scaffold(
      appBar: AppBar(title: const Text('Booking details')),
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
    final booking = _booking;
    if (booking == null) {
      final error = _error;
      if (error == null) return const LoadingView(label: 'Loading booking');
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

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          PageHeader(
            eyebrow: booking.bookingNumber.isEmpty
                ? 'Booking'
                : booking.bookingNumber,
            title: bookingStatusLabel(booking.status),
            subtitle: bookingStatusDetail(booking.status),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              20,
              AppSpacing.page,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (booking.status == 'REQUESTED') ...[
                  const NoticeBanner(
                    icon: Icons.mark_email_unread_outlined,
                    message:
                        'This request is waiting for you. Answer it so the '
                        'customer can plan their day.',
                  ),
                  const SizedBox(height: 18),
                ],
                if (booking.status == 'PROPOSED' &&
                    booking.activeProposal == null) ...[
                  const NoticeBanner(
                    icon: Icons.timer_off_outlined,
                    message:
                        'Your last proposal is no longer active. Send a fresh '
                        'one or wait for the customer.',
                  ),
                  const SizedBox(height: 18),
                ],
                const SectionTitle('Customer'),
                _CustomerPanel(
                  booking: booking,
                  onCopy: () => _copyPhone(booking.customerPhone),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Visit'),
                _VisitPanel(booking: booking),
                if (booking.note != null) ...[
                  const SizedBox(height: 14),
                  SurfacePanel(
                    color: AppColors.paper,
                    borderColor: AppColors.paper,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Customer’s note',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          booking.note!,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: AppColors.ink),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('Price'),
                _PricePanel(booking: booking),
                if (booking.completionNote != null) ...[
                  const SizedBox(height: 14),
                  SurfacePanel(
                    color: AppColors.mint,
                    borderColor: AppColors.mint,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Your completion note',
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(color: AppColors.forestInk),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          booking.completionNote!,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: AppColors.forestInk),
                        ),
                      ],
                    ),
                  ),
                ],
                if (booking.activeProposal != null) ...[
                  const SizedBox(height: 22),
                  const SectionTitle('Your open proposal'),
                  _ProposalPanel(proposal: booking.activeProposal!),
                ],
                if (booking.cancellation != null) ...[
                  const SizedBox(height: 18),
                  _CancellationBanner(cancellation: booking.cancellation!),
                ],
                if (booking.dispute != null) ...[
                  const SizedBox(height: 18),
                  _DisputeBanner(dispute: booking.dispute!),
                ],
                if (booking.events.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const SectionTitle('History'),
                  _HistoryPanel(events: booking.events),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget? _actionBar(BusinessBooking booking) {
    if (booking.isNewRequest) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppButton(
            key: const Key('booking_accept'),
            label: 'Accept request',
            icon: Icons.check_circle_outline_rounded,
            loading: _busy == 'accept',
            onPressed: _working ? null : _accept,
          ),
          const SizedBox(height: 8),
          AppButton(
            key: const Key('booking_propose'),
            label: 'Send a price proposal',
            variant: AppButtonVariant.outline,
            loading: _busy == 'propose',
            onPressed: _working ? null : _propose,
          ),
          const SizedBox(height: 2),
          TextButton(
            key: const Key('booking_decline'),
            onPressed: _working ? null : _decline,
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
            child: const Text('Decline request'),
          ),
        ],
      );
    }

    if (booking.status == 'PROPOSED') {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppButton(
            key: const Key('booking_propose'),
            label: 'Change proposal',
            icon: Icons.edit_outlined,
            loading: _busy == 'propose',
            onPressed: _working ? null : _propose,
          ),
          const SizedBox(height: 2),
          TextButton(
            key: const Key('booking_cancel'),
            onPressed: _working ? null : _cancel,
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
            child: const Text('Cancel booking'),
          ),
        ],
      );
    }

    if (booking.canStart) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppButton(
            key: const Key('booking_start'),
            label: 'Start job',
            icon: Icons.play_arrow_rounded,
            loading: _busy == 'start',
            onPressed: _working ? null : _start,
          ),
          const SizedBox(height: 2),
          TextButton(
            key: const Key('booking_cancel'),
            onPressed: _working ? null : _cancel,
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
            child: const Text('Cancel booking'),
          ),
        ],
      );
    }

    if (booking.canComplete) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppButton(
            key: const Key('booking_complete'),
            label: 'Mark as complete',
            icon: Icons.task_alt_rounded,
            loading: _busy == 'complete',
            onPressed: _working ? null : _complete,
          ),
          const SizedBox(height: 2),
          TextButton(
            key: const Key('booking_cancel'),
            onPressed: _working ? null : _cancel,
            style: TextButton.styleFrom(foregroundColor: AppColors.clay),
            child: const Text('Cancel booking'),
          ),
        ],
      );
    }

    return null;
  }
}

class _CustomerPanel extends StatelessWidget {
  const _CustomerPanel({required this.booking, required this.onCopy});

  final BusinessBooking booking;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final phone = booking.customerPhone;
    return SurfacePanel(
      child: Row(
        children: [
          AvatarBadge(name: booking.customerName, size: 46),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  phone.isEmpty ? 'No phone shared' : phone,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('booking_copy_phone'),
            onPressed: phone.isEmpty ? null : onCopy,
            tooltip: 'Copy phone number',
            icon: const Icon(Icons.copy_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}

class _VisitPanel extends StatelessWidget {
  const _VisitPanel({required this.booking});

  final BusinessBooking booking;

  @override
  Widget build(BuildContext context) {
    final address = booking.address;
    final area = address?.areaLabel ?? '';
    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          InfoRow(
            icon: Icons.home_repair_service_outlined,
            label: 'Service',
            value: booking.offering.title,
          ),
          const Divider(indent: 66),
          InfoRow(
            icon: Icons.schedule_rounded,
            label: booking.scheduledStart == null
                ? 'Requested time'
                : 'Scheduled time',
            value: _fullWhenLabel(booking),
          ),
          if (booking.offering.durationMinutes > 0) ...[
            const Divider(indent: 66),
            InfoRow(
              icon: Icons.timelapse_rounded,
              label: 'Duration',
              value: '${booking.offering.durationMinutes} minutes',
            ),
          ],
          const Divider(indent: 66),
          InfoRow(
            icon: Icons.place_outlined,
            label: 'Address',
            value: address == null ? 'Not shared' : address.addressLine,
          ),
          if (area.isNotEmpty) ...[
            const Divider(indent: 66),
            InfoRow(icon: Icons.map_outlined, label: 'Area', value: area),
          ],
        ],
      ),
    );
  }
}

class _PricePanel extends StatelessWidget {
  const _PricePanel({required this.booking});

  final BusinessBooking booking;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[
      InfoRow(
        icon: Icons.price_change_outlined,
        label: 'Starting price',
        value: money(booking.offering.startingAtPricePaisa),
      ),
      if (booking.customerOfferPaisa != null)
        InfoRow(
          icon: Icons.sell_outlined,
          label: 'Customer’s offer',
          value: money(booking.customerOfferPaisa),
        ),
      if (booking.agreedPricePaisa != null)
        InfoRow(
          icon: Icons.handshake_outlined,
          label: 'Agreed price',
          value: money(booking.agreedPricePaisa),
        ),
      if (booking.finalAmountPaisa != null)
        InfoRow(
          icon: Icons.receipt_long_outlined,
          label: 'Final amount',
          value: money(booking.finalAmountPaisa),
        ),
    ];

    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Divider(indent: 66),
            rows[i],
          ],
        ],
      ),
    );
  }
}

class _ProposalPanel extends StatelessWidget {
  const _ProposalPanel({required this.proposal});

  final BookingProposal proposal;

  @override
  Widget build(BuildContext context) {
    final when = proposal.scheduledStart;
    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          InfoRow(
            icon: Icons.payments_outlined,
            label: 'Your price',
            value: money(proposal.pricePaisa),
          ),
          const Divider(indent: 66),
          InfoRow(
            icon: Icons.schedule_rounded,
            label: 'Proposed time',
            value: when == null ? 'Not set' : _proposalWhen(when),
          ),
          if (proposal.expiresAt != null) ...[
            const Divider(indent: 66),
            InfoRow(
              icon: Icons.hourglass_bottom_rounded,
              label: 'Answer by',
              value: dateTimeLabel(proposal.expiresAt!),
            ),
          ],
          if (proposal.scope.trim().isNotEmpty) ...[
            const Divider(indent: 66),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'What the price includes',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    proposal.scope,
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: AppColors.ink),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _proposalWhen(DateTime when) =>
      '${fullDay(when)} · ${timeLabel(when)}';
}

class _CancellationBanner extends StatelessWidget {
  const _CancellationBanner({required this.cancellation});

  final BookingCancellation cancellation;

  @override
  Widget build(BuildContext context) {
    final who = cancellation.by == 'PROVIDER' ? 'You' : 'The customer';
    final reason = cancellation.reason.trim();
    return NoticeBanner(
      icon: Icons.cancel_outlined,
      tone: AppTone.red,
      message: reason.isEmpty
          ? '$who cancelled this booking.'
          : '$who cancelled this booking. $reason',
    );
  }
}

class _DisputeBanner extends StatelessWidget {
  const _DisputeBanner({required this.dispute});

  final BookingDispute dispute;

  @override
  Widget build(BuildContext context) {
    final reason = dispute.reason.trim();
    final resolution = dispute.isResolved
        ? ' CityCart resolved it: ${dispute.resolution.toLowerCase()}.'
        : ' CityCart support is reviewing it.';
    return NoticeBanner(
      icon: Icons.gavel_rounded,
      tone: AppTone.red,
      message: reason.isEmpty
          ? 'The customer raised a dispute.$resolution'
          : 'Dispute: $reason.$resolution',
    );
  }
}

class _HistoryPanel extends StatelessWidget {
  const _HistoryPanel({required this.events});

  final List<BookingEvent> events;

  @override
  Widget build(BuildContext context) {
    final ordered = events.reversed.toList(growable: false);
    return SurfacePanel(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Column(
        children: [
          for (var i = 0; i < ordered.length; i++) ...[
            if (i > 0) const Divider(indent: 26),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(top: 6),
                    decoration: const BoxDecoration(
                      color: AppColors.forest,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          bookingEventLabel(ordered[i].type),
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        if (ordered[i].note != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            ordered[i].note!,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                        if (ordered[i].at != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            dateTimeLabel(ordered[i].at!),
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ],
                      ],
                    ),
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

class _AcceptChoice {
  const _AcceptChoice.price(this.pricePaisa) : useCustomerOffer = false;
  const _AcceptChoice.customerOffer()
    : pricePaisa = null,
      useCustomerOffer = true;

  final int? pricePaisa;
  final bool useCustomerOffer;
}

class _AcceptSheet extends StatefulWidget {
  const _AcceptSheet({required this.booking});

  final BusinessBooking booking;

  @override
  State<_AcceptSheet> createState() => _AcceptSheetState();
}

class _AcceptSheetState extends State<_AcceptSheet> {
  late final TextEditingController _price = TextEditingController(
    text: rupeesField(widget.booking.offering.startingAtPricePaisa),
  );
  var _useOffer = false;
  String? _error;

  @override
  void dispose() {
    _price.dispose();
    super.dispose();
  }

  void _submit() {
    if (_useOffer) {
      Navigator.of(context).pop(const _AcceptChoice.customerOffer());
      return;
    }
    final paisa = paisaFromRupees(_price.text);
    if (paisa == null) {
      setState(() => _error = 'Enter a price, for example 1500.');
      return;
    }
    if (paisa < widget.booking.offering.startingAtPricePaisa) {
      setState(
        () => _error =
            'Your price cannot be below the starting price of '
            '${money(widget.booking.offering.startingAtPricePaisa)}.',
      );
      return;
    }
    Navigator.of(context).pop(_AcceptChoice.price(paisa));
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.booking.customerOfferPaisa;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'The customer is asking for '
          '${widget.booking.offering.title} on ${_whenLabel(widget.booking)}.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        if (offer != null) ...[
          _OfferChoice(
            amount: offer,
            selected: _useOffer,
            onTap: () => setState(() {
              _useOffer = !_useOffer;
              _error = null;
            }),
          ),
          const SizedBox(height: 14),
        ],
        if (_useOffer)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.mint,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Text(
              'You will be paid ${money(offer)} for this job. The customer '
              'has already agreed to this amount.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.forestInk,
                fontWeight: FontWeight.w600,
              ),
            ),
          )
        else
          AppField(
            label: 'Your price (Rs)',
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            hint: '1500',
            prefixText: 'Rs ',
          ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              color: AppColors.clay,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 18),
        AppButton(
          key: const Key('booking_accept_submit'),
          label: _useOffer ? 'Accept their offer' : 'Accept booking',
          icon: Icons.check_circle_outline_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _OfferChoice extends StatelessWidget {
  const _OfferChoice({
    required this.amount,
    required this.selected,
    required this.onTap,
  });

  final int amount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.mint : AppColors.paper,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: BorderSide(color: selected ? AppColors.forest : AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(
                Icons.sell_outlined,
                size: 20,
                color: AppColors.forest,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Accept the customer’s offer',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${money(amount)} — below your starting price, but the '
                      'customer proposed it.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                size: 22,
                color: selected ? AppColors.forest : AppColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProposalDraft {
  const _ProposalDraft({
    required this.pricePaisa,
    required this.scope,
    required this.scheduledStart,
  });

  final int pricePaisa;
  final String scope;
  final DateTime scheduledStart;
}

class _ProposalSheet extends StatefulWidget {
  const _ProposalSheet({required this.booking});

  final BusinessBooking booking;

  @override
  State<_ProposalSheet> createState() => _ProposalSheetState();
}

class _ProposalSheetState extends State<_ProposalSheet> {
  late final BookingProposal? _active = widget.booking.activeProposal;
  late final TextEditingController _price = TextEditingController(
    text: rupeesField(
      _active?.pricePaisa ?? widget.booking.offering.startingAtPricePaisa,
    ),
  );
  late final TextEditingController _scope = TextEditingController(
    text: _active?.scope ?? '',
  );
  late DateTime _when =
      _active?.scheduledStart ??
      widget.booking.scheduledStart ??
      widget.booking.requestedStart ??
      DateTime.now().add(const Duration(days: 1));
  String? _error;

  @override
  void dispose() {
    _price.dispose();
    _scope.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _when.isBefore(now) ? now : _when,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 60)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _when = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _when.hour,
        _when.minute,
      );
      _error = null;
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_when),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _when = DateTime(
        _when.year,
        _when.month,
        _when.day,
        picked.hour,
        picked.minute,
      );
      _error = null;
    });
  }

  void _submit() {
    final paisa = paisaFromRupees(_price.text);
    if (paisa == null) {
      setState(() => _error = 'Enter a price, for example 1500.');
      return;
    }
    if (paisa < widget.booking.offering.startingAtPricePaisa) {
      setState(
        () => _error =
            'Your price cannot be below the starting price of '
            '${money(widget.booking.offering.startingAtPricePaisa)}.',
      );
      return;
    }
    if (_scope.text.trim().length < 3) {
      setState(() => _error = 'Describe what the price includes.');
      return;
    }
    if (!_when.isAfter(DateTime.now())) {
      setState(() => _error = 'Choose a time in the future.');
      return;
    }
    Navigator.of(context).pop(
      _ProposalDraft(
        pricePaisa: paisa,
        scope: _scope.text.trim(),
        scheduledStart: _when,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppField(
          label: 'Your price (Rs)',
          controller: _price,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          hint: '1500',
          prefixText: 'Rs ',
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _PickButton(
                label: 'Date',
                value: fullDay(_when),
                icon: Icons.calendar_today_outlined,
                onTap: _pickDate,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PickButton(
                label: 'Time',
                value: timeLabel(_when),
                icon: Icons.schedule_rounded,
                onTap: _pickTime,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        AppField(
          label: 'What the price includes',
          controller: _scope,
          hint: 'For example: parts, the visit, and a 30-day check.',
          maxLines: 3,
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              color: AppColors.clay,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 6),
        Text(
          'The customer has 24 hours to accept. A new proposal replaces the '
          'last one.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        AppButton(
          key: const Key('booking_propose_submit'),
          label: 'Send proposal',
          icon: Icons.send_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _PickButton extends StatelessWidget {
  const _PickButton({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        alignment: Alignment.centerLeft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall,
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Icon(icon, size: 15, color: AppColors.inkSoft),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
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

class _CompletionDraft {
  const _CompletionDraft({required this.finalAmountPaisa, this.note});

  final int finalAmountPaisa;
  final String? note;
}

class _CompleteSheet extends StatefulWidget {
  const _CompleteSheet({required this.booking});

  final BusinessBooking booking;

  @override
  State<_CompleteSheet> createState() => _CompleteSheetState();
}

class _CompleteSheetState extends State<_CompleteSheet> {
  late final TextEditingController _amount = TextEditingController(
    text: rupeesField(
      widget.booking.agreedPricePaisa ??
          widget.booking.offering.startingAtPricePaisa,
    ),
  );
  late final TextEditingController _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final paisa = paisaFromRupees(_amount.text);
    if (paisa == null) {
      setState(() => _error = 'Enter the amount the customer should pay.');
      return;
    }
    final note = _note.text.trim();
    Navigator.of(context)
        .pop(_CompletionDraft(finalAmountPaisa: paisa, note: note));
  }

  @override
  Widget build(BuildContext context) {
    final agreed = widget.booking.agreedPricePaisa;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (agreed != null) ...[
          Text(
            'The agreed price was ${money(agreed)}. Change it only if the '
            'work was different from the agreed scope.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 14),
        ],
        AppField(
          label: 'Final amount (Rs)',
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          hint: '1500',
          prefixText: 'Rs ',
        ),
        const SizedBox(height: 14),
        AppField(
          label: 'Completion note (optional)',
          controller: _note,
          hint: 'What was done, or any parts used.',
          maxLines: 3,
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              color: AppColors.clay,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 6),
        Text(
          'The customer has 3 days to confirm. The job confirms '
          'automatically after that.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        AppButton(
          key: const Key('booking_complete_submit'),
          label: 'Complete job',
          icon: Icons.task_alt_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({
    required this.label,
    required this.hint,
    required this.submitLabel,
    required this.requiredReason,
  });

  final String label;
  final String hint;
  final String submitLabel;
  final bool requiredReason;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = _controller.text.trim();
    if (widget.requiredReason && value.length < 3) {
      setState(() => _error = 'Tell the customer why (at least 3 letters).');
      return;
    }
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppField(
          label: widget.label,
          controller: _controller,
          hint: widget.hint,
          maxLines: 3,
          maxLength: 500,
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              color: AppColors.clay,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 16),
        AppButton(
          key: const Key('booking_reason_submit'),
          label: widget.submitLabel,
          variant: AppButtonVariant.danger,
          onPressed: _submit,
        ),
      ],
    );
  }
}
