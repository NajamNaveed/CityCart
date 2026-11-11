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

class _BookingFilter {
  const _BookingFilter(this.label, this.status);

  final String label;
  final String? status;
}

const _filters = [
  _BookingFilter('All', null),
  _BookingFilter('New', 'REQUESTED'),
  _BookingFilter('Scheduled', 'ACCEPTED'),
  _BookingFilter('In progress', 'IN_PROGRESS'),
  _BookingFilter('Awaiting', 'COMPLETED'),
  _BookingFilter('Done', 'CONFIRMED'),
];

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your bookings. Check the connection and try again.';
}

String _whenLine(BusinessBooking booking) {
  final when = booking.whenStart;
  if (when == null) return 'Time not set';
  if (booking.scheduledStart != null) {
    return '${dayRelation(when)} · ${timeLabel(when)}';
  }
  return 'Requested ${dateTimeLabel(when)}';
}

String _placeLine(BusinessBooking booking) {
  final address = booking.address;
  if (address == null) return 'Address not shared';
  final area = address.areaLabel;
  return area.isEmpty ? address.addressLine : area;
}

/// The provider's work inbox. One list, six plain filters, and a card that
/// answers three questions: who, when and how much.
class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});

  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  var _filterIndex = 0;
  var _items = const <BusinessBooking>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  var _request = 0;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({bool reset = true}) async {
    final token = ++_request;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      setState(() => _loadingMore = true);
    }

    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .providerBookings(
            status: _filters[_filterIndex].status,
            page: reset ? 1 : _pagination.page + 1,
          );
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _pagination = page.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted || token != _request) return;
      final message = _errorSentence(error);
      setState(() {
        _loading = false;
        _loadingMore = false;
        if (reset) _error = message;
      });
      if (!reset) showAppSnack(context, message, error: true);
    }
  }

  void _selectFilter(int index) {
    if (index == _filterIndex) return;
    setState(() => _filterIndex = index);
    _load();
  }

  Future<void> _open(BusinessBooking booking) async {
    await context.push('/bookings/${booking.id}', extra: booking);
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isProvider) {
      return const _ProviderOnly();
    }

    return RefreshIndicator(
      onRefresh: () => _load(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          const PageHeader(
            eyebrow: 'Service provider',
            title: 'Bookings',
            subtitle: 'Requests, scheduled visits and finished jobs.',
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 42,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              itemCount: _filters.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final filter = _filters[index];
                return _FilterPill(
                  key: Key(
                    'booking_filter_${index == 0 ? 'all' : filter.status!.toLowerCase()}',
                  ),
                  label: filter.label,
                  selected: index == _filterIndex,
                  onTap: () => _selectFilter(index),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: _content(),
          ),
        ],
      ),
    );
  }

  Widget _content() {
    if (_loading) return const LoadingView(label: 'Loading bookings');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      return EmptyPanel(
        icon: Icons.event_available_outlined,
        title: _emptyTitle,
        message: _emptyMessage,
        action: _filterIndex == 0
            ? null
            : AppButton(
                label: 'Show all bookings',
                variant: AppButtonVariant.outline,
                onPressed: () => _selectFilter(0),
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _BookingCard(
            key: Key('booking_card_${_items[i].id}'),
            booking: _items[i],
            onTap: () => _open(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more bookings',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }

  String get _emptyTitle => switch (_filters[_filterIndex].status) {
    null => 'No bookings yet',
    'REQUESTED' => 'No new requests',
    'ACCEPTED' => 'No scheduled jobs',
    'IN_PROGRESS' => 'Nothing in progress',
    'COMPLETED' => 'Nothing waiting',
    'CONFIRMED' => 'No finished jobs yet',
    _ => 'Nothing here',
  };

  String get _emptyMessage => switch (_filters[_filterIndex].status) {
    null =>
      'When a customer requests one of your services, the request appears '
          'here.',
    'REQUESTED' =>
      'You have answered every request. New ones will appear here.',
    'ACCEPTED' =>
      'Accept a request and it moves here with its time and address.',
    'IN_PROGRESS' =>
      'Start a scheduled job and it stays here until you complete it.',
    'COMPLETED' =>
      'Finished jobs wait here while the customer confirms the work.',
    'CONFIRMED' => 'Confirmed jobs are kept here with their final amount.',
    _ => 'Try another filter.',
  };
}

class _ProviderOnly extends StatelessWidget {
  const _ProviderOnly();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 30),
      children: const [
        PageHeader(
          eyebrow: 'Bookings',
          title: 'For service providers',
          subtitle: 'Shop accounts manage orders, not service bookings.',
        ),
        SizedBox(height: 20),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
          child: EmptyPanel(
            icon: Icons.storefront_outlined,
            title: 'This is a service business screen',
            message:
                'Service bookings belong to provider accounts. Your shop '
                'orders will arrive in a later update.',
          ),
        ),
      ],
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.forest : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        side: BorderSide(color: selected ? AppColors.forest : AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              height: 1.2,
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.white : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({super.key, required this.booking, required this.onTap});

  final BusinessBooking booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StatusTag(
                label: bookingStatusLabel(booking.status),
                tone: bookingStatusTone(booking.status),
              ),
              const Spacer(),
              if (booking.unread > 0) ...[
                _UnreadPill(count: booking.unread),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  booking.bookingNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: text.labelSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          Text(
            booking.customerName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.titleMedium,
          ),
          const SizedBox(height: 2),
          Text(
            booking.offering.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.bodySmall,
          ),
          const SizedBox(height: 11),
          _CardLine(icon: Icons.schedule_rounded, text: _whenLine(booking)),
          const SizedBox(height: 5),
          _CardLine(icon: Icons.place_outlined, text: _placeLine(booking)),
          if (booking.customerOfferPaisa != null) ...[
            const SizedBox(height: 5),
            _CardLine(
              icon: Icons.sell_outlined,
              text: 'Customer offered ${money(booking.customerOfferPaisa)}',
              tint: AppColors.amber,
            ),
          ],
          const SizedBox(height: 13),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      money(booking.headlinePricePaisa),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleMedium?.copyWith(
                        color: AppColors.forestInk,
                        fontSize: 17,
                      ),
                    ),
                    Text(
                      booking.priceCaption,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.labelSmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Open',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  color: AppColors.forest,
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.forest,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardLine extends StatelessWidget {
  const _CardLine({required this.icon, required this.text, this.tint});

  final IconData icon;
  final String text;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: tint ?? AppColors.muted),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: tint ?? AppColors.inkSoft,
              fontWeight: tint == null ? FontWeight.w500 : FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _UnreadPill extends StatelessWidget {
  const _UnreadPill({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.forest,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        count > 9 ? '9+' : '$count',
        textAlign: TextAlign.center,
        maxLines: 1,
        style: const TextStyle(
          fontSize: 11,
          height: 1.3,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
        ),
      ),
    );
  }
}
