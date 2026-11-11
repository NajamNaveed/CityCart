import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../auth/server_sheet.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    if (user == null) return const SizedBox.shrink();
    final settings = ref.watch(serverSettingsProvider);

    return ListView(
      padding: const EdgeInsets.only(bottom: 30),
      children: [
        PageHeader(
          eyebrow: roleName(user.role),
          title: user.name,
          subtitle: user.email,
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
              SurfacePanel(
                child: Row(
                  children: [
                    AvatarBadge(name: user.name, size: 52),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user.email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 6),
                          StatusTag(
                            label: roleName(user.role),
                            tone: user.isProvider
                                ? AppTone.blue
                                : AppTone.green,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              const SectionTitle('Business'),
              if (user.isProvider) ...[
                _BusinessCard(
                  name: user.provider?.displayName ?? user.businessName,
                  status: user.provider?.status,
                ),
                const SizedBox(height: 10),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        key: const Key('account_offerings'),
                        icon: Icons.home_repair_service_outlined,
                        label: 'Services and prices',
                        value: 'Manage what customers can book',
                        onTap: () => context.push('/offerings'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_availability'),
                        icon: Icons.schedule_rounded,
                        label: 'Working hours',
                        value: 'Set the days and times you work',
                        onTap: () => context.push('/availability'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_provider_profile'),
                        icon: Icons.storefront_outlined,
                        label: 'Business profile',
                        value: 'Name, phone and service area',
                        onTap: () => context.push('/profile'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const SectionTitle('Customers'),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        key: const Key('account_messages'),
                        icon: Icons.forum_outlined,
                        label: 'Messages',
                        value: 'Job chats and customer questions',
                        onTap: () => context.push('/messages'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_reviews'),
                        icon: Icons.star_outline_rounded,
                        label: 'Reviews',
                        value: 'Read reviews and reply once',
                        onTap: () => context.push('/reviews'),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                const _BrandBusinessCard(),
                const SizedBox(height: 10),
                SurfacePanel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      InfoRow(
                        key: const Key('account_orders'),
                        icon: Icons.receipt_long_outlined,
                        label: 'Orders',
                        value: 'Confirm and prepare customer orders',
                        onTap: () => context.push('/brand-orders'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_products'),
                        icon: Icons.inventory_2_outlined,
                        label: 'Products',
                        value: 'Prices, stock and visibility',
                        onTap: () => context.push('/brand-products'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_deliveries'),
                        icon: Icons.local_shipping_outlined,
                        label: 'Deliveries',
                        value: 'Parcels on their way to customers',
                        onTap: () => context.push('/brand-deliveries'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_returns'),
                        icon: Icons.assignment_return_outlined,
                        label: 'Returns',
                        value: 'Goods coming back to your shop',
                        onTap: () => context.push('/brand-returns'),
                      ),
                      const Divider(indent: 66),
                      InfoRow(
                        key: const Key('account_riders'),
                        icon: Icons.sports_motorsports_outlined,
                        label: 'Riders',
                        value: 'People who deliver your orders',
                        onTap: () => context.push('/brand-riders'),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 22),
              const SectionTitle('Security'),
              SurfacePanel(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: InfoRow(
                  key: const Key('account_change_password'),
                  icon: Icons.lock_outline_rounded,
                  label: 'Password',
                  value: 'Change your password',
                  onTap: () => _changePassword(context, ref),
                ),
              ),
              const SizedBox(height: 22),
              const SectionTitle('App'),
              SurfacePanel(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  children: [
                    InfoRow(
                      key: const Key('account_server'),
                      icon: Icons.cloud_outlined,
                      label: 'Server',
                      value: settings.url ?? 'No server address set',
                      onTap: settings.isLockedByBuild
                          ? null
                          : () =>
                                showServerAddressSheet(context, ref, settings),
                      trailing: settings.isLockedByBuild
                          ? const StatusTag(label: 'Built in')
                          : null,
                    ),
                    const Divider(indent: 66),
                    const InfoRow(
                      icon: Icons.info_outline_rounded,
                      label: 'App version',
                      value: 'CityCart Business ${AppConfig.appVersion}',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              AppButton(
                key: const Key('account_sign_out'),
                label: 'Sign out',
                icon: Icons.logout_rounded,
                variant: AppButtonVariant.danger,
                onPressed: () => _signOut(context, ref),
              ),
              const SizedBox(height: 14),
              Text(
                'Your session is private to this phone and ends automatically.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final changed = await showFormSheet<bool>(
      context,
      title: 'Change password',
      subtitle:
          'You will stay signed in on this phone. Other devices must sign in '
          'again.',
      child: const _PasswordSheet(),
    );
    if (changed == true && context.mounted) {
      showAppSnack(context, 'Password updated.');
    }
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final ok = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You will need your email and password to sign in again.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    await ref.read(sessionProvider).signOut();
  }
}

class _BusinessCard extends StatelessWidget {
  const _BusinessCard({required this.name, required this.status});

  final String name;
  final String? status;

  @override
  Widget build(BuildContext context) {
    return SurfacePanel(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          InfoRow(
            icon: Icons.storefront_outlined,
            label: 'Business name',
            value: name,
          ),
          if (status != null) ...[
            const Divider(indent: 66),
            InfoRow(
              icon: Icons.verified_outlined,
              label: 'Status',
              value: reviewStatusLabel(status!),
              trailing: StatusTag(
                label: reviewStatusLabel(status!),
                tone: reviewStatusTone(status!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BrandBusinessCard extends ConsumerWidget {
  const _BrandBusinessCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBrand = ref.watch(brandSummaryProvider);
    final brand = asyncBrand.asData?.value;

    if (brand == null && asyncBrand.hasError) {
      final error = asyncBrand.error;
      return SurfacePanel(
        child: Row(
          children: [
            Expanded(
              child: Text(
                error is ApiException
                    ? error.message
                    : 'Your shop could not be loaded right now.',
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            TextButton(
              onPressed: () => ref.invalidate(brandSummaryProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (brand == null) {
      return const SurfacePanel(
        child: Row(
          children: [
            SizedBox(
              width: 17,
              height: 17,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 11),
            Expanded(child: Text('Loading your shop…')),
          ],
        ),
      );
    }

    return SurfacePanel(
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
            label: 'Status',
            value: reviewStatusLabel(brand.status),
            trailing: StatusTag(
              label: reviewStatusLabel(brand.status),
              tone: reviewStatusTone(brand.status),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordSheet extends ConsumerStatefulWidget {
  const _PasswordSheet();

  @override
  ConsumerState<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends ConsumerState<_PasswordSheet> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
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
          .read(sessionProvider)
          .changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
            confirmPassword: _confirm.text,
          );
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
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            ErrorPanel(message: _error!),
            const SizedBox(height: 14),
          ],
          AppField(
            label: 'Current password',
            controller: _current,
            obscure: true,
            autofillHints: const [AutofillHints.password],
            textInputAction: TextInputAction.next,
            validator: (value) =>
                (value ?? '').isEmpty ? 'Enter your current password.' : null,
          ),
          const SizedBox(height: 13),
          AppField(
            label: 'New password',
            controller: _next,
            obscure: true,
            hint: 'At least 8 characters',
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.next,
            validator: (value) {
              final text = value ?? '';
              if (text.isEmpty) return 'Choose a new password.';
              if (text.length < 8) return 'Use at least 8 characters.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            label: 'Confirm new password',
            controller: _confirm,
            obscure: true,
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
            validator: (value) {
              if ((value ?? '').isEmpty) return 'Repeat the new password.';
              if (value != _next.text) return 'The passwords do not match.';
              return null;
            },
          ),
          const SizedBox(height: 20),
          AppButton(
            label: 'Save password',
            icon: Icons.check_rounded,
            loading: _busy,
            onPressed: _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}
