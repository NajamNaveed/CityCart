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

/// What customers said about this shop's products. Reviews are read-only here;
/// the server only returns approved reviews of the signed-in brand.
class BrandReviewsScreen extends ConsumerStatefulWidget {
  const BrandReviewsScreen({super.key});

  @override
  ConsumerState<BrandReviewsScreen> createState() => _BrandReviewsScreenState();
}

class _BrandReviewsScreenState extends ConsumerState<BrandReviewsScreen> {
  int? _rating;
  var _items = const <BrandReview>[];
  var _summary = const ReviewSummary();
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  var _request = 0;

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
      final page = await ref
          .read(businessRepositoryProvider)
          .brandReviews(
            rating: _rating,
            page: reset ? 1 : _pagination.page + 1,
          );
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.reviews : [..._items, ...page.reviews];
        _summary = page.summary;
        _pagination = page.pagination;
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

  void _selectRating(int? rating) {
    if (rating == _rating) return;
    setState(() => _rating = rating);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Reviews')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'What customers say',
              subtitle:
                  'Ratings on your products, from shoppers who received '
                  'their order.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                20,
                AppSpacing.page,
                0,
              ),
              child: _content(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading && _summary.count == 0) {
      return const LoadingView(label: 'Loading your reviews');
    }

    final error = _error;
    if (error != null && _summary.count == 0) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_summary.count == 0) {
      return const EmptyPanel(
        icon: Icons.star_outline_rounded,
        title: 'No reviews yet',
        message:
            'When a customer receives an order, they can rate the products '
            'they bought. Approved reviews appear here.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SummaryPanel(summary: _summary),
        const SizedBox(height: 16),
        _RatingFilter(selected: _rating, onChanged: _selectRating),
        const SizedBox(height: 18),
        if (_loading)
          const LoadingView(label: 'Loading your reviews')
        else if (error != null)
          ErrorPanel(message: error, onRetry: () => _load())
        else ...[
          SectionTitle(
            _rating == null ? 'All reviews' : '$_rating-star reviews',
            trailing: Text(
              '${_pagination.total}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          if (_items.isEmpty)
            EmptyPanel(
              icon: Icons.filter_alt_off_outlined,
              title: 'Nothing here yet',
              message:
                  'No reviews with this rating. Choose All to see every '
                  'review.',
              action: TextButton(
                key: const Key('brand_reviews_clear_filter'),
                onPressed: () => _selectRating(null),
                child: const Text('Show all reviews'),
              ),
            )
          else
            for (var i = 0; i < _items.length; i++) ...[
              if (i > 0) const SizedBox(height: 12),
              _ReviewCard(
                key: Key('brand_review_${_items[i].id}'),
                review: _items[i],
              ),
            ],
          if (_pagination.hasMore) ...[
            const SizedBox(height: 16),
            AppButton(
              label: 'Load more reviews',
              variant: AppButtonVariant.outline,
              loading: _loadingMore,
              onPressed: () => _load(reset: false),
            ),
          ],
        ],
      ],
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
        FilterPill(
          key: const Key('brand_reviews_filter_all'),
          label: 'All',
          selected: selected == null,
          onTap: () => onChanged(null),
        ),
        for (var stars = 5; stars >= 1; stars -= 1)
          FilterPill(
            key: Key('brand_reviews_filter_$stars'),
            label: '$stars',
            trailing: const Icon(
              Icons.star_rounded,
              size: 14,
              color: AppColors.amber,
            ),
            selected: selected == stars,
            onTap: () => onChanged(stars),
          ),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({super.key, required this.review});

  final BrandReview review;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final when = review.createdAt;

    return SurfacePanel(
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
                      review.productName,
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
          if (review.title.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: text.titleSmall,
            ),
          ],
          if (review.comment.trim().isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              review.comment,
              style: text.bodyMedium?.copyWith(color: AppColors.ink),
            ),
          ],
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
      appBar: AppBar(title: const Text('Reviews')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Reviews',
            title: 'For shop owners',
            subtitle: 'Service accounts read reviews in their Reviews screen.',
          ),
        ],
      ),
    );
  }
}
