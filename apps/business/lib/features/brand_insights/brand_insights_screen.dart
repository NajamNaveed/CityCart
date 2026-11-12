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

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your numbers. Check the connection and try again.';
}

class _RangeOption {
  const _RangeOption(this.label, this.key);

  final String label;
  final String key;
}

const _ranges = [
  _RangeOption('Last 7 days', '7d'),
  _RangeOption('Last 30 days', '30d'),
  _RangeOption('This month', 'month'),
];

String _dateText(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// The shop's own numbers: money in, orders, customers and stock. Only this
/// shop's data is ever requested, and the server scopes it to the brand.
class BrandInsightsScreen extends ConsumerStatefulWidget {
  const BrandInsightsScreen({super.key});

  @override
  ConsumerState<BrandInsightsScreen> createState() =>
      _BrandInsightsScreenState();
}

class _BrandInsightsScreenState extends ConsumerState<BrandInsightsScreen> {
  var _rangeIndex = 1;
  BrandAnalytics? _analytics;
  var _loading = true;
  String? _error;
  var _request = 0;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  ({String from, String to}) _dates() {
    final now = DateTime.now().toUtc();
    final today = DateTime.utc(now.year, now.month, now.day);
    final from = switch (_ranges[_rangeIndex].key) {
      '7d' => today.subtract(const Duration(days: 6)),
      'month' => DateTime.utc(today.year, today.month),
      _ => today.subtract(const Duration(days: 29)),
    };
    return (from: _dateText(from), to: _dateText(today));
  }

  Future<void> _load() async {
    final token = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });

    final dates = _dates();
    try {
      final analytics = await ref
          .read(businessRepositoryProvider)
          .brandAnalytics(from: dates.from, to: dates.to);
      if (!mounted || token != _request) return;
      setState(() {
        _analytics = analytics;
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

  void _selectRange(int index) {
    if (index == _rangeIndex) return;
    setState(() => _rangeIndex = index);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user != null && !user.isBrand) {
      return const _BrandOnly();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Insights')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Shop owner',
              title: 'How your shop is doing',
              subtitle:
                  'Money, orders and stock for the dates you choose. Only '
                  'your own shop is included.',
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 42,
              child: ListView.separated(
                key: const Key('insight_ranges'),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.page,
                ),
                itemCount: _ranges.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final range = _ranges[index];
                  return FilterPill(
                    key: Key('insight_range_${range.key}'),
                    label: range.label,
                    selected: index == _rangeIndex,
                    onTap: () => _selectRange(index),
                  );
                },
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
    if (_loading) return const LoadingView(label: 'Adding up your numbers');

    final error = _error;
    if (error != null) {
      return ErrorPanel(message: error, onRetry: _load);
    }

    final analytics = _analytics;
    if (analytics == null) {
      return const EmptyPanel(
        icon: Icons.insights_outlined,
        title: 'No numbers yet',
        message:
            'Once you take orders, this page will show how the shop is '
            'doing.',
      );
    }

    final summary = analytics.summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _periodLabel(analytics),
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: MetricTile(
                key: const Key('insight_revenue'),
                value: compactMoney(summary.revenuePaisa),
                label: 'earned from delivered orders',
                tone: AppTone.green,
                icon: Icons.payments_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                key: const Key('insight_orders'),
                value: '${summary.orders}',
                label: summary.orders == 1 ? 'order placed' : 'orders placed',
                tone: AppTone.blue,
                icon: Icons.receipt_long_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: MetricTile(
                value: compactMoney(summary.averageOrderValuePaisa),
                label: 'average order',
                tone: AppTone.neutral,
                icon: Icons.scale_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                value: '${summary.customers}',
                label: summary.repeatCustomers == 1
                    ? 'customers, 1 came back'
                    : 'customers, ${summary.repeatCustomers} came back',
                tone: AppTone.green,
                icon: Icons.people_outline_rounded,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: MetricTile(
                value: '${summary.productsSold}',
                label: 'items sold',
                tone: AppTone.blue,
                icon: Icons.shopping_bag_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                value: '${summary.pendingOrders}',
                label: summary.pendingOrders == 1
                    ? 'order still to confirm'
                    : 'orders still to confirm',
                tone: summary.pendingOrders > 0 ? AppTone.amber : AppTone.green,
                icon: Icons.pending_actions_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        const SectionTitle('Sales by day'),
        SurfacePanel(
          child: analytics.salesTrend.isEmpty
              ? Text(
                  'No delivered orders in these dates yet.',
                  style: Theme.of(context).textTheme.bodySmall,
                )
              : _SalesBars(points: analytics.salesTrend),
        ),
        if (analytics.salesTrend.isNotEmpty) ...[
          const SizedBox(height: 10),
          _BestDay(points: analytics.salesTrend),
        ],
        if (analytics.orderStatuses.isNotEmpty) ...[
          const SizedBox(height: 22),
          const SectionTitle('Where orders are'),
          SurfacePanel(
            child: Column(
              children: [
                for (var i = 0; i < analytics.orderStatuses.length; i++) ...[
                  if (i > 0) const Divider(height: 18),
                  _CountRow(
                    label: brandOrderStatusLabel(
                      analytics.orderStatuses[i].status,
                    ),
                    count: analytics.orderStatuses[i].count,
                  ),
                ],
              ],
            ),
          ),
        ],
        if (analytics.deliveryStatuses.isNotEmpty) ...[
          const SizedBox(height: 22),
          const SectionTitle('Where deliveries are'),
          SurfacePanel(
            child: Column(
              children: [
                for (var i = 0; i < analytics.deliveryStatuses.length; i++) ...[
                  if (i > 0) const Divider(height: 18),
                  _CountRow(
                    label: brandDeliveryStatusLabel(
                      analytics.deliveryStatuses[i].status,
                    ),
                    count: analytics.deliveryStatuses[i].count,
                  ),
                ],
              ],
            ),
          ),
        ],
        if (analytics.topProducts.isNotEmpty) ...[
          const SizedBox(height: 22),
          const SectionTitle('Best sellers'),
          SurfacePanel(
            child: Column(
              children: [
                for (var i = 0; i < analytics.topProducts.length; i++) ...[
                  if (i > 0) const Divider(height: 18),
                  _ProductRow(product: analytics.topProducts[i]),
                ],
              ],
            ),
          ),
        ],
        if (analytics.inventoryAlerts.isNotEmpty ||
            summary.lowStockProducts > 0 ||
            summary.outOfStockProducts > 0) ...[
          const SizedBox(height: 22),
          const SectionTitle('Stock to watch'),
          SurfacePanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  summary.outOfStockProducts > 0
                      ? '${summary.outOfStockProducts} out of stock, '
                            '${summary.lowStockProducts} running low.'
                      : '${summary.lowStockProducts} products are running low.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (analytics.inventoryAlerts.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final alert in analytics.inventoryAlerts) ...[
                    const Divider(height: 18),
                    _AlertRow(
                      alert: alert,
                      onTap: alert.productId.isEmpty
                          ? null
                          : () => context.push(
                              '/brand-products/${alert.productId}',
                            ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }

  String _periodLabel(BrandAnalytics analytics) {
    final from = DateTime.tryParse(analytics.from);
    final to = DateTime.tryParse(analytics.to);
    if (from == null || to == null) return 'Your chosen dates';
    return '${shortDate(from)} to ${shortDate(to)}';
  }
}


class _SalesBars extends StatelessWidget {
  const _SalesBars({required this.points});

  final List<SalesPoint> points;

  @override
  Widget build(BuildContext context) {
    final highest = points.fold<int>(
      0,
      (best, point) => point.revenuePaisa > best ? point.revenuePaisa : best,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 112,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final point in points)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Container(
                      alignment: Alignment.bottomCenter,
                      child: FractionallySizedBox(
                        heightFactor: highest == 0
                            ? 0
                            : (point.revenuePaisa / highest).clamp(0.06, 1.0),
                        widthFactor: 0.66,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: AppColors.forest,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(4),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                'Each bar is one day with paid orders',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Top ${money(highest)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: AppColors.forest,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _BestDay extends StatelessWidget {
  const _BestDay({required this.points});

  final List<SalesPoint> points;

  @override
  Widget build(BuildContext context) {
    final best = points.reduce(
      (a, b) => a.revenuePaisa >= b.revenuePaisa ? a : b,
    );
    final quiet = points.reduce(
      (a, b) => a.revenuePaisa <= b.revenuePaisa ? a : b,
    );
    final bestDate = DateTime.tryParse(best.date);
    final quietDate = DateTime.tryParse(quiet.date);
    return Row(
      children: [
        Expanded(
          child: _SmallNote(
            title: 'Best day',
            detail: bestDate == null
                ? money(best.revenuePaisa)
                : '${shortDate(bestDate)} · ${money(best.revenuePaisa)}',
            tone: AppTone.green,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _SmallNote(
            title: 'Quietest day',
            detail: quietDate == null
                ? money(quiet.revenuePaisa)
                : '${shortDate(quietDate)} · ${money(quiet.revenuePaisa)}',
            tone: AppTone.neutral,
          ),
        ),
      ],
    );
  }
}

class _SmallNote extends StatelessWidget {
  const _SmallNote({
    required this.title,
    required this.detail,
    required this.tone,
  });

  final String title;
  final String detail;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tint = tone == AppTone.green ? AppColors.mint : AppColors.paper;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tint,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.inkSoft,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            detail,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleSmall,
          ),
        ],
      ),
    );
  }
}

class _CountRow extends StatelessWidget {
  const _CountRow({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          '$count',
          key: Key('insight_count_$label'),
          style: Theme.of(context).textTheme.titleSmall
              ?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({required this.product});

  final TopProduct product;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          product.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 3),
        Text(
          '${product.unitsSold} sold · ${money(product.revenuePaisa)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.alert, this.onTap});

  final InventoryAlert alert;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final out = alert.isOutOfStock;
    final content = Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  alert.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              const SizedBox(width: 8),
              StatusTag(
                label: out ? 'Out of stock' : 'Running low',
                tone: out ? AppTone.red : AppTone.amber,
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            out
                ? 'None left to sell'
                : '${alert.available} left, warns at ${alert.threshold}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
    if (onTap == null) return content;
    return InkWell(onTap: onTap, child: content);
  }
}

class _BrandOnly extends StatelessWidget {
  const _BrandOnly();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Insights')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: const [
          PageHeader(
            eyebrow: 'Insights',
            title: 'For shop owners',
            subtitle: 'Service accounts track bookings, not shop sales.',
          ),
        ],
      ),
    );
  }
}
