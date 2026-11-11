import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../providers.dart';

/// Opens the "ask the shop" composer and, once the first message is sent,
/// switches to the conversation thread. The server owns the conversation id.
Future<void> openProductChat(
  BuildContext context, {
  required String productId,
  required String productName,
  required String brandName,
}) async {
  final conversationId = await showAppSheet<String>(
    context,
    title: 'Message $brandName',
    subtitle: 'Ask about "$productName". The shop replies here in Messages.',
    child: _Composer(productId: productId, productName: productName),
  );
  if (conversationId == null || !context.mounted) return;
  final uri = Uri(
    path: '/chat/$conversationId',
    queryParameters: {'name': brandName},
  );
  context.push(uri.toString());
}

class _Composer extends ConsumerStatefulWidget {
  const _Composer({required this.productId, required this.productName});

  final String productId;
  final String productName;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  late final TextEditingController _controller;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: 'Hi, I would like to ask about "${widget.productName}".',
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(shopperRepositoryProvider)
          .startProductChat(widget.productId, body: text);
      if (!mounted) return;
      Navigator.of(context).pop(result.conversationId);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'The message did not send. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[
          ErrorNotice(message: _error!),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _controller,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Your message',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Send message',
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: _busy ? null : _send,
        ),
      ],
    );
  }
}
