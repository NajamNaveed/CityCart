import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// A customer conversation on the shop side. The server decides who may read
/// and reply; this screen only shows the thread it was given.
class BrandChatScreen extends ConsumerStatefulWidget {
  const BrandChatScreen({
    super.key,
    required this.conversationId,
    this.initial,
  });

  final String conversationId;
  final BrandChatThread? initial;

  @override
  ConsumerState<BrandChatScreen> createState() => _BrandChatScreenState();
}

class _BrandChatScreenState extends ConsumerState<BrandChatScreen> {
  final _scroll = ScrollController();
  final _input = TextEditingController();

  List<ChatMessage> _messages = const <ChatMessage>[];
  bool _loading = true;
  bool _loadingEarlier = false;
  bool _sending = false;
  bool _hasMore = false;
  String? _error;
  late bool _canSend;

  @override
  void initState() {
    super.initState();
    _canSend = widget.initial?.canSend ?? true;
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .brandChatMessages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _messages = [...page.messages];
        _hasMore = page.hasMore;
        _loading = false;
      });
      _markRead();
      _scrollToBottom();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error =
            'We could not load this conversation. Check the connection and try '
            'again.';
      });
    }
  }

  Future<void> _markRead() async {
    try {
      await ref
          .read(businessRepositoryProvider)
          .markBrandChatRead(widget.conversationId);
    } catch (_) {
      // The thread still reads; the unread count can catch up later.
    }
  }

  Future<void> _loadEarlier() async {
    if (_loadingEarlier || _messages.isEmpty) return;
    setState(() => _loadingEarlier = true);
    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .brandChatMessages(widget.conversationId, before: _messages.first.id);
      if (!mounted) return;
      setState(() {
        _messages = [...page.messages, ..._messages];
        _hasMore = page.hasMore;
      });
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'Older messages could not be loaded. Try again.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _loadingEarlier = false);
    }
  }

  Future<void> _send() async {
    final body = _input.text.trim();
    if (body.isEmpty || _sending) return;
    FocusScope.of(context).unfocus();
    setState(() => _sending = true);
    try {
      final message = await ref
          .read(businessRepositoryProvider)
          .sendBrandChatMessage(widget.conversationId, body);
      if (!mounted) return;
      setState(() {
        _messages = [..._messages, message];
        _sending = false;
      });
      _input.clear();
      _scrollToBottom();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        if (error.status == 409 &&
            error.message == 'This seller is not taking messages right now.') {
          _canSend = false;
        }
      });
      showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnack(
        context,
        'Your message was not sent. Check the connection and try again.',
        error: true,
      );
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 60,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final name = widget.initial?.customerName ?? 'Customer';

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.titleMedium,
            ),
            Text(
              'Customer chat',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.bodySmall?.copyWith(fontSize: 12),
            ),
          ],
        ),
        actions: [
          IconButton(
            key: const Key('brand_chat_refresh'),
            tooltip: 'Refresh messages',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildThread(context)),
          if (_canSend)
            _Composer(controller: _input, sending: _sending, onSend: _send)
          else
            _ClosedNotice(name: name),
        ],
      ),
    );
  }

  Widget _buildThread(BuildContext context) {
    if (_loading && _messages.isEmpty) {
      return const LoadingView(label: 'Loading the conversation');
    }
    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: [ErrorPanel(message: _error!, onRetry: _load)],
      );
    }
    if (_messages.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: const [
          SizedBox(height: 30),
          EmptyPanel(
            icon: Icons.forum_outlined,
            title: 'No messages yet',
            message:
                'Write the first message below. Only this customer and your '
                'shop can see this conversation.',
          ),
        ],
      );
    }

    final offset = _hasMore ? 1 : 0;
    return ListView.builder(
      key: const Key('brand_chat_thread'),
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      itemCount: _messages.length + offset,
      itemBuilder: (context, index) {
        if (_hasMore && index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Center(
              child: _loadingEarlier
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : TextButton(
                      key: const Key('brand_chat_load_earlier'),
                      onPressed: _loadEarlier,
                      child: const Text('Load earlier messages'),
                    ),
            ),
          );
        }
        final message = _messages[index - offset];
        if (message.isSystem) return _SystemLine(message: message);
        return _MessageBubble(message: message);
      },
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    final when = message.createdAt;
    final product = message.product;
    final width = MediaQuery.sizeOf(context).width;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 9),
        padding: const EdgeInsets.fromLTRB(14, 9, 14, 7),
        constraints: BoxConstraints(maxWidth: width * 0.78),
        decoration: BoxDecoration(
          color: mine ? AppColors.forest : AppColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: AppColors.line),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: mine
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            if (product != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(9),
                margin: const EdgeInsets.only(bottom: 7),
                decoration: BoxDecoration(
                  color: mine ? const Color(0x33FFFFFF) : AppColors.paper,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Product question',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                        color: mine ? const Color(0xCCFFFFFF) : AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: mine ? AppColors.white : AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      product.available
                          ? money(product.pricePaisa)
                          : 'No longer available',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: mine
                            ? const Color(0xCCFFFFFF)
                            : AppColors.inkSoft,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            Text(
              message.body,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.4,
                color: mine ? AppColors.white : AppColors.ink,
              ),
            ),
            if (mine && message.sentBy.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                'Sent by ${message.sentBy}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: Color(0xCCFFFFFF)),
              ),
            ],
            if (when != null) ...[
              const SizedBox(height: 3),
              Text(
                chatTime(when),
                style: TextStyle(
                  fontSize: 11,
                  color: mine ? const Color(0xCCFFFFFF) : AppColors.muted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SystemLine extends StatelessWidget {
  const _SystemLine({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          margin: const EdgeInsets.symmetric(horizontal: 24),
          decoration: BoxDecoration(
            color: AppColors.paper,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(
            message.body,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(fontSize: 12, color: AppColors.inkSoft),
          ),
        ),
      ),
    );
  }
}

class _ClosedNotice extends StatelessWidget {
  const _ClosedNotice({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Text(
          'Replying is closed for now. $name can still read the conversation.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        padding: const EdgeInsets.fromLTRB(14, 9, 14, 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                key: const Key('brand_chat_input'),
                controller: controller,
                minLines: 1,
                maxLines: 4,
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                style: const TextStyle(fontSize: 15, color: AppColors.ink),
                decoration: const InputDecoration(
                  hintText: 'Write a reply',
                  counterText: '',
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: 46,
              height: 46,
              child: IconButton.filled(
                key: const Key('brand_chat_send'),
                tooltip: 'Send',
                onPressed: sending ? null : onSend,
                icon: sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.white,
                        ),
                      )
                    : const Icon(
                        Icons.send_rounded,
                        size: 21,
                        color: AppColors.white,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
