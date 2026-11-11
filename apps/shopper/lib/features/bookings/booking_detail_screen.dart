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
import 'bookings_controller.dart';

/// One service booking: the offer to answer, the address, the chat, the
/// history, and the review once the job is confirmed. Actions are only offered
/// where the server accepts them; the backend stays authoritative.
class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<BookingDetailScreen> createState() =>
      _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  String? _busyAction;

  Future<void> _refresh() async {
    ref.invalidate(bookingDetailProvider(widget.bookingId));
    try {
      await ref.read(bookingDetailProvider(widget.bookingId).future);
    } catch (_) {
      // The provider's error state already explains the failure.
    }
  }

  Future<void> _run(
    String action,
    Future<ServiceBooking> Function() work,
    String success,
  ) async {
    if (_busyAction != null) return;
    setState(() => _busyAction = action);
    try {
      await work();
      if (!mounted) return;
      ref.invalidate(bookingDetailProvider(widget.bookingId));
      showAppSnack(context, success);
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'That did not go through. Try again.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busyAction = null);
    }
  }

  Future<void> _accept(ServiceBooking booking) async {
    final proposal = booking.activeProposal;
    if (proposal == null) return;
    final confirmed = await confirmAction(
      context,
      title: 'Accept this offer?',
      message:
          '${formatMoney(proposal.price)} for '
          '${formatDateTime(proposal.scheduledStart)}. The provider will be '
          'told the job is booked.',
      confirmLabel: 'Accept offer',
    );
    if (!confirmed || !mounted) return;
    await _run(
      'accept',
      () =>
          ref.read(shopperRepositoryProvider).acceptBookingProposal(booking.id),
      'Offer accepted. Your booking is scheduled.',
    );
  }

  Future<void> _decline(ServiceBooking booking) async {
    final confirmed = await confirmAction(
      context,
      title: 'Decline this offer?',
      message:
          'The provider will be told. You can ask for another time from their '
          'page afterwards.',
      confirmLabel: 'Decline offer',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await _run(
      'decline',
      () => ref
          .read(shopperRepositoryProvider)
          .declineBookingProposal(booking.id),
      'Offer declined.',
    );
  }

  Future<void> _confirm(ServiceBooking booking) async {
    final confirmed = await confirmAction(
      context,
      title: 'Confirm the job is done?',
      message:
          'This confirms the job is finished and the final amount of '
          '${formatMoney(booking.finalAmount ?? booking.headlinePrice)}. If '
          'something is wrong, report a problem instead.',
      confirmLabel: 'Yes, confirm',
    );
    if (!confirmed || !mounted) return;
    await _run(
      'confirm',
      () =>
          ref.read(shopperRepositoryProvider).confirmServiceBooking(booking.id),
      'Booking confirmed. Thank you.',
    );
  }

  Future<void> _dispute(ServiceBooking booking) async {
    final reason = await _askReason(
      title: 'What went wrong?',
      subtitle: 'CityCart will look at this booking and contact both sides.',
      hint: 'Describe the problem with the job or the final amount.',
      minLength: 5,
      maxLength: 1000,
      confirmLabel: 'Send report',
    );
    if (reason == null || !mounted) return;
    await _run(
      'dispute',
      () => ref
          .read(shopperRepositoryProvider)
          .disputeServiceBooking(booking.id, reason: reason),
      'Your report was sent. CityCart will review it.',
    );
  }

  Future<void> _cancel(ServiceBooking booking) async {
    final confirmed = await confirmAction(
      context,
      title: 'Cancel this booking?',
      message:
          'The provider will be told. If they already accepted, the '
          'cancellation is recorded as late.',
      confirmLabel: 'Continue',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    final reason = await _askReason(
      title: 'Why are you cancelling?',
      subtitle: 'The provider sees this reason.',
      hint: 'For example: plans changed, or the time no longer works.',
      minLength: 3,
      maxLength: 500,
      confirmLabel: 'Cancel booking',
    );
    if (reason == null || !mounted) return;
    await _run(
      'cancel',
      () => ref
          .read(shopperRepositoryProvider)
          .cancelServiceBooking(booking.id, reason: reason),
      'Your booking was cancelled.',
    );
  }

  Future<String?> _askReason({
    required String title,
    String? subtitle,
    required String hint,
    required int minLength,
    required int maxLength,
    required String confirmLabel,
  }) async {
    final controller = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final result = await showAppSheet<String>(
      context,
      title: title,
      subtitle: subtitle,
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: controller,
              autofocus: true,
              minLines: 3,
              maxLines: 5,
              maxLength: maxLength,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(hintText: hint, counterText: ''),
              validator: (value) {
                final trimmed = (value ?? '').trim();
                if (trimmed.length < minLength) {
                  return 'Please write at least $minLength characters.';
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            AppButton(
              label: confirmLabel,
              onPressed: () {
                if (formKey.currentState?.validate() ?? false) {
                  Navigator.of(context).pop(controller.text.trim());
                }
              },
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return result;
  }

  void _openChat(ServiceBooking booking) {
    final uri = Uri(
      // Booking chat routes are addressed by the booking id.
      path: '/messages/job/${booking.id}',
      queryParameters: {
        'name': booking.provider?.displayName ?? 'Provider',
        'subtitle': booking.bookingNumber,
      },
    );
    context.push(uri.toString());
  }

  void _bookAgain(ServiceBooking booking) {
    final slug = booking.provider?.slug ?? '';
    if (slug.isEmpty) return;
    final uri = Uri(
      path: '/services/provider/$slug/book',
      queryParameters: {'offering': booking.offering.id},
    );
    context.push(uri.toString());
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(bookingDetailProvider(widget.bookingId));
    final booking = detail.asData?.value;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Booking',
              subtitle: booking?.bookingNumber,
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/bookings');
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
      bottomNavigationBar: booking != null && booking.canMessage
          ? BottomActionBar(
              child: AppButton(
                label: 'Message ${booking.provider?.displayName ?? 'provider'}',
                icon: Icons.chat_bubble_outline_rounded,
                onPressed: () => _openChat(booking),
              ),
            )
          : null,
    );
  }

  Widget _buildBody(ServiceBooking booking) {
    final busy = _busyAction != null;
    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
        children: [
          _HeaderCard(booking: booking),
          if (booking.status == 'PROPOSED' &&
              booking.activeProposal != null) ...[
            const SizedBox(height: 16),
            _OfferCard(
              booking: booking,
              proposal: booking.activeProposal!,
              busyAction: _busyAction,
              onAccept: () => _accept(booking),
              onDecline: () => _decline(booking),
            ),
          ],
          if (booking.status == 'COMPLETED') ...[
            const SizedBox(height: 16),
            _CompletionCard(
              booking: booking,
              busyAction: _busyAction,
              onConfirm: () => _confirm(booking),
              onDispute: () => _dispute(booking),
            ),
          ],
          if (booking.status == 'REQUESTED') ...[
            const SizedBox(height: 16),
            NoticeCard(
              icon: Icons.schedule_rounded,
              tone: StatusTone.info,
              title: 'Waiting for the provider',
              message:
                  'The provider will send a price and time for this visit. '
                  'Their answer appears here, and you can accept or decline it.',
            ),
          ],
          if (booking.status == 'ACCEPTED') ...[
            const SizedBox(height: 16),
            NoticeCard(
              icon: Icons.event_available_rounded,
              tone: StatusTone.sage,
              title: 'Scheduled',
              message:
                  'The provider is booked'
                  '${booking.scheduledStart == null ? '.' : ' for ${formatDateTime(booking.scheduledStart)}.'} '
                  'Message them here if you need to change anything.',
            ),
          ],
          if (booking.status == 'IN_PROGRESS') ...[
            const SizedBox(height: 16),
            const NoticeCard(
              icon: Icons.handyman_outlined,
              tone: StatusTone.clay,
              title: 'The job is in progress',
              message:
                  'The provider has started. When they finish, you will be '
                  'asked to confirm the final amount.',
            ),
          ],
          if (booking.status == 'CONFIRMED') ...[
            const SizedBox(height: 16),
            const NoticeCard(
              icon: Icons.verified_rounded,
              tone: StatusTone.sage,
              title: 'Job completed',
              message:
                  'You confirmed this booking. Your review helps other '
                  'shoppers choose well.',
            ),
            const SizedBox(height: 20),
            _ReviewSection(booking: booking),
          ],
          if (booking.status == 'CANCELLED' &&
              booking.cancellation != null) ...[
            const SizedBox(height: 16),
            _CancelledCard(cancellation: booking.cancellation!),
          ],
          if (booking.status == 'DECLINED') ...[
            const SizedBox(height: 16),
            // The provider declining a request and the customer declining an
            // offer share the same status but mean opposite things.
            if (booking.cancellation != null)
              NoticeCard(
                icon: Icons.event_busy_outlined,
                tone: StatusTone.muted,
                title: 'The provider declined this request',
                message: [
                  'You can ask another provider, or try this one again later.',
                  if (booking.cancellation!.reason.trim().isNotEmpty)
                    'Reason: ${booking.cancellation!.reason.trim()}',
                ].join('\n'),
              )
            else
              const NoticeCard(
                icon: Icons.event_busy_outlined,
                tone: StatusTone.muted,
                title: 'Offer declined',
                message:
                    'You declined the provider’s offer. You can ask for '
                    'another time from their page.',
              ),
          ],
          if (booking.status == 'DISPUTED') ...[
            const SizedBox(height: 16),
            NoticeCard(
              icon: Icons.report_gmailerrorred_rounded,
              tone: StatusTone.danger,
              title: 'CityCart is reviewing this booking',
              message: booking.dispute?.reason.isNotEmpty == true
                  ? 'Your report: ${booking.dispute!.reason}'
                  : 'We will contact you and the provider after looking at '
                        'this booking.',
            ),
          ],
          if (booking.address != null) ...[
            const SizedBox(height: 20),
            _AddressSection(
              address: booking.address!,
              providerPhone: booking.provider?.phone,
            ),
          ],
          if ((booking.note ?? '').isNotEmpty) ...[
            const SizedBox(height: 20),
            _NoteSection(note: booking.note!),
          ],
          if (booking.events.isNotEmpty) ...[
            const SizedBox(height: 20),
            _HistorySection(events: booking.events),
          ],
          if ((booking.status == 'CANCELLED' || booking.status == 'DECLINED') &&
              (booking.provider?.slug ?? '').isNotEmpty) ...[
            const SizedBox(height: 20),
            AppButton(
              label: 'Book this service again',
              icon: Icons.replay_rounded,
              variant: AppButtonVariant.outline,
              onPressed: () => _bookAgain(booking),
            ),
          ],
          if (booking.canCancel) ...[
            const SizedBox(height: 18),
            TextButton.icon(
              onPressed: busy ? null : () => _cancel(booking),
              icon: const Icon(Icons.close_rounded, size: 19),
              label: Text(busy ? 'Please wait…' : 'Cancel this booking'),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.danger,
                minimumSize: const Size(44, 48),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.booking});

  final ServiceBooking booking;

  String get _priceLabel {
    if (booking.finalAmount != null) return 'Final amount';
    if (booking.agreedPrice != null) return 'Agreed price';
    return 'Starting from';
  }

  @override
  Widget build(BuildContext context) {
    final provider = booking.provider;
    final when = booking.whenStart;
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  booking.offering.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 126),
                child: StatusPill(
                  text: friendlyServiceBooking(booking.status),
                  tone: toneForServiceBooking(booking.status),
                  compact: true,
                ),
              ),
            ],
          ),
          if (provider != null) ...[
            const SizedBox(height: 10),
            InkWell(
              onTap: provider.slug.isEmpty
                  ? null
                  : () => context.push('/services/provider/${provider.slug}'),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    BrandLogo(
                      name: provider.displayName,
                      url: provider.avatar,
                      size: 34,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        provider.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                    if (provider.slug.isNotEmpty)
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 19,
                        color: AppColors.muted,
                      ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 8),
          InfoRow(
            label: 'When',
            value: when == null ? 'Time to be agreed' : formatDateTime(when),
          ),
          InfoRow(
            label: _priceLabel,
            value: formatMoney(booking.headlinePrice),
            strong: true,
          ),
        ],
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
    required this.booking,
    required this.proposal,
    required this.busyAction,
    required this.onAccept,
    required this.onDecline,
  });

  final ServiceBooking booking;
  final ServiceBookingProposal proposal;
  final String? busyAction;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final busy = busyAction != null;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.goldSoft,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(
          color: AppColors.gold.withValues(alpha: 0.4),
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
                Icons.local_offer_outlined,
                size: 22,
                color: AppColors.goldInk,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  'Offer from '
                  '${booking.provider?.displayName ?? 'the provider'}',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: AppColors.goldInk),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          MoneyText(
            formatMoney(proposal.price),
            size: 28,
            align: TextAlign.left,
            color: AppColors.ink,
          ),
          if (proposal.scope.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(proposal.scope, style: Theme.of(context).textTheme.bodyMedium),
          ],
          const SizedBox(height: 10),
          InfoRow(
            label: 'When',
            value: formatDateTime(proposal.scheduledStart),
          ),
          if (booking.offering.durationMinutes > 0)
            InfoRow(
              label: 'Job length',
              value: formatDurationMinutes(booking.offering.durationMinutes),
            ),
          if (proposal.expiresAt != null) ...[
            const SizedBox(height: 4),
            Text(
              'Answer by ${formatDateTime(proposal.expiresAt)}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.goldInk,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 14),
          AppButton(
            label: 'Accept offer',
            icon: Icons.check_rounded,
            height: 50,
            loading: busyAction == 'accept',
            onPressed: busy ? null : onAccept,
          ),
          const SizedBox(height: 8),
          AppButton(
            label: 'Decline offer',
            variant: AppButtonVariant.outline,
            height: 50,
            loading: busyAction == 'decline',
            onPressed: busy ? null : onDecline,
          ),
        ],
      ),
    );
  }
}

