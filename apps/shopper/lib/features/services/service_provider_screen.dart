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
import 'service_slots.dart';
import 'service_widgets.dart';

/// The published provider page: who they are, what they offer, when they work
/// and what customers said. The pin, phone and street address are never shown.
class ServiceProviderScreen extends ConsumerWidget {
  const ServiceProviderScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = ref.watch(serviceProviderProvider(slug));

    return provider.when(
      loading: () => Scaffold(
        body: SafeArea(
          child: Column(
            children: const [
              ScreenTopBar(title: 'Service provider'),
              Expanded(child: LoadingList(count: 2)),
            ],
          ),
        ),
      ),
      error: (error, stack) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              const ScreenTopBar(title: 'Service provider'),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: ErrorNotice(
                  message: error is ApiException
                      ? error.message
                      : 'We could not open this provider. Check your '
                            'connection.',
                  onRetry: () => ref.invalidate(serviceProviderProvider(slug)),
                ),
              ),
            ],
          ),
        ),
      ),
      data: (provider) => _ProviderPage(provider: provider),
    );
  }
}

class _ProviderPage extends StatelessWidget {
  const _ProviderPage({required this.provider});

  final ServiceProvider provider;

  bool get _canBook =>
      provider.acceptingNewOrders && provider.offerings.isNotEmpty;

