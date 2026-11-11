import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your branches. Check the connection and try again.';
}

/// The brand's physical shops. A branch belongs to one neighbourhood, which is
/// how orders and riders know where the goods come from.
class BrandBranchesScreen extends ConsumerStatefulWidget {
  const BrandBranchesScreen({super.key});

  @override
  ConsumerState<BrandBranchesScreen> createState() =>
      _BrandBranchesScreenState();
}

class _BrandBranchesScreenState extends ConsumerState<BrandBranchesScreen> {
  var _branches = const <BrandBranch>[];
  var _blocks = const <BranchBlock>[];
  var _loading = true;
  String? _error;
  String? _busy;
  var _request = 0;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    final token = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final profile = await ref.read(brandProfileProvider.future);
      final cityId = profile.cityId;
      if (cityId == null || cityId.isEmpty) {
        throw ApiException(
          'Your shop does not have a city yet, so branches cannot be added.',
        );
      }
      final repo = ref.read(businessRepositoryProvider);
      final results = await Future.wait([
        repo.brandBranches(),
        repo.brandBranchBlocks(cityId),
      ]);
      if (!mounted || token != _request) return;
      setState(() {
        _branches = results[0] as List<BrandBranch>;
        _blocks = results[1] as List<BranchBlock>;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || token != _request) return;
      setState(() {
        _loading = false;
        _error = _errorSentence(error);
      });
    }
  }

  Future<void> _add() async {
    if (_busy != null) return;
    if (_blocks.isEmpty) {
      showAppSnack(
        context,
        'Your city has no areas set up yet, so a branch cannot be placed. Ask '
        'CityCart support to add one.',
        error: true,
      );
      return;
    }
    final draft = await showFormSheet<_BranchDraft>(
      context,
      title: 'Add a branch',
      subtitle: 'Choose the area this shop sits in and how customers reach it.',
      child: _BranchFormSheet(blocks: _blocks),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = 'add');
    try {
      await ref
          .read(businessRepositoryProvider)
          .createBrandBranch(
            name: draft.name,
            blockId: draft.blockId,
            address: draft.address,
            phone: draft.phone,
          );
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, '${draft.name} is now open.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _edit(BrandBranch branch) async {
    if (_busy != null) return;
    final draft = await showFormSheet<_BranchDraft>(
      context,
      title: 'Edit ${branch.name}',
      subtitle: 'Moving the area changes where this branch is placed.',
      child: _BranchFormSheet(branch: branch, blocks: _blocks),
    );
    if (draft == null || !mounted) return;

    setState(() => _busy = branch.id);
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateBrandBranch(
            branch.id,
            name: draft.name,
            blockId: draft.blockId,
            address: draft.address,
            phone: draft.phone,
          );
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) showAppSnack(context, 'Branch saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = null);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _toggle(BrandBranch branch) async {
    if (_busy != null) return;
    final closing = branch.isActive;
    final ok = await confirmAction(
      context,
      title: closing ? 'Close ${branch.name}?' : 'Reopen ${branch.name}?',
      message: closing
          ? 'New orders stop using this branch. Past orders keep their branch '
                'and history.'
          : 'Customers in the area can order from this branch again.',
      confirmLabel: closing ? 'Close branch' : 'Reopen branch',
      destructive: closing,
    );
    if (!ok || !mounted) return;

    setState(() => _busy = branch.id);
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateBrandBranch(branch.id, isActive: !branch.isActive);
      if (!mounted) return;
      setState(() => _busy = null);
      await _load();
      if (mounted) {
        showAppSnack(
          context,
          closing ? '${branch.name} was closed.' : '${branch.name} is open.',
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
      appBar: AppBar(title: const Text('Branches')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Your branches',
              subtitle:
                  'Each branch is one physical shop in one area. Orders and '
                  'riders follow the branch that serves the customer.',
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: AppButton(
                key: const Key('add_branch'),
                label: 'Add a branch',
                icon: Icons.add_business_rounded,
                loading: _busy == 'add',
                onPressed: _busy == null ? _add : null,
              ),
            ),
            const SizedBox(height: 18),
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
    if (_loading) return const LoadingView(label: 'Loading your branches');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: _load);
    }

    if (_branches.isEmpty) {
      return const EmptyPanel(
        icon: Icons.store_mall_directory_outlined,
        title: 'No branches yet',
        message:
            'Add the shop where orders are packed. Choose the area it sits in '
            'so customers nearby can order from it.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _branches.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _BranchCard(
            key: Key('branch_card_${_branches[i].id}'),
            branch: _branches[i],
            busy: _busy != null,
            onEdit: () => _edit(_branches[i]),
            onToggle: () => _toggle(_branches[i]),
          ),
        ],
      ],
    );
  }
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({
    super.key,
    required this.branch,
    required this.busy,
    required this.onEdit,
    required this.onToggle,
  });

  final BrandBranch branch;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      onTap: busy ? null : onEdit,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  branch.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall,
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                key: Key('branch_actions_${branch.id}'),
                onPressed: busy ? null : onToggle,
                icon: Icon(
                  branch.isActive
                      ? Icons.pause_circle_outline_rounded
                      : Icons.play_circle_outline_rounded,
                ),
                tooltip: branch.isActive ? 'Close branch' : 'Reopen branch',
              ),
            ],
          ),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              StatusTag(label: branch.blockName, tone: AppTone.blue),
              StatusTag(
                label: branch.isActive ? 'Open' : 'Closed',
                tone: branch.isActive ? AppTone.green : AppTone.neutral,
              ),
            ],
          ),
          if (branch.address.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.place_outlined,
                  size: 17,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    branch.address,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall,
                  ),
                ),
              ],
            ),
          ],
          if (branch.phone.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.call_outlined,
                  size: 17,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    branch.phone,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BranchDraft {
  const _BranchDraft({
    required this.name,
    required this.blockId,
    required this.address,
    required this.phone,
  });

  final String name;
  final String blockId;
  final String address;
  final String phone;
}

class _BranchFormSheet extends StatefulWidget {
  const _BranchFormSheet({this.branch, required this.blocks});

  final BrandBranch? branch;
  final List<BranchBlock> blocks;

  @override
  State<_BranchFormSheet> createState() => _BranchFormSheetState();
}

class _BranchFormSheetState extends State<_BranchFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _address;
  late final TextEditingController _phone;
  late String? _blockId;

  bool get _creating => widget.branch == null;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.branch?.name ?? '');
    _address = TextEditingController(text: widget.branch?.address ?? '');
    _phone = TextEditingController(text: widget.branch?.phone ?? '');
    final current = widget.branch?.blockId;
    _blockId = widget.blocks.any((block) => block.id == current)
        ? current
        : widget.blocks.where((block) => block.isActive).firstOrNull?.id;
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    final blockId = _blockId;
    if (_formKey.currentState?.validate() != true || blockId == null) return;
    Navigator.of(context).pop(
      _BranchDraft(
        name: _name.text.trim(),
        blockId: blockId,
        address: _address.text.trim(),
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
            key: const Key('branch_name'),
            label: 'Branch name',
            controller: _name,
            hint: 'Gulberg shop',
            textInputAction: TextInputAction.next,
            validator: (value) {
              final name = (value ?? '').trim();
              if (name.isEmpty) return 'Give this branch a name.';
              if (name.length > 80) return 'Keep the name under 80 characters.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          DropdownButtonFormField<String>(
            key: const Key('branch_area'),
            initialValue: _blockId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Area'),
            items: [
              for (final block in widget.blocks)
                DropdownMenuItem(
                  value: block.id,
                  child: Text(
                    block.isActive ? block.name : '${block.name} (closed)',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (value) => setState(() => _blockId = value),
            validator: (value) =>
                value == null ? 'Choose the area this shop sits in.' : null,
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('branch_address'),
            label: 'Street address (optional)',
            controller: _address,
            hint: '12 Main Road',
            textInputAction: TextInputAction.next,
            maxLength: 200,
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('branch_phone'),
            label: 'Branch phone (optional)',
            controller: _phone,
            hint: '0300 1234567',
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            maxLength: 30,
          ),
          const SizedBox(height: 18),
          AppButton(
            key: const Key('branch_save'),
            label: _creating ? 'Add branch' : 'Save branch',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Branches')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Branches',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not shop branches.',
          ),
        ],
      ),
    );
  }
}
