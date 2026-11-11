import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'bookings_controller.dart';

/// Every service booking, newest first. Each card makes the next step obvious:
/// answer an offer, confirm a finished job, or open the chat with the provider.
class BookingsScreen extends ConsumerWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(bookingsProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Your bookings',
              subtitle: 'At-home services',
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/services');
                }
              },
            ),
            Expanded(
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) {
                  if (controller.loading && controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [LoadingList(count: 3)],
                    );
                  }
                  if (controller.error != null && controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                      children: [
                        ErrorNotice(
                          message: controller.error!,
                          onRetry: controller.refresh,
                        ),
                      ],
                    );
                  }
                  if (controller.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 24),
                        EmptyState(
                          icon: Icons.event_available_outlined,
                          title: 'No bookings yet',
                          message:
                              'When you ask a service provider for a visit, '
                              'their answer and the job details appear here.',
                          action: AppButton(
                            label: 'Find a service',
                            icon: Icons.home_repair_service_rounded,
                            expand: false,
                            onPressed: () => context.go('/services'),
                          ),
                        ),
                      ],
                    );
                  }

                  final items = controller.items;
                  final showFooter =
                      controller.hasMore ||
                      controller.error != null ||
                      controller.loadingMore;
                  return RefreshIndicator(
                    color: AppColors.forest,
                    onRefresh: controller.refresh,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                      itemCount: items.length + (showFooter ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == items.length) {
                          return _Footer(controller: controller);
                        }
                        final booking = items[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _BookingCard(
                            booking: booking,
                            onTap: () async {
                              await context.push('/bookings/${booking.id}');
                              if (context.mounted) controller.refresh();
                            },
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.controller});

  final BookingsController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (controller.error != null) ...[
            ErrorNotice(
              message: controller.error!,
              onRetry: controller.refresh,
            ),
            const SizedBox(height: 12),
          ],
          if (controller.hasMore)
            AppButton(
              label: 'Load more bookings',
              icon: Icons.expand_more_rounded,
              variant: AppButtonVariant.outline,
              loading: controller.loadingMore,
              onPressed: controller.loadingMore ? null : controller.loadMore,
            )
          else
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                controller.pagination.total > 0
                    ? '${plural(controller.pagination.total, 'booking')} in total.'
                    : '',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking, required this.onTap});

  final ServiceBooking booking;
  final VoidCallback onTap;

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
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
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
                    booking.offering.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
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
          const SizedBox(height: 9),
          Row(
            children: [
              BrandLogo(
                name: provider?.displayName ?? 'Provider',
                url: provider?.avatar,
                size: 30,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  provider?.displayName ?? 'Service provider',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          if (when != null) ...[
            const SizedBox(height: 7),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.event_outlined,
                  size: 16,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    formatDateTime(when),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
          ],
          if (booking.needsAnswer) ...[
            const SizedBox(height: 9),
            Row(
              children: [
                const Icon(
                  Icons.priority_high_rounded,
                  size: 16,
                  color: AppColors.goldInk,
                ),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    'Waiting for your answer',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.goldInk,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _priceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 1),
                    MoneyText(
                      formatMoney(booking.headlinePrice),
                      size: 15.5,
                      align: TextAlign.left,
                    ),
                  ],
                ),
              ),
              if (booking.unread > 0) ...[
                const SizedBox(width: 8),
                Pill(
                  text: '${booking.unread} new',
                  background: AppColors.claySoft,
                  foreground: AppColors.clay,
                  icon: Icons.chat_bubble_rounded,
                ),
              ],
              const SizedBox(width: 4),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