class _CompletionCard extends StatelessWidget {
  const _CompletionCard({
    required this.booking,
    required this.busyAction,
    required this.onConfirm,
    required this.onDispute,
  });

  final ServiceBooking booking;
  final String? busyAction;
  final VoidCallback onConfirm;
  final VoidCallback onDispute;

  @override
  Widget build(BuildContext context) {
    final busy = busyAction != null;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.sage,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(
          color: AppColors.sageInk.withValues(alpha: 0.28),
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
                Icons.task_alt_rounded,
                size: 22,
                color: AppColors.sageInk,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  'The job is done',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: AppColors.sageInk),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            (booking.completionNote ?? '').isNotEmpty
                ? booking.completionNote!
                : 'The provider marked this job complete. Check the final '
                      'amount and confirm.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 10),
          InfoRow(
            label: 'Final amount',
            value: formatMoney(booking.finalAmount ?? booking.headlinePrice),
            strong: true,
          ),
          if (booking.autoConfirmAt != null) ...[
            const SizedBox(height: 4),
            Text(
              'If you do nothing, this confirms on '
              '${formatDateTime(booking.autoConfirmAt)}.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 14),
          AppButton(
            label: 'Confirm and finish',
            icon: Icons.verified_rounded,
            height: 50,
            loading: busyAction == 'confirm',
            onPressed: busy ? null : onConfirm,
          ),
          const SizedBox(height: 8),
          AppButton(
            label: 'Report a problem',
            icon: Icons.flag_outlined,
            variant: AppButtonVariant.outline,
            height: 50,
            loading: busyAction == 'dispute',
            onPressed: busy ? null : onDispute,
          ),
        ],
      ),
    );
  }
}

