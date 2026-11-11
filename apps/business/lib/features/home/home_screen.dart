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

/// The first screen after sign-in. A shop owner and a service provider see the
/// same greeting and the same account shortcut, over their own business facts.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    if (user == null) return const SizedBox.shrink();
    return user.isProvider ? _ProviderHome(user: user) : _BrandHome(user: user);
  }
}

String _friendlyError(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your business. Check the connection and try again.';
}

String _greetingTitle(String name) {
  return '${greetingFor(DateTime.now())}, ${firstNameOf(name)}';
}

class _ProviderHome extends ConsumerWidget {
  const _ProviderHome({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProfile = ref.watch(providerProfileProvider);
    final profile = asyncProfile.asData?.value;
    final status = profile?.status ?? user.provider?.status;

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(providerProfileProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          PageHeader(
            eyebrow: 'Service provider',
            title: _greetingTitle(user.name),
            subtitle: profile?.displayName ?? user.businessName,
            action: status == null
                ? null
                : StatusTag(
                    label: reviewStatusLabel(status),
                    tone: reviewStatusTone(status),
                  ),
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
                if (status != null && status != 'ACTIVE') ...[
                  NoticeBanner(
                    icon: Icons.hourglass_top_rounded,
                    message: reviewStatusMessage(status, provider: true) ?? '',
                  ),
                  const SizedBox(height: 16),
                ],
                if (asyncProfile.isLoading && profile == null)
                  const LoadingView(label: 'Loading your business')
                else if (asyncProfile.hasError && profile == null) ...[
                  ErrorPanel(
                    message: _friendlyError(asyncProfile.error),
                    onRetry: () => ref.invalidate(providerProfileProvider),
                  ),
                  const SizedBox(height: 16),
                ] else if (profile != null) ...[
                  Row(
                    children: [
                      Expanded(
                        child: MetricTile(
                          value: profile.ratingCount == 0
                              ? 'New'
                              : profile.ratingAvg.toStringAsFixed(1),
                          label: profile.ratingCount == 1
                              ? '1 review'
                              : '${profile.ratingCount} reviews',
                          tone: AppTone.amber,
                          icon: Icons.star_rounded,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: MetricTile(
                          value: '${profile.completedBookings}',
                          label: profile.completedBookings == 1
                              ? 'job completed'
                              : 'jobs completed',
                          tone: AppTone.green,
                          icon: Icons.task_alt_rounded,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  const SectionTitle('Your business'),
                  SurfacePanel(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      children: [
                        InfoRow(
                          icon: Icons.category_outlined,
                          label: 'Category',
                          value: profile.categoryName ?? 'Not set',
                        ),
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.place_outlined,
                          label: 'Service area',
                          value: profile.areaLabel,
                        ),
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.call_outlined,
                          label: 'Phone',
                          value: profile.phone?.trim().isNotEmpty == true
                              ? profile.phone!
                              : 'Not set',
                        ),
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.payments_outlined,
                          label: 'Starting price',
                          value: profile.startingAtPrice == null
                              ? 'Not set'
                              : 'From ${money(profile.startingAtPrice)}',
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('Work'),
                ActionTile(
                  icon: Icons.event_note_outlined,
                  title: 'Bookings',
                  subtitle: 'Accept requests, run jobs and close them out',
                  onTap: () => context.go('/bookings'),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Your services'),
                ActionTile(
                  icon: Icons.home_repair_service_outlined,
                  title: 'Services and prices',
                  subtitle: 'What customers can book and what it costs',
                  tone: AppTone.blue,
                  onTap: () => context.push('/offerings'),
                ),
                const SizedBox(height: 10),
                ActionTile(
                  icon: Icons.schedule_rounded,
                  title: 'Working hours',
                  subtitle: 'The days and times customers can book you',
                  tone: AppTone.amber,
                  onTap: () => context.push('/availability'),
                ),
                const SizedBox(height: 10),
                ActionTile(
                  icon: Icons.storefront_outlined,
                  title: 'Business profile',
                  subtitle: 'Your name, phone and service area',
                  tone: AppTone.green,
                  onTap: () => context.push('/profile'),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Account'),
                ActionTile(
                  icon: Icons.manage_accounts_outlined,
                  title: 'Profile and security',
                  subtitle: 'Change your password or sign out',
                  onTap: () => context.go('/account'),
                ),
                const SizedBox(height: 22),
                Text(
                  'Signed in as ${user.email}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BrandHome extends ConsumerWidget {
  const _BrandHome({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBrand = ref.watch(brandSummaryProvider);
    final brand = asyncBrand.asData?.value;
    final status = brand?.status ?? 'PENDING';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(brandSummaryProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          PageHeader(
            eyebrow: 'Shop owner',
            title: _greetingTitle(user.name),
            subtitle: brand?.name ?? 'Your shop',
            action: brand == null
                ? null
                : StatusTag(
                    label: reviewStatusLabel(status),
                    tone: reviewStatusTone(status),
                  ),
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
                if (asyncBrand.isLoading && brand == null)
                  const LoadingView(label: 'Loading your shop')
                else if (asyncBrand.hasError && brand == null) ...[
                  ErrorPanel(
                    message: _friendlyError(asyncBrand.error),
                    onRetry: () => ref.invalidate(brandSummaryProvider),
                  ),
                  const SizedBox(height: 16),
                ] else if (brand != null) ...[
                  if (reviewStatusMessage(status, provider: false) != null) ...[
                    NoticeBanner(
                      icon: status == 'PENDING'
                          ? Icons.hourglass_top_rounded
                          : Icons.info_outline_rounded,
                      message:
                          reviewStatusMessage(status, provider: false) ?? '',
                    ),
                    const SizedBox(height: 16),
                  ],
                  const SectionTitle('Your shop'),
                  SurfacePanel(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      children: [
                        InfoRow(
                          icon: Icons.storefront_outlined,
                          label: 'Shop name',
                          value: brand.name,
                        ),
                        const Divider(indent: 66),
                        InfoRow(
                          icon: Icons.verified_outlined,
                          label: 'Review status',
                          value: reviewStatusLabel(brand.status),
                        ),
                        if (brand.slug.trim().isNotEmpty) ...[
                          const Divider(indent: 66),
                          InfoRow(
                            icon: Icons.link_rounded,
                            label: 'Shop handle',
                            value: brand.slug,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                const SectionTitle('Account'),
                ActionTile(
                  icon: Icons.manage_accounts_outlined,
                  title: 'Profile and security',
                  subtitle: 'Change your password or sign out',
                  onTap: () => context.go('/account'),
                ),
                const SizedBox(height: 22),
                Text(
                  'Signed in as ${user.email}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
