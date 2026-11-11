import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../providers.dart';
import '../cart/cart_controller.dart';

enum _AuthMode { signIn, register }

/// Sign in or create a shopper account. A new account has to be verified from
/// the inbox before the first sign-in, so registration ends on a clear
/// "check your email" panel rather than pretending the shopper is inside.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  _AuthMode _mode = _AuthMode.signIn;
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  String? _registeredEmail;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _switchMode(_AuthMode mode) {
    if (_busy || mode == _mode) return;
    setState(() {
      _mode = mode;
      _error = null;
      _registeredEmail = null;
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
      if (_mode == _AuthMode.signIn) {
        await ref
            .read(sessionProvider)
            .signIn(email: _email.text.trim(), password: _password.text);
        ref.invalidate(cartProvider);
      } else {
        final user = await ref
            .read(sessionProvider)
            .register(
              name: _name.text.trim(),
              email: _email.text.trim(),
              password: _password.text,
            );
        if (!mounted) return;
        setState(() {
          _registeredEmail = user.email.isEmpty
              ? _email.text.trim()
              : user.email;
          _password.clear();
        });
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.needsEmailVerification
            ? '${error.message} Check your inbox, then sign in.'
            : error.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(serverSettingsProvider);
    final notice = ref.watch(sessionProvider).notice;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 30, 24, 32),
              children: [
                const _LoginMark(),
                const SizedBox(height: 26),
                if (_registeredEmail != null)
                  _CheckInbox(
                    email: _registeredEmail!,
                    onBack: () {
                      setState(() {
                        _registeredEmail = null;
                        _mode = _AuthMode.signIn;
                      });
                    },
                  )
                else ...[
                  SegmentedControl<_AuthMode>(
                    values: const [_AuthMode.signIn, _AuthMode.register],
                    labelOf: (mode) =>
                        mode == _AuthMode.signIn ? 'Sign in' : 'Create account',
                    value: _mode,
                    onChanged: _switchMode,
                  ),
                  const SizedBox(height: 20),
                  _buildForm(notice),
                ],
                const SizedBox(height: 30),
                _ServerFooter(settings: settings),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildForm(String? notice) {
    final registering = _mode == _AuthMode.register;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (notice != null) ...[
            NoticeCard(
              title: 'Please sign in',
              message: notice,
              icon: Icons.lock_clock_outlined,
              tone: StatusTone.amber,
            ),
            const SizedBox(height: 16),
          ],
          if (_error != null) ...[
            NoticeCard(
              title: registering
                  ? "Couldn't create the account"
                  : "Couldn't sign in",
              message: _error!,
              icon: Icons.error_outline_rounded,
              tone: StatusTone.danger,
            ),
            const SizedBox(height: 16),
          ],
          if (registering) ...[
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name],
              decoration: const InputDecoration(
                labelText: 'Your name',
                hintText: 'Sana Iqbal',
                prefixIcon: Icon(Icons.person_outline_rounded, size: 20),
              ),
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 2) return 'Enter your name.';
                return null;
              },
            ),
            const SizedBox(height: 12),
          ],
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
              hintText: 'you@example.com',
              prefixIcon: Icon(Icons.alternate_email_rounded, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Enter your email.';
              if (!text.contains('@') || !text.contains('.')) {
                return 'Enter a valid email address.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            autofillHints: registering
                ? const [AutofillHints.newPassword]
                : const [AutofillHints.password],
            onFieldSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Password',
              helperText: registering ? 'At least 8 characters.' : null,
              prefixIcon: const Icon(Icons.key_rounded, size: 20),
              suffixIcon: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                tooltip: _obscure ? 'Show password' : 'Hide password',
                icon: Icon(
                  _obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  size: 20,
                ),
              ),
            ),
            validator: (value) {
              final text = value ?? '';
              if (text.isEmpty) return 'Enter your password.';
              if (registering && text.length < 8) {
                return 'Use at least 8 characters.';
              }
              return null;
            },
          ),
          const SizedBox(height: 22),
          AppButton(
            label: registering ? 'Create account' : 'Sign in',
            icon: registering
                ? Icons.person_add_alt_1_rounded
                : Icons.login_rounded,
            loading: _busy,
            onPressed: _busy ? null : _submit,
          ),
          const SizedBox(height: 14),
          Text(
            registering
                ? 'We will email you a link to confirm your address before you sign in.'
                : 'Shops and services around your neighbourhood, in one place.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _LoginMark extends StatelessWidget {
  const _LoginMark();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            color: AppColors.forest,
            borderRadius: BorderRadius.circular(18),
          ),
          child: const Icon(
            Icons.shopping_bag_rounded,
            size: 31,
            color: AppColors.surface,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'CityCart',
          style: Theme.of(context).textTheme.headlineMedium
              ?.copyWith(fontSize: 32),
        ),
        const SizedBox(height: 8),
        Text(
          'Local shops and trusted service providers, just around your block.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}

class _CheckInbox extends StatelessWidget {
  const _CheckInbox({required this.email, required this.onBack});

  final String email;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: AppColors.sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.mark_email_read_outlined,
              size: 25,
              color: AppColors.sageInk,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Check your inbox',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'We sent a confirmation link to $email. Open it, then come back and sign in.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 18),
          AppButton(
            label: 'I have confirmed my email',
            icon: Icons.login_rounded,
            onPressed: onBack,
          ),
        ],
      ),
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
        runSpacing: 4,
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
              onPressed: () => _editServer(context, ref),
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

  Future<void> _editServer(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: settings.url ?? '');
    final saved = await showAppSheet<bool>(
      context,
      title: 'Server address',
      subtitle:
          'Use the address of your CityCart API. On an Android emulator with '
          'the server on this computer, that is usually http://10.0.2.2:5000.',
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
                if (context.mounted) Navigator.of(context).pop(true);
              } on FormatException catch (error) {
                if (!context.mounted) return;
                showAppSnack(context, error.message);
              }
            },
          ),
        ],
      ),
    );
    controller.dispose();
    if (saved == true && context.mounted) {
      ref.read(apiClientProvider).setBaseUrl(settings.url);
      showAppSnack(context, 'Server address saved.');
    }
  }
}
