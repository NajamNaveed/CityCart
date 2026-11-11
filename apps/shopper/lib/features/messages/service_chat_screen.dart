import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'service_chat_controller.dart';

/// A service conversation, either the thread attached to one booking or a
/// direct thread with a provider. New messages arrive on pull, after sending
/// and quietly every 15 seconds while the screen is open.
class ServiceChatScreen extends ConsumerStatefulWidget {
  const ServiceChatScreen({
    super.key,
    required this.conversationId,
    required this.kind,
    this.title,
    this.subtitle,
  });

  final String conversationId;
  final ServiceChatKind kind;
  final String? title;
  final String? subtitle;

  @override
  ConsumerState<ServiceChatScreen> createState() => _ServiceChatScreenState();
}

class _ServiceChatScreenState extends ConsumerState<ServiceChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  Timer? _poll;
  int _lastCount = -1;

  ServiceChatController get _controller => widget.kind == ServiceChatKind.job
      ? ref.read(bookingChatProvider(widget.conversationId))
      : ref.read(directChatProvider(widget.conversationId));

  @override
  void initState() {
    super.initState();
    _input.addListener(() => setState(() {}));
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) _controller.refreshLatest(silent: true);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(ServiceChatController controller) async {
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

  Future<void> _refresh(ServiceChatController controller) async {
    await controller.refreshLatest();
    if (!mounted) return;
    if (controller.error != null && controller.messages.isNotEmpty) {
      showAppSnack(context, controller.error!, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = widget.kind == ServiceChatKind.job
        ? bookingChatProvider(widget.conversationId)
        : directChatProvider(widget.conversationId);
    final controller = ref.watch(provider);

    if (_lastCount != controller.messages.length) {
      _lastCount = controller.messages.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(0);
      });
    }

    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              ScreenTopBar(
                title: widget.title ?? 'Messages',
                subtitle:
                    widget.subtitle ??
                    (widget.kind == ServiceChatKind.job
                        ? 'Booking chat'
                        : 'Provider chat'),
                trailing: IconButton(
                  tooltip: 'Refresh messages',
                  onPressed: () => _refresh(controller),
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
                    ? _EmptyThread(controller: controller)
                    : _MessageList(
                        controller: controller,
                        scroll: _scroll,
                        onRefresh: () => _refresh(controller),
                      ),
              ),
              BottomActionBar(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 1000,
                        textCapitalization: TextCapitalization.sentences,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(controller),
                        decoration: const InputDecoration(
                          hintText: 'Write a message',
                          counterText: '',
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
                        onPressed:
                            _input.text.trim().isEmpty || controller.sending
                            ? null
                            : () => _send(controller),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.forest,
                          padding: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(
                              AppRadius.button,
                            ),
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
      ),
    );
  }
}

class _EmptyThread extends StatelessWidget {
  const _EmptyThread({required this.controller});

  final ServiceChatController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.error != null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
        children: [
          ErrorNotice(
            message: controller.error!,
            onRetry: controller.loadInitial,
          ),
        ],
      );
    }
    return EmptyState(
      icon: Icons.waving_hand_outlined,
      title: 'Start the conversation',
      message:
          'Introduce yourself and share what you need. Keep the details of the '
          'job in one place.',
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.controller,
    required this.scroll,
    required this.onRefresh,
  });

  final ServiceChatController controller;
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
    final time = formatTime(message.createdAt);
    final textColor = mine ? AppColors.white : AppColors.ink;

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
                child: Text(
                  message.body,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(color: textColor),
                ),
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            time,
            style: TextStyle(
              fontSize: 11,
              color: mine
                  ? AppColors.surface.withValues(alpha: 0.7)
                  : AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}
