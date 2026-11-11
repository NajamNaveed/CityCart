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

class _ReturnFilter {
  const _ReturnFilter(this.label, this.key, this.status);

  final String label;
  final String key;
  final String? status;
}

const _filters = [
  _ReturnFilter('All', 'all', null),
  _ReturnFilter('On the way back', 'transit', 'IN_TRANSIT'),
  _ReturnFilter('Received', 'received', 'RECEIVED'),
];

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your returns. Check the connection and try again.';
}

/// The returned-goods inbox: what came back, what it is worth, and what still
/// needs receiving.
class BrandReturnsScreen extends ConsumerStatefulWidget {
  const BrandReturnsScreen({super.key, this.initialStatus});

  final String? initialStatus;

  @override
  ConsumerState<BrandReturnsScreen> createState() => _BrandReturnsScreenState();
}

class _BrandReturnsScreenState extends ConsumerState<BrandReturnsScreen> {
  late int _filterIndex = _indexFor(widget.initialStatus);
  var _items = const <BrandReturn>[];
  var _pagination = const Pagination();
  BrandReturnSummary? _summary;
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
      final repository = ref.read(businessRepositoryProvider);
      final page = await repository.brandReturns(
        status: _filters[_filterIndex].status,
        page: reset ? 1 : _pagination.page + 1,
      );
      BrandReturnSummary? summary = _summary;
      if (reset) {
        try {
          summary = await repository.brandReturnSummary();
        } catch (_) {
          summary = null;
        }
      }
      if (!mounted || token != _request) return;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _pagination = page.pagination;
        _summary = summary;
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

  Future<void> _open(BrandReturn entry) async {
    await context.push('/brand-returns/${entry.id}', extra: entry);
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Returns')),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'Returned goods',
              subtitle:
                  'Items customers refuse at the door come back here. Receive '
                  'them and choose what goes back into stock.',
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 42,
              child: ListView.separated(
                key: const Key('return_filters'),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _filters[index];
                  return _FilterPill(
                    key: Key('return_filter_${filter.key}'),
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
    if (_loading) return const LoadingView(label: 'Loading returns');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: () => _load());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_summary != null) ...[
          _SummaryPanel(summary: _summary!),
          const SizedBox(height: 18),
        ],
        if (_items.isEmpty)
          EmptyPanel(
            icon: Icons.assignment_return_outlined,
            title: _emptyTitle,
            message: _emptyMessage,
            action: _filterIndex == 0
                ? null
                : AppButton(
                    label: 'Show all returns',
                    variant: AppButtonVariant.outline,
                    onPressed: () => _selectFilter(0),
                  ),
          )
        else ...[
          for (var i = 0; i < _items.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            _ReturnCard(
              key: Key('return_card_${_items[i].id}'),
              entry: _items[i],
              onTap: () => _open(_items[i]),
            ),
          ],
          if (_pagination.hasMore) ...[
            const SizedBox(height: 16),
            AppButton(
              label: 'Load more returns',
              variant: AppButtonVariant.outline,
              loading: _loadingMore,
              onPressed: () => _load(reset: false),
            ),
          ],
        ],
      ],
    );
  }

  String get _emptyTitle => switch (_filters[_filterIndex].status) {
    null => 'No returns yet',
    'IN_TRANSIT' => 'Nothing on the way back',
    'RECEIVED' => 'Nothing received yet',
    _ => 'Nothing here',
  };

  String get _emptyMessage => switch (_filters[_filterIndex].status) {
    null =>
      'If a customer refuses items at the door, the goods appear here for you '
          'to receive.',
    'IN_TRANSIT' =>
      'When a customer refuses items, the parcel on its way back appears here.',
    'RECEIVED' => 'Returns you receive are kept here with their history.',
    _ => 'Try another filter.',
  };
}

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({required this.summary});

  final BrandReturnSummary summary;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                key: const Key('returns_in_transit'),
                value: '${summary.inTransitCount}',
                label: summary.inTransitCount == 1
                    ? 'parcel coming back'
                    : 'parcels coming back',
                tone: summary.inTransitCount > 0
                    ? AppTone.amber
                    : AppTone.green,
                icon: Icons.keyboard_return_rounded,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                key: const Key('returns_received'),
                value: '${summary.receivedCount}',
                label: summary.receivedCount == 1
                    ? 'return received'
                    : 'returns received',
                tone: AppTone.green,
                icon: Icons.inventory_2_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SurfacePanel(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: [
              InfoRow(
                icon: Icons.receipt_long_outlined,
                label: 'Value of returned goods',
                value: money(summary.returnedSubtotalPaisa),
              ),
              const Divider(indent: 66),
              InfoRow(
                icon: Icons.undo_rounded,
                label: 'Refunded to customers',
                value: money(summary.refundAmountPaisa),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({super.key, required this.entry, required this.onTap});

  final BrandReturn entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final units = entry.totalUnits == 1
        ? '1 item returned'
        : '${entry.totalUnits} items returned';
    final reasons = entry.lines
        .map((line) => returnReasonLabel(line.reason))
        .toSet()
        .join(' · ');
    final orderNumber = entry.orderNumber.isEmpty
        ? 'Door return'
        : entry.orderNumber;

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
                label: returnStatusLabel(entry.status),
                tone: returnStatusTone(entry.status),
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      units,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleSmall,
                    ),
                    if (reasons.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        reasons,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                money(entry.returnedSubtotalPaisa),
                maxLines: 1,
                style: text.titleMedium?.copyWith(fontSize: 17),
              ),
            ],
          ),
          if (entry.createdAt != null) ...[
            const SizedBox(height: 8),
            Text(
              dateTimeLabel(entry.createdAt!),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.labelSmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.forest : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        side: BorderSide(color: selected ? AppColors.forest : AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              height: 1.2,
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.white : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Returns')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Returns',
            title: 'For shop owners',
            subtitle: 'Service accounts manage bookings, not shop returns.',
          ),
          SizedBox(height: 20),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: EmptyPanel(
              icon: Icons.storefront_outlined,
              title: 'This is a shop screen',
              message:
                  'Returned goods belong to shop accounts. Service jobs are '
                  'under Bookings.',
            ),
          ),
        ],
      ),
    );
  }
}
