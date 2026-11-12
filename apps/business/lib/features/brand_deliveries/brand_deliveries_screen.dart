import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class _DeliveryFilter {
  const _DeliveryFilter(this.label, this.key, this.status);

  final String label;
  final String key;
  final String? status;
}

const _filters = [
  _DeliveryFilter('All', 'all', null),
  _DeliveryFilter('To collect', 'ready', 'READY_FOR_PICKUP'),
  _DeliveryFilter('Picked up', 'picked_up', 'PICKED_UP'),
  _DeliveryFilter('On the way', 'transit', 'IN_TRANSIT'),
  _DeliveryFilter('At the door', 'door', 'OUT_FOR_DELIVERY'),
  _DeliveryFilter('Failed', 'failed', 'FAILED'),
];

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your deliveries. Check the connection and try again.';
}

/// Every delivery for the shop, with plain filters and one card per parcel.
class BrandDeliveriesScreen extends ConsumerStatefulWidget {
  const BrandDeliveriesScreen({super.key, this.initialStatus});

  final String? initialStatus;

  @override
  ConsumerState<BrandDeliveriesScreen> createState() =>
      _BrandDeliveriesScreenState();
}

class _BrandDeliveriesScreenState extends ConsumerState<BrandDeliveriesScreen> {
  late int _filterIndex = _indexFor(widget.initialStatus);
  var _items = const <BrandDelivery>[];
  var _pagination = const Pagination();
  var _loading = true;
  var _loadingMore = false;
  String? _error;
  var _request = 0;

  static int _indexFor(String? status) {
    if (status == null) return 0;
    final index = _filters.indexWhere((filter) => filter.status == status);
    return index < 0 ? 0 : index;
  }

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
          .brandDeliveries(
            status: _filters[_filterIndex].status,
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

  Future<void> _open(BrandDelivery delivery) async {
    await context.push('/brand-deliveries/${delivery.id}', extra: delivery);
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Deliveries')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Deliveries',
              subtitle:
                  'Follow every order from your shop to the customer’s door.',
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 42,
              child: ListView.separated(
                key: const Key('delivery_filters'),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _filters[index];
                  return FilterPill(
                    key: Key('delivery_filter_${filter.key}'),
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
    if (_loading) return const LoadingView(label: 'Loading deliveries');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      return EmptyPanel(
        icon: Icons.local_shipping_outlined,
        title: _emptyTitle,
        message: _emptyMessage,
        action: _filterIndex == 0
            ? null
            : AppButton(
                label: 'Show all deliveries',
                variant: AppButtonVariant.outline,
                onPressed: () => _selectFilter(0),
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _DeliveryCard(
            key: Key('delivery_card_${_items[i].id}'),
            delivery: _items[i],
            onTap: () => _open(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more deliveries',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }

  String get _emptyTitle => switch (_filters[_filterIndex].status) {
    null => 'No deliveries yet',
    'READY_FOR_PICKUP' => 'Nothing waiting for pickup',
    'PICKED_UP' => 'No parcels picked up',
    'IN_TRANSIT' => 'Nothing on the way',
    'OUT_FOR_DELIVERY' => 'Nobody at the door',
    'FAILED' => 'No failed deliveries',
    _ => 'Nothing here',
  };

  String get _emptyMessage => switch (_filters[_filterIndex].status) {
    null =>
      'When an order is ready to ship, its delivery appears here with the '
          'rider and the way to the customer.',
    'READY_FOR_PICKUP' =>
      'Orders you mark ready to ship wait here until the rider collects them.',
    'PICKED_UP' => 'A parcel appears here once a rider has it.',
    'IN_TRANSIT' => 'Moving parcels appear here until they reach the door.',
    'OUT_FOR_DELIVERY' =>
      'Parcels with a rider at the customer’s door appear here.',
    'FAILED' => 'A failed attempt appears here so you can send it out again.',
    _ => 'Try another filter.',
  };
}

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({super.key, required this.delivery, required this.onTap});

  final BrandDelivery delivery;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final address = delivery.address;
    final customer = address?.name ?? 'Customer';
    final city = address?.cityLine ?? '';
    final rider = delivery.assignedAgent.trim();
    final orderNumber = delivery.orderNumber.isEmpty
        ? 'Delivery'
        : delivery.orderNumber;

    return SurfacePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 6,
            children: [
              StatusTag(
                label: brandDeliveryStatusLabel(delivery.status),
                tone: brandDeliveryStatusTone(delivery.status),
              ),
              Text(
                orderNumber,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text.labelSmall,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            customer,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.titleSmall,
          ),
          if (city.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              city,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.bodySmall,
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(
                Icons.sports_motorsports_outlined,
                size: 17,
                color: AppColors.muted,
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  rider.isEmpty ? 'No rider yet' : rider,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                money(delivery.deliveryFeePaisa),
                maxLines: 1,
                style: text.titleSmall,
              ),
            ],
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
      appBar: AppBar(title: const Text('Deliveries')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Deliveries',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not shop deliveries.',
          ),
          SizedBox(height: 20),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: EmptyPanel(
              icon: Icons.storefront_outlined,
              title: 'This is a shop screen',
              message:
                  'Deliveries belong to shop accounts. Service jobs are under '
                  'Bookings.',
            ),
          ),
        ],
      ),
    );
  }
}
