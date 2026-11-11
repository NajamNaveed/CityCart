import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../cart/cart_controller.dart';
import '../chat/chat_compose.dart';

/// A product page: photos, price, availability, details, ratings and a direct
/// line to the shop. Reviews are public and paged; nothing is invented locally.
class ProductScreen extends ConsumerStatefulWidget {
  const ProductScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends ConsumerState<ProductScreen> {
  int _quantity = 1;
  bool _adding = false;

  Future<void> _addToBasket(Product product) async {
    if (_adding) return;
    setState(() => _adding = true);
    final error = await ref
        .read(cartProvider)
        .add(product.id, quantity: _quantity);
    if (!mounted) return;
    setState(() => _adding = false);
    if (error != null) {
      showAppSnack(context, error, error: true);
      return;
    }
    showAppSnack(
      context,
      _quantity == 1
          ? 'Added to your basket.'
          : '$_quantity added to your basket.',
      actionLabel: 'View basket',
      onAction: () => context.go('/cart'),
    );
  }

  @override
  Widget build(BuildContext context) {
    final product = ref.watch(productProvider(widget.productId));
    final loaded = product.asData?.value;
    final brand = loaded == null || loaded.brandId.isEmpty
        ? null
        : ref.watch(brandProvider(loaded.brandId));
    final brandName = brand?.asData?.value.name;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: brandName ?? 'Item',
              subtitle: loaded?.name,
              trailing: loaded == null
                  ? null
                  : IconButton(
                      tooltip: 'Open the shop',
                      onPressed: () => context.push('/store/${loaded.brandId}'),
                      icon: const Icon(Icons.storefront_outlined),
                      style: IconButton.styleFrom(
                        backgroundColor: AppColors.surface,
                        side: const BorderSide(color: AppColors.line),
                        minimumSize: const Size(44, 44),
                      ),
                    ),
            ),
            Expanded(
              child: product.when(
                loading: () => const LoadingList(count: 2),
                error: (error, stack) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                  child: ErrorNotice(
                    message: error is ApiException
                        ? error.message
                        : 'We could not open this item. Check your connection.',
                    onRetry: () =>
                        ref.invalidate(productProvider(widget.productId)),
                  ),
                ),
                data: (data) => _ProductBody(
                  product: data,
                  brandName: brandName ?? 'the shop',
                ),
              ),
            ),
            if (loaded != null)
              BottomActionBar(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (loaded.inStock)
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'How many?',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          QuantityStepper(
                            value: _quantity,
                            busy: _adding,
                            onChanged: (value) =>
                                setState(() => _quantity = value),
                          ),
                        ],
                      )
                    else
                      Text(
                        'This item is out of stock at the shop.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    const SizedBox(height: 10),
                    AppButton(
                      label: loaded.inStock ? 'Add to basket' : 'Out of stock',
                      icon: loaded.inStock
                          ? Icons.add_shopping_cart_rounded
                          : Icons.remove_shopping_cart_outlined,
                      loading: _adding,
                      onPressed: loaded.inStock && !_adding
                          ? () => _addToBasket(loaded)
                          : null,
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

class _ProductBody extends StatelessWidget {
  const _ProductBody({required this.product, required this.brandName});

  final Product product;
  final String brandName;

  @override
  Widget build(BuildContext context) {
    final compareAt = product.compareAtPrice;
    final discounted =
        compareAt != null &&
        product.price != null &&
        compareAt > product.price!;
    final discount = discounted
        ? ((compareAt - product.price!) / compareAt * 100).round()
        : null;
    final attributes = _visibleAttributes(product.attributes);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        _Gallery(images: product.images, name: product.name),
        const SizedBox(height: 18),
        Text(product.name, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        Wrap(
          spacing: 10,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              formatMoney(product.price),
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: AppColors.clay,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (discounted)
              Text(
                formatMoney(compareAt),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.muted,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            if (discount != null && discount > 0)
              Pill(
                text: '$discount% off',
                background: AppColors.claySoft,
                foreground: AppColors.clay,
              ),
          ],
        ),
        const SizedBox(height: 10),
        StatusPill(
          text: friendlyAvailability(product.availability),
          tone: toneForAvailability(product.availability),
          compact: true,
        ),
        if ((product.description ?? '').isNotEmpty) ...[
          const SizedBox(height: 24),
          const SectionLabel('About this item'),
          const SizedBox(height: 8),
          Text(
            product.description!,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
        if (attributes.isNotEmpty) ...[
          const SizedBox(height: 24),
          const SectionLabel('Details'),
          const SizedBox(height: 6),
          SurfaceCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              children: [
                for (final entry in attributes.entries)
                  InfoRow(label: entry.key, value: entry.value),
              ],
            ),
          ),
        ],
        const SizedBox(height: 24),
        SurfaceCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.chat_bubble_outline_rounded,
                    size: 20,
                    color: AppColors.inkSoft,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'A question about this item?',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Message $brandName and they will reply here in the app.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Ask the shop',
                icon: Icons.send_outlined,
                variant: AppButtonVariant.outline,
                height: 48,
                onPressed: () => openProductChat(
                  context,
                  productId: product.id,
                  productName: product.name,
                  brandName: brandName,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 26),
        _ReviewsSection(productId: product.id),
      ],
    );
  }

  Map<String, String> _visibleAttributes(Map<String, dynamic> raw) {
    final values = <String, String>{};
    for (final entry in raw.entries) {
      final value = entry.value;
      String? text;
      if (value is String && value.trim().isNotEmpty) {
        text = value.trim();
      } else if (value is num || value is bool) {
        text = '$value';
      } else if (value is List &&
          value.every(
            (item) => item is String || item is num || item is bool,
          )) {
        text = value.join(', ');
      }
      if (text != null && text.isNotEmpty) {
        values[_readableKey(entry.key)] = text;
      }
    }
    return values;
  }

  String _readableKey(String key) {
    final spaced = key
        .replaceAllMapped(
          RegExp(r'([a-z0-9])([A-Z])'),
          (match) => '${match[1]} ${match[2]}',
        )
        .replaceAll('_', ' ')
        .trim();
    if (spaced.isEmpty) return key;
    return '${spaced[0].toUpperCase()}${spaced.substring(1)}';
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.images, required this.name});

  final List<String> images;
  final String name;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    if (images.isEmpty) {
      return Container(
        height: 240,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.paperDeep,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: const Icon(
          Icons.photo_outlined,
          size: 46,
          color: AppColors.muted,
        ),
      );
    }

    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: SizedBox(
            height: 280,
            child: PageView.builder(
              itemCount: images.length,
              onPageChanged: (page) => setState(() => _page = page),
              itemBuilder: (context, index) => Image.network(
                images[index],
                fit: BoxFit.cover,
                semanticLabel: widget.name,
                errorBuilder: (context, error, stack) => Container(
                  color: AppColors.paperDeep,
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.photo_outlined,
                    size: 46,
                    color: AppColors.muted,
                  ),
                ),
              ),
            ),
          ),
        ),
        if (images.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var index = 0; index < images.length; index++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: index == _page ? 18 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: index == _page
                        ? AppColors.forest
                        : AppColors.lineStrong,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ReviewsSection extends ConsumerStatefulWidget {
  const _ReviewsSection({required this.productId});

  final String productId;

  @override
  ConsumerState<_ReviewsSection> createState() => _ReviewsSectionState();
}

class _ReviewsSectionState extends ConsumerState<_ReviewsSection> {
  final List<ProductReview> _reviews = [];
  RatingSummary _summary = const RatingSummary();
  Pagination _pagination = const Pagination();
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref
          .read(shopperRepositoryProvider)
          .productReviews(widget.productId);
      if (!mounted) return;
      setState(() {
        _reviews
          ..clear()
          ..addAll(page.reviews);
        _summary = page.summary;
        _pagination = page.pagination;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'We could not load the reviews.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_pagination.hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(shopperRepositoryProvider)
          .productReviews(widget.productId, page: _pagination.page + 1);
      if (!mounted) return;
      setState(() {
        _reviews.addAll(page.reviews);
        _pagination = page.pagination;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnack(context, 'We could not load more reviews.', error: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: SectionLabel('Reviews')),
            if (_summary.count > 0)
              Text(
                plural(_summary.count, 'review'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (_loading)
          const Column(
            children: [
              SkeletonBox(height: 86),
              SizedBox(height: 10),
              SkeletonBox(height: 110),
            ],
          )
        else if (_error != null)
          ErrorNotice(message: _error!, onRetry: _loadInitial)
        else if (_reviews.isEmpty)
          SurfaceCard(
            padding: const EdgeInsets.all(18),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.rate_review_outlined,
                  size: 22,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'No reviews yet. Shoppers can review this item after their '
                    'order is delivered.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          )
        else ...[
          _RatingPanel(summary: _summary),
          const SizedBox(height: 10),
          for (final review in _reviews)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _ReviewCard(review: review),
            ),
          if (_pagination.hasMore)
            AppButton(
              label: _loadingMore ? 'Loading reviews' : 'Show more reviews',
              variant: AppButtonVariant.outline,
              loading: _loadingMore,
              onPressed: _loadingMore ? null : _loadMore,
            ),
        ],
      ],
    );
  }
}

class _RatingPanel extends StatelessWidget {
  const _RatingPanel({required this.summary});

  final RatingSummary summary;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Text(
                summary.average.toStringAsFixed(1),
                style: Theme.of(context).textTheme.headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              StarRating(rating: summary.average, size: 14),
              const SizedBox(height: 3),
              Text(
                '${summary.count}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              children: [
                for (var stars = 5; stars >= 1; stars--)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 12,
                          child: Text(
                            '$stars',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                        const Icon(
                          Icons.star_rounded,
                          size: 12,
                          color: AppColors.gold,
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: summary.count == 0
                                  ? 0
                                  : summary.countFor(stars) / summary.count,
                              minHeight: 7,
                              backgroundColor: AppColors.paperDeep,
                              valueColor: const AlwaysStoppedAnimation(
                                AppColors.gold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        SizedBox(
                          width: 34,
                          child: Text(
                            '${summary.countFor(stars)}',
                            textAlign: TextAlign.right,
                            maxLines: 1,
                            overflow: TextOverflow.clip,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final ProductReview review;

  @override
  Widget build(BuildContext context) {
    final name = review.reviewerName ?? 'CityCart shopper';
    return SurfaceCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Avatar(name: name, size: 38),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 3),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        StarRating(rating: review.rating.toDouble(), size: 13),
                        Text(
                          formatDate(review.createdAt),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        if (review.verifiedPurchase)
                          const Pill(
                            text: 'Verified',
                            background: AppColors.sage,
                            foreground: AppColors.sageInk,
                            icon: Icons.check_circle_outline_rounded,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if ((review.title ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(review.title!, style: Theme.of(context).textTheme.titleSmall),
          ],
          if ((review.comment ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              review.comment!,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ],
      ),
    );
  }
}
