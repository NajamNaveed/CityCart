import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'notifications_controller.dart';

/// Every update the shopper receives about an order, a service booking or a
/// payment, newest first. Opening one marks it read and goes to the thing it
/// is about; deleting it never touches that order or booking.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    // The account badge may have loaded this inbox earlier; re-read it when
    // the screen opens so the list and the badge agree.
    final controller = ref.read(notificationsProvider);
    if (!controller.loading) controller.refresh();
  }

  Future<void> _open(AppNotification notification) async {
    final controller = ref.read(notificationsProvider);
    final error = await controller.markRead(notification);
    if (!mounted) return;
    if (error != null) showAppSnack(context, error, error: true);

    final router = GoRouter.maybeOf(context);
    if (router == null) return;
    if (notification.orderId.isNotEmpty) {
      router.push('/orders/${notification.orderId}');
    } else if (notification.bookingId.isNotEmpty) {
      router.push('/bookings/${notification.bookingId}');
    }
  }

  Future<void> _delete(AppNotification notification) async {
    final error = await ref.read(notificationsProvider).remove(notification);
    if (!mounted) return;
    if (error != null) {
      showAppSnack(context, error, error: true);
    } else {
      showAppSnack(context, 'Notification removed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(notificationsProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ListenableBuilder(
              listenable: controller,
              builder: (context, _) => ScreenTopBar(
                title: 'Notifications',
                subtitle: controller.unreadCount == 0
                    ? 'You are all caught up'
                    : '${controller.unreadCount} unread',
                trailing: IconButton(
                  tooltip: 'Mark all as read',
                  onPressed: controller.unreadCount == 0 || controller.busy
                      ? null
                      : () async {
                          final error = await controller.markAllRead();
                          if (!context.mounted) return;
                          if (error != null) {
                            showAppSnack(context, error, error: true);
                          }
                        },
                  icon: const Icon(Icons.done_all_rounded),
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.surface,
                    side: const BorderSide(color: AppColors.line),
                    minimumSize: const Size(44, 44),
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) => _body(context, controller),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, NotificationsController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [LoadingList(count: 4)],
      );
    }

    if (controller.items.isEmpty) {
      return RefreshIndicator(
        color: AppColors.forest,
        onRefresh: controller.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
          children: [
            if (controller.error != null) ...[
              ErrorNotice(
                message: controller.error!,
                onRetry: controller.refresh,
              ),
              const SizedBox(height: 20),
            ],
            EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'Nothing new',
              message:
                  'Order updates, booking offers and payment news will appear '
                  'here.',
              action: AppButton(
                label: 'See your orders',
                icon: Icons.receipt_long_rounded,
                expand: false,
                onPressed: () => context.go('/orders'),
              ),
            ),
          ],
        ),
      );
    }

    final entries = _entriesFor(controller.items);
    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: controller.refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 2, 20, 28),
        itemCount: entries.length + 1,
        itemBuilder: (context, index) {
          if (index >= entries.length) {
            return _Footer(controller: controller);
          }
          final entry = entries[index];
          if (entry.day != null) {
            return Padding(
              padding: EdgeInsets.only(top: index == 0 ? 2 : 18, bottom: 8),
              child: SectionLabel(entry.day!),
            );
          }
          final item = entry.notification!;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _NotificationCard(
              notification: item,
              onTap: () => _open(item),
              onDelete: () => _delete(item),
            ),
          );
        },
      ),
    );
  }

  List<_NotificationEntry> _entriesFor(List<AppNotification> items) {
    final entries = <_NotificationEntry>[];
    String? lastDay;
    for (final item in items) {
      final day = item.createdAt == null
          ? 'Earlier'
          : formatDayLabel(item.createdAt!);
      if (day != lastDay) {
        entries.add(_NotificationEntry.day(day));
        lastDay = day;
      }
      entries.add(_NotificationEntry.item(item));
    }
    return entries;
  }
}

class _NotificationEntry {
  const _NotificationEntry._({this.day, this.notification});

  factory _NotificationEntry.day(String day) => _NotificationEntry._(day: day);

  factory _NotificationEntry.item(AppNotification notification) =>
      _NotificationEntry._(notification: notification);

  final String? day;
  final AppNotification? notification;
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onDelete,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final look = _lookFor(notification.type);
    final unread = !notification.isRead;
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 13, 8, 13),
      color: unread ? AppColors.sage : null,
      borderColor: unread ? AppColors.sageInk.withValues(alpha: 0.28) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: look.background,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(look.icon, size: 20, color: look.foreground),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: unread
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                            ),
                      ),
                    ),
                    if (unread) ...[
                      const SizedBox(width: 6),
                      const Padding(
                        padding: EdgeInsets.only(top: 6),
                        child: _UnreadDot(),
                      ),
                    ],
                  ],
                ),
                if (notification.message.trim().isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    notification.message,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 5),
                Text(
                  formatAge(notification.createdAt),
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: AppColors.muted),
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Notification options',
            padding: EdgeInsets.zero,
            icon: const Icon(
              Icons.more_vert_rounded,
              size: 19,
              color: AppColors.muted,
            ),
            onSelected: (value) {
              if (value == 'delete') onDelete();
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'delete',
                child: Row(
                  children: [
                    Icon(
                      Icons.delete_outline_rounded,
                      size: 19,
                      color: AppColors.danger,
                    ),
                    SizedBox(width: 9),
                    Text('Remove'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 9,
      height: 9,
      decoration: const BoxDecoration(
        color: AppColors.clay,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.controller});

  final NotificationsController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.error != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 4),
        child: ErrorNotice(
          message: controller.error!,
          onRetry: controller.refresh,
        ),
      );
    }
    if (!controller.hasMore) {
      return const Padding(
        padding: EdgeInsets.only(top: 10),
        child: Text(
          'You have seen every notification.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: AppColors.muted),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: OutlinedButton(
        onPressed: controller.loadingMore ? null : controller.loadMore,
        child: controller.loadingMore
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: AppColors.forest,
                ),
              )
            : const Text('Load older notifications'),
      ),
    );
  }
}

class _NotificationLook {
  const _NotificationLook(this.icon, this.background, this.foreground);

  final IconData icon;
  final Color background;
  final Color foreground;
}

_NotificationLook _lookFor(String type) {
  if (type.startsWith('SERVICE_BOOKING') || type == 'SERVICE_REVIEW_REPLIED') {
    return const _NotificationLook(
      Icons.event_available_outlined,
      AppColors.sage,
      AppColors.sageInk,
    );
  }
  if (type == 'PAYMENT_RECEIVED' || type == 'PAYMENT_FAILED') {
    return const _NotificationLook(
      Icons.payments_outlined,
      AppColors.sage,
      AppColors.sageInk,
    );
  }
  if (type == 'REFUND_ISSUED') {
    return const _NotificationLook(
      Icons.currency_exchange_rounded,
      AppColors.goldSoft,
      AppColors.goldInk,
    );
  }
  if (type.startsWith('ADJUSTMENT')) {
    return const _NotificationLook(
      Icons.sync_alt_rounded,
      AppColors.infoSoft,
      AppColors.info,
    );
  }
  if (type == 'SYSTEM_NOTIFICATION') {
    return const _NotificationLook(
      Icons.campaign_outlined,
      AppColors.paperDeep,
      AppColors.inkSoft,
    );
  }
  return const _NotificationLook(
    Icons.receipt_long_outlined,
    AppColors.claySoft,
    AppColors.clay,
  );
}
