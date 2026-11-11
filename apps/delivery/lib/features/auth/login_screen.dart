import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;

    if (email.isEmpty || !email.contains('@')) {
      setState(
        () => _error = 'Enter the email address your store set up for you.',
      );
      return;
    }
    if (password.isEmpty) {
      setState(() => _error = 'Enter your password.');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(sessionProvider).signIn(email: email, password: password);
      if (!mounted) return;
      context.go('/today');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openServerSetup() async {
    final saved = await showAppSheet<String>(
      context,
      title: 'Connect to a server',
      child: const _ServerSheet(),
    );
    if (saved == null || !mounted) return;
    ref.read(apiClientProvider).setBaseUrl(saved);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final configured = ref.watch(apiClientProvider).isConfigured;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          Positioned(
            right: -90,
            top: -110,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                color: AppColors.sage.withValues(alpha: 0.55),
                shape: BoxShape.circle,
              ),
            ),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight - 48,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          BrandMark(size: 42),
                          SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'CityCart',
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.ink,
                                ),
                              ),
                              Text(
                                'Delivery app',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 46),
                      Text(
                        'Today’s route,\none job at a time.',
                        style: Theme.of(context).textTheme.displayMedium
                            ?.copyWith(fontSize: 38, height: 1.08),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Sign in with the rider account your store created for you.',
                        style: Theme.of(context).textTheme.bodyLarge
                            ?.copyWith(color: AppColors.muted),
                      ),
                      const SizedBox(height: 40),
                      if (!configured) ...[
                        SurfaceCard(
                          color: AppColors.amber,
                          borderColor: AppColors.amber,
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(
                                    Icons.cloud_off_rounded,
                                    size: 19,
                                    color: AppColors.amberInk,
                                  ),
                                  SizedBox(width: 8),
                                  Text(
                                    'No server set up',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.amberInk,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'Tap “Set up server” below and enter the address once. You only need to do this when the app was built without one.',
                                style: TextStyle(
                                  fontSize: 13.5,
                                  height: 1.4,
                                  color: AppColors.amberInk,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (session.notice != null) ...[
                        ErrorNotice(
                          message: session.notice!,
                          onDismiss: session.clearNotice,
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (_error != null) ...[
                        ErrorNotice(message: _error!),
                        const SizedBox(height: 16),
                      ],
                      SurfaceCard(
                        padding: const EdgeInsets.all(20),
                        child: AutofillGroup(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SectionLabel('Rider sign in'),
                              const SizedBox(height: 16),
                              TextField(
                                controller: _email,
                                enabled: !_busy,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                autofillHints: const [
                                  AutofillHints.username,
                                  AutofillHints.email,
                                ],
                                onSubmitted: (_) =>
                                    _passwordFocus.requestFocus(),
                                decoration: const InputDecoration(
                                  labelText: 'Email',
                                  hintText: 'you@store.com',
                                  prefixIcon: Icon(
                                    Icons.alternate_email_rounded,
                                    size: 20,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _password,
                                focusNode: _passwordFocus,
                                enabled: !_busy,
                                obscureText: _obscure,
                                textInputAction: TextInputAction.done,
                                autofillHints: const [AutofillHints.password],
                                onSubmitted: (_) => _submit(),
                                decoration: InputDecoration(
                                  labelText: 'Password',
                                  prefixIcon: const Icon(
                                    Icons.lock_outline_rounded,
                                    size: 20,
                                  ),
                                  suffixIcon: IconButton(
                                    onPressed: () =>
                                        setState(() => _obscure = !_obscure),
                                    icon: Icon(
                                      _obscure
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                      size: 20,
                                      color: AppColors.muted,
                                    ),
                                    tooltip: _obscure
                                        ? 'Show password'
                                        : 'Hide password',
                                  ),
                                ),
                              ),
                              const SizedBox(height: 18),
                              AppButton(
                                label: configured ? 'Sign in' : 'Set up server',
                                loading: _busy,
                                onPressed: configured
                                    ? _submit
                                    : _openServerSetup,
                                icon: configured
                                    ? Icons.arrow_forward_rounded
                                    : Icons.dns_outlined,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Center(
                        child: Text(
                          'Rider accounts only · CityCart',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                      if (configured && !settingsLocked(ref)) ...[
                        const SizedBox(height: 4),
                        Center(
                          child: TextButton(
                            onPressed: _openServerSetup,
                            child: Text(
                              'Server: ${ref.watch(apiClientProvider).baseUrl}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool settingsLocked(WidgetRef ref) =>
      ref.watch(serverSettingsProvider).isLockedByBuild;
}

/// Owns the address field for as long as the sheet exists. The controller must
/// outlive `Navigator.pop`, because the closing animation still builds the
/// field.
class _ServerSheet extends ConsumerStatefulWidget {
  const _ServerSheet();

  @override
  ConsumerState<_ServerSheet> createState() => _ServerSheetState();
}

class _ServerSheetState extends ConsumerState<_ServerSheet> {
  late final TextEditingController _controller;
  String? _problem;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: ref.read(serverSettingsProvider).url ?? AppConfig.suggestedDevUrl,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _problem = null;
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
        _problem = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'This build has no server address. Enter it once while testing; a release build has the address built in.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _controller,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Server address',
            hintText: AppConfig.suggestedDevUrl,
            errorText: _problem,
          ),
        ),
        const SizedBox(height: 14),
        AppButton(label: 'Save address', loading: _busy, onPressed: _save),
      ],
    );
  }
}
