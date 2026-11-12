import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'team_permissions.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your team. Check the connection and try again.';
}

class _TeamFilter {
  const _TeamFilter(this.label, this.key, this.isActive);

  final String label;
  final String key;
  final bool? isActive;
}

const _filters = [
  _TeamFilter('Active', 'active', true),
  _TeamFilter('Removed', 'removed', false),
  _TeamFilter('Everyone', 'all', null),
];

enum _TeamAction { edit, access, remove, restore }

/// The people who work in this shop. Their access is decided here; they sign
/// in to the staff app with the account the owner creates.
class BrandTeamScreen extends ConsumerStatefulWidget {
  const BrandTeamScreen({super.key});

  @override
  ConsumerState<BrandTeamScreen> createState() => _BrandTeamScreenState();
}

class _BrandTeamScreenState extends ConsumerState<BrandTeamScreen> {
  var _filterIndex = 0;
  var _items = const <TeamMember>[];
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
          .teamMembers(
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
    final draft = await showFormSheet<_MemberDraft>(
      context,
      title: 'Add a team member',
      subtitle:
          'Create the sign-in they will use in the staff app. Share the email '
          'and password with them in person.',
      child: const _MemberFormSheet(),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'add');
    try {
      await ref
          .read(businessRepositoryProvider)
          .createTeamMember(
            name: draft.name,
            email: draft.email,
            password: draft.password,
            role: draft.role,
            phone: draft.phone,
            jobTitle: draft.jobTitle,
            permissions: draft.permissions,
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

  Future<void> _openActions(TeamMember member) async {
    if (_busy != null) return;
    final action = await showModalBottomSheet<_TeamAction>(
      context: context,
      useSafeArea: true,
      builder: (context) => _TeamActionsSheet(member: member),
    );
    if (action == null || !mounted) return;

    switch (action) {
      case _TeamAction.edit:
        await _edit(member);
        break;
      case _TeamAction.access:
        await _editAccess(member);
        break;
      case _TeamAction.remove:
        await _remove(member);
        break;
      case _TeamAction.restore:
        await _restore(member);
        break;
    }
  }

  Future<void> _edit(TeamMember member) async {
    final draft = await showFormSheet<_MemberDraft>(
      context,
      title: 'Edit ${member.name}',
      subtitle: 'Their sign-in email stays the same.',
      child: _MemberFormSheet(member: member),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'edit');
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateTeamMember(
            member.id,
            name: draft.name,
            phone: draft.phone,
            jobTitle: draft.jobTitle,
          );
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, 'Team details saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _editAccess(TeamMember member) async {
    final permissions = await showFormSheet<List<String>>(
      context,
      title: 'What ${member.name} can do',
      subtitle:
          'Only turn on what this person needs. Nothing else in the shop can '
          'be opened by them.',
      child: _PermissionsSheet(member: member),
    );
    if (permissions == null || !mounted) return;

    setState(() => _busy = 'access');
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateTeamMemberPermissions(member.id, permissions: permissions);
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, 'Access updated.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _remove(TeamMember member) async {
    final ok = await confirmAction(
      context,
      title: 'Remove ${member.name}?',
      message:
          'They lose access to this shop straight away. Past orders stay with '
          'the shop, and you can add them back later.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!ok || !mounted) return;

    setState(() => _busy = member.id);
    try {
      await ref.read(businessRepositoryProvider).removeTeamMember(member.id);
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, '${member.name} was removed.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _restore(TeamMember member) async {
    final ok = await confirmAction(
      context,
      title: 'Add ${member.name} back?',
      message:
          'They can sign in to the staff app again with the access they had '
          'before.',
      confirmLabel: 'Add back',
    );
    if (!ok || !mounted) return;

    setState(() => _busy = member.id);
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateTeamMember(member.id, isActive: true);
      if (!mounted) return;
      setState(() {
        _busy = null;
        _filterIndex = 0;
      });
      await _load();
      if (mounted) showAppSnack(context, '${member.name} is back on the team.');
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
      appBar: AppBar(title: const Text('Team')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Your team',
              subtitle:
                  'People who help run this shop. Choose exactly what each '
                  'person can see and do.',
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: AppButton(
                key: const Key('add_team_member'),
                label: 'Add a team member',
                icon: Icons.person_add_alt_1_rounded,
                loading: _busy == 'add',
                onPressed: _busy == null ? _add : null,
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 42,
              child: ListView.separated(
                key: const Key('team_filters'),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _filters[index];
                  return FilterPill(
                    key: Key('team_filter_${filter.key}'),
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
    if (_loading) return const LoadingView(label: 'Loading your team');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      return EmptyPanel(
        icon: Icons.groups_outlined,
        title: switch (_filters[_filterIndex].isActive) {
          true => 'No team members yet',
          false => 'Nobody removed',
          null => 'No team members yet',
        },
        message: switch (_filters[_filterIndex].isActive) {
          true =>
            'Add the people who help you pack and send orders. You decide '
                'what each person can open.',
          false => 'People you remove from the team are kept here.',
          null =>
            'Add your first team member to share the day-to-day work of the '
                'shop.',
        },
        action: _filters[_filterIndex].isActive == false
            ? null
            : AppButton(
                label: 'Add a team member',
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
          _TeamCard(
            key: Key('team_card_${_items[i].id}'),
            member: _items[i],
            busy: _busy != null,
            onActions: () => _openActions(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more people',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({
    super.key,
    required this.member,
    required this.busy,
    required this.onActions,
  });

  final TeamMember member;
  final bool busy;
  final VoidCallback onActions;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final detail = member.jobTitle.isNotEmpty
        ? member.jobTitle
        : member.isPicker
        ? 'Packs orders in the staff app'
        : permissionSummary(member.permissions);

    return SurfacePanel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AvatarBadge(name: member.name, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall,
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    StatusTag(
                      label: member.roleLabel,
                      tone: member.isPicker ? AppTone.blue : AppTone.neutral,
                    ),
                    StatusTag(
                      label: member.statusLabel,
                      tone: member.isActive ? AppTone.green : AppTone.neutral,
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Text(
                  detail,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall,
                ),
                if (member.email.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    member.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall?.copyWith(color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            key: Key('team_actions_${member.id}'),
            onPressed: busy ? null : onActions,
            icon: const Icon(Icons.more_horiz_rounded),
            tooltip: 'Team member options',
          ),
        ],
      ),
    );
  }
}

class _TeamActionsSheet extends StatelessWidget {
  const _TeamActionsSheet({required this.member});

  final TeamMember member;

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
              member.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              member.email,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 14),
            _ActionRow(
              key: const Key('team_action_edit'),
              icon: Icons.edit_outlined,
              label: 'Edit name and phone',
              onTap: () => Navigator.of(context).pop(_TeamAction.edit),
            ),
            if (!member.isPicker)
              _ActionRow(
                key: const Key('team_action_access'),
                icon: Icons.admin_panel_settings_outlined,
                label: 'Change what they can do',
                onTap: () => Navigator.of(context).pop(_TeamAction.access),
              ),
            if (member.isActive)
              _ActionRow(
                key: const Key('team_action_remove'),
                icon: Icons.person_remove_outlined,
                label: 'Remove from the team',
                destructive: true,
                onTap: () => Navigator.of(context).pop(_TeamAction.remove),
              )
            else
              _ActionRow(
                key: const Key('team_action_restore'),
                icon: Icons.person_add_alt_1_outlined,
                label: 'Add back to the team',
                onTap: () => Navigator.of(context).pop(_TeamAction.restore),
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

class _MemberDraft {
  const _MemberDraft({
    required this.name,
    required this.email,
    required this.password,
    required this.role,
    required this.phone,
    required this.jobTitle,
    required this.permissions,
  });

  final String name;
  final String email;
  final String password;
  final String role;
  final String phone;
  final String jobTitle;
  final List<String> permissions;
}

class _MemberFormSheet extends StatefulWidget {
  const _MemberFormSheet({this.member});

  final TeamMember? member;

  @override
  State<_MemberFormSheet> createState() => _MemberFormSheetState();
}

class _MemberFormSheetState extends State<_MemberFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _job;
  late final TextEditingController _email;
  final _password = TextEditingController();
  var _role = 'BRAND_EMPLOYEE';
  var _permissions = <String>{};
  var _showPassword = false;

  bool get _creating => widget.member == null;
  bool get _isPicker => _role == 'PICKER';

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.member?.name ?? '');
    _phone = TextEditingController(text: widget.member?.phone ?? '');
    _job = TextEditingController(text: widget.member?.jobTitle ?? '');
    _email = TextEditingController(text: widget.member?.email ?? '');
    _role = widget.member?.role ?? 'BRAND_EMPLOYEE';
    _permissions = {...?widget.member?.permissions};
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _job.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    Navigator.of(context).pop(
      _MemberDraft(
        name: _name.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        role: _role,
        phone: _phone.text.trim(),
        jobTitle: _job.text.trim(),
        permissions: _isPicker ? const [] : (_permissions.toList()..sort()),
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
            key: const Key('team_name'),
            label: 'Full name',
            controller: _name,
            hint: 'Ayesha Khan',
            textInputAction: TextInputAction.next,
            validator: (value) {
              if ((value ?? '').trim().isEmpty) return 'Enter their name.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          if (_creating) ...[
            AppField(
              key: const Key('team_email'),
              label: 'Sign-in email',
              controller: _email,
              hint: 'ayesha@example.com',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              validator: (value) {
                final email = (value ?? '').trim();
                if (email.isEmpty) {
                  return 'Enter the email they will sign in with.';
                }
                if (!email.contains('@') || !email.contains('.')) {
                  return 'Enter a valid email address.';
                }
                return null;
              },
            ),
            const SizedBox(height: 13),
            AppField(
              key: const Key('team_password'),
              label: 'First password',
              controller: _password,
              hint: 'At least 8 characters',
              obscure: !_showPassword,
              textInputAction: TextInputAction.next,
              suffix: IconButton(
                onPressed: () => setState(() => _showPassword = !_showPassword),
                icon: Icon(
                  _showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
                tooltip: _showPassword ? 'Hide password' : 'Show password',
              ),
              validator: (value) {
                if ((value ?? '').length < 8) {
                  return 'Use at least 8 characters.';
                }
                return null;
              },
            ),
          ] else
            SurfacePanel(
              color: AppColors.paper,
              padding: const EdgeInsets.all(14),
              child: Text(
                'Signing in with ${widget.member!.email}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('team_phone'),
            label: 'Phone (optional)',
            controller: _phone,
            hint: '0300 1234567',
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final phone = (value ?? '').trim();
              if (phone.isEmpty) return null;
              if (!RegExp(r'^\+?[0-9][0-9\s-]{6,19}$').hasMatch(phone)) {
                return 'Enter a phone number, or leave it blank.';
              }
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('team_job'),
            label: 'Job title (optional)',
            controller: _job,
            hint: 'Store supervisor',
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            validator: (value) => (value ?? '').trim().length > 100
                ? 'Keep the job title short.'
                : null,
          ),
          if (_creating) ...[
            const SizedBox(height: 18),
            Text(
              'What kind of account?',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  key: const Key('team_role_employee'),
                  label: const Text('Team member'),
                  selected: !_isPicker,
                  onSelected: (_) => setState(() => _role = 'BRAND_EMPLOYEE'),
                ),
                ChoiceChip(
                  key: const Key('team_role_picker'),
                  label: const Text('Picker'),
                  selected: _isPicker,
                  onSelected: (_) => setState(() => _role = 'PICKER'),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              _isPicker
                  ? 'A picker only sees the packing queue in the staff app.'
                  : 'A team member opens only the parts of the staff app you '
                        'allow below.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (_creating && !_isPicker) ...[
            const SizedBox(height: 20),
            Text(
              'What can they open?',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 2),
            Text(
              'Tick what this person needs. You can change this later.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            for (final group in teamPermissionGroups) ...[
              _PermissionGroupBlock(
                group: group,
                selected: _permissions,
                onChanged: (key, value) => setState(() {
                  if (value) {
                    _permissions.add(key);
                  } else {
                    _permissions.remove(key);
                  }
                }),
              ),
              const SizedBox(height: 6),
            ],
          ],
          const SizedBox(height: 18),
          AppButton(
            key: const Key('team_save'),
            label: _creating ? 'Add team member' : 'Save details',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _PermissionGroupBlock extends StatelessWidget {
  const _PermissionGroupBlock({
    required this.group,
    required this.selected,
    required this.onChanged,
  });

  final PermissionGroup group;
  final Set<String> selected;
  final void Function(String key, bool value) onChanged;

  @override
  Widget build(BuildContext context) {
    return SurfacePanel(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(group.icon, size: 17, color: AppColors.muted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  group.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ],
          ),
          for (final item in group.items)
            SwitchListTile(
              key: Key('team_permission_${item.key}'),
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: selected.contains(item.key),
              onChanged: (value) => onChanged(item.key, value),
              title: Text(
                item.label,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
        ],
      ),
    );
  }
}

class _PermissionsSheet extends StatefulWidget {
  const _PermissionsSheet({required this.member});

  final TeamMember member;

  @override
  State<_PermissionsSheet> createState() => _PermissionsSheetState();
}

class _PermissionsSheetState extends State<_PermissionsSheet> {
  late final Set<String> _selected;

  @override
  void initState() {
    super.initState();
    _selected = {...widget.member.permissions};
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final group in teamPermissionGroups) ...[
          _PermissionGroupBlock(
            group: group,
            selected: _selected,
            onChanged: (key, value) => setState(() {
              if (value) {
                _selected.add(key);
              } else {
                _selected.remove(key);
              }
            }),
          ),
          const SizedBox(height: 6),
        ],
        const SizedBox(height: 12),
        AppButton(
          key: const Key('team_access_save'),
          label: 'Save access',
          icon: Icons.check_rounded,
          onPressed: () =>
              Navigator.of(context).pop(_selected.toList()..sort()),
        ),
      ],
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Team')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Team',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not a shop team.',
          ),
        ],
      ),
    );
  }
}
