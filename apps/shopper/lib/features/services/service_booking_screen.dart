import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'service_slots.dart';

/// Asking a provider for a visit: what, when and where. The server still
/// checks the block, the time and the price; this form only makes the choices
/// clear and sends the request.
class ServiceBookingScreen extends ConsumerWidget {
  const ServiceBookingScreen({super.key, required this.slug, this.offeringId});

  final String slug;
  final String? offeringId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = ref.watch(serviceProviderProvider(slug));
    return provider.when(
      loading: () => Scaffold(
        body: SafeArea(
          child: Column(
            children: const [
              ScreenTopBar(title: 'Request a booking'),
              Expanded(child: LoadingList(count: 2)),
            ],
          ),
        ),
      ),
      error: (error, stack) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              const ScreenTopBar(title: 'Request a booking'),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: ErrorNotice(
                  message: error is ApiException
                      ? error.message
                      : 'We could not open this provider. Check your '
                            'connection.',
                  onRetry: () => ref.invalidate(serviceProviderProvider(slug)),
                ),
              ),
            ],
          ),
        ),
      ),
      data: (provider) =>
          _BookingForm(provider: provider, initialOfferingId: offeringId),
    );
  }
}

class _BookingForm extends ConsumerStatefulWidget {
  const _BookingForm({required this.provider, this.initialOfferingId});

  final ServiceProvider provider;
  final String? initialOfferingId;

  @override
  ConsumerState<_BookingForm> createState() => _BookingFormState();
}

