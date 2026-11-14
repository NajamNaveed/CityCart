import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart' hide Block;
import 'package:latlong2/latlong.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../location/geo.dart';
import '../location/maps.dart';

/// Add or edit one saved address. The pin is dropped on a free OpenStreetMap
/// with the delivery areas shaded; the server still checks that it lies inside
/// an active block before the address is saved.
class AddressFormScreen extends ConsumerStatefulWidget {
  const AddressFormScreen({super.key, this.addressId});

  final String? addressId;

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _label = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _addressLine = TextEditingController();
  final _city = TextEditingController();
  final _notes = TextEditingController();
  final _state = TextEditingController();
  final _postal = TextEditingController();
  final _country = TextEditingController();

  bool _showExtra = false;
  bool _makeDefault = false;

  double? _latitude;
  double? _longitude;
  String? _pinLabel;
  bool _pinError = false;

  bool _loading = false;
  bool _busy = false;
  String? _loadError;
  String? _saveError;

  bool get _editing => widget.addressId != null;

  @override
  void initState() {
    super.initState();
    _name.text = ref.read(sessionProvider).user?.name ?? '';
    final area = ref.read(areaProvider).area;
    if (area != null) {
      _city.text = area.cityName;
      if (area.latitude != null && area.longitude != null) {
        _latitude = area.latitude;
        _longitude = area.longitude;
        _pinLabel = area.blockName;
      }
    }
    if (_editing) {
      _loading = true;
      _load();
    }
  }

