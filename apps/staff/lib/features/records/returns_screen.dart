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
import 'paged_controller.dart';

const _returnFilters = <(String?, String)>[
  (null, 'All'),
  ('IN_TRANSIT', 'Coming back'),
  ('RECEIVED', 'Received'),
];

class ReturnsScreen extends ConsumerStatefulWidget {
  const ReturnsScreen({super.key});

  @override
  ConsumerState<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends ConsumerState<ReturnsScreen> {
  PagedController<ReturnRecord>? _controller;
  String? _status;
  ReturnsSummary? _summary;
  String? _summaryError;

  @override
  void initState() {
    super.initState();
    _bind();
    _loadSummary();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    super.dispose();
  }

  void _bind() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    final repository = ref.read(staffRepositoryProvider);
    _controller = PagedController(
      (page) => repository.returns(status: _status, page: page),
    )..addListener(_onChanged);
    _controller!.load();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadSummary() async {
    try {
      final summary = await ref.read(staffRepositoryProvider).returnsSummary();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _summaryError = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _summaryError = error.message);
    }
  }

  void _filter(String? status) {
    if (_status == status) return;
    setState(() => _status = status);
    _bind();
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      if (_controller != null) _controller!.refresh(),
      _loadSummary(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final items = controller?.items ?? const <ReturnRecord>[];
    final user = ref.watch(sessionProvider).user;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.forest,
          backgroundColor: AppColors.surface,
          onRefresh: _refreshAll,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(
                child: PageHeader(
                  eyebrow: 'Records',
                  title: 'Returns',
                  subtitle: 'Goods coming back, and what to do with them.',
                  trailing: GestureDetector(
                    onTap: () => context.push('/account'),
                    child: Avatar(name: user?.name ?? 'Team'),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: _SummaryCard(
                    summary: _summary,
                    error: _summaryError,
                    onRetry: _loadSummary,
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: FilterChips<String?>(
                    values: _returnFilters
                        .map((filter) => filter.$1)
                        .toList(growable: false),
                    labelOf: (status) => _returnFilters
                        .firstWhere((filter) => filter.$1 == status)
                        .$2,
                    value: _status,
                    onChanged: _filter,
                  ),
                ),
              ),
              if (controller?.error != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: ErrorNotice(
                      message: controller!.error!,
                      onRetry: controller.refresh,
                    ),
                  ),
                ),
              if (controller == null || (controller.loading && items.isEmpty))
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 20),
                    child: LoadingList(count: 3),
                  ),
                )
              else if (items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.keyboard_return_rounded,
                    title: 'No returns here',
                    message: _status == null
                        ? 'When a rider brings goods back, they show up here.'
                        : 'No return has this status right now.',
                  ),
                )
              else ...[
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final record = items[index];
                      return _ReturnCard(
                        record: record,
                        onTap: () async {
                          await context.push('/returns/${record.id}');
                          if (context.mounted) await _refreshAll();
                        },
                      );
                    },
                  ),
                ),
                if (controller.hasMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                      child: AppButton(
                        label: 'Load more returns',
                        variant: AppButtonVariant.outline,
                        height: 48,
                        loading: controller.loadingMore,
                        onPressed: controller.loadMore,
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 26)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.summary,
    required this.error,
    required this.onRetry,
  });

  final ReturnsSummary? summary;
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (summary == null) {
      if (error == null) return const SkeletonBox(height: 132, radius: 20);
      return ErrorNotice(message: error!, onRetry: onRetry);
    }
    final value = summary!;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: AppColors.forest,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.keyboard_return_rounded,
                size: 18,
                color: AppColors.sage,
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  'Returned goods',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.sage,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _SummaryStat(
                  label: 'Coming back',
                  count: value.inTransit.count,
                  value: value.inTransit.returnedSubtotal,
                ),
              ),
              Container(
                width: 1,
                height: 46,
                margin: const EdgeInsets.symmetric(horizontal: 14),
                color: AppColors.white.withValues(alpha: 0.16),
              ),
              Expanded(
                child: _SummaryStat(
                  label: 'Received',
                  count: value.received.count,
                  value: value.received.returnedSubtotal,
                ),
              ),
            ],
          ),
          const SizedBox(height: 13),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              Pill(
                text: '${formatMoney(value.returnedSubtotal)} returned',
                background: AppColors.white.withValues(alpha: 0.1),
                foreground: AppColors.surface,
              ),
              Pill(
                text: '${formatMoney(value.refundAmount)} refund value',
                background: AppColors.claySoft,
                foreground: AppColors.clay,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({
    required this.label,
    required this.count,
    required this.value,
  });

  final String label;
  final int count;
  final double value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: AppColors.sage.withValues(alpha: 0.85),
          ),
        ),
        const SizedBox(height: 3),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            '$count',
            maxLines: 1,
            style: const TextStyle(
              fontSize: 26,
              height: 1.05,
              fontWeight: FontWeight.w700,
              color: AppColors.white,
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatMoney(value),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.sage.withValues(alpha: 0.85),
          ),
        ),
      ],
    );
  }
}

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({required this.record, required this.onTap});

  final ReturnRecord record;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final reasons = <String>{};
    for (final line in record.lines) {
      if (line.reason != null) reasons.add(friendlyReturnReason(line.reason!));
    }
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 13, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  record.orderNumber ?? 'Return',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: StatusPill(
                  text: friendlyReturn(record.status),
                  tone: toneForReturn(record.status),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            '${unitsLabel(record.units)} · ${linesLabel(record.lines.length)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (reasons.isNotEmpty) ...[
            const SizedBox(height: 9),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                for (final reason in reasons.take(3))
                  Pill(
                    text: reason,
                    background: AppColors.amber,
                    foreground: AppColors.amberInk,
                  ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  record.createdAt == null
                      ? 'No date'
                      : 'Started ${formatDateTime(record.createdAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const SizedBox(width: 10),
              MoneyText(
                formatMoney(record.refundAmount, currency: record.currency),
                size: 14.5,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
