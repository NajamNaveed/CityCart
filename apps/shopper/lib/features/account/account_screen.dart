import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../providers.dart';
import '../cart/cart_controller.dart';
import '../notifications/notifications_controller.dart';

/// The shopper's account: who you are, where you shop, saved addresses, the
/// notification inbox, and the support details published by the platform.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  bool _signingOut = false;

  Future<void> _signOut() async {
    if (_signingOut) return;
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'Your cart and saved area stay on this device.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!confirmed) return;
    setState(() => _signingOut = true);
    await ref.read(sessionProvider).signOut();
    ref.invalidate(cartProvider);
    if (mounted) setState(() => _signingOut = false);
  }

  Future<void> _editServer() async {
    final settings = ref.read(serverSettingsProvider);
    if (settings.isLockedByBuild) return;
    final controller = TextEditingController(text: settings.url ?? '');
    final saved = await showAppSheet<bool>(
      context,
      title: 'Server address',
      subtitle: 'Where the CityCart app sends its requests.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Server address',
              hintText: 'https://api.example.com',
              prefixIcon: Icon(Icons.link_rounded, size: 20),
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            label: 'Save address',
            icon: Icons.check_rounded,
            onPressed: () async {
              try {
                await settings.save(controller.text);
                if (!mounted) return;
                Navigator.of(context).pop(true);
              } on FormatException catch (error) {
                if (!mounted) return;
                showAppSnack(context, error.message);
              }
            },
          ),
        ],
      ),
    );
    controller.dispose();
    if (saved == true && mounted) {
      ref.read(apiClientProvider).setBaseUrl(settings.url);
      setState(() {});
      showAppSnack(context, 'Server address saved.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final areaController = ref.watch(areaProvider);
    final settings = ref.watch(serverSettingsProvider);
    final notifications = ref.watch(notificationsProvider);

    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: Listenable.merge([
            session,
            areaController,
            notifications,
          ]),
          builder: (context, _) {
            final user = session.user;
            final area = areaController.area;
            final unread = notifications.unreadCount;
            return ListView(
              padding: const EdgeInsets.only(bottom: 30),
              children: [
                PageHeader(
                  eyebrow: 'Your account',
                  title: user == null ? 'You' : firstNameOf(user.name),
                  subtitle: user?.email,
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                  child: Column(
                    children: [
                      SurfaceCard(
                        child: Row(
                          children: [
                            Avatar(name: user?.name ?? 'Shopper', size: 56),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    user?.name ?? 'Shopper',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge,
                                  ),
                                  if ((user?.email ?? '').isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      user!.email,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall,
                                    ),
                                  ],
                                  const SizedBox(height: 8),
                                  const Pill(
                                    text: 'Customer account',
                                    background: AppColors.sage,
                                    foreground: AppColors.sageInk,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      _MenuCard(
                        children: [
                          _MenuRow(
                            icon: Icons.receipt_long_outlined,
                            title: 'Your orders',
                            subtitle: 'Track, review and buy again',
                            onTap: () => context.push('/orders'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.event_available_outlined,
                            title: 'Your bookings',
                            subtitle: 'Service visits, offers and reviews',
                            onTap: () => context.push('/bookings'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.forum_outlined,
                            title: 'Messages',
                            subtitle: 'Chats with shops and providers',
                            onTap: () => context.push('/messages'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.notifications_none_rounded,
                            title: 'Notifications',
                            subtitle: unread == 0
                                ? 'Order, booking and payment updates'
                                : '$unread unread '
                                      '${unread == 1 ? 'update' : 'updates'}',
                            trailing: unread == 0
                                ? null
                                : _UnreadCount(count: unread),
                            onTap: () => context.push('/notifications'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.place_outlined,
                            title: 'Delivery area',
                            subtitle: area?.label ?? 'Choose your area',
                            onTap: () => context.push('/area'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.location_on_outlined,
                            title: 'Saved addresses',
                            subtitle: 'Used at checkout and for bookings',
                            onTap: () => context.push('/addresses'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.dns_outlined,
                            title: 'Server address',
                            subtitle: settings.url ?? 'Not set',
                            trailing: settings.isLockedByBuild
                                ? const Icon(
                                    Icons.lock_outline_rounded,
                                    size: 18,
                                    color: AppColors.muted,
                                  )
                                : null,
                            onTap: settings.isLockedByBuild
                                ? null
                                : _editServer,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      _MenuCard(
                        children: [
                          _MenuRow(
                            icon: Icons.help_outline_rounded,
                            title: 'Help & support',
                            subtitle: 'Answers and contact details',
                            onTap: () => context.push('/help'),
                          ),
                          const Divider(),
                          _MenuRow(
                            icon: Icons.info_outline_rounded,
                            title: 'About CityCart',
                            subtitle: 'Version ${AppConfig.appVersion}',
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      AppButton(
                        label: 'Sign out',
                        icon: Icons.logout_rounded,
                        variant: AppButtonVariant.outline,
                        loading: _signingOut,
                        onPressed: _signingOut ? null : _signOut,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Shops and services around your block.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  const _MenuCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: EdgeInsets.zero,
      child: Column(children: children),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.paperDeep,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: AppColors.inkSoft),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null)
            trailing!
          else if (onTap != null)
            const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );

    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: content,
    );
  }
}

class _UnreadCount extends StatelessWidget {
  const _UnreadCount({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.clay,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Text(
        count > 9 ? '9+' : '$count',
        maxLines: 1,
        style: const TextStyle(
          fontSize: 11,
          height: 1.1,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
        ),
      ),
    );
  }
}
