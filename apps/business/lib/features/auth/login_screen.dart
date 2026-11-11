import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/repository.dart';
import '../../providers.dart';
import 'server_sheet.dart';

/// One sign-in for two kinds of owner. The door chosen here is part of the
/// request, so a shop account is never looked up through the service door and
/// the server can say plainly which app an account belongs to.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  AccessDoor _door = AccessDoor.brand;
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _chooseDoor(AccessDoor door) {
    if (_busy || door == _door) return;
    setState(() {
      _door = door;
      _error = null;
    });
  }

  Future<void> _submit() async {
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
          .signIn(
            door: _door,
            email: _email.text.trim(),
            password: _password.text,
          );
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

  Future<void> _forgotPassword() async {
    final message = await showFormSheet<String>(
      context,
      title: 'Reset your password',
      subtitle: 'We will email you a link to choose a new password.',
      child: _ResetSheet(initialEmail: _email.text.trim()),
    );
    if (message != null && mounted) showAppSnack(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final settings = ref.watch(serverSettingsProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 470),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
              children: [
                const BusinessMark(size: 58),
                const SizedBox(height: 18),
                Text(
                  'CityCart Business',
                  style: Theme.of(context).textTheme.displaySmall
                      ?.copyWith(fontSize: 30),
                ),
                const SizedBox(height: 7),
                Text(
                  'Sign in to run your shop or your service business.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 26),
                if (session.notice != null) ...[
                  NoticeBanner(
                    icon: Icons.lock_clock_outlined,
                    message: session.notice!,
                    action: IconButton(
                      onPressed: session.clearNotice,
                      tooltip: 'Dismiss',
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.close_rounded, size: 18),
                    ),
                  ),
                  const SizedBox(height: 18),
                ],
                Text(
                  'Choose your account',
                  style: Theme.of(context).textTheme.labelMedium
                      ?.copyWith(color: AppColors.ink),
                ),
                const SizedBox(height: 9),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: _DoorCard(
                          key: const Key('door_brand'),
                          icon: Icons.storefront_rounded,
                          title: 'Shop owner',
                          subtitle: 'Orders, products and deliveries',
                          selected: _door == AccessDoor.brand,
                          onTap: () => _chooseDoor(AccessDoor.brand),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DoorCard(
                          key: const Key('door_service'),
                          icon: Icons.handyman_rounded,
                          title: 'Service provider',
                          subtitle: 'Bookings, offerings and messages',
                          selected: _door == AccessDoor.service,
                          onTap: () => _chooseDoor(AccessDoor.service),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                if (_error != null) ...[
                  ErrorPanel(message: _error!),
                  const SizedBox(height: 14),
                ],
                Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AppField(
                        label: 'Email',
                        controller: _email,
                        hint: 'you@example.com',
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        validator: (value) {
                          final text = value?.trim() ?? '';
                          if (text.isEmpty) return 'Enter your email.';
                          if (!text.contains('@') || !text.contains('.')) {
                            return 'Enter a valid email address.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 13),
                      AppField(
                        label: 'Password',
                        controller: _password,
                        hint: 'Your password',
                        obscure: _obscure,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _submit(),
                        suffix: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            size: 20,
                          ),
                        ),
                        validator: (value) {
                          if ((value ?? '').isEmpty) {
                            return 'Enter your password.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 20),
                      AppButton(
                        key: const Key('login_submit'),
                        label: 'Sign in',
                        icon: Icons.login_rounded,
                        loading: _busy,
                        onPressed: _busy ? null : _submit,
                      ),
                    ],
                  ),
                ),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 2,
                  children: [
                    TextButton(
                      onPressed: _busy ? null : _forgotPassword,
                      child: const Text('Forgot password?'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  'Team members use the CityCart Staff app. Riders use the '
                  'CityCart Delivery app.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 22),
                _ServerFooter(settings: settings),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DoorCard extends StatelessWidget {
  const _DoorCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? AppColors.mint : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          side: BorderSide(
            color: selected ? AppColors.forest : AppColors.line,
            width: selected ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      icon,
                      size: 21,
                      color: selected ? AppColors.forest : AppColors.inkSoft,
                    ),
                    const Spacer(),
                    Icon(
                      selected
                          ? Icons.check_circle_rounded
                          : Icons.circle_outlined,
                      size: 18,
                      color: selected ? AppColors.forest : AppColors.line,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: selected ? AppColors.forestInk : AppColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    color: selected ? AppColors.forestInk : AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ResetSheet extends ConsumerStatefulWidget {
  const _ResetSheet({required this.initialEmail});

  final String initialEmail;

  @override
  ConsumerState<_ResetSheet> createState() => _ResetSheetState();
}

class _ResetSheetState extends ConsumerState<_ResetSheet> {
  late final TextEditingController _email = TextEditingController(
    text: widget.initialEmail,
  );
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_busy) return;
    final email = _email.text.trim();
    if (email.isEmpty || !email.contains('@') || !email.contains('.')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final message = await ref
          .read(businessRepositoryProvider)
          .requestPasswordReset(email);
      if (mounted) Navigator.of(context).pop(message);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = "We couldn't reach CityCart. Check your connection.";
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _email,
          autofocus: true,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _send(),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          decoration: InputDecoration(
            labelText: 'Email',
            hintText: 'you@example.com',
            prefixIcon: const Icon(Icons.alternate_email_rounded, size: 20),
            errorText: _error,
          ),
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Send reset link',
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: _busy ? null : _send,
        ),
      ],
    );
  }
}

class _ServerFooter extends ConsumerWidget {
  const _ServerFooter({required this.settings});

  final ServerSettings settings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = settings.url;
    return Center(
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 6,
        runSpacing: 2,
        children: [
          Icon(
            settings.isConfigured
                ? Icons.cloud_done_outlined
                : Icons.cloud_off_outlined,
            size: 15,
            color: AppColors.muted,
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 240),
            child: Text(
              url ?? 'No server address set',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          if (!settings.isLockedByBuild)
            TextButton(
              onPressed: () => showServerAddressSheet(context, ref, settings),
              style: TextButton.styleFrom(
                minimumSize: const Size(0, 34),
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: const Text('Change'),
            ),
        ],
      ),
    );
  }
}
