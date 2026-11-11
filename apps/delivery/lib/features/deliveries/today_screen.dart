import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'deliveries_controller.dart';
import 'delivery_cards.dart';
import 'delivery_rules.dart';

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen>
    with WidgetsBindingObserver {
  late final DeliveriesController _controller;

  @override
  void initState() {
    super.initState();
    _controller = DeliveriesController(ref.read(deliveryRepositoryProvider));
    _controller.addListener(_onChanged);
    _controller.load();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_onChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _controller.refresh();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _open(RiderDelivery delivery) async {
    await context.push('/delivery/${delivery.id}');
    if (mounted) _controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final items = _controller.items;
    final actionable = items
        .where((item) => !isWaitingOnStore(item))
        .toList(growable: false);
    final waiting = items.where(isWaitingOnStore).toList(growable: false);
    final next = actionable.isNotEmpty ? actionable.first : null;
    final rest = actionable.length > 1
        ? actionable.sublist(1)
        : const <RiderDelivery>[];
    final totalToCollect = actionable.fold<double>(
      0,
      (sum, item) => sum + item.amountToCollect,
    );

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.forest,
          backgroundColor: AppColors.surface,
          onRefresh: _controller.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(child: _Header(name: user?.name ?? 'Rider')),
              if (_controller.error != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                    child: ErrorNotice(
                      message: _controller.error!,
                      onRetry: _controller.refresh,
                    ),
                  ),
                ),
              if (_controller.loading && items.isEmpty)
                const SliverToBoxAdapter(child: _TodaySkeleton())
              else if (items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.wb_sunny_outlined,
                    title: 'All caught up',
                    message: 'No jobs are waiting for you right now. Pull down to check again.',
                    action: AppButton(
                      label: 'See past deliveries',
                      variant: AppButtonVariant.outline,
                      expand: false,
                      height: 48,
                      onPressed: () => context.push('/history'),
                    ),
                  ),
                )
              else ...[
                if (next != null) ...[
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(20, 8, 20, 10),
                      child: SectionLabel('Next job'),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: CurrentJobCard(
                        delivery: next,
                        onTap: () => _open(next),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                      child: Text(
                        next.status == 'OUT_FOR_DELIVERY'
                            ? 'You are at the customer. Open the job to finish it.'
                            : statusHelper(next.status),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
                ],
                if (rest.isNotEmpty) ...[
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(20, 26, 20, 10),
                      child: SectionLabel('Also on your route'),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    sliver: SliverList.separated(
                      itemCount: rest.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 10),
                      itemBuilder: (context, index) => DeliveryRow(
                        delivery: rest[index],
                        onTap: () => _open(rest[index]),
                      ),
                    ),
                  ),
                ],
                if (waiting.isNotEmpty) ...[
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(20, 26, 20, 4),
                      child: SectionLabel('Waiting on the store'),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                      child: Text(
                        'You can open these, but there is nothing to do yet.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 8)),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    sliver: SliverList.separated(
                      itemCount: waiting.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 10),
                      itemBuilder: (context, index) => DeliveryRow(
                        delivery: waiting[index],
                        onTap: () => _open(waiting[index]),
                      ),
                    ),
                  ),
                ],
                if (_controller.hasMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                      child: AppButton(
                        label: 'Load more jobs',
                        variant: AppButtonVariant.outline,
                        height: 48,
                        loading: _controller.loadingMore,
                        onPressed: _controller.loadMore,
                      ),
                    ),
                  ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.today_rounded,
                          size: 15,
                          color: AppColors.muted,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          actionable.isEmpty
                              ? 'Nothing to collect right now'
                              : '${actionable.length} ${actionable.length == 1 ? 'job' : 'jobs'} · ${totalToCollect > 0 ? '${formatMoney(totalToCollect)} to collect' : 'no cash to collect'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 20)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final firstName = name.trim().split(RegExp(r'\s+')).first;
    final now = DateTime.now();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${greetingFor(now)}, $firstName',
                  style: Theme.of(context).textTheme.headlineMedium
                      ?.copyWith(fontSize: 25),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  formatShortDate(now),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => context.push('/history'),
            icon: const Icon(Icons.history_rounded, size: 21),
            tooltip: 'Past deliveries',
            style: IconButton.styleFrom(
              backgroundColor: AppColors.surface,
              side: const BorderSide(color: AppColors.line),
              minimumSize: const Size(44, 44),
            ),
          ),
          const SizedBox(width: 10),
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.sage,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.surface, width: 2),
            ),
            child: Text(
              initialsOf(name),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.sageInk,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TodaySkeleton extends StatelessWidget {
  const _TodaySkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Skeleton(height: 16, width: 90),
          SizedBox(height: 12),
          _Skeleton(height: 226, radius: 26),
          SizedBox(height: 22),
          _Skeleton(height: 14, width: 130),
          SizedBox(height: 12),
          _Skeleton(height: 76),
          SizedBox(height: 10),
          _Skeleton(height: 76),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton({required this.height, this.width, this.radius = 16});

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: AppColors.paperDeep,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
