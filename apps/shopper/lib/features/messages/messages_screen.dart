import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'messages_controller.dart';

enum _InboxFilter { all, jobs, providers }

/// One inbox for every conversation about a service: threads attached to a
/// booking and direct threads with a provider. Unread counts come straight
/// from the server, so the badges match the provider side.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  _InboxFilter _filter = _InboxFilter.all;

  List<InboxItem> _visible(List<InboxItem> items) => switch (_filter) {
    _InboxFilter.all => items,
    _InboxFilter.jobs =>
      items.where((item) => item.kind == InboxKind.job).toList(),
    _InboxFilter.providers =>
      items.where((item) => item.kind == InboxKind.direct).toList(),
  };

  Future<void> _open(InboxItem item) async {
    final uri = Uri(
      path: item.kind == InboxKind.job
          ? '/messages/job/${item.routeId}'
          : '/messages/provider/${item.routeId}',
      queryParameters: {
        'name': item.name,
        'subtitle': item.kind == InboxKind.job
            ? 'Booking chat · ${item.contextLabel}'
            : 'Provider chat',
      },
    );
    await context.push(uri.toString());
    if (context.mounted) {
      ref.read(messagesProvider).refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(messagesProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Messages',
              subtitle: 'Chats with providers',
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/account');
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
                      children: const [LoadingList(count: 4)],
                    );
                  }
                  if (controller.items.isEmpty) {
                    return RefreshIndicator(
                      color: AppColors.forest,
                      onRefresh: controller.refresh,
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                        children: [
                          if (controller.error != null) ...[
                            ErrorNotice(
                              message: controller.error!,
                              onRetry: controller.refresh,
                            ),
                            const SizedBox(height: 20),
                          ],
                          EmptyState(
                            icon: Icons.forum_outlined,
                            title: 'No messages yet',
                            message:
                                'A chat opens when a provider accepts your '
                                'booking, or when you message a provider '
                                'directly.',
                            action: AppButton(
                              label: 'Find a service',
                              icon: Icons.home_repair_service_rounded,
                              expand: false,
                              onPressed: () => context.go('/services'),
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  final items = _visible(controller.items);
                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 2, 20, 12),
                        child: SegmentedControl<_InboxFilter>(
                          values: _InboxFilter.values,
                          labelOf: (filter) => switch (filter) {
                            _InboxFilter.all => 'All',
                            _InboxFilter.jobs => 'Bookings',
                            _InboxFilter.providers => 'Providers',
                          },
                          value: _filter,
                          onChanged: (filter) =>
                              setState(() => _filter = filter),
                        ),
                      ),
                      Expanded(
                        child: RefreshIndicator(
                          color: AppColors.forest,
                          onRefresh: controller.refresh,
                          child: items.isEmpty
                              ? ListView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.fromLTRB(
                                    20,
                                    20,
                                    20,
                                    28,
                                  ),
                                  children: [
                                    EmptyState(
                                      icon: _filter == _InboxFilter.jobs
                                          ? Icons.event_available_outlined
                                          : Icons.chat_bubble_outline_rounded,
                                      title: _filter == _InboxFilter.jobs
                                          ? 'No booking chats'
                                          : 'No provider chats',
                                      message: _filter == _InboxFilter.jobs
                                          ? 'Booking chats appear once a '
                                                'provider accepts your request.'
                                          : 'Open a provider page and send '
                                                'them a message to start here.',
                                    ),
                                  ],
                                )
                              : ListView.builder(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.fromLTRB(
                                    20,
                                    0,
                                    20,
                                    28,
                                  ),
                                  itemCount:
                                      items.length +
                                      (controller.error != null ? 1 : 0),
                                  itemBuilder: (context, index) {
                                    if (index >= items.length) {
                                      return Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: ErrorNotice(
                                          message: controller.error!,
                                          onRetry: controller.refresh,
                                        ),
                                      );
                                    }
                                    final item = items[index];
                                    return Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 10,
                                      ),
                                      child: _InboxTile(
                                        item: item,
                                        onTap: () => _open(item),
                                      ),
                                    );
                                  },
                                ),
                        ),
                      ),
                    ],
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

class _InboxTile extends StatelessWidget {
  const _InboxTile({required this.item, required this.onTap});

  final InboxItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final time = formatAge(item.lastMessageAt);
    final preview = item.preview.trim();
    final hasPreview = preview.isNotEmpty;
    final unread = item.unread > 0;
    final kindLabel = item.kind == InboxKind.job ? 'Booking' : 'Provider';

    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BrandLogo(name: item.name, url: item.image, size: 46),
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
                        item.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: unread
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                            ),
                      ),
                    ),
                    if (time.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text(
                        time,
                        maxLines: 1,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '$kindLabel · ${item.contextLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 5),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        hasPreview
                            ? '${item.lastSenderRole == 'CUSTOMER' ? 'You: ' : ''}'
                                  '$preview'
                            : 'No messages yet',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: unread ? AppColors.ink : AppColors.inkSoft,
                          fontWeight: unread
                              ? FontWeight.w600
                              : FontWeight.w400,
                        ),
                      ),
                    ),
                    if (unread) ...[
                      const SizedBox(width: 8),
                      _UnreadBadge(count: item.unread),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: AppColors.clay,
        shape: BoxShape.rectangle,
        borderRadius: BorderRadius.all(Radius.circular(11)),
      ),
      child: Text(
        count > 9 ? '9+' : '$count',
        maxLines: 1,
        style: const TextStyle(
          fontSize: 11,
          height: 1.1,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
        ),
      ),
    );
  }
}