class _CancelledCard extends StatelessWidget {
  const _CancelledCard({required this.cancellation});

  final ServiceBookingCancellation cancellation;

  @override
  Widget build(BuildContext context) {
    final who = friendlyCancelledBy(cancellation.by);
    final when = cancellation.at == null
        ? ''
        : ' on ${formatDateTime(cancellation.at)}';
    final reason = cancellation.reason.trim();
    return NoticeCard(
      icon: Icons.cancel_outlined,
      tone: StatusTone.muted,
      title: cancellation.by == 'CUSTOMER'
          ? 'You cancelled this booking'
          : 'Booking cancelled',
      message: [
        '$who cancelled this booking$when.',
        if (reason.isNotEmpty) 'Reason: $reason',
        if (cancellation.late)
          'This was after the provider accepted, so it is recorded as a late '
              'cancellation.',
      ].join('\n'),
    );
  }
}

class _AddressSection extends StatelessWidget {
  const _AddressSection({required this.address, this.providerPhone});

  final ServiceBookingAddress address;
  final String? providerPhone;

  @override
  Widget build(BuildContext context) {
    final phone = (providerPhone ?? '').trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Where the job happens'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                address.fullName.isEmpty ? 'Job address' : address.fullName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (address.phone.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  address.phone,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 6),
              Text(address.addressLine),
              if (address.placeLine.isNotEmpty)
                Text(
                  address.placeLine,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              if (phone.isNotEmpty) ...[
                const SizedBox(height: 10),
                const Divider(),
                InfoRow(label: 'Provider phone', value: phone),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _NoteSection extends StatelessWidget {
  const _NoteSection({required this.note});

  final String note;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Your note'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Text(note, style: Theme.of(context).textTheme.bodyMedium),
        ),
      ],
    );
  }
}

