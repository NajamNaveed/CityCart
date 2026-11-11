import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';

/// A provider summary card: who they are, what they do, and where.
class ServiceProviderCard extends StatelessWidget {
  const ServiceProviderCard({
    super.key,
    required this.provider,
    required this.onTap,
  });

  final ServiceProvider provider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = [
      provider.categoryName,
      if (provider.placeLabel.isNotEmpty) provider.placeLabel,
    ].join(' • ');
    final distance = formatDistance(provider.distanceKm);
    final services = plural(
      provider.offeringCount == 0
          ? provider.topOfferings.length
          : provider.offeringCount,
      'service',
    );

    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BrandLogo(
                name: provider.displayName,
                url: provider.avatar,
                size: 56,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      provider.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        distance.isEmpty ? meta : '$meta • $distance',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 7),
                    if (provider.hasRating)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          StarRating(rating: provider.ratingAvg, size: 14),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              '${provider.ratingAvg.toStringAsFixed(1)} '
                              '(${provider.ratingCount})',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.inkSoft,
                              ),
                            ),
                          ),
                        ],
                      )
                    else
                      const StatusPill(
                        text: 'New on CityCart',
                        tone: StatusTone.info,
                        compact: true,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
          if (!provider.acceptingNewOrders) ...[
            const SizedBox(height: 10),
            const StatusPill(
              text: 'Not taking requests',
              tone: StatusTone.muted,
              compact: true,
            ),
          ],
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  'From ${formatMoney(provider.startingAtPrice)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  services,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.arrow_forward_rounded,
                size: 17,
                color: AppColors.forest,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The wide image at the top of a provider page, with a calm fallback.
class ServiceCover extends StatelessWidget {
  const ServiceCover({super.key, this.url, this.height = 132});

  final String? url;
  final double height;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.sage, AppColors.paperDeep],
        ),
      ),
      child: const Center(
        child: Icon(
          Icons.home_repair_service_outlined,
          size: 42,
          color: AppColors.sageInk,
        ),
      ),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: Image.network(
        url!,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => fallback,
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}