class _BookingFormState extends ConsumerState<_BookingForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _note = TextEditingController();
  final _offer = TextEditingController();

  String? _offeringId;
  DateTime? _day;
  DateTime? _slot;
  String? _appliedAddressId;
  double? _savedLat;
  double? _savedLng;
  bool _submitting = false;
  bool _slotError = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _city.text = ref.read(areaProvider).area?.cityName ?? '';
    final user = ref.read(sessionProvider).user;
    if (user != null) _name.text = user.name;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _city.dispose();
    _note.dispose();
    _offer.dispose();
    super.dispose();
  }

  ServiceOffering? _offeringFor(ServiceProvider provider) {
    if (provider.offerings.isEmpty) return null;
    if (_offeringId != null) {
      for (final offering in provider.offerings) {
        if (offering.id == _offeringId) return offering;
      }
    }
    if (widget.initialOfferingId != null) {
      for (final offering in provider.offerings) {
        if (offering.id == widget.initialOfferingId) return offering;
      }
    }
    return provider.offerings.first;
  }

  DateTime _dayFor(ServiceProvider provider, int durationMinutes) {
    if (_day != null) return _day!;
    final now = DateTime.now().toUtc();
    return firstServiceDay(
          provider: provider,
          durationMinutes: durationMinutes,
          nowUtc: now,
        ) ??
        karachiToday(now);
  }

  (double, double)? _location(ServiceProvider provider) {
    if (_savedLat != null && _savedLng != null) {
      return (_savedLat!, _savedLng!);
    }
    final area = ref.read(areaProvider).area;
    if (area?.latitude != null && area?.longitude != null) {
      return (area!.latitude!, area.longitude!);
    }
    if (provider.blockLatitude != null && provider.blockLongitude != null) {
      return (provider.blockLatitude!, provider.blockLongitude!);
    }
    return null;
  }

  void _applyAddress(SavedAddress address) {
    setState(() {
      if (address.fullName.isNotEmpty) _name.text = address.fullName;
      if (address.phone.isNotEmpty) _phone.text = address.phone;
      if (address.addressLine.isNotEmpty) {
        _address.text = address.addressLine;
      }
      if (address.city.isNotEmpty) _city.text = address.city;
      _savedLat = address.latitude;
      _savedLng = address.longitude;
      _appliedAddressId = address.id;
    });
  }

  Future<void> _pickDate(DateTime today) async {
    final first = DateTime(today.year, today.month, today.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: first,
      firstDate: first,
      lastDate: first.add(const Duration(days: serviceAdvanceDays - 1)),
      helpText: 'Pick a day for the visit',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _day = DateTime.utc(picked.year, picked.month, picked.day);
      _slot = null;
      _slotError = false;
    });
  }

  String _whenLabel(DateTime day, DateTime slot) {
    final today = karachiToday(DateTime.now().toUtc());
    final dayName = serviceDayLabel(day, today);
    return '$dayName, ${serviceDateLabel(day)} at '
        '${formatKarachiTime(slot)}';
  }

  Future<void> _submit(ServiceProvider provider) async {
    FocusScope.of(context).unfocus();
    final valid = _formKey.currentState?.validate() ?? false;
    final offering = _offeringFor(provider);
    final location = _location(provider);

    DateTime? slot;
    DateTime? day;
    if (offering != null) {
      day = _dayFor(provider, offering.durationMinutes);
      final slots = serviceSlotsFor(
        day: day,
        availability: provider.availability,
        durationMinutes: offering.durationMinutes,
        nowUtc: DateTime.now().toUtc(),
      );
      if (_slot != null && slots.contains(_slot)) slot = _slot;
    }

    int? offerPaisa;
    final rawOffer = _offer.text.trim().replaceAll(',', '');
    if (rawOffer.isNotEmpty) {
      final rupees = double.tryParse(rawOffer);
      if (rupees == null || rupees <= 0) {
        setState(() {
          _error = 'Enter your offer as a rupee amount, or leave it empty.';
        });
        return;
      }
      offerPaisa = (rupees * 100).round();
    }

    if (!valid || offering == null || slot == null || location == null) {
      setState(() {
        _slotError = slot == null;
        _error = location == null
            ? 'Choose a block in your area so we can place this job on the map.'
            : null;
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _slotError = false;
    });

    try {
      final created = await ref
          .read(shopperRepositoryProvider)
          .requestServiceBooking(
            providerId: provider.id,
            offeringId: offering.id,
            scheduledStart: slot,
            fullName: _name.text.trim(),
            phone: _phone.text.trim(),
            addressLine: _address.text.trim(),
            city: _city.text.trim(),
            latitude: location.$1,
            longitude: location.$2,
            note: _note.text,
            customerOfferPaisa: offerPaisa,
          );
      if (!mounted) return;
      await _showSent(
        provider: provider,
        created: created,
        offering: offering,
        when: _whenLabel(day!, slot),
      );
      if (!mounted) return;
      if (context.canPop()) context.pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        if (error.code == 'SLOT_TAKEN' || error.code == 'SLOT_UNAVAILABLE') {
          _slot = null;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error =
            'We could not send your request. Check your connection and try '
            'again.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSent({
    required ServiceProvider provider,
    required ServiceBookingCreated created,
    required ServiceOffering offering,
    required String when,
  }) {
    return showAppSheet<void>(
      context,
      title: 'Request sent',
      subtitle: 'Your request is with ${provider.displayName}.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SurfaceCard(
            child: Column(
              children: [
                InfoRow(label: 'Booking', value: created.bookingNumber),
                InfoRow(label: 'Service', value: offering.title),
                InfoRow(label: 'When', value: when),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'The provider will reply with a firm price and time. You will see '
            'their answer in your bookings.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 18),
          AppButton(
            label: 'Done',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  String? _validateName(String? value) {
    final trimmed = (value ?? '').trim();
    if (trimmed.length < 2) return 'Enter the name of the person to meet.';
    return null;
  }

  String? _validatePhone(String? value) {
    final trimmed = (value ?? '').trim();
    if (!RegExp(r'^[0-9+()\-\s]{7,20}$').hasMatch(trimmed)) {
      return 'Enter a phone number the provider can call.';
    }
    return null;
  }

  String? _validateAddress(String? value) {
    if ((value ?? '').trim().length < 5) return 'Enter the full address.';
    return null;
  }

  String? _validateOffer(String? value) {
    final raw = (value ?? '').trim().replaceAll(',', '');
    if (raw.isEmpty) return null;
    final rupees = double.tryParse(raw);
    if (rupees == null || rupees <= 0) return 'Enter a valid amount.';
    if (rupees > 10000000) return 'That amount is too large.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final provider = widget.provider;
    final offering = _offeringFor(provider);
    final now = DateTime.now().toUtc();
    final today = karachiToday(now);
    final day = offering == null
        ? today
        : _dayFor(provider, offering.durationMinutes);
    final slots = offering == null
        ? const <DateTime>[]
        : serviceSlotsFor(
            day: day,
            availability: provider.availability,
            durationMinutes: offering.durationMinutes,
            nowUtc: now,
          );
    final selectedSlot = _slot != null && slots.contains(_slot) ? _slot : null;
    final location = _location(provider);
    final addresses =
        ref.watch(savedAddressesProvider).asData?.value ?? const [];
    final canSubmit =
        !_submitting &&
        offering != null &&
        location != null &&
        provider.acceptingNewOrders;

    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              ScreenTopBar(
                title: 'Request a booking',
                subtitle: provider.displayName,
              ),
              if (!provider.acceptingNewOrders)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: const NoticeCard(
                    title: 'Not taking requests',
                    message:
                        'This provider is paused right now. You can look at '
                        'their services, but a request cannot be sent.',
                    icon: Icons.pause_circle_outline_rounded,
                    tone: StatusTone.info,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: SectionHeader(
                  title: 'What do you need?',
                  subtitle: provider.offerings.isEmpty
                      ? null
                      : 'Prices are a starting point. The provider sends a '
                            'firm price.',
                ),
              ),
              const SizedBox(height: 12),
              if (provider.offerings.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: const NoticeCard(
                    title: 'No services listed',
                    message:
                        'This provider has not published a service yet, so '
                        'there is nothing to request.',
                    icon: Icons.inventory_2_outlined,
                    tone: StatusTone.info,
                  ),
                )
              else
                for (final option in provider.offerings)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                    child: _OfferingChoice(
                      offering: option,
                      selected: option.id == offering?.id,
                      onTap: () => setState(() {
                        _offeringId = option.id;
                        _day = null;
                        _slot = null;
                        _slotError = false;
                      }),
                    ),
                  ),
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SectionHeader(
                  title: 'When should they come?',
                  subtitle: provider.availability.isPublished
                      ? 'Times are shown in Pakistan time.'
                      : 'This provider has not listed weekly hours. Pick any '
                            'future time; they can accept it or suggest '
                            'another.',
                ),
              ),
              const SizedBox(height: 10),
              _DayChooser(
                today: today,
                selected: day,
                onSelect: (picked) => setState(() {
                  _day = picked;
                  _slot = null;
                  _slotError = false;
                }),
                onMore: () => _pickDate(today),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: slots.isEmpty
                    ? _NoSlots(
                        onNextDay: () {
                          final next = firstServiceDay(
                            provider: provider,
                            durationMinutes: offering?.durationMinutes ?? 60,
                            nowUtc: DateTime.now().toUtc(),
                          );
                          if (next != null) {
                            setState(() {
                              _day = next;
                              _slot = null;
                            });
                          }
                        },
                        hasNext:
                            firstServiceDay(
                              provider: provider,
                              durationMinutes: offering?.durationMinutes ?? 60,
                              nowUtc: DateTime.now().toUtc(),
                            ) !=
                            null,
                      )
                    : Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final slot in slots)
                            _SlotChip(
                              label: formatKarachiTime(slot),
                              selected: slot == selectedSlot,
                              onTap: () => setState(() {
                                _slot = slot;
                                _slotError = false;
                              }),
                            ),
                        ],
                      ),
              ),
              const SizedBox(height: 22),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SectionHeader(
                  title: 'Where is the job?',
                  subtitle:
                      'The provider needs a number and an address to '
                      'find you.',
                ),
              ),
              if (addresses.isNotEmpty) ...[
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final address in addresses.take(4))
                        _SavedAddressChip(
                          label: address.label,
                          selected: address.id == _appliedAddressId,
                          onTap: () => _applyAddress(address),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    TextFormField(
                      key: const ValueKey('booking-name'),
                      controller: _name,
                      textInputAction: TextInputAction.next,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.name],
                      decoration: const InputDecoration(
                        labelText: 'Who should they meet?',
                      ),
                      validator: _validateName,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const ValueKey('booking-phone'),
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      inputFormatters: [LengthLimitingTextInputFormatter(20)],
                      decoration: const InputDecoration(
                        labelText: 'Phone number',
                        hintText: '03xx xxxxxxx',
                      ),
                      validator: _validatePhone,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const ValueKey('booking-address'),
                      controller: _address,
                      textCapitalization: TextCapitalization.sentences,
                      minLines: 1,
                      maxLines: 3,
                      autofillHints: const [AutofillHints.fullStreetAddress],
                      decoration: const InputDecoration(
                        labelText: 'Full address',
                        hintText: 'House, street and any landmark',
                        alignLabelWithHint: true,
                      ),
                      validator: _validateAddress,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const ValueKey('booking-city'),
                      controller: _city,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'City'),
                    ),
                  ],
                ),
              ),
              if (location == null) ...[
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: NoticeCard(
                    title: 'Choose your area first',
                    message:
                        'We need a nearby block to place this job on the map.',
                    icon: Icons.place_outlined,
                    tone: StatusTone.amber,
                    action: AppButton(
                      label: 'Choose area',
                      icon: Icons.edit_location_alt_outlined,
                      expand: false,
                      height: 44,
                      onPressed: () => context.push('/area'),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 22),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SectionHeader(
                  title: 'Anything else?',
                  subtitle: 'Both of these are optional.',
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    TextFormField(
                      key: const ValueKey('booking-note'),
                      controller: _note,
                      minLines: 2,
                      maxLines: 4,
                      maxLength: 1000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'A note for the provider',
                        hintText:
                            'For example: the gate code, or what needs '
                            'fixing',
                        alignLabelWithHint: true,
                        counterText: '',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const ValueKey('booking-offer'),
                      controller: _offer,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                        LengthLimitingTextInputFormatter(12),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Your offer for the whole job',
                        prefixText: 'Rs ',
                        helperText:
                            'Optional. The provider can accept it or '
                            'suggest a price.',
                        helperMaxLines: 2,
                      ),
                      validator: _validateOffer,
                    ),
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: ErrorNotice(
                    message: _error!,
                    onDismiss: () => setState(() => _error = null),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: BottomActionBar(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_slotError) ...[
              Row(
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    size: 17,
                    color: AppColors.danger,
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      'Choose a time for the visit.',
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: AppColors.danger),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            AppButton(
              label: 'Send booking request',
              icon: Icons.send_rounded,
              loading: _submitting,
              onPressed: canSubmit ? () => _submit(provider) : null,
              helper: offering == null
                  ? null
                  : 'Starts from ${formatMoney(offering.startingAtPrice)}. The '
                        'provider confirms the final price.',
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferingChoice extends StatelessWidget {
  const _OfferingChoice({
    required this.offering,
    required this.selected,
    required this.onTap,
  });

  final ServiceOffering offering;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      color: selected ? AppColors.sage : AppColors.surface,
      borderColor: selected ? AppColors.forest : AppColors.line,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            selected
                ? Icons.radio_button_checked_rounded
                : Icons.radio_button_unchecked_rounded,
            size: 21,
            color: selected ? AppColors.forest : AppColors.muted,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offering.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    formatDurationMinutes(offering.durationMinutes),
                    'From ${formatMoney(offering.startingAtPrice)}',
                  ].join(' • '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DayChooser extends StatelessWidget {
  const _DayChooser({
    required this.today,
    required this.selected,
    required this.onSelect,
    required this.onMore,
  });

  final DateTime today;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final days = serviceDayOptions(today.toUtc());
    return SizedBox(
      height: 74,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: days.length + 1,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (index == days.length) {
            return _DayChip(
              top: 'More',
              bottom: 'dates',
              selected: false,
              icon: Icons.calendar_month_rounded,
              onTap: onMore,
            );
          }
          final day = days[index];
          return _DayChip(
            top: serviceDayLabel(day, today),
            bottom: serviceDateLabel(day),
            selected: day == selected,
            onTap: () => onSelect(day),
          );
        },
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({
    required this.top,
    required this.bottom,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String top;
  final String bottom;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      label: '$top $bottom',
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: 78,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AppColors.forest : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AppColors.forest : AppColors.line,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null)
                Icon(
                  icon,
                  size: 18,
                  color: selected ? AppColors.white : AppColors.forest,
                )
              else
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    top,
                    maxLines: 1,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: selected ? AppColors.white : AppColors.ink,
                    ),
                  ),
                ),
              const SizedBox(height: 3),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  bottom,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: selected
                        ? AppColors.white.withValues(alpha: 0.8)
                        : AppColors.muted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotChip extends StatelessWidget {
  const _SlotChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.forest : AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(
              color: selected ? AppColors.forest : AppColors.line,
            ),
          ),
          child: Text(
            label,
            maxLines: 1,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.white : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _NoSlots extends StatelessWidget {
  const _NoSlots({required this.onNextDay, required this.hasNext});

  final VoidCallback onNextDay;
  final bool hasNext;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'No times on this day',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            hasNext
                ? 'The provider is closed on this day, or the job does not '
                      'fit. The next open day is ready for you.'
                : 'The provider has no open time in the next 60 days. Pick '
                      'another day or contact another provider.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (hasNext) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: onNextDay,
              child: const Text('Go to the next open day'),
            ),
          ],
        ],
      ),
    );
  }
}

class _SavedAddressChip extends StatelessWidget {
  const _SavedAddressChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.sage : AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? AppColors.forest : AppColors.line,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.bookmark_outline_rounded,
              size: 15,
              color: selected ? AppColors.forest : AppColors.muted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.forest : AppColors.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