  @override
  void dispose() {
    _label.dispose();
    _name.dispose();
    _phone.dispose();
    _addressLine.dispose();
    _city.dispose();
    _notes.dispose();
    _state.dispose();
    _postal.dispose();
    _country.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final list = await ref.read(shopperRepositoryProvider).addresses();
      if (!mounted) return;
      SavedAddress? found;
      for (final address in list) {
        if (address.id == widget.addressId) {
          found = address;
          break;
        }
      }
      if (found == null) {
        setState(() {
          _loading = false;
          _loadError = 'This address is no longer on your account.';
        });
        return;
      }
      _fill(found);
      setState(() => _loading = false);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = error.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = 'We could not load this address. Check your connection.';
        });
      }
    }
  }

  void _fill(SavedAddress address) {
    _label.text = address.label;
    _name.text = address.fullName;
    _phone.text = address.phone;
    _addressLine.text = address.addressLine;
    _city.text = address.city;
    _notes.text = address.additionalInstructions ?? '';
    _state.text = address.state ?? '';
    _postal.text = address.postalCode ?? '';
    _country.text = address.country ?? '';
    _showExtra =
        _state.text.isNotEmpty ||
        _postal.text.isNotEmpty ||
        _country.text.isNotEmpty;
    _latitude = address.latitude;
    _longitude = address.longitude;
    if (address.blocks.isNotEmpty) {
      _pinLabel = address.blocks.map((block) => block.name).join(', ');
    } else if (address.canDeliver) {
      _pinLabel = 'Saved delivery pin';
    } else {
      _pinLabel = null;
    }
    _pinError = false;
  }

  void _pickOnMap(LatLng point, List<Block> blocks) {
    final inside = blocksContainingPoint(blocks, point);
    setState(() {
      _latitude = point.latitude;
      _longitude = point.longitude;
      _pinLabel = inside.isEmpty
          ? 'Pinned on the map'
          : inside.map((block) => block.name).join(' + ');
      _pinError = false;
      _saveError = null;
    });
  }

  /// The map is a hint; this asks the same blocks endpoint the server uses so
  /// a spot outside every drawn area is caught before the save call.
  Future<bool> _pinIsDeliverable() async {
    final area = ref.read(areaProvider).area;
    if (area == null || _latitude == null || _longitude == null) return true;
    try {
      final blocks = await ref.read(blocksProvider(area.cityId).future);
      if (blocks.isEmpty) return true;
      return blocksContainingPoint(
        blocks,
        LatLng(_latitude!, _longitude!),
      ).isNotEmpty;
    } catch (_) {
      // The server is still authoritative; do not block on a hint that failed.
      return true;
    }
  }

  Future<void> _save() async {
    if (_busy) return;
    final formValid = _formKey.currentState?.validate() ?? false;
    final hasPin = _latitude != null && _longitude != null;
    if (!hasPin && _pinError != true) setState(() => _pinError = true);
    if (!formValid || !hasPin) return;
    if (!await _pinIsDeliverable()) {
      if (mounted) setState(() => _pinError = true);
      return;
    }
    if (!mounted) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _saveError = null;
    });

    final notes = _notes.text.trim();
    final state = _state.text.trim();
    final postal = _postal.text.trim();
    final country = _country.text.trim();
    try {
      final repository = ref.read(shopperRepositoryProvider);
      if (_editing) {
        await repository.updateAddress(
          widget.addressId!,
          label: _label.text.trim(),
          fullName: _name.text.trim(),
          phone: _phone.text.trim(),
          addressLine: _addressLine.text.trim(),
          city: _city.text.trim(),
          latitude: _latitude!,
          longitude: _longitude!,
          state: state.isEmpty ? null : state,
          postalCode: postal.isEmpty ? null : postal,
          country: country.isEmpty ? null : country,
          additionalInstructions: notes.isEmpty ? null : notes,
        );
      } else {
        await repository.createAddress(
          label: _label.text.trim(),
          fullName: _name.text.trim(),
          phone: _phone.text.trim(),
          addressLine: _addressLine.text.trim(),
          city: _city.text.trim(),
          latitude: _latitude!,
          longitude: _longitude!,
          state: state.isEmpty ? null : state,
          postalCode: postal.isEmpty ? null : postal,
          country: country.isEmpty ? null : country,
          additionalInstructions: notes.isEmpty ? null : notes,
          isDefault: _makeDefault,
        );
      }
      ref.invalidate(savedAddressesProvider);
      if (!mounted) return;
      context.pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _saveError = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _saveError =
              'We could not save this address. Check your connection.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: _editing ? 'Edit address' : 'New address',
              subtitle: _editing
                  ? 'Update where this address delivers'
                  : 'Save a place you order to',
            ),
            Expanded(
              child: _loading
                  ? const Center(
                      child: SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: AppColors.forest,
                        ),
                      ),
                    )
                  : _loadError != null
                  ? ListView(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
                      children: [
                        ErrorNotice(
                          message: _loadError!,
                          onRetry: _editing ? _load : null,
                        ),
                        const SizedBox(height: 18),
                        AppButton(
                          label: 'Back to addresses',
                          variant: AppButtonVariant.outline,
                          onPressed: () {
                            if (context.canPop()) {
                              context.pop();
                            } else {
                              context.go('/addresses');
                            }
                          },
                        ),
                      ],
                    )
                  : _form(),
            ),
            if (!_loading && _loadError == null)
              BottomActionBar(
                child: AppButton(
                  label: _editing ? 'Save changes' : 'Add address',
                  icon: Icons.check_rounded,
                  loading: _busy,
                  onPressed: _busy ? null : _save,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _form() {
    final area = ref.watch(areaProvider).area;
    final blocks = area == null ? null : ref.watch(blocksProvider(area.cityId));
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          TextFormField(
            controller: _label,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Name this address',
              hintText: 'Home',
              prefixIcon: Icon(Icons.bookmark_outline_rounded, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Give this address a short name.';
              if (text.length > 40) return 'Use 40 characters or fewer.';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(
              labelText: 'Full name',
              prefixIcon: Icon(Icons.person_outline_rounded, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.length < 2) return 'Enter the name for this delivery.';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(
              labelText: 'Phone number',
              hintText: '0300 1234567',
              prefixIcon: Icon(Icons.call_outlined, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (!RegExp(r'^\+?[0-9][0-9\s-]{6,19}$').hasMatch(text)) {
                return 'Enter a phone number the rider can call.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _addressLine,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.next,
            minLines: 2,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Street address',
              hintText: 'House 12, Street 4',
              alignLabelWithHint: true,
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.length < 5) {
                return 'Enter the street and house number.';
              }
              if (text.length > 300) {
                return 'Keep the address under 300 characters.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _city,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'City',
              prefixIcon: Icon(Icons.location_city_outlined, size: 20),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Enter the city.';
              if (text.length > 100) return 'Keep the city name shorter.';
              return null;
            },
          ),
          const SizedBox(height: 14),
          DeliverySpotPicker(
            hasArea: area != null,
            blocks: blocks,
            pin: _latitude != null && _longitude != null
                ? LatLng(_latitude!, _longitude!)
                : null,
            label: _pinLabel,
            error: _pinError,
            onPick: (point) =>
                _pickOnMap(point, blocks?.asData?.value ?? const <Block>[]),
            onRetry: area == null
                ? null
                : () => ref.invalidate(blocksProvider(area.cityId)),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _notes,
            minLines: 2,
            maxLines: 4,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            buildCounter: (
              context, {
              required currentLength,
              required isFocused,
              maxLength,
            }) => null,
            decoration: const InputDecoration(
              labelText: 'Delivery notes (optional)',
              hintText: 'Landmark, gate, floor, or who to call.',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _busy
                  ? null
                  : () => setState(() => _showExtra = !_showExtra),
              icon: Icon(
                _showExtra
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
                size: 19,
              ),
              label: Text(
                _showExtra
                    ? 'Hide extra address details'
                    : 'Add state, postal code or country',
              ),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.inkSoft,
                padding: const EdgeInsets.symmetric(horizontal: 4),
              ),
            ),
          ),
          if (_showExtra) ...[
            const SizedBox(height: 6),
            TextFormField(
              controller: _state,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'State or province (optional)',
              ),
              validator: (value) {
                if ((value?.trim().length ?? 0) > 100) {
                  return 'Keep the state name shorter.';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _postal,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Postal code (optional)',
              ),
              validator: (value) {
                if ((value?.trim().length ?? 0) > 20) {
                  return 'Keep the postal code shorter.';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _country,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Country (optional)',
              ),
              validator: (value) {
                if ((value?.trim().length ?? 0) > 100) {
                  return 'Keep the country name shorter.';
                }
                return null;
              },
            ),
          ],
          if (!_editing) ...[
            const SizedBox(height: 12),
            SurfaceCard(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              child: Row(
                children: [
                  const Icon(
                    Icons.check_circle_outline_rounded,
                    size: 21,
                    color: AppColors.sageInk,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Make this my default address',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Checkout and service bookings use it first.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    value: _makeDefault,
                    onChanged: _busy
                        ? null
                        : (value) => setState(() => _makeDefault = value),
                  ),
                ],
              ),
            ),
          ],
          if (_saveError != null) ...[
            const SizedBox(height: 14),
            ErrorNotice(message: _saveError!),
          ],
        ],
      ),
    );
  }
}
