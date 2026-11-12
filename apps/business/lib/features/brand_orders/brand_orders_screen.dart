import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'order_card.dart';

class _OrderFilter {
  const _OrderFilter(this.label, this.key, this.status);

  final String label;
  final String key;
  final String? status;
}

const _filters = [
  _OrderFilter('All', 'all', null),
  _OrderFilter('New', 'pending', 'PENDING'),
  _OrderFilter('Confirmed', 'confirmed', 'CONFIRMED'),
  _OrderFilter('Preparing', 'processing', 'PROCESSING'),
  _OrderFilter('Ready', 'ready', 'READY_FOR_SHIPMENT'),
  _OrderFilter('Rejected', 'rejected', 'REJECTED'),
];

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your orders. Check the connection and try again.';
}

/// Every customer order for the shop, newest first, with six plain filters.
class BrandOrdersScreen extends ConsumerStatefulWidget {
  const BrandOrdersScreen({super.key, this.initialStatus});

  final String? initialStatus;

  @override
  ConsumerState<BrandOrdersScreen> createState() => _BrandOrdersScreenState();
}

class _BrandOrdersScreenState extends ConsumerState<BrandOrdersScreen> {
  late int _filterIndex = _indexFor(widget.initialStatus);
  var _items = const <BrandOrder>[];
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
          .brandOrders(
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

  Future<void> _open(BrandOrder order) async {
    await context.push('/brand-orders/${order.id}', extra: order);
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Customer orders',
              subtitle:
                  'Confirm orders, prepare them and hand them to delivery.',
            ),
            const SizedBox(height: 16),
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
                    key: Key('brand_order_filter_${filter.key}'),
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
    if (_loading) return const LoadingView(label: 'Loading orders');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    if (_items.isEmpty) {
      return EmptyPanel(
        icon: Icons.receipt_long_outlined,
        title: _emptyTitle,
        message: _emptyMessage,
        action: _filterIndex == 0
            ? null
            : AppButton(
                label: 'Show all orders',
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
          BrandOrderCard(
            key: Key('brand_order_card_${_items[i].id}'),
            order: _items[i],
            onTap: () => _open(_items[i]),
          ),
        ],
        if (_pagination.hasMore) ...[
          const SizedBox(height: 16),
          AppButton(
            label: 'Load more orders',
            variant: AppButtonVariant.outline,
            loading: _loadingMore,
            onPressed: () => _load(reset: false),
          ),
        ],
      ],
    );
  }

  String get _emptyTitle => switch (_filters[_filterIndex].status) {
    null => 'No orders yet',
    'PENDING' => 'No new orders',
    'CONFIRMED' => 'No confirmed orders',
    'PROCESSING' => 'Nothing being prepared',
    'READY_FOR_SHIPMENT' => 'Nothing ready to ship',
    'REJECTED' => 'No rejected orders',
    _ => 'Nothing here',
  };

  String get _emptyMessage => switch (_filters[_filterIndex].status) {
    null => 'When a customer orders from your shop, the order appears here.',
    'PENDING' => 'Every new order has been answered.',
    'CONFIRMED' => 'Confirm a new order and it moves here.',
    'PROCESSING' => 'Start preparing a confirmed order and it stays here.',
    'READY_FOR_SHIPMENT' =>
      'Orders you finish packing wait here for the delivery team.',
    'REJECTED' => 'Orders you reject are kept here with their history.',
    _ => 'Try another filter.',
  };
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Orders',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not shop orders.',
          ),
          SizedBox(height: 20),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: EmptyPanel(
              icon: Icons.storefront_outlined,
              title: 'This is a shop screen',
              message:
                  'Customer orders belong to shop accounts. Service jobs are '
                  'under Bookings.',
            ),
          ),
        ],
      ),
    );
  }
}