  void _book(BuildContext context, {String? offeringId}) {
    final query = offeringId == null ? '' : '?offering=$offeringId';
    context.push('/services/provider/${provider.slug}/book$query');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: 28),
          children: [
            ScreenTopBar(
              title: provider.displayName,
              subtitle: [
                provider.categoryName,
                provider.placeLabel,
              ].where((value) => value.isNotEmpty).join(' • '),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: ServiceCover(url: provider.coverImage),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BrandLogo(
                    name: provider.displayName,
                    url: provider.avatar,
                    size: 62,
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          provider.displayName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        if (provider.placeLabel.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            provider.placeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: 7),
                        if (provider.hasRating)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              StarRating(rating: provider.ratingAvg, size: 15),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  '${provider.ratingAvg.toStringAsFixed(1)} · '
                                  '${provider.ratingCount} reviews',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkSoft,
                                  ),
                                ),
                              ),
                            ],
                          )
                        else
                          const StatusPill(
                            text: 'New on CityCart',
                            tone: StatusTone.info,
                            compact: true,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusPill(
                    text: provider.acceptingNewOrders
                        ? 'Taking requests'
                        : 'Not taking requests',
                    tone: provider.acceptingNewOrders
                        ? StatusTone.sage
                        : StatusTone.muted,
                    compact: true,
                  ),
                  if (provider.completedBookings > 0)
                    Pill(
                      text: '${plural(provider.completedBookings, 'job')} done',
                      background: AppColors.goldSoft,
                      foreground: AppColors.goldInk,
                      icon: Icons.task_alt_rounded,
                    ),
                ],
              ),
            ),
            if (provider.bio != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                child: Text(
                  provider.bio!,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: _MessageProviderButton(provider: provider),
            ),
            if (!provider.acceptingNewOrders)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: const NoticeCard(
                  title: 'Not taking new requests',
                  message:
                      'This provider is paused right now. You can still read '
                      'about them and look at their services.',
                  icon: Icons.pause_circle_outline_rounded,
                  tone: StatusTone.info,
                ),
              ),
            const SizedBox(height: 24),
            if (provider.offerings.isNotEmpty)
              _OfferingsSection(provider: provider, onBook: _book)
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: const NoticeCard(
                  title: 'No services listed yet',
                  message:
                      'This provider has not published a service to request '
                      'yet. Check back soon.',
                  icon: Icons.inventory_2_outlined,
                  tone: StatusTone.info,
                ),
              ),
            const SizedBox(height: 24),
            _HoursSection(availability: provider.availability),
            const SizedBox(height: 24),
            _ReviewsSection(provider: provider),
          ],
        ),
      ),
      bottomNavigationBar: BottomActionBar(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Starting from',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 2),
                  MoneyText(
                    formatMoney(provider.startingAtPrice),
                    size: 18,
                    align: TextAlign.left,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: AppButton(
                label: _canBook
                    ? 'Request a booking'
                    : provider.acceptingNewOrders
                    ? 'No services listed'
                    : 'Not taking requests',
                icon: Icons.event_available_rounded,
                onPressed: _canBook ? () => _book(context) : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferingsSection extends StatelessWidget {
  const _OfferingsSection({required this.provider, required this.onBook});

  final ServiceProvider provider;
  final void Function(BuildContext context, {String? offeringId}) onBook;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            title: 'Services offered',
            subtitle: plural(provider.offerings.length, 'service'),
          ),
          const SizedBox(height: 12),
          for (final offering in provider.offerings)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                padding: const EdgeInsets.all(14),
                onTap: provider.acceptingNewOrders
                    ? () => onBook(context, offeringId: offering.id)
                    : null,
                child: Row(
                  children: [
                    ProductThumb(
                      url: offering.image,
                      size: 56,
                      icon: Icons.home_repair_service_outlined,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offering.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              formatDurationMinutes(offering.durationMinutes),
                              'From ${formatMoney(offering.startingAtPrice)}',
                            ].join(' • '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    if (provider.acceptingNewOrders) ...[
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.chevron_right_rounded,
                        color: AppColors.muted,
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HoursSection extends StatelessWidget {
  const _HoursSection({required this.availability});

  final ServiceAvailability availability;

  static const _days = [1, 2, 3, 4, 5, 6, 0];

  String _dayName(int weekday) {
    for (final window in availability.windows) {
      if (window.weekday == weekday) return window.weekdayName;
    }
    const names = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return names[weekday];
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'Working hours'),
          const SizedBox(height: 10),
          if (!availability.isPublished)
            const NoticeCard(
              title: 'Hours not listed yet',
              message:
                  'This provider has not published weekly hours. Pick any '
                  'future time that suits you and they can accept it or '
                  'suggest another.',
              icon: Icons.schedule_rounded,
              tone: StatusTone.info,
            )
          else
            SurfaceCard(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
              child: Column(
                children: [
                  for (final day in _days)
                    _DayHours(
                      name: _dayName(day).length >= 3
                          ? _dayName(day).substring(0, 3)
                          : _dayName(day),
                      windows: availability.windows
                          .where((window) => window.weekday == day)
                          .map(
                            (window) => formatKarachiWindow(
                              window.startMinute,
                              window.endMinute,
                            ),
                          )
                          .toList(growable: false),
                    ),
                  if (availability.blackoutDates.isNotEmpty) ...[
                    const Divider(),
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.event_busy_outlined,
                            size: 17,
                            color: AppColors.muted,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Also closed on '
                              '${plural(availability.blackoutDates.length, 'chosen date')}.',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _DayHours extends StatelessWidget {
  const _DayHours({required this.name, required this.windows});

  final String name;
  final List<String> windows;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 46,
            child: Text(
              name,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSoft,
              ),
            ),
          ),
          Expanded(
            child: Text(
              windows.isEmpty ? 'Closed' : windows.join('\n'),
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.45,
                fontWeight: windows.isEmpty ? FontWeight.w400 : FontWeight.w500,
                color: windows.isEmpty ? AppColors.muted : AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewsSection extends StatelessWidget {
  const _ReviewsSection({required this.provider});

  final ServiceProvider provider;

  @override
  Widget build(BuildContext context) {
    final reviews = provider.reviews;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            title: 'Reviews',
            subtitle: reviews.isEmpty ? null : plural(reviews.length, 'review'),
          ),
          const SizedBox(height: 10),
          if (reviews.isEmpty)
            SurfaceCard(
              child: Text(
                'No reviews yet. They appear after a booking is confirmed.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            )
          else ...[
            SurfaceCard(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Text(
                    provider.ratingAvg.toStringAsFixed(1),
                    style: Theme.of(context).textTheme.displayMedium,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        StarRating(rating: provider.ratingAvg, size: 17),
                        const SizedBox(height: 3),
                        Text(
                          plural(provider.ratingCount, 'review'),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            for (final review in reviews)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ReviewCard(review: review),
              ),
          ],
        ],
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final ServiceReview review;

  @override
  Widget build(BuildContext context) {
    final name = review.reviewerName ?? 'CityCart shopper';
    return SurfaceCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Avatar(name: name, size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (review.createdAt != null)
                      Text(
                        formatShortDate(review.createdAt),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StarRating(rating: review.rating.toDouble(), size: 14),
            ],
          ),
          if (review.serviceTitle != null) ...[
            const SizedBox(height: 10),
            Text(
              review.serviceTitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (review.comment != null) ...[
            const SizedBox(height: 6),
            Text(
              review.comment!,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          if (review.reply != null) ...[
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
                    style: Theme.of(context).textTheme.labelSmall
                        ?.copyWith(color: AppColors.sageInk),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    review.reply!.body,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: AppColors.sageInk),
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

/// Opens (or reopens) the shopper's direct chat with this provider. The server
/// owns the conversation id; the app only sends the provider id.
class _MessageProviderButton extends ConsumerStatefulWidget {
  const _MessageProviderButton({required this.provider});

  final ServiceProvider provider;

  @override
  ConsumerState<_MessageProviderButton> createState() =>
      _MessageProviderButtonState();
}

class _MessageProviderButtonState
    extends ConsumerState<_MessageProviderButton> {
  bool _busy = false;

  Future<void> _start() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref
          .read(shopperRepositoryProvider)
          .startDirectChat(widget.provider.id);
      if (!mounted) return;
      final uri = Uri(
        path: '/messages/provider/${result.conversationId}',
        queryParameters: {
          'name': result.providerName,
          'subtitle': 'Provider chat',
        },
      );
      context.push(uri.toString());
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'We could not open the chat. Try again.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppButton(
      label: 'Message provider',
      icon: Icons.chat_bubble_outline_rounded,
      variant: AppButtonVariant.outline,
      height: 48,
      loading: _busy,
      onPressed: _busy ? null : _start,
    );
  }
}
