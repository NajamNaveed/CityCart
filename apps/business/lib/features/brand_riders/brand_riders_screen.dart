import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your riders. Check the connection and try again.';
}

class _RiderFilter {
  const _RiderFilter(this.label, this.key, this.isActive);

  final String label;
  final String key;
  final bool? isActive;
}

const _filters = [
  _RiderFilter('Active', 'active', true),
  _RiderFilter('Turned off', 'off', false),
  _RiderFilter('Everyone', 'all', null),
];

enum _RiderAction { edit, password, toggle }

/// The people who deliver this shop's orders. Their sign-in is created and
/// controlled here; they use the rider app.
class BrandRidersScreen extends ConsumerStatefulWidget {
  const BrandRidersScreen({super.key});

  @override
  ConsumerState<BrandRidersScreen> createState() => _BrandRidersScreenState();
}

class _BrandRidersScreenState extends ConsumerState<BrandRidersScreen> {
  var _filterIndex = 0;
  var _items = const <BrandRider>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  String? _busy;
  var _request = 0;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({bool reset = true}) async {
    final token = ++_request;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      setState(() => _loadingMore = true);
    }

    try {
      final page = await ref
          .read(businessRepositoryProvider)
          .brandRiders(
            isActive: _filters[_filterIndex].isActive,
            page: reset ? 1 : _pagination.page + 1,
          );
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _pagination = page.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted || token != _request) return;
      final message = _errorSentence(error);
      setState(() {
        _loading = false;
        _loadingMore = false;
        if (reset) _error = message;
      });
      if (!reset) showAppSnack(context, message, error: true);
    }
  }

  void _selectFilter(int index) {
    if (index == _filterIndex) return;
    setState(() => _filterIndex = index);
    _load();
  }

  Future<void> _add() async {
    if (_busy != null) return;
    final draft = await showFormSheet<_RiderDraft>(
      context,
      title: 'Add a rider',
      subtitle:
          'Set the sign-in they will use in the rider app. Share the email and '
          'password with them in person.',
      child: const _RiderFormSheet(),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'add');
    try {
      await ref
          .read(businessRepositoryProvider)
          .createBrandRider(
            name: draft.name,
            email: draft.email,
            password: draft.password,
            phone: draft.phone,
          );
      if (!mounted) return;
      setState(() {
        _busy = null;
        _filterIndex = 0;
      });
      await _load();
      if (mounted) showAppSnack(context, '${draft.name} can now sign in.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _openActions(BrandRider rider) async {
    if (_busy != null) return;
    final action = await showModalBottomSheet<_RiderAction>(
      context: context,
      useSafeArea: true,
      builder: (context) => _RiderActionsSheet(rider: rider),
    );
    if (action == null || !mounted) return;

    switch (action) {
      case _RiderAction.edit:
        await _edit(rider);
        break;
      case _RiderAction.password:
        await _resetPassword(rider);
        break;
      case _RiderAction.toggle:
        await _toggle(rider);
        break;
    }
  }

  Future<void> _edit(BrandRider rider) async {
    final draft = await showFormSheet<_RiderDraft>(
      context,
      title: 'Edit ${rider.name}',
      subtitle: 'These details are only used by you and the rider.',
      child: _RiderFormSheet(rider: rider),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'edit');
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateBrandRider(rider.id, name: draft.name, phone: draft.phone);
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, 'Rider details saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _resetPassword(BrandRider rider) async {
    final password = await showFormSheet<String>(
      context,
      title: 'New password for ${rider.name}',
      subtitle:
          'This signs the rider out on every device. Share the new password '
          'with them in person.',
      child: const _PasswordSheet(),
    );
    if (password == null || !mounted) return;

    setState(() => _busy = 'password');
    try {
      await ref
          .read(businessRepositoryProvider)
          .resetBrandRiderPassword(rider.id, password: password);
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, 'Password changed. The rider can sign in now.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _toggle(BrandRider rider) async {
    final turningOff = rider.isActive;
    final ok = await confirmAction(
      context,
      title: turningOff ? 'Turn off ${rider.name}?' : 'Turn ${rider.name} on?',
      message: turningOff
          ? 'They can no longer sign in or receive deliveries. Riders with '
                'open deliveries must be moved to someone else first.'
          : 'They can sign in and receive deliveries again.',
      confirmLabel: turningOff ? 'Turn off' : 'Turn on',
      destructive: turningOff,
    );
    if (!ok || !mounted) return;

    setState(() => _busy = 'toggle');
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateBrandRider(rider.id, isActive: !rider.isActive);
      if (!mounted) return;
      setState(() {
        _busy = null;
        if (!turningOff) _filterIndex = 0;
      });
      await _load();
      if (mounted) {
        showAppSnack(
          context,
          turningOff
              ? '${rider.name} was turned off.'
              : '${rider.name} can deliver again.',
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Riders')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Delivery riders',
              subtitle:
                  'Create a sign-in for each person who delivers your orders. '
                  'They use it in the rider app.',
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: AppButton(
                key: const Key('add_rider'),
                label: 'Add a rider',
                icon: Icons.person_add_alt_1_rounded,
                loading: _busy == 'add',
                onPressed: _busy == null ? _add : null,
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _filters[index];
                  return FilterPill(
                    key: Key('rider_filter_${filter.key}'),
                    label: filter.label,
                    selected: index == _filterIndex,
                    onTap: () => _selectFilter(index),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: _content(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading) return const LoadingView(label: 'Loading riders');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      return EmptyPanel(
        icon: Icons.sports_motorsports_outlined,
        title: switch (_filters[_filterIndex].isActive) {
          true => 'No active riders',
          false => 'Nobody is turned off',
          null => 'No riders yet',
        },
        message: switch (_filters[_filterIndex].isActive) {
          true =>
            'Add a rider so they can sign in to the rider app and receive '
                'deliveries.',
          false => 'Riders you turn off are kept here with their history.',
          null =>
            'Add your first rider to start delivering orders with the rider '
                'app.',
        },
        action: _filters[_filterIndex].isActive == false
            ? null
            : AppButton(
                label: 'Add a rider',
                variant: AppButtonVariant.outline,
                onPressed: _busy == null ? _add : null,
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _RiderCard(
            key: Key('rider_card_${_items[i].id}'),
            rider: _items[i],
            busy: _busy != null,
            onActions: () => _openActions(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more riders',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }
}

class _RiderCard extends StatelessWidget {
  const _RiderCard({
    super.key,
    required this.rider,
    required this.busy,
    required this.onActions,
  });

  final BrandRider rider;
  final bool busy;
  final VoidCallback onActions;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final contact = [
      rider.phone,
      rider.email,
    ].where((value) => value.trim().isNotEmpty).join(' · ');
    return SurfacePanel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AvatarBadge(name: rider.name, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  rider.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall,
                ),
                const SizedBox(height: 4),
                StatusTag(
                  label: rider.isActive ? 'Active' : 'Turned off',
                  tone: rider.isActive ? AppTone.green : AppTone.neutral,
                ),
                const SizedBox(height: 3),
                Text(
                  contact.isEmpty ? 'No contact details' : contact,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            key: Key('rider_actions_${rider.id}'),
            onPressed: busy ? null : onActions,
            icon: const Icon(Icons.more_horiz_rounded),
            tooltip: 'Rider options',
          ),
        ],
      ),
    );
  }
}

class _RiderDraft {
  const _RiderDraft({
    required this.name,
    required this.email,
    required this.password,
    required this.phone,
  });

  final String name;
  final String email;
  final String password;
  final String phone;
}

class _RiderFormSheet extends StatefulWidget {
  const _RiderFormSheet({this.rider});

  final BrandRider? rider;

  @override
  State<_RiderFormSheet> createState() => _RiderFormSheetState();
}

class _RiderFormSheetState extends State<_RiderFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  final _password = TextEditingController();
  var _showPassword = false;

  bool get _creating => widget.rider == null;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.rider?.name ?? '');
    _phone = TextEditingController(text: widget.rider?.phone ?? '');
    _email = TextEditingController(text: widget.rider?.email ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(
      _RiderDraft(
        name: _name.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        phone: _phone.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('rider_name'),
            label: 'Full name',
            controller: _name,
            hint: 'Ahmed Khan',
            textInputAction: TextInputAction.next,
            validator: (value) => (value ?? '').trim().length < 2
                ? 'Enter the rider’s name.'
                : null,
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('rider_phone'),
            label: 'Phone (optional)',
            controller: _phone,
            hint: '03001234567',
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            validator: (value) => (value ?? '').trim().length > 30
                ? 'Keep the phone number under 30 characters.'
                : null,
          ),
          if (_creating) ...[
            const SizedBox(height: 13),
            AppField(
              key: const Key('rider_email'),
              label: 'Email',
              controller: _email,
              hint: 'rider@example.com',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              validator: (value) {
                final email = (value ?? '').trim();
                if (email.isEmpty) {
                  return 'Enter the email the rider signs in with.';
                }
                if (!email.contains('@') || !email.contains('.')) {
                  return 'Enter a valid email address.';
                }
                return null;
              },
            ),
            const SizedBox(height: 13),
            AppField(
              key: const Key('rider_password'),
              label: 'Password',
              controller: _password,
              hint: 'At least 8 characters',
              obscure: !_showPassword,
              autofillHints: const [AutofillHints.newPassword],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              suffix: IconButton(
                onPressed: () => setState(() => _showPassword = !_showPassword),
                icon: Icon(
                  _showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                  size: 20,
                ),
                tooltip: _showPassword ? 'Hide password' : 'Show password',
              ),
              validator: (value) => (value ?? '').length < 8
                  ? 'Use at least 8 characters.'
                  : null,
            ),
          ],
          const SizedBox(height: 20),
          AppButton(
            key: const Key('rider_save'),
            label: _creating ? 'Create rider' : 'Save changes',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _PasswordSheet extends StatefulWidget {
  const _PasswordSheet();

  @override
  State<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends State<_PasswordSheet> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  var _showPassword = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(_password.text);
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('rider_password_new'),
            label: 'New password',
            controller: _password,
            hint: 'At least 8 characters',
            obscure: !_showPassword,
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.next,
            suffix: IconButton(
              onPressed: () => setState(() => _showPassword = !_showPassword),
              icon: Icon(
                _showPassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 20,
              ),
              tooltip: _showPassword ? 'Hide password' : 'Show password',
            ),
            validator: (value) =>
                (value ?? '').length < 8 ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('rider_password_confirm'),
            label: 'Repeat the password',
            controller: _confirm,
            hint: 'Same password again',
            obscure: !_showPassword,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) => value != _password.text
                ? 'The two passwords do not match.'
                : null,
          ),
          const SizedBox(height: 20),
          AppButton(
            key: const Key('rider_password_save'),
            label: 'Change password',
            icon: Icons.lock_reset_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _RiderActionsSheet extends StatelessWidget {
  const _RiderActionsSheet({required this.rider});

  final BrandRider rider;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              rider.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              rider.email,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 14),
            _ActionRow(
              key: const Key('rider_action_edit'),
              icon: Icons.edit_outlined,
              label: 'Edit name and phone',
              onTap: () => Navigator.of(context).pop(_RiderAction.edit),
            ),
            _ActionRow(
              key: const Key('rider_action_password'),
              icon: Icons.lock_reset_rounded,
              label: 'Change password',
              onTap: () => Navigator.of(context).pop(_RiderAction.password),
            ),
            _ActionRow(
              key: const Key('rider_action_toggle'),
              icon: rider.isActive
                  ? Icons.person_off_outlined
                  : Icons.person_outline_rounded,
              label: rider.isActive ? 'Turn off rider' : 'Turn rider on',
              destructive: rider.isActive,
              onTap: () => Navigator.of(context).pop(_RiderAction.toggle),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.clay : AppColors.ink;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.bodyLarge
            ?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
      onTap: onTap,
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Riders')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Riders',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not shop riders.',
          ),
          SizedBox(height: 20),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: EmptyPanel(
              icon: Icons.storefront_outlined,
              title: 'This is a shop screen',
              message:
                  'Delivery riders belong to shop accounts. Service jobs are '
                  'under Bookings.',
            ),
          ),
        ],
      ),
    );
  }
}
