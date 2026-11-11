import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Sign-in and, for a person who works for more than one brand, the brand
/// chooser on the same screen. Keeping both steps here means the router only
/// has to know about "signed out" and "signed in".
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _obscure = true;
  bool _busy = false;
  String? _error;

  String? _workspaceToken;
  List<Workspace> _workspaces = const [];
  String? _choosingBrandId;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
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
          .signIn(email: _email.text.trim(), password: _password.text);
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.needsWorkspace && error.workspaceToken != null) {
        final memberships = asList(error.extra?['memberships'])
            .map(Workspace.fromJson)
            .toList(growable: false);
        setState(() {
          _workspaceToken = error.workspaceToken;
          _workspaces = memberships;
          _error = null;
        });
      } else {
        setState(() => _error = error.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose(Workspace workspace) async {
    final token = _workspaceToken;
    if (token == null || _choosingBrandId != null) return;
    setState(() {
      _choosingBrandId = workspace.brandId;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider)
          .chooseWorkspace(
            workspaceToken: token,
            brandId: workspace.brandId,
            workspaces: _workspaces,
          );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _choosingBrandId = null;
      });
    }
  }

  void _useAnotherAccount() {
    _password.clear();
    setState(() {
      _workspaceToken = null;
      _workspaces = const [];
      _choosingBrandId = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(serverSettingsProvider);
    final inChooser = _workspaceToken != null;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
              children: [
                const _LoginMark(),
                const SizedBox(height: 26),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: inChooser
                      ? _WorkspaceChooser(
                          key: const ValueKey('workspace'),
                          workspaces: _workspaces,
                          busyBrandId: _choosingBrandId,
                          error: _error,
                          onChoose: _choose,
                          onBack: _useAnotherAccount,
                        )
                      : _SignInForm(
                          key: const ValueKey('form'),
                          formKey: _formKey,
                          email: _email,
                          password: _password,
                          obscure: _obscure,
                          busy: _busy,
                          error: _error,
                          onToggleObscure: () =>
                              setState(() => _obscure = !_obscure),
                          onSubmit: _submit,
                          notice: ref.watch(sessionProvider).notice,
                        ),
                ),
                const SizedBox(height: 26),
                _ServerFooter(settings: settings),
              ],
            ),
          ),
        ),
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
        const BrandMark(size: 60),
        const SizedBox(height: 20),
        Text(
          'CityCart Staff',
          style: Theme.of(context).textTheme.headlineMedium
              ?.copyWith(fontSize: 30),
        ),
        const SizedBox(height: 8),
        Text(
          'Picking, deliveries, returns and daily takings for your store team.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}

class _SignInForm extends StatelessWidget {
  const _SignInForm({
    super.key,
    required this.formKey,
    required this.email,
    required this.password,
    required this.obscure,
    required this.busy,
    required this.error,
    required this.onToggleObscure,
    required this.onSubmit,
    required this.notice,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController email;
  final TextEditingController password;
  final bool obscure;
  final bool busy;
  final String? error;
  final String? notice;
  final VoidCallback onToggleObscure;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (notice != null) ...[
            NoticeCard(
              title: 'Please sign in',
              message: notice!,
              icon: Icons.lock_clock_outlined,
              tone: StatusTone.amber,
            ),
            const SizedBox(height: 16),
          ],
          if (error != null) ...[
            NoticeCard(
              title: "Couldn't sign in",
              message: error!,
              icon: Icons.error_outline_rounded,
              tone: StatusTone.danger,
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Work email',
              hintText: 'you@yourbrand.com',
              prefixIcon: Icon(Icons.alternate_email_rounded, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Enter your work email.';
              if (!text.contains('@') || !text.contains('.')) {
                return 'Enter a valid email address.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: password,
            obscureText: obscure,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onFieldSubmitted: (_) => onSubmit(),
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.key_rounded, size: 20),
              suffixIcon: IconButton(
                onPressed: onToggleObscure,
                tooltip: obscure ? 'Show password' : 'Hide password',
                icon: Icon(
                  obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  size: 20,
                ),
              ),
            ),
            validator: (value) =>
                (value ?? '').isEmpty ? 'Enter your password.' : null,
          ),
          const SizedBox(height: 20),
          AppButton(
            label: 'Sign in',
            icon: Icons.login_rounded,
            loading: busy,
            onPressed: busy ? null : onSubmit,
          ),
          const SizedBox(height: 14),
          Text(
            'Your brand manager creates this account. If you cannot sign in, '
            'ask them to check your access.',
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _WorkspaceChooser extends StatelessWidget {
  const _WorkspaceChooser({
    super.key,
    required this.workspaces,
    required this.busyBrandId,
    required this.error,
    required this.onChoose,
    required this.onBack,
  });

  final List<Workspace> workspaces;
  final String? busyBrandId;
  final String? error;
  final ValueChanged<Workspace> onChoose;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Which brand are you working for?',
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontSize: 22),
        ),
        const SizedBox(height: 6),
        Text(
          'You can sign out and sign back in to choose a different brand later.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        if (error != null) ...[
          NoticeCard(
            title: "Couldn't open that brand",
            message: error!,
            icon: Icons.error_outline_rounded,
            tone: StatusTone.danger,
          ),
          const SizedBox(height: 12),
        ],
        if (workspaces.isEmpty)
          NoticeCard(
            title: 'No brand available',
            message: 'This account has no active brand access. Ask your brand manager to check it.',
            icon: Icons.storefront_outlined,
            tone: StatusTone.amber,
          )
        else
          ...workspaces.map((workspace) {
            final busy = busyBrandId == workspace.brandId;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                onTap: busyBrandId == null ? () => onChoose(workspace) : null,
                padding: const EdgeInsets.fromLTRB(16, 15, 14, 15),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.sage,
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.storefront_rounded,
                        size: 21,
                        color: AppColors.sageInk,
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            workspace.brandName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            friendlyRole(workspace.role),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (busy)
                      const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: AppColors.forest,
                        ),
                      )
                    else
                      const Icon(
                        Icons.chevron_right_rounded,
                        color: AppColors.muted,
                      ),
                  ],
                ),
              ),
            );
          }),
        const SizedBox(height: 4),
        TextButton(
          onPressed: busyBrandId == null ? onBack : null,
          child: const Text('Use another account'),
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
            constraints: const BoxConstraints(maxWidth: 250),
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
          'Use the address of your CityCart API, for example '
          'http://10.0.2.2:5000 on an Android emulator.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Server address',
              hintText: 'https://api.yourbrand.com',
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
