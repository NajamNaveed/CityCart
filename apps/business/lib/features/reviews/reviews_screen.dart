import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your reviews. Check the connection and try again.';
}

/// Customer reviews and a single reply per review. The card shows the rating,
/// the job it belongs to and the reply once it exists, so an owner always
/// knows which reviews are still waiting for an answer.
class ReviewsScreen extends ConsumerStatefulWidget {
  const ReviewsScreen({super.key});

  @override
  ConsumerState<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends ConsumerState<ReviewsScreen> {
  int? _rating;

  Future<void> _openReply(ServiceReview review) async {
    final posted = await showFormSheet<bool>(
      context,
      title: 'Reply to ${review.reviewerName}',
      subtitle:
          'Customers see your reply under the review. Each review can be '
          'answered once.',
      child: _ReplySheet(review: review),
    );
    if (posted != true || !mounted) return;
    showAppSnack(context, 'Reply posted.');
    ref.invalidate(providerReviewsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final asyncReviews = ref.watch(providerReviewsProvider(_rating));
    final page = asyncReviews.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Reviews')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(providerReviewsProvider);
          await ref.read(providerReviewsProvider(_rating).future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Service provider',
              title: 'What customers say',
              subtitle:
                  'Ratings come from completed jobs. Reply once to thank a '
                  'customer or explain what you fixed.',
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
                  if (asyncReviews.isLoading && page == null)
                    const LoadingView(label: 'Loading your reviews')
                  else if (asyncReviews.hasError && page == null)
                    ErrorPanel(
                      message: _errorSentence(asyncReviews.error),
                      onRetry: () => ref.invalidate(providerReviewsProvider),
                    )
                  else if (page == null || page.summary.count == 0)
                    const EmptyPanel(
                      icon: Icons.star_outline_rounded,
                      title: 'No reviews yet',
                      message:
                          'After a job is completed, the customer can leave a '
                          'rating. It will appear here for you to reply to.',
                    )
                  else ...[
                    _SummaryPanel(summary: page.summary),
                    const SizedBox(height: 16),
                    _RatingFilter(
                      selected: _rating,
                      onChanged: (value) => setState(() => _rating = value),
                    ),
                    const SizedBox(height: 18),
                    SectionTitle(
                      _rating == null ? 'All reviews' : '$_rating-star reviews',
                      trailing: Text(
                        '${page.reviews.length}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    if (page.reviews.isEmpty)
                      EmptyPanel(
                        icon: Icons.filter_alt_off_outlined,
                        title: 'Nothing here yet',
                        message:
                            'No reviews with this rating. Choose All to see '
                            'every review.',
                        action: TextButton(
                          key: const Key('reviews_clear_filter'),
                          onPressed: () => setState(() => _rating = null),
                          child: const Text('Show all reviews'),
                        ),
                      )
                    else
                      for (final review in page.reviews) ...[
                        _ReviewCard(
                          review: review,
                          onReply: () => _openReply(review),
                        ),
                        const SizedBox(height: 12),
                      ],
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

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({required this.summary});

  final ReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                summary.average.toStringAsFixed(1),
                maxLines: 1,
                style: text.displaySmall,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StarRating(rating: summary.average, size: 20),
                    const SizedBox(height: 4),
                    Text(
                      summary.count == 1
                          ? 'from 1 review'
                          : 'from ${summary.count} reviews',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (var stars = 5; stars >= 1; stars -= 1) ...[
            Row(
              children: [
                SizedBox(
                  width: 12,
                  child: Text(
                    '$stars',
                    textAlign: TextAlign.right,
                    style: text.bodySmall?.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ),
                const SizedBox(width: 5),
                const Icon(
                  Icons.star_rounded,
                  size: 14,
                  color: AppColors.amber,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                    child: LinearProgressIndicator(
                      value: summary.shareFor(stars),
                      minHeight: 7,
                      backgroundColor: AppColors.paper,
                      color: AppColors.amber,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  width: 26,
                  child: Text(
                    '${summary.countFor(stars)}',
                    textAlign: TextAlign.right,
                    style: text.bodySmall?.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            if (stars > 1) const SizedBox(height: 7),
          ],
        ],
      ),
    );
  }
}

class _RatingFilter extends StatelessWidget {
  const _RatingFilter({required this.selected, required this.onChanged});

  final int? selected;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ChoiceChip(
          key: const Key('reviews_filter_all'),
          label: const Text('All'),
          selected: selected == null,
          onSelected: (_) => onChanged(null),
        ),
        for (var stars = 5; stars >= 1; stars -= 1)
          ChoiceChip(
            key: Key('reviews_filter_$stars'),
            label: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('$stars'),
                const SizedBox(width: 3),
                const Icon(
                  Icons.star_rounded,
                  size: 14,
                  color: AppColors.amber,
                ),
              ],
            ),
            selected: selected == stars,
            onSelected: (_) => onChanged(stars),
          ),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review, required this.onReply});

  final ServiceReview review;
  final VoidCallback onReply;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final when = review.createdAt;

    return SurfacePanel(
      key: Key('review_card_${review.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AvatarBadge(name: review.reviewerName, size: 40),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      review.reviewerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleSmall,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      review.serviceTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodySmall?.copyWith(fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (when != null) ...[
                const SizedBox(width: 8),
                Text(
                  inboxTime(when),
                  maxLines: 1,
                  style: text.bodySmall?.copyWith(
                    fontSize: 12,
                    color: AppColors.muted,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 11),
          StarRating(rating: review.rating.toDouble(), size: 17),
          if (review.comment.trim().isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(
              review.comment,
              style: text.bodyMedium?.copyWith(color: AppColors.ink),
            ),
          ],
          if (review.hasReply) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.mint,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.storefront_outlined,
                        size: 15,
                        color: AppColors.forestInk,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Your reply',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.labelMedium?.copyWith(
                            color: AppColors.forestInk,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    review.providerReply!.body,
                    style: text.bodySmall?.copyWith(
                      color: AppColors.forestInk,
                      fontSize: 13.5,
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                key: Key('review_reply_${review.id}'),
                onPressed: onReply,
                icon: const Icon(Icons.reply_rounded, size: 18),
                label: const Text('Reply'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReplySheet extends ConsumerStatefulWidget {
  const _ReplySheet({required this.review});

  final ServiceReview review;

  @override
  ConsumerState<_ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends ConsumerState<_ReplySheet> {
  final _formKey = GlobalKey<FormState>();
  final _body = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(businessRepositoryProvider)
          .replyToProviderReview(widget.review.id, body: _body.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Something went wrong. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            ErrorPanel(message: _error!),
            const SizedBox(height: 14),
          ],
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.paper,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StarRating(rating: widget.review.rating.toDouble(), size: 15),
                if (widget.review.comment.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    widget.review.comment,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          AppField(
            label: 'Your reply',
            controller: _body,
            hint: 'Thank the customer or explain what you fixed.',
            maxLines: 4,
            maxLength: 1000,
            textInputAction: TextInputAction.newline,
            validator: (value) {
              final text = (value ?? '').trim();
              if (text.isEmpty) return 'Write a reply.';
              return null;
            },
          ),
          const SizedBox(height: 18),
          AppButton(
            key: const Key('review_reply_submit'),
            label: 'Post reply',
            icon: Icons.send_rounded,
            loading: _busy,
            onPressed: _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}
