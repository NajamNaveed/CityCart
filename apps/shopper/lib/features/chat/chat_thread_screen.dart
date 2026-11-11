import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'chat_thread_controller.dart';

/// A product conversation with one shop. Messages are refreshed on open, after
/// sending, on pull, and quietly every 15 seconds while the screen is visible.
class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({super.key, required this.conversationId, this.title});

  final String conversationId;
  final String? title;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  Timer? _poll;
  int _lastCount = -1;

  @override
  void initState() {
    super.initState();
    _input.addListener(() => setState(() {}));
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted) return;
      ref
          .read(chatThreadProvider(widget.conversationId))
          .refreshLatest(silent: true);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(ChatThreadController controller) async {
    final text = _input.text.trim();
    if (text.isEmpty || controller.sending) return;
    FocusScope.of(context).unfocus();
    final error = await controller.send(text);
    if (!mounted) return;
    if (error == null) {
      _input.clear();
      if (_scroll.hasClients) _scroll.jumpTo(0);
    } else {
      showAppSnack(context, error, error: true);
    }
  }

  Future<void> _refresh(ChatThreadController controller) async {
    await controller.refreshLatest();
    if (!mounted) return;
    if (controller.error != null && controller.messages.isNotEmpty) {
      showAppSnack(context, controller.error!, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(chatThreadProvider(widget.conversationId));

    if (_lastCount != controller.messages.length) {
      _lastCount = controller.messages.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(0);
      });
    }

    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => _Scaffold(
        controller: controller,
        title: widget.title,
        input: _input,
        scroll: _scroll,
        onSend: () => _send(controller),
        onRefresh: () => _refresh(controller),
      ),
    );
  }
}

class _Scaffold extends StatelessWidget {
  const _Scaffold({
    required this.controller,
    required this.title,
    required this.input,
    required this.scroll,
    required this.onSend,
    required this.onRefresh,
  });

  final ChatThreadController controller;
  final String? title;
  final TextEditingController input;
  final ScrollController scroll;
  final VoidCallback onSend;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: title ?? 'Messages',
              subtitle: 'About a product',
              trailing: IconButton(
                tooltip: 'Refresh messages',
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(44, 44),
                ),
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: controller.loading
                  ? const Center(
                      child: SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: AppColors.forest,
                        ),
                      ),
                    )
                  : controller.messages.isEmpty
                  ? _EmptyThread(
                      error: controller.error,
                      controller: controller,
                    )
                  : _MessageList(
                      controller: controller,
                      scroll: scroll,
                      onRefresh: onRefresh,
                    ),
            ),
            BottomActionBar(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: input,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => onSend(),
                      decoration: const InputDecoration(
                        hintText: 'Write a message',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 13,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 50,
                    height: 50,
                    child: FilledButton(
                      onPressed: input.text.trim().isEmpty || controller.sending
                          ? null
                          : onSend,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.forest,
                        padding: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppRadius.button),
                        ),
                      ),
                      child: controller.sending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: AppColors.white,
                              ),
                            )
                          : const Icon(Icons.send_rounded, size: 21),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyThread extends StatelessWidget {
  const _EmptyThread({required this.error, required this.controller});

  final String? error;
  final ChatThreadController controller;

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
        children: [
          ErrorNotice(message: error!, onRetry: controller.loadInitial),
        ],
      );
    }
    return EmptyState(
      icon: Icons.forum_outlined,
      title: 'No messages yet',
      message: 'Say hello to the shop and ask about this item.',
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.controller,
    required this.scroll,
    required this.onRefresh,
  });

  final ChatThreadController controller;
  final ScrollController scroll;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final messages = controller.messages;
    final extra = controller.hasMore ? 1 : 0;

    return RefreshIndicator(
      color: AppColors.forest,
      onRefresh: onRefresh,
      child: ListView.builder(
        controller: scroll,
        reverse: true,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        itemCount: messages.length + extra,
        itemBuilder: (context, index) {
          if (index >= messages.length) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Center(
                child: controller.loadingOlder
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: AppColors.forest,
                        ),
                      )
                    : TextButton(
                        onPressed: controller.loadOlder,
                        child: const Text('Load earlier messages'),
                      ),
              ),
            );
          }
          final message = messages[messages.length - 1 - index];
          return _Bubble(message: message);
        },
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    final textColor = mine ? AppColors.white : AppColors.ink;
    final timeColor = mine
        ? AppColors.surface.withValues(alpha: 0.7)
        : AppColors.muted;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: mine
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Align(
            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.78,
              ),
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                decoration: BoxDecoration(
                  color: mine ? AppColors.forest : AppColors.surface,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(mine ? 18 : 5),
                    bottomRight: Radius.circular(mine ? 5 : 18),
                  ),
                  border: mine ? null : Border.all(color: AppColors.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (message.product != null) ...[
                      _ProductAttachment(product: message.product!),
                      const SizedBox(height: 8),
                    ],
                    Text(
                      message.body,
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: textColor),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            formatTime(message.createdAt),
            style: TextStyle(fontSize: 11, color: timeColor),
          ),
        ],
      ),
    );
  }
}

class _ProductAttachment extends StatelessWidget {
  const _ProductAttachment({required this.product});

  final ChatProduct product;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: product.id.isEmpty
          ? null
          : () => context.push('/product/${product.id}'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.paper,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ProductThumb(url: product.image, size: 38, radius: 9),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                  Text(
                    formatMoney(product.price),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.clay,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
