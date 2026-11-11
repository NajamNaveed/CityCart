import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Every delivery address saved on the account. The server owns the list and
/// the default flag; this screen only asks and then re-reads the list, so a
/// failed change never leaves the app showing something the server rejected.
class AddressesScreen extends ConsumerStatefulWidget {
  const AddressesScreen({super.key});

  @override
  ConsumerState<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends ConsumerState<AddressesScreen> {
  String? _busyId;

  Future<void> _refresh() async {
    ref.invalidate(savedAddressesProvider);
    try {
      await ref.read(savedAddressesProvider.future);
    } catch (_) {
      // The error state is rendered from the provider itself.
    }
  }

  Future<void> _openForm([String? addressId]) async {
    final changed = await context.push<bool>(
      addressId == null ? '/addresses/new' : '/addresses/$addressId/edit',
    );
    if (changed == true && mounted) await _refresh();
  }

  Future<void> _setDefault(SavedAddress address) async {
    if (_busyId != null) return;
    setState(() => _busyId = address.id);
    try {
      await ref.read(shopperRepositoryProvider).setDefaultAddress(address.id);
      if (!mounted) return;
      showAppSnack(context, '${address.label} is now your default address.');
      await _refresh();
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'We could not change the default address.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(SavedAddress address) async {
    if (_busyId != null) return;
    final confirmed = await confirmAction(
      context,
      title: 'Remove ${address.label}?',
      message: address.isDefault
          ? 'This is your default address. Another saved address will take '
                'its place.'
          : 'It will be removed from checkout and service bookings.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _busyId = address.id);
    try {
      await ref.read(shopperRepositoryProvider).deleteAddress(address.id);
      if (!mounted) return;
      showAppSnack(context, '${address.label} removed.');
      await _refresh();
    } on ApiException catch (error) {
      if (mounted) showAppSnack(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showAppSnack(context, 'We could not remove that address.', error: true);
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final addresses = ref.watch(savedAddressesProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Saved addresses',
              subtitle: 'Used at checkout and when you book a service',
              trailing: IconButton(
                tooltip: 'Add an address',
                onPressed: () => _openForm(),
                icon: const Icon(Icons.add_rounded),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.line),
                  minimumSize: const Size(44, 44),
                ),
              ),
            ),
            Expanded(
              child: addresses.when(
                loading: () => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [LoadingList(count: 3)],
                ),
                error: (error, _) => RefreshIndicator(
                  color: AppColors.forest,
                  onRefresh: _refresh,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
                    children: [
                      ErrorNotice(
                        message: error is ApiException
                            ? error.message
                            : 'We could not load your saved addresses.',
                        onRetry: _refresh,
                      ),
                    ],
                  ),
                ),
                data: (items) => RefreshIndicator(
                  color: AppColors.forest,
                  onRefresh: _refresh,
                  child: items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
                          children: [
                            EmptyState(
                              icon: Icons.place_outlined,
                              title: 'No saved addresses',
                              message:
                                  'Save the places you order to and they will '
                                  'be ready at checkout and for service '
                                  'bookings.',
                              action: AppButton(
                                label: 'Add an address',
                                icon: Icons.add_location_alt_outlined,
                                expand: false,
                                onPressed: () => _openForm(),
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                          itemCount: items.length + 2,
                          itemBuilder: (context, index) {
                            if (index == items.length) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: AppButton(
                                  label: 'Add another address',
                                  icon: Icons.add_location_alt_outlined,
                                  variant: AppButtonVariant.outline,
                                  onPressed: () => _openForm(),
                                ),
                              );
                            }
                            if (index > items.length) {
                              return const Padding(
                                padding: EdgeInsets.only(top: 14),
                                child: Text(
                                  'Only addresses inside a delivery block can '
                                  'be used at checkout.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: AppColors.muted,
                                  ),
                                ),
                              );
                            }
                            final address = items[index];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _AddressCard(
                                address: address,
                                busy: _busyId == address.id,
                                anyBusy: _busyId != null,
                                onEdit: () => _openForm(address.id),
                                onSetDefault: address.isDefault
                                    ? null
                                    : () => _setDefault(address),
                                onDelete: () => _delete(address),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({
    required this.address,
    required this.busy,
    required this.anyBusy,
    required this.onEdit,
    required this.onDelete,
    this.onSetDefault,
  });

  final SavedAddress address;
  final bool busy;
  final bool anyBusy;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onSetDefault;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.paperDeep,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.place_outlined,
                  size: 21,
                  color: AppColors.inkSoft,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            address.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        if (address.isDefault) ...[
                          const SizedBox(width: 8),
                          const Pill(
                            text: 'Default',
                            background: AppColors.sage,
                            foreground: AppColors.sageInk,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      address.summary,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${address.fullName} · ${address.phone}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (address.additionalInstructions != null &&
                        address.additionalInstructions!.trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        address.additionalInstructions!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall
                            ?.copyWith(fontStyle: FontStyle.italic),
                      ),
                    ],
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.only(left: 8, top: 10),
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: AppColors.forest,
                    ),
                  ),
                ),
            ],
          ),
          if (!address.canDeliver) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.dangerSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.wrong_location_outlined,
                    size: 17,
                    color: AppColors.danger,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No delivery pin saved. Edit this address to choose a '
                      'block before using it.',
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.35,
                        color: AppColors.danger,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 4,
              children: [
                TextButton(
                  onPressed: anyBusy ? null : onEdit,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.inkSoft,
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: const Text('Edit'),
                ),
                if (onSetDefault != null)
                  TextButton(
                    onPressed: anyBusy ? null : onSetDefault,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.forest,
                      minimumSize: const Size(0, 44),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    child: const Text('Make default'),
                  ),
                TextButton(
                  onPressed: anyBusy ? null : onDelete,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: const Text('Remove'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
