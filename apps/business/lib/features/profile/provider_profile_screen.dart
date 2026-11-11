import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your profile. Check the connection and try again.';
}

class ProviderProfileScreen extends ConsumerWidget {
  const ProviderProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProfile = ref.watch(providerProfileProvider);
    final profile = asyncProfile.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Business profile')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(providerProfileProvider),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Your business',
              title: 'The details customers see',
              subtitle:
                  'Your name, phone and area appear on your public page. '
                  'You can change them here at any time.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                20,
                AppSpacing.page,
                0,
              ),
              child: asyncProfile.isLoading && profile == null
                  ? const LoadingView(label: 'Loading your profile')
                  : asyncProfile.hasError && profile == null
                  ? ErrorPanel(
                      message: _errorSentence(asyncProfile.error),
                      onRetry: () => ref.invalidate(providerProfileProvider),
                    )
                  : _ProfileEditor(profile: profile!),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileEditor extends ConsumerStatefulWidget {
  const _ProfileEditor({required this.profile});

  final ProviderProfile profile;

  @override
  ConsumerState<_ProfileEditor> createState() => _ProfileEditorState();
}

class _ProfileEditorState extends ConsumerState<_ProfileEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _bio;
  late final TextEditingController _address;
  late final TextEditingController _price;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final profile = widget.profile;
    _name = TextEditingController(text: profile.displayName);
    _phone = TextEditingController(text: profile.phone ?? '');
    _bio = TextEditingController(text: profile.bio ?? '');
    _address = TextEditingController(text: profile.addressLine ?? '');
    _price = TextEditingController(
      text: profile.startingAtPrice == null
          ? ''
          : rupeesField(profile.startingAtPrice!),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _bio.dispose();
    _address.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref
          .read(businessRepositoryProvider)
          .updateProviderProfile(
            displayName: _name.text,
            phone: _phone.text,
            bio: _bio.text,
            addressLine: _address.text,
            startingAtPricePaisa: paisaFromRupees(_price.text)!,
          );
      ref.invalidate(providerProfileProvider);
      try {
        await ref.read(sessionProvider).refreshProfile();
      } catch (_) {
        // The profile itself is saved; a refresh failure only changes the
        // greeting name and is retried on the next launch.
      }
      if (mounted) showAppSnack(context, 'Profile updated.');
    } catch (error) {
      if (mounted) showAppSnack(context, _errorSentence(error), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changeArea() async {
    final profile = widget.profile;
    final cityId = profile.cityId;
    if (cityId == null || cityId.isEmpty) {
      showAppSnack(
        context,
        'Your city is not set. Contact CityCart support to fix it.',
        error: true,
      );
      return;
    }
    final chosen = await showFormSheet<BlockOption>(
      context,
      title: 'Change service area',
      subtitle:
          'Choose the area where you work. Customers in that area will find '
          'you first.',
      child: _AreaSheet(
        cityId: cityId,
        cityName: profile.cityName ?? 'your city',
        currentBlockId: profile.blockId,
      ),
    );
    if (chosen == null || !mounted) return;
    if (chosen.id == profile.blockId) return;

    setState(() => _saving = true);
    try {
      await ref
          .read(businessRepositoryProvider)
          .changeProviderBlock(
            blockId: chosen.id,
            latitude: chosen.latitude,
            longitude: chosen.longitude,
          );
      ref.invalidate(providerProfileProvider);
      if (mounted) {
        showAppSnack(context, 'Service area changed to ${chosen.name}.');
      }
    } catch (error) {
      if (mounted) showAppSnack(context, _errorSentence(error), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final profile = widget.profile;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionTitle('Public details'),
          AppField(
            key: const Key('profile_display_name'),
            label: 'Business name',
            controller: _name,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final trimmed = (value ?? '').trim();
              if (trimmed.length < 2) return 'Enter your business name.';
              if (trimmed.length > 100) {
                return 'Keep the name under 100 letters.';
              }
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('profile_phone'),
            label: 'Phone for customers',
            controller: _phone,
            hint: '03001234567',
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final trimmed = (value ?? '').trim();
              if (trimmed.isEmpty) return null;
              final valid = RegExp(r'^\+?[0-9][0-9\s-]{6,19}$')
                  .hasMatch(trimmed);
              return valid ? null : 'Enter a phone number customers can call.';
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('profile_address'),
            label: 'Address (kept private until booked)',
            controller: _address,
            hint: 'House, street, landmark',
            textInputAction: TextInputAction.next,
            validator: (value) {
              if ((value ?? '').trim().length > 300) {
                return 'Keep the address under 300 letters.';
              }
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('profile_price'),
            label: 'Starting price',
            controller: _price,
            prefixText: 'Rs ',
            hint: '1500',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            validator: (value) {
              final paisa = paisaFromRupees(value ?? '');
              if (paisa == null) return 'Enter a starting price.';
              if (paisa <= 0) return 'Enter a price greater than zero.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('profile_bio'),
            label: 'About your business (optional)',
            controller: _bio,
            hint:
                'What you do, how long you have worked, what makes you '
                'different.',
            maxLines: 4,
            maxLength: 1000,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
          ),
          const SizedBox(height: 18),
          AppButton(
            key: const Key('profile_save'),
            label: 'Save changes',
            icon: Icons.check_rounded,
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
          const SizedBox(height: 26),
          const SectionTitle('Service area'),
          SurfacePanel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                InfoRow(
                  icon: Icons.place_outlined,
                  label: 'Area',
                  value: profile.areaLabel,
                ),
                const Divider(indent: 66),
                InfoRow(
                  icon: Icons.category_outlined,
                  label: 'Category',
                  value: profile.categoryName ?? 'Not set',
                  trailing: const StatusTag(label: 'Fixed'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const NoticeBanner(
            icon: Icons.info_outline_rounded,
            tone: AppTone.blue,
            message:
                'You can change your area once a month. Your exact address '
                'stays private; customers see only the area.',
          ),
          const SizedBox(height: 12),
          AppButton(
            key: const Key('profile_change_area'),
            label: 'Change area',
            icon: Icons.map_outlined,
            variant: AppButtonVariant.outline,
            onPressed: _saving ? null : _changeArea,
          ),
          const SizedBox(height: 22),
          Text(
            'Your public page handle: ${profile.slug ?? '—'}',
            textAlign: TextAlign.center,
            style: text.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _AreaSheet extends ConsumerStatefulWidget {
  const _AreaSheet({
    required this.cityId,
    required this.cityName,
    required this.currentBlockId,
  });

  final String cityId;
  final String cityName;
  final String? currentBlockId;

  @override
  ConsumerState<_AreaSheet> createState() => _AreaSheetState();
}

class _AreaSheetState extends ConsumerState<_AreaSheet> {
  List<BlockOption>? _blocks;
  String? _error;
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.currentBlockId;
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    try {
      final blocks = await ref
          .read(businessRepositoryProvider)
          .cityBlocks(widget.cityId);
      if (!mounted) return;
      setState(() {
        _blocks = blocks;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _errorSentence(error));
    }
  }

  void _submit() {
    final blocks = _blocks;
    if (blocks == null || _selectedId == null) return;
    final matches = blocks.where((block) => block.id == _selectedId);
    if (matches.isEmpty) return;
    Navigator.of(context).pop(matches.first);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_error != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ErrorPanel(message: _error!, onRetry: _load),
          const SizedBox(height: 14),
        ],
      );
    }
    final blocks = _blocks;
    if (blocks == null) {
      return const LoadingView(label: 'Loading areas in your city');
    }
    if (blocks.isEmpty) {
      return Text(
        'No areas are open in ${widget.cityName} yet. Contact CityCart '
        'support.',
        style: text.bodyMedium,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text('Areas in ${widget.cityName}', style: text.labelMedium),
        ),
        SizedBox(
          height: 280,
          child: ListView.separated(
            itemCount: blocks.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final block = blocks[index];
              final selected = block.id == _selectedId;
              return SurfacePanel(
                key: Key('area_block_${block.id}'),
                onTap: () => setState(() => _selectedId = block.id),
                color: selected ? AppColors.mint : AppColors.surface,
                borderColor: selected ? AppColors.forest : AppColors.line,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 13,
                ),
                child: Row(
                  children: [
                    Icon(
                      selected
                          ? Icons.check_circle_rounded
                          : Icons.circle_outlined,
                      size: 21,
                      color: selected ? AppColors.forest : AppColors.muted,
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Text(
                        block.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.titleSmall,
                      ),
                    ),
                    if (block.id == widget.currentBlockId)
                      const StatusTag(label: 'Current'),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        AppButton(
          key: const Key('area_save'),
          label: 'Use this area',
          icon: Icons.check_rounded,
          onPressed: _selectedId == null ? null : _submit,
        ),
      ],
    );
  }
}
