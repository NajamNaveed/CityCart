import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/permissions.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  bool _busy = false;

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      await ref.read(sessionProvider).refreshProfile();
      if (!mounted) return;
      showAppSnack(context, 'Profile reloaded.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _switchWorkspace(Workspace workspace) async {
    setState(() => _busy = true);
    try {
      await ref.read(sessionProvider).switchWorkspace(workspace.brandId);
      if (!mounted) return;
      showAppSnack(context, 'Now working for ${workspace.brandName}.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You will need your email and password to sign back in.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(sessionProvider).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final access = ref.watch(accessProvider);
    final user = session.user;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            ScreenTopBar(
              title: 'Account',
              onBack: () {
                if (context.canPop()) context.pop();
              },
            ),
            if (user == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  icon: Icons.person_off_outlined,
                  title: 'Not signed in',
                  message: 'Sign in to see your account.',
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                child: _ProfileCard(user: user),
              ),
              if (session.profileIncomplete || session.isOffline)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                  child: NoticeCard(
                    title: session.isOffline
                        ? 'Working offline'
                        : 'Access details missing',
                    message: session.isOffline
                        ? 'The server could not be reached, so this may be out of date. '
                              'Pull down or tap retry when you have signal.'
                        : 'Your permissions could not be loaded, so some tabs may be hidden.',
                    icon: Icons.cloud_off_outlined,
                    tone: StatusTone.amber,
                    action: AppButton(
                      label: 'Retry',
                      variant: AppButtonVariant.outline,
                      expand: false,
                      height: 44,
                      loading: _busy,
                      onPressed: _busy ? null : _refresh,
                    ),
                  ),
                ),
              const SizedBox(height: 22),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: SectionLabel('Your access'),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _AccessCard(access: access),
              ),
              if (session.workspaces.length > 1) ...[
                const SizedBox(height: 22),
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: SectionLabel('Brand'),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: _WorkspaceCard(
                    workspaces: session.workspaces,
                    currentBrandId: user.brandId,
                    busy: _busy,
                    onSwitch: _switchWorkspace,
                  ),
                ),
              ],
              const SizedBox(height: 22),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: SectionLabel('App'),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SurfaceCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      InfoRow(
                        label: 'Signed in as',
                        value: user.email.isEmpty ? 'No email' : user.email,
                      ),
                      const Divider(height: 1, color: AppColors.line),
                      InfoRow(label: 'Version', value: AppConfig.appVersion),
                      const Divider(height: 1, color: AppColors.line),
                      Padding(
                        padding: const EdgeInsets.all(6),
                        child: AppButton(
                          label: 'Sign out',
                          icon: Icons.logout_rounded,
                          variant: AppButtonVariant.danger,
                          height: 48,
                          onPressed: _signOut,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Text(
                  'CityCart Staff · work accounts are managed by your brand.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Avatar(name: user.name, size: 54),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 3),
                Text(
                  user.email,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    Pill(
                      text: friendlyRole(user.role),
                      background: AppColors.sage,
                      foreground: AppColors.sageInk,
                      icon: Icons.badge_outlined,
                    ),
                    if (user.isPicker)
                      const Pill(
                        text: 'Picking app',
                        background: AppColors.surfaceMuted,
                        foreground: AppColors.inkSoft,
                        icon: Icons.inventory_2_outlined,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.access});

  final StaffAccess access;

  @override
  Widget build(BuildContext context) {
    final rows = <(String, bool, String)>[
      if (access.isPicker)
        ('Pick orders', true, 'Queue, picking and packing')
      else ...[
        ('Orders', access.orders, 'Look up an order and its payment'),
        ('Deliveries', access.deliveries, 'Track jobs and assign riders'),
        ('Returns', access.returns, 'Take returned goods back in'),
        ('Money', access.money, 'Receipts, payment checks and cash'),
      ],
    ];
    return SurfaceCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.line),
            _AccessRow(
              label: rows[i].$1,
              allowed: rows[i].$2,
              detail: rows[i].$3,
            ),
          ],
        ],
      ),
    );
  }
}

class _AccessRow extends StatelessWidget {
  const _AccessRow({
    required this.label,
    required this.allowed,
    required this.detail,
  });

  final String label;
  final bool allowed;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 13, 16, 13),
      child: Row(
        children: [
          Icon(
            allowed ? Icons.check_circle_outline_rounded : Icons.lock_outline,
            size: 20,
            color: allowed ? AppColors.sageInk : AppColors.muted,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 1),
                Text(
                  allowed ? detail : 'Ask your brand manager for access',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
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

class _WorkspaceCard extends StatelessWidget {
  const _WorkspaceCard({
    required this.workspaces,
    required this.currentBrandId,
    required this.busy,
    required this.onSwitch,
  });

  final List<Workspace> workspaces;
  final String? currentBrandId;
  final bool busy;
  final ValueChanged<Workspace> onSwitch;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'You belong to more than one brand. Switching reloads this app for '
            'the brand you choose.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: workspaces
                .map((workspace) {
                  final active = workspace.brandId == currentBrandId;
                  return ActionChip(
                    avatar: Icon(
                      active ? Icons.check_rounded : Icons.storefront_outlined,
                      size: 17,
                      color: active ? AppColors.sageInk : AppColors.muted,
                    ),
                    label: Text(
                      workspace.brandName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    backgroundColor: active
                        ? AppColors.sage
                        : AppColors.surfaceMuted,
                    side: BorderSide(
                      color: active ? AppColors.sageInk : AppColors.line,
                    ),
                    onPressed: active || busy
                        ? null
                        : () => onSwitch(workspace),
                  );
                })
                .toList(growable: false),
          ),
        ],
      ),
    );
  }
}
