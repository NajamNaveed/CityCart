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

/// One inbox for everything a customer sends: chats attached to a job and
/// questions asked before booking. Each row shows who wrote, what it is about,
/// and the last line, so there is never a mystery thread.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  ProviderChatKind? _filter;

  @override
  Widget build(BuildContext context) {
    final asyncInbox = ref.watch(providerChatInboxProvider);
    final threads = asyncInbox.asData?.value;
    final unread = (threads ?? const <ProviderChatThread>[]).fold(
      0,
      (total, thread) => total + thread.unread,
    );
    final hasJobs = threads?.any((thread) => thread.isJob) ?? false;
    final hasQuestions = threads?.any((thread) => !thread.isJob) ?? false;
    final visible = _filter == null || threads == null
        ? threads
        : threads.where((thread) => thread.kind == _filter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(providerChatInboxProvider);
          await ref.read(providerChatInboxProvider.future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            PageHeader(
              eyebrow: 'Service provider',
              title: 'Customer messages',
              subtitle:
                  'Job chats and questions in one place. Unread messages are '
                  'marked so nothing gets missed.',
              action: unread == 0
                  ? null
                  : StatusTag(label: '$unread new', tone: AppTone.amber),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                20,
                AppSpacing.page,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (asyncInbox.isLoading && threads == null)
                    const LoadingView(label: 'Loading your messages')
                  else if (asyncInbox.hasError && threads == null)
                    ErrorPanel(
                      message: _errorSentence(asyncInbox.error),
                      onRetry: () => ref.invalidate(providerChatInboxProvider),
                    )
                  else if (threads == null || threads.isEmpty)
                    const EmptyPanel(
                      icon: Icons.mark_unread_chat_alt_outlined,
                      title: 'No messages yet',
                      message:
                          'When a customer asks a question or a job chat '
                          'opens, the conversation appears here.',
                    )
                  else ...[
                    if (hasJobs && hasQuestions) ...[
                      _FilterRow(
                        selected: _filter,
                        onChanged: (value) => setState(() => _filter = value),
                      ),
                      const SizedBox(height: 16),
                    ],
                    SectionTitle(
                      _filter == null
                          ? 'All conversations'
                          : _filter == ProviderChatKind.job
                          ? 'Job chats'
                          : 'Questions',
                      trailing: Text(
                        '${visible?.length ?? 0}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    if (visible == null || visible.isEmpty)
                      EmptyPanel(
                        icon: Icons.filter_alt_off_outlined,
                        title: 'Nothing in this filter',
                        message: 'Choose All to see every conversation again.',
                        action: TextButton(
                          key: const Key('messages_clear_filter'),
                          onPressed: () => setState(() => _filter = null),
                          child: const Text('Show all'),
                        ),
                      )
                    else
                      SurfacePanel(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (
                              var index = 0;
                              index < visible.length;
                              index++
                            ) ...[
                              if (index > 0) const Divider(indent: 70),
                              _ThreadRow(thread: visible[index]),
                            ],
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.selected, required this.onChanged});

  final ProviderChatKind? selected;
  final ValueChanged<ProviderChatKind?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        FilterPill(
          key: const Key('messages_filter_all'),
          label: 'All',
          selected: selected == null,
          onTap: () => onChanged(null),
        ),
        FilterPill(
          key: const Key('messages_filter_job'),
          label: 'Job chats',
          selected: selected == ProviderChatKind.job,
          onTap: () => onChanged(ProviderChatKind.job),
        ),
        FilterPill(
          key: const Key('messages_filter_question'),
          label: 'Questions',
          selected: selected == ProviderChatKind.question,
          onTap: () => onChanged(ProviderChatKind.question),
        ),
      ],
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread});

  final ProviderChatThread thread;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final preview = thread.preview.trim().isEmpty
        ? 'No messages yet'
        : thread.preview.trim();
    final when = thread.lastMessageAt;

    return InkWell(
      key: Key('chat_row_${thread.kind.name}_${thread.routeId}'),
      onTap: () => context.push(
        '/messages/${thread.isJob ? 'job' : 'question'}/${thread.routeId}',
        extra: thread,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AvatarBadge(name: thread.name, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.titleSmall,
                        ),
                      ),
                      if (when != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          inboxTime(when),
                          maxLines: 1,
                          style: text.bodySmall?.copyWith(
                            color: AppColors.muted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(
                        thread.isJob
                            ? Icons.event_note_outlined
                            : Icons.chat_bubble_outline_rounded,
                        size: 14,
                        color: thread.isJob ? AppColors.forest : AppColors.blue,
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          thread.contextLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall?.copyWith(
                            fontSize: 12.5,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.lastFromMe ? 'You: $preview' : preview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall?.copyWith(
                            color: thread.unread > 0
                                ? AppColors.ink
                                : AppColors.muted,
                            fontWeight: thread.unread > 0
                                ? FontWeight.w600
                                : FontWeight.w400,
                          ),
                        ),
                      ),
                      if (thread.unread > 0) ...[
                        const SizedBox(width: 8),
                        _UnreadBadge(count: thread.unread),
                      ],
                    ],
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

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
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
          height: 1.2,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
        ),
      ),
    );
  }
}
