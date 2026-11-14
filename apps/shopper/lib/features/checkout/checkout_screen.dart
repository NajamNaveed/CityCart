import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart' hide Block;
import 'package:latlong2/latlong.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../cart/cart_controller.dart';
import '../location/geo.dart';
import '../location/maps.dart';

/// One page from basket to order: where it goes, how the rider finds it, and
/// how it is paid. The server splits the basket into one order per shop, so the
/// confirmation lists every order that was actually created.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _phone = TextEditingController();
  final _addressLine = TextEditingController();
  final _city = TextEditingController();
  final _notes = TextEditingController();
  final _label = TextEditingController(text: 'Home');

  List<SavedAddress> _addresses = const [];
  bool _loadingAddresses = true;
  String? _addressError;

  String? _selectedAddressId;
  bool _newAddress = true;
  bool _saveAddress = false;
  LatLng? _pin;
  String? _pinLabel;
  bool _blockMissing = false;
  String? _notesError;

  bool _placing = false;
  String? _placeError;
  List<PlacedOrder>? _placed;

  @override
  void initState() {
    super.initState();
    _city.text = ref.read(areaProvider).area?.cityName ?? '';
    _loadAddresses();
  }

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
    _addressLine.dispose();
    _city.dispose();
    _notes.dispose();
    _label.dispose();
    super.dispose();
  }

  Future<void> _loadAddresses() async {
    setState(() {
      _loadingAddresses = true;
      _addressError = null;
    });
    try {
      final list = await ref.read(shopperRepositoryProvider).addresses();
      if (!mounted) return;
      final preferred = list.where((a) => a.isDefault && a.canDeliver);
      final firstUsable = list.where((a) => a.canDeliver);
      final chosen = preferred.isNotEmpty
          ? preferred.first
          : (firstUsable.isNotEmpty ? firstUsable.first : null);
      setState(() {
        _addresses = list;
        _loadingAddresses = false;
        if (chosen != null) {
          _selectedAddressId = chosen.id;
          _newAddress = false;
          _notes.text = chosen.additionalInstructions ?? '';
        }
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _addressError = error.message;
        _loadingAddresses = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _addressError = 'We could not load your saved addresses.';
        _loadingAddresses = false;
      });
    }
  }

  void _selectAddress(SavedAddress address) {
    setState(() {
      _selectedAddressId = address.id;
      _newAddress = false;
      _notes.text = address.additionalInstructions ?? '';
      _notesError = null;
      _placeError = null;
    });
  }

  void _selectNewAddress() {
    setState(() {
      _selectedAddressId = null;
      _newAddress = true;
      if (_notes.text.isNotEmpty &&
          _addresses.any((a) => a.additionalInstructions == _notes.text)) {
        _notes.clear();
      }
      _placeError = null;
    });
  }

  void _pickOnMap(LatLng point, List<Block> blocks) {
    final inside = blocksContainingPoint(blocks, point);
    setState(() {
      _pin = point;
      _pinLabel = inside.isEmpty
          ? 'Pinned on the map'
          : inside.map((block) => block.name).join(' + ');
      _blockMissing = false;
      _placeError = null;
    });
  }

  int _wordCount(String value) =>
      value.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

  Future<void> _placeOrder() async {
    if (_placing) return;
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) {
      showAppSnack(context, 'Your basket is empty.', error: true);
      return;
    }
    if (cart.hasIssues) {
      showAppSnack(
        context,
        'Remove the unavailable items in your basket first.',
        error: true,
      );
      return;
    }

    final notes = _notes.text.trim();
    final words = _wordCount(notes);
    if (words == 0) {
      setState(() => _notesError = 'Add a note so the rider can find you.');
      FocusScope.of(context).unfocus();
      return;
    }
    if (words > 200) {
      setState(() => _notesError = 'Use 200 words or fewer.');
      FocusScope.of(context).unfocus();
      return;
    }

    SavedAddress? saved;
    if (!_newAddress) {
      for (final address in _addresses) {
        if (address.id == _selectedAddressId) {
          saved = address;
          break;
        }
      }
      if (saved == null || !saved.canDeliver) {
        setState(
          () => _placeError = 'Choose an address that has a delivery pin.',
        );
        showAppSnack(
          context,
          'Choose an address that has a delivery pin.',
          error: true,
        );
        return;
      }
    } else {
      final valid = _formKey.currentState?.validate() ?? false;
      setState(() => _blockMissing = _pin == null);
      if (!valid || _pin == null) {
        FocusScope.of(context).unfocus();
        return;
      }
      final area = ref.read(areaProvider).area;
      if (area != null) {
        try {
          final blocks = await ref.read(blocksProvider(area.cityId).future);
          if (blocks.isNotEmpty &&
              blocksContainingPoint(blocks, _pin!).isEmpty) {
            setState(() => _blockMissing = true);
            return;
          }
        } catch (_) {
          // The server still checks the point; a failed hint must not stop it.
        }
      }
    }

    setState(() {
      _placing = true;
      _placeError = null;
      _notesError = null;
    });
    try {
      final orders = await ref
          .read(shopperRepositoryProvider)
          .placeOrder(
            fullName: saved?.fullName ?? _fullName.text.trim(),
            phone: saved?.phone ?? _phone.text.trim(),
            addressLine: saved?.addressLine ?? _addressLine.text.trim(),
            city: saved?.city ?? _city.text.trim(),
            deliveryNotes: notes,
            latitude: saved?.latitude ?? _pin!.latitude,
            longitude: saved?.longitude ?? _pin!.longitude,
            state: saved?.state,
            postalCode: saved?.postalCode,
            country: saved?.country,
            addressId: saved?.id,
            saveAsLabel: _newAddress && _saveAddress
                ? (_label.text.trim().isEmpty ? 'Home' : _label.text.trim())
                : null,
          );
      await ref.read(cartProvider).load();
      if (!mounted) return;
      setState(() {
        _placed = orders;
        _placing = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        _placeError = error.message;
      });
      showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        _placeError = 'The order did not go through. Please try again.';
      });
      showAppSnack(
        context,
        'The order did not go through. Please try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final placed = _placed;
    if (placed != null) return _Confirmation(orders: placed);

    final cart = ref.watch(cartProvider).cart;
    final area = ref.watch(areaProvider).area;
    final blocks = area == null
        ? const AsyncLoading<List<Block>>()
        : ref.watch(blocksProvider(area.cityId));
    final canPlace = !cart.isEmpty && !cart.hasIssues;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Checkout',
              subtitle: cart.isEmpty
                  ? null
                  : '${itemCountLabel(cart.itemCount)} from '
                        '${plural(cart.groups.length, 'shop')}',
            ),
            Expanded(child: _body(cart, area, blocks)),
            if (canPlace)
              BottomActionBar(
                child: AppButton(
                  label: 'Place order',
                  icon: Icons.lock_outline_rounded,
                  loading: _placing,
                  onPressed: _placing ? null : _placeOrder,
                  helper:
                      'You pay ${formatMoney(cart.subtotal)} in cash when the '
                      'order arrives.',
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _body(
    CartView cart,
    AreaSelection? area,
    AsyncValue<List<Block>> blocks,
  ) {
    if (cart.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 30),
        children: [
          EmptyState(
            icon: Icons.shopping_basket_outlined,
            title: 'Nothing to check out',
            message:
                'Your basket is empty, so there is nothing to order right now.',
            action: AppButton(
              label: 'Browse shops',
              icon: Icons.storefront_outlined,
              expand: false,
              onPressed: () => context.go('/home'),
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 2, 20, 24),
      children: [
        if (cart.hasIssues) ...[
          const NoticeCard(
            title: 'Some items cannot be bought',
            message:
                'Go back to the basket and remove the items marked as '
                'unavailable before checking out.',
            icon: Icons.info_outline_rounded,
            tone: StatusTone.amber,
          ),
          const SizedBox(height: 16),
        ],
        const SectionLabel('Deliver to'),
        const SizedBox(height: 10),
        _addressSection(),
        if (_newAddress) ...[
          const SizedBox(height: 14),
          _newAddressForm(area, blocks),
        ],
        const SizedBox(height: 22),
        _notesField(),
        const SizedBox(height: 22),
        const SectionLabel('Payment'),
        const SizedBox(height: 10),
        const _PaymentCard(),
        const SizedBox(height: 22),
        const SectionLabel('Order summary'),
        const SizedBox(height: 10),
        _SummaryCard(cart: cart),
        if (_placeError != null) ...[
          const SizedBox(height: 14),
          ErrorNotice(message: _placeError!),
        ],
      ],
    );
  }

  Widget _addressSection() {
    if (_loadingAddresses) {
      return const Column(
        children: [
          SkeletonBox(height: 74),
          SizedBox(height: 10),
          SkeletonBox(height: 74),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_addressError != null) ...[
          ErrorNotice(message: _addressError!, onRetry: _loadAddresses),
          const SizedBox(height: 10),
        ],
        for (final address in _addresses)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _AddressOption(
              address: address,
              selected: !_newAddress && _selectedAddressId == address.id,
              onTap: address.canDeliver ? () => _selectAddress(address) : null,
            ),
          ),
        _NewAddressOption(selected: _newAddress, onTap: _selectNewAddress),
      ],
    );
  }

  Widget _newAddressForm(AreaSelection? area, AsyncValue<List<Block>> blocks) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _fullName,
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
          const SizedBox(height: 12),
          DeliverySpotPicker(
            hasArea: area != null,
            blocks: blocks,
            pin: _pin,
            label: _pinLabel,
            error: _blockMissing,
            onPick: (point) =>
                _pickOnMap(point, blocks.asData?.value ?? const <Block>[]),
            onRetry: area == null
                ? null
                : () => ref.invalidate(blocksProvider(area.cityId)),
          ),
          const SizedBox(height: 14),
          _SaveAddressToggle(
            value: _saveAddress,
            onChanged: (value) => setState(() => _saveAddress = value),
            child: _saveAddress
                ? Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: TextFormField(
                      controller: _label,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Name this address',
                        hintText: 'Home',
                        prefixIcon: Icon(
                          Icons.bookmark_outline_rounded,
                          size: 20,
                        ),
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) {
                          return 'Give the address a short name.';
                        }
                        if (text.length > 40) {
                          return 'Use 40 characters or fewer.';
                        }
                        return null;
                      },
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          if (area != null) ...[
            const SizedBox(height: 8),
            Text(
              'Delivering in ${area.cityName}. Change your area from the You '
              'tab if this is the wrong city.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  Widget _notesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel('Delivery notes'),
        const SizedBox(height: 10),
        TextField(
          controller: _notes,
          minLines: 3,
          maxLines: 5,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          buildCounter: (
            context, {
            required currentLength,
            required isFocused,
            maxLength,
          }) => null,
          onChanged: (_) {
            if (_notesError != null) setState(() => _notesError = null);
          },
          decoration: InputDecoration(
            hintText: 'Landmark, gate, floor, or who to call on arrival.',
            alignLabelWithHint: true,
            errorText: _notesError,
          ),
        ),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _notes,
          builder: (context, value, child) {
            final words = _wordCount(value.text);
            final over = words > 200;
            return Text(
              '$words of 200 words',
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(color: over ? AppColors.danger : null),
            );
          },
        ),
        const SizedBox(height: 4),
        Text(
          'The rider sees these notes. They are required so every delivery '
          'has a way to find you.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _AddressOption extends StatelessWidget {
  const _AddressOption({
    required this.address,
    required this.selected,
    required this.onTap,
  });

  final SavedAddress address;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final usable = onTap != null;
    return SurfaceCard(
      onTap: onTap,
      color: selected ? AppColors.sage : null,
      borderColor: selected ? AppColors.sageInk.withValues(alpha: 0.4) : null,
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RadioDot(selected: selected, disabled: !usable),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  address.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  address.summary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 3),
                Text(
                  usable
                      ? address.phone
                      : 'No delivery pin saved. Choose another address.',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: usable ? AppColors.inkSoft : AppColors.danger,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NewAddressOption extends StatelessWidget {
  const _NewAddressOption({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: onTap,
      color: selected ? AppColors.sage : null,
      borderColor: selected ? AppColors.sageInk.withValues(alpha: 0.4) : null,
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      child: Row(
        children: [
          _RadioDot(selected: selected),
          const SizedBox(width: 12),
          const Icon(
            Icons.add_location_alt_outlined,
            size: 20,
            color: AppColors.inkSoft,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Deliver to a new address',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ],
      ),
    );
  }
}

class _RadioDot extends StatelessWidget {
  const _RadioDot({required this.selected, this.disabled = false});

  final bool selected;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final color = disabled
        ? AppColors.lineStrong
        : selected
        ? AppColors.forest
        : AppColors.lineStrong;
    return Container(
      width: 21,
      height: 21,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 1.8),
      ),
      child: selected
          ? Container(
              width: 11,
              height: 11,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.forest,
              ),
            )
          : null,
    );
  }
}

class _SaveAddressToggle extends StatelessWidget {
  const _SaveAddressToggle({
    required this.value,
    required this.onChanged,
    required this.child,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(14, 8, 10, 8),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.bookmark_border_rounded,
                size: 20,
                color: AppColors.inkSoft,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Save this address',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Switch.adaptive(
                value: value,
                activeThumbColor: AppColors.forest,
                onChanged: onChanged,
              ),
            ],
          ),
          child,
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard();

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.sage,
      borderColor: AppColors.sage,
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.75),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.payments_outlined,
              size: 21,
              color: AppColors.sageInk,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Cash on delivery',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    const Pill(
                      text: 'COD',
                      background: AppColors.surface,
                      foreground: AppColors.sageInk,
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  'Pay the rider in cash when your order reaches your door. '
                  'Nothing is charged now.',
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.cart});

  final CartView cart;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        children: [
          for (final group in cart.groups) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${group.brandName ?? 'Shop'} · '
                      '${itemCountLabel(_unitsIn(group))}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 96),
                    child: MoneyText(
                      formatMoney(group.subtotal),
                      size: 14,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const Divider(),
          InfoRow(label: 'Delivery', value: 'Free'),
          InfoRow(
            label: 'Total',
            value: formatMoney(cart.subtotal),
            strong: true,
          ),
          const SizedBox(height: 4),
          Text(
            'One order is created for each shop, so a rider may arrive for '
            'each one separately.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  int _unitsIn(CartGroup group) =>
      group.items.fold<int>(0, (sum, item) => sum + item.quantity);
}

class _Confirmation extends StatelessWidget {
  const _Confirmation({required this.orders});

  final List<PlacedOrder> orders;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ScreenTopBar(title: 'Order placed', back: false),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                children: [
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        color: AppColors.sage,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_rounded,
                        size: 36,
                        color: AppColors.sageInk,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Thank you!',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    orders.length == 1
                        ? 'The shop has your order and will confirm it shortly.'
                        : '${orders.length} shops have your order and will '
                              'confirm it shortly.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 22),
                  for (final order in orders)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _PlacedOrderCard(order: order),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    'Your basket is empty now. You can follow every order '
                    'once the shop starts preparing it.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 20),
                  AppButton(
                    label: 'View your orders',
                    icon: Icons.receipt_long_rounded,
                    onPressed: () => context.go('/orders'),
                  ),
                  const SizedBox(height: 8),
                  AppButton(
                    label: 'Keep shopping',
                    icon: Icons.storefront_outlined,
                    variant: AppButtonVariant.outline,
                    onPressed: () => context.go('/home'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlacedOrderCard extends StatelessWidget {
  const _PlacedOrderCard({required this.order});

  final PlacedOrder order;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      onTap: order.id.isEmpty
          ? null
          : () => context.push('/orders/${order.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  order.orderNumber.isEmpty
                      ? 'New order'
                      : 'Order ${order.orderNumber}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 128),
                child: StatusPill(
                  text: friendlyOrder(order.orderStatus),
                  tone: toneForOrder(order.orderStatus),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Tap to follow this order',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 10),
          for (final item in order.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${item.productName} × ${item.quantity}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 90),
                    child: MoneyText(
                      formatMoney(item.totalPrice, currency: order.currency),
                      size: 13.5,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 6),
          const Divider(),
          InfoRow(
            label: 'Pay on delivery',
            value: formatMoney(order.total, currency: order.currency),
            strong: true,
          ),
        ],
      ),
    );
  }
}
