import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../providers.dart';
import 'location_sharing.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message:
          'Your jobs are safe. You will need to sign in again to see them.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(locationSharingProvider).stopForSignOut();
    await ref.read(sessionProvider).signOut();
  }

  Future<void> _changeServer(BuildContext context, WidgetRef ref) async {
    final settings = ref.read(serverSettingsProvider);
    final saved = await showAppSheet<String>(
      context,
      title: 'Change server',
      child: _ServerSheet(initial: settings.url ?? AppConfig.suggestedDevUrl),
    );
    if (saved == null) return;
    ref.read(apiClientProvider).setBaseUrl(saved);
    await ref.read(locationSharingProvider).stopForSignOut();
    await ref.read(sessionProvider).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final user = session.user;
    final settings = ref.watch(serverSettingsProvider);
    final location = ref.watch(locationSharingProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          children: [
            Text(
              'Account',
              style: Theme.of(context).textTheme.headlineMedium
                  ?.copyWith(fontSize: 25),
            ),
            const SizedBox(height: 18),
            SurfaceCard(
              child: Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.sage,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                      initialsOf(user?.name),
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: AppColors.sageInk,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'Rider',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontSize: 19),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          user?.email ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 8),
                        const Pill(
                          text: 'Delivery rider',
                          background: AppColors.paper,
                          foreground: AppColors.inkSoft,
                          icon: Icons.two_wheeler_rounded,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (session.isOffline) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.amber,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.cloud_off_rounded,
                      size: 18,
                      color: AppColors.amberInk,
                    ),
                    SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        "You're offline. This is the last saved account; your jobs will load when the connection returns.",
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: AppColors.amberInk,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            const SectionLabel('While you deliver'),
            const SizedBox(height: 10),
            ListenableBuilder(
              listenable: location,
              builder: (context, _) {
                return SurfaceCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: AppColors.paper,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.near_me_outlined,
                              size: 19,
                              color: AppColors.forest,
                            ),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Share my location',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.ink,
                                  ),
                                ),
                                SizedBox(height: 2),
                                Text(
                                  'Only while a delivery is out',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: AppColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Switch(
                            value: location.enabled,
                            onChanged: location.busy
                                ? null
                                : (value) => location.setEnabled(value),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Your store uses this to see where its deliveries are. It is off by default, works only '
                        'while this app is open, and stops when you sign out.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      if (location.error != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.claySoft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            location.error!,
                            style: const TextStyle(
                              fontSize: 12.5,
                              height: 1.4,
                              color: AppColors.clay,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            const SectionLabel('Your jobs'),
            const SizedBox(height: 10),
            SurfaceCard(
              onTap: () => context.push('/history'),
              padding: const EdgeInsets.fromLTRB(16, 15, 12, 15),
              child: const Row(
                children: [
                  Icon(
                    Icons.history_rounded,
                    size: 20,
                    color: AppColors.inkSoft,
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Past deliveries',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 22,
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const SectionLabel('Connection'),
            const SizedBox(height: 10),
            SurfaceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.dns_outlined,
                        size: 18,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Server',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    settings.url ?? 'Not set up',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (settings.isLockedByBuild)
                    Text(
                      'This address is set when the app is built.',
                      style: Theme.of(context).textTheme.bodySmall,
                    )
                  else
                    AppButton(
                      label: 'Change server address',
                      variant: AppButtonVariant.outline,
                      height: 46,
                      expand: false,
                      onPressed: () => _changeServer(context, ref),
                    ),
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      const Icon(
                        Icons.info_outline_rounded,
                        size: 18,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'CityCart Delivery',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const Spacer(),
                      Text(
                        'v${AppConfig.appVersion}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            AppButton(
              label: 'Sign out',
              variant: AppButtonVariant.outline,
              icon: Icons.logout_rounded,
              onPressed: () => _signOut(context, ref),
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(
                'Need help with a job? Ask your store manager.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServerSheet extends ConsumerStatefulWidget {
  const _ServerSheet({required this.initial});

  final String initial;

  @override
  ConsumerState<_ServerSheet> createState() => _ServerSheetState();
}

class _ServerSheetState extends ConsumerState<_ServerSheet> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initial,
  );
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final saved = await ref
          .read(serverSettingsProvider)
          .save(_controller.text);
      if (!mounted) return;
      Navigator.of(context).pop(saved);
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'That address could not be saved. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Changing the server signs you out. Sign in again with the same rider account.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _controller,
          enabled: !_busy,
          keyboardType: TextInputType.url,
          autocorrect: false,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _save(),
          decoration: InputDecoration(
            labelText: 'Server address',
            hintText: AppConfig.suggestedDevUrl,
            errorText: _error,
            prefixIcon: const Icon(Icons.dns_outlined, size: 20),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Use the address your store gave you. The app adds /api/v1 if it is missing.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 18),
        AppButton(label: 'Save and sign out', loading: _busy, onPressed: _save),
        const SizedBox(height: 8),
        AppButton(
          label: 'Cancel',
          variant: AppButtonVariant.text,
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
