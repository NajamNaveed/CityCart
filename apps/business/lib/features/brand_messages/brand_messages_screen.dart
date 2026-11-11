import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your messages. Check the connection and try again.';
}

/// Customers who wrote to this shop. The list is scoped to the signed-in
/// brand by the server; the app never asks for another shop's chats.
class BrandMessagesScreen extends ConsumerStatefulWidget {
  const BrandMessagesScreen({super.key});

  @override
  ConsumerState<BrandMessagesScreen> createState() =>
      _BrandMessagesScreenState();
}

class _BrandMessagesScreenState extends ConsumerState<BrandMessagesScreen> {
  var _items = const <BrandChatThread>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  var _request = 0;

  var _unread = 0;

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
      final repository = ref.read(businessRepositoryProvider);
      final page = await repository.brandChats(
        page: reset ? 1 : _pagination.page + 1,
      );
      final unread = reset ? await repository.brandChatUnread() : _unread;
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _pagination = page.pagination;
        _unread = unread;
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

  Future<void> _open(BrandChatThread thread) async {
    await context.push('/brand-messages/${thread.id}', extra: thread);
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            PageHeader(
              eyebrow: 'Shop owner',
              title: 'Customer messages',
              subtitle:
                  'Questions about products and orders. Customers only see '
                  'the shop reply, not who on the team wrote it.',
              action: _unread == 0
                  ? null
                  : StatusTag(label: '$_unread new', tone: AppTone.amber),
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: _content(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading) return const LoadingView(label: 'Loading your messages');

    final error = _error;
    if (error != null) return ErrorPanel(message: error, onRetry: _load);

    if (_items.isEmpty) {
      return const EmptyPanel(
        icon: Icons.chat_bubble_outline_rounded,
        title: 'No customer messages yet',
        message:
            'When a customer asks about a product, the conversation appears '
            'here with their name and the product they asked about.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _ThreadRow(
            key: Key('brand_chat_row_${_items[i].id}'),
            thread: _items[i],
            onTap: () => _open(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more conversations',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({super.key, required this.thread, required this.onTap});

  final BrandChatThread thread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final preview = thread.preview.isEmpty
        ? 'No messages yet'
        : thread.lastFromShop
        ? 'You: ${thread.preview}'
        : thread.preview;

    return SurfacePanel(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AvatarBadge(name: thread.customerName, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  thread.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall,
                ),
                const SizedBox(height: 3),
                Text(
                  preview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall?.copyWith(
                    color: thread.unread > 0
                        ? AppColors.inkSoft
                        : AppColors.muted,
                    fontWeight: thread.unread > 0
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (thread.lastMessageAt != null)
                Text(
                  inboxTime(thread.lastMessageAt!),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.labelSmall?.copyWith(color: AppColors.muted),
                ),
              if (thread.unread > 0) ...[
                const SizedBox(height: 6),
                StatusTag(label: '${thread.unread} new', tone: AppTone.amber),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Messages',
            title: 'For shop owners',
            subtitle: 'Service accounts answer customer questions in Bookings.',
          ),
        ],
      ),
    );
  }
}
