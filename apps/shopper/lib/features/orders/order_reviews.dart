import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Write or edit the shopper's review of one item from a delivered order.
/// Returns true when the review was saved.
Future<bool?> showOrderReviewSheet(
  BuildContext context, {
  required CustomerOrder order,
  required CustomerOrderItem item,
  MyReview? existing,
}) {
  return showAppSheet<bool>(
    context,
    title: existing == null ? 'Review this item' : 'Edit your review',
    subtitle: item.productName,
    child: _ReviewForm(order: order, item: item, existing: existing),
  );
}

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({required this.order, required this.item, this.existing});

  final CustomerOrder order;
  final CustomerOrderItem item;
  final MyReview? existing;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> {
  late final TextEditingController _title = TextEditingController(
    text: widget.existing?.title ?? '',
  );
  late final TextEditingController _comment = TextEditingController(
    text: widget.existing?.comment ?? '',
  );
  late int _rating = widget.existing?.rating ?? 0;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating < 1 || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final repository = ref.read(shopperRepositoryProvider);
    try {
      final title = _trimOrNull(_title.text);
      final comment = _trimOrNull(_comment.text);
      final existing = widget.existing;
      if (existing == null) {
        await repository.createReview(
          orderId: widget.order.id,
          productId: widget.item.productId,
          rating: _rating,
          title: title,
          comment: comment,
        );
      } else {
        await repository.updateReview(
          existing.id,
          rating: _rating,
          title: title,
          comment: comment,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Your review did not save. Try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.existing != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          editing ? 'Change your rating or words. Your review stays verified.' : 'Only you can review this item, because it was in your delivered order.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 14),
        Text('Your rating', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 2),
        Row(
          children: [
            for (var star = 1; star <= 5; star++)
              Expanded(
                child: IconButton(
                  onPressed: _saving
                      ? null
                      : () => setState(() => _rating = star),
                  tooltip: star == 1 ? '1 star' : '$star stars',
                  iconSize: 34,
                  color: AppColors.gold,
                  icon: Icon(
                    _rating >= star
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _title,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.next,
          maxLength: 100,
          decoration: const InputDecoration(
            labelText: 'Title (optional)',
            hintText: 'Beautiful linen',
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _comment,
          textCapitalization: TextCapitalization.sentences,
          minLines: 3,
          maxLines: 5,
          maxLength: 2000,
          decoration: const InputDecoration(
            labelText: 'Your review (optional)',
            hintText: 'How did it fit? How was the quality?',
            alignLabelWithHint: true,
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          ErrorNotice(message: _error!),
        ],
        const SizedBox(height: 12),
        AppButton(
          label: editing ? 'Save review' : 'Post review',
          icon: Icons.star_rounded,
          loading: _saving,
          onPressed: _rating < 1 || _saving ? null : _submit,
          helper: _rating < 1 ? 'Tap a star to rate this item.' : null,
        ),
      ],
    );
  }
}

String? _trimOrNull(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
