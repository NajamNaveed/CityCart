import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your shop details. Check the connection and try '
      'again.';
}

const _weekDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/// The shop's own details: how customers see it, when it is open, and the
/// delivery defaults used at checkout. The server stays authoritative for
/// everything ordered; this page only asks for the values it may change.
class BrandSettingsScreen extends ConsumerStatefulWidget {
  const BrandSettingsScreen({super.key});

  @override
  ConsumerState<BrandSettingsScreen> createState() =>
      _BrandSettingsScreenState();
}

class _BrandSettingsScreenState extends ConsumerState<BrandSettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _street = TextEditingController();
  final _area = TextEditingController();
  final _city = TextEditingController();
  final _supportPhone = TextEditingController();
  final _supportEmail = TextEditingController();
  final _opensAt = TextEditingController();
  final _closesAt = TextEditingController();
  final _deliveryFee = TextEditingController();
  final _minimumOrder = TextEditingController();
  final _deliveryTime = TextEditingController();
  final _deliveryNote = TextEditingController();
  final _closedDays = <String>{};

  BrandProfile? _profile;
  var _loading = true;
  var _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _description,
      _street,
      _area,
      _city,
      _supportPhone,
      _supportEmail,
      _opensAt,
      _closesAt,
      _deliveryFee,
      _minimumOrder,
      _deliveryTime,
      _deliveryNote,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await ref.read(businessRepositoryProvider).brandProfile();
      if (!mounted) return;
      _fill(profile);
      setState(() {
        _profile = profile;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _errorSentence(error);
      });
    }
  }

  void _fill(BrandProfile profile) {
    _name.text = profile.name;
    _description.text = profile.description;
    _street.text = profile.street;
    _area.text = profile.area;
    _city.text = profile.city;
    _supportPhone.text = profile.supportPhone;
    _supportEmail.text = profile.supportEmail;
    _opensAt.text = profile.opensAt;
    _closesAt.text = profile.closesAt;
    _deliveryFee.text = _rupeesText(profile.deliveryFee);
    _minimumOrder.text = _rupeesText(profile.minimumOrderValue);
    _deliveryTime.text = profile.estimatedDeliveryTime;
    _deliveryNote.text = profile.deliveryNote;
    _closedDays
      ..clear()
      ..addAll(profile.closedDays.where(_weekDays.contains));
  }

  String _rupeesText(double? value) {
    if (value == null) return '';
    return rupeesField((value * 100).round());
  }

  double? _parseRupees(String raw) {
    final cleaned = raw.replaceAll(',', '').replaceAll('Rs', '').trim();
    if (cleaned.isEmpty) return null;
    return double.tryParse(cleaned);
  }

  String? _timeError(String value) {
    if (value.isEmpty) return null;
    final match = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
    return match.hasMatch(value) ? null : 'Use 24-hour time, like 09:00.';
  }

  String? _moneyError(String value) {
    if (value.trim().isEmpty) return null;
    final amount = _parseRupees(value);
    if (amount == null || amount < 0 || amount > 10000000) {
      return 'Enter a rupee amount, or leave it blank.';
    }
    return null;
  }

  String? _emailError(String value) {
    final email = value.trim();
    if (email.isEmpty) return null;
    if (!email.contains('@') || !email.contains('.')) {
      return 'Enter a valid support email, or leave it blank.';
    }
    return null;
  }

  Future<void> _save() async {
    final profile = _profile;
    if (profile == null || _saving) return;
    if (_formKey.currentState?.validate() != true) return;

    setState(() => _saving = true);
    try {
      final saved = await ref
          .read(businessRepositoryProvider)
          .saveBrandProfile(
            brandId: profile.id,
            name: _name.text,
            description: _description.text,
            street: _street.text,
            area: _area.text,
            city: _city.text,
            supportPhone: _supportPhone.text,
            supportEmail: _supportEmail.text,
            opensAt: _opensAt.text.trim(),
            closesAt: _closesAt.text.trim(),
            closedDays: _closedDays.toList()..sort(),
            deliveryFee: _parseRupees(_deliveryFee.text),
            estimatedDeliveryTime: _deliveryTime.text,
            minimumOrderValue: _parseRupees(_minimumOrder.text),
            deliveryNote: _deliveryNote.text,
          );
      if (!mounted) return;
      _fill(saved);
      setState(() {
        _profile = saved;
        _saving = false;
      });
      ref.invalidate(brandProfileProvider);
      showAppSnack(context, 'Shop details saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
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
      appBar: AppBar(title: const Text('Shop settings')),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: LoadingView(label: 'Loading shop details'));
    }

    final error = _error;
    if (error != null) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: [ErrorPanel(message: error, onRetry: _load)],
      );
    }

    final profile = _profile;
    if (profile == null) return const SizedBox.shrink();

    final text = Theme.of(context).textTheme;
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 30),
        children: [
          PageHeader(
            eyebrow: 'Shop owner',
            title: profile.name,
            subtitle:
                'These details appear to customers. Delivery defaults are '
                'used when an order is placed.',
            action: StatusTag(
              label: reviewStatusLabel(profile.status),
              tone: reviewStatusTone(profile.status),
            ),
          ),
          const SizedBox(height: 20),
          _Section(
            title: 'Shop details',
            children: [
              AppField(
                key: const Key('settings_name'),
                label: 'Shop name',
                controller: _name,
                hint: 'Your shop name',
                textInputAction: TextInputAction.next,
                maxLength: 80,
                validator: (value) => (value ?? '').trim().isEmpty
                    ? 'Enter the name customers see.'
                    : null,
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_description'),
                label: 'Short description (optional)',
                controller: _description,
                hint: 'What your shop sells',
                maxLines: 3,
                maxLength: 500,
                textInputAction: TextInputAction.newline,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Address',
            children: [
              AppField(
                key: const Key('settings_street'),
                label: 'Street (optional)',
                controller: _street,
                hint: '12 Main Road',
                maxLength: 200,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_area'),
                label: 'Area (optional)',
                controller: _area,
                hint: 'Gulberg',
                maxLength: 100,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_city'),
                label: 'City (optional)',
                controller: _city,
                hint: 'Lahore',
                maxLength: 100,
                textInputAction: TextInputAction.done,
              ),
              const SizedBox(height: 6),
              Text(
                'Changing the city is handled by CityCart support.',
                style: text.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Customer support',
            children: [
              AppField(
                key: const Key('settings_support_phone'),
                label: 'Support phone (optional)',
                controller: _supportPhone,
                hint: '042 1234567',
                keyboardType: TextInputType.phone,
                maxLength: 40,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_support_email'),
                label: 'Support email (optional)',
                controller: _supportEmail,
                hint: 'help@yourshop.com',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                validator: (value) => _emailError(value ?? ''),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Opening hours',
            children: [
              AppField(
                key: const Key('settings_opens'),
                label: 'Opens at',
                controller: _opensAt,
                hint: '09:00',
                maxLength: 5,
                textInputAction: TextInputAction.next,
                validator: (value) => _timeError((value ?? '').trim()),
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_closes'),
                label: 'Closes at',
                controller: _closesAt,
                hint: '21:00',
                maxLength: 5,
                textInputAction: TextInputAction.done,
                validator: (value) => _timeError((value ?? '').trim()),
              ),
              const SizedBox(height: 6),
              Text(
                'Use 24-hour time. Leave both blank if customers can order any '
                'time.',
                style: text.bodySmall,
              ),
              const SizedBox(height: 14),
              Text('Days closed', style: text.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final day in _weekDays)
                    FilterChip(
                      key: Key('settings_day_$day'),
                      label: Text(day),
                      selected: _closedDays.contains(day),
                      onSelected: (value) => setState(() {
                        if (value) {
                          _closedDays.add(day);
                        } else {
                          _closedDays.remove(day);
                        }
                      }),
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Delivery defaults',
            children: [
              AppField(
                key: const Key('settings_delivery_fee'),
                label: 'Delivery fee',
                controller: _deliveryFee,
                hint: '150',
                prefixText: 'Rs ',
                keyboardType: TextInputType.number,
                maxLength: 12,
                textInputAction: TextInputAction.next,
                validator: (value) => _moneyError(value ?? ''),
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_minimum_order'),
                label: 'Minimum order value (optional)',
                controller: _minimumOrder,
                hint: '500',
                prefixText: 'Rs ',
                keyboardType: TextInputType.number,
                maxLength: 12,
                textInputAction: TextInputAction.next,
                validator: (value) => _moneyError(value ?? ''),
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_delivery_time'),
                label: 'Delivery time (optional)',
                controller: _deliveryTime,
                hint: '30–45 minutes',
                maxLength: 100,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 13),
              AppField(
                key: const Key('settings_delivery_note'),
                label: 'Delivery note (optional)',
                controller: _deliveryNote,
                hint: 'Delivered by the shop in 30 minutes',
                maxLines: 2,
                maxLength: 500,
                textInputAction: TextInputAction.newline,
              ),
            ],
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: AppButton(
              key: const Key('settings_save'),
              label: 'Save shop details',
              icon: Icons.check_rounded,
              loading: _saving,
              onPressed: _saving ? null : _save,
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle(title),
          SurfacePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
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
      appBar: AppBar(title: const Text('Shop settings')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Shop settings',
            title: 'For shop owners',
            subtitle: 'Service accounts edit their profile instead.',
          ),
        ],
      ),
    );
  }
}