class _HistorySection extends StatelessWidget {
  const _HistorySection({required this.events});

  final List<ServiceBookingEvent> events;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Updates'),
        const SizedBox(height: 10),
        SurfaceCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < events.length; i++) ...[
                if (i > 0) const Divider(),
                _EventRow(event: events[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});

  final ServiceBookingEvent event;

  @override
  Widget build(BuildContext context) {
    final danger = event.type == 'CANCELLED' || event.type == 'DISPUTED';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(top: 5),
            decoration: BoxDecoration(
              color: danger ? AppColors.danger : AppColors.forest,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  friendlyServiceEvent(event.type),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                if ((event.note ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    event.note!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatShortDate(event.at),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _ReviewSection extends ConsumerStatefulWidget {
  const _ReviewSection({required this.booking});

  final ServiceBooking booking;

  @override
  ConsumerState<_ReviewSection> createState() => _ReviewSectionState();
}

class _ReviewSectionState extends ConsumerState<_ReviewSection> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating == 0 || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref
          .read(shopperRepositoryProvider)
          .createBookingReview(
            widget.booking.id,
            rating: _rating,
            comment: _comment.text,
          );
      if (!mounted) return;
      ref.invalidate(bookingDetailProvider(widget.booking.id));
      showAppSnack(context, 'Thanks for reviewing this service.');
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Your review did not send. Try again.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final review = widget.booking.review;
    if (review != null) return _PostedReview(review: review);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'How was the service?',
          subtitle: 'Your review helps other shoppers choose well.',
        ),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  for (var star = 1; star <= 5; star++)
                    IconButton(
                      onPressed: _submitting
                          ? null
                          : () => setState(() => _rating = star),
                      tooltip: '$star star${star == 1 ? '' : 's'}',
                      icon: Icon(
                        star <= _rating
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 30,
                        color: star <= _rating
                            ? AppColors.gold
                            : AppColors.lineStrong,
                      ),
                    ),
                ],
              ),
              if (_rating == 0)
                Padding(
                  padding: const EdgeInsets.only(top: 2, bottom: 6),
                  child: Text(
                    'Tap a star to rate the visit.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              const SizedBox(height: 6),
              TextField(
                controller: _comment,
                minLines: 3,
                maxLines: 5,
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Tell others about the visit (optional)',
                  counterText: '',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: AppColors.danger),
                ),
              ],
              const SizedBox(height: 12),
              AppButton(
                label: 'Post review',
                icon: Icons.star_outline_rounded,
                height: 50,
                loading: _submitting,
                onPressed: _rating == 0 || _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PostedReview extends StatelessWidget {
  const _PostedReview({required this.review});

  final ServiceReview review;

  @override
  Widget build(BuildContext context) {
    final reply = review.reply;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Your review'),
        const SizedBox(height: 10),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  StarRating(rating: review.rating.toDouble(), size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      review.createdAt == null
                          ? ''
                          : formatDate(review.createdAt),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
              if ((review.comment ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  review.comment!,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
              if (reply != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.sage,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Reply from the provider',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.sageInk,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        reply.body,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.error, required this.onRetry});

  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      children: [
        ErrorNotice(
          message: error is ApiException
              ? (error as ApiException).message
              : 'We could not open this booking. Check your connection.',
          onRetry: onRetry,
        ),
      ],
    );
  }
}
