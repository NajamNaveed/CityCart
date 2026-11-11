import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

class PickerQueueController extends ChangeNotifier {
  PickerQueueController(this._repository);

  final StaffRepository _repository;

  List<PickQueueItem> items = const [];
  Pagination _pagination = const Pagination();
  bool loading = false;
  bool loadingMore = false;
  String? error;

  bool get hasMore => _pagination.hasMore;

  Future<void> load() async {
    if (loading) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final page = await _repository.pickerQueue();
      items = page.items;
      _pagination = page.pagination;
    } catch (error) {
      this.error = _message(error);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    error = null;
    try {
      final page = await _repository.pickerQueue();
      items = page.items;
      _pagination = page.pagination;
    } catch (error) {
      this.error = _message(error);
    }
    notifyListeners();
  }

  Future<void> loadMore() async {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    notifyListeners();
    try {
      final page = await _repository.pickerQueue(page: _pagination.page + 1);
      items = [...items, ...page.items];
      _pagination = page.pagination;
    } catch (error) {
      this.error = _message(error);
    } finally {
      loadingMore = false;
      notifyListeners();
    }
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : 'Something went wrong. Pull down to try again.';
}

class PickerQueueScreen extends ConsumerStatefulWidget {
  const PickerQueueScreen({super.key});

  @override
  ConsumerState<PickerQueueScreen> createState() => _PickerQueueScreenState();
}

class _PickerQueueScreenState extends ConsumerState<PickerQueueScreen>
    with WidgetsBindingObserver {
  late final PickerQueueController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PickerQueueController(ref.read(staffRepositoryProvider));
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

  Future<void> _open(PickQueueItem item) async {
    await context.push('/pick/${item.id}');
    if (mounted) _controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final items = _controller.items;
    final mine = items
        .where((item) => item.claimedByMe)
        .toList(growable: false);
    final ready = items
        .where((item) => !item.claimedByMe && !item.waitingForCustomer)
        .toList(growable: false);
    final waiting = items
        .where((item) => item.waitingForCustomer && !item.claimedByMe)
        .toList(growable: false);
    final units = items.fold<int>(0, (sum, item) => sum + item.units);

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
              SliverToBoxAdapter(
                child: _QueueHeader(
                  name: user?.name ?? 'Picker',
                  avatarName: user?.name ?? 'Picker',
                ),
              ),
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
                const SliverToBoxAdapter(child: _QueueSkeleton())
              else if (items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: 'No orders to pick yet',
                    message: 'New paid orders appear here. Pull down to check again.',
                    action: AppButton(
                      label: 'Check again',
                      variant: AppButtonVariant.outline,
                      expand: false,
                      height: 48,
                      onPressed: _controller.refresh,
                    ),
                  ),
                )
              else ...[
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 18),
                    child: _QueueSummary(
                      orders: items.length,
                      units: units,
                      mine: mine.length,
                    ),
                  ),
                ),
                if (mine.isNotEmpty) ...[
                  const SliverToBoxAdapter(
                    child: _SectionHeader(
                      title: 'Your orders',
                      caption: 'Orders you already started',
                    ),
                  ),
                  _QueueList(items: mine, onOpen: _open),
                ],
                if (ready.isNotEmpty) ...[
                  const SliverToBoxAdapter(
                    child: _SectionHeader(
                      title: 'Ready to pick',
                      caption: 'Pick one and it becomes yours',
                    ),
                  ),
                  _QueueList(items: ready, onOpen: _open),
                ],
                if (waiting.isNotEmpty) ...[
                  const SliverToBoxAdapter(
                    child: _SectionHeader(
                      title: 'Waiting on the customer',
                      caption: 'A change request needs their answer first',
                    ),
                  ),
                  _QueueList(items: waiting, onOpen: _open),
                ],
                if (_controller.hasMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                      child: AppButton(
                        label: 'Load more orders',
                        variant: AppButtonVariant.outline,
                        height: 48,
                        loading: _controller.loadingMore,
                        onPressed: _controller.loadMore,
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 28)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueHeader extends StatelessWidget {
  const _QueueHeader({required this.name, required this.avatarName});

  final String name;
  final String avatarName;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${greetingFor(now)}, ${firstNameOf(name)}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineMedium
                      ?.copyWith(fontSize: 25),
                ),
                const SizedBox(height: 4),
                Text(
                  'Picking · ${formatShortDate(now)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: () => context.push('/account'),
            child: Avatar(name: avatarName),
          ),
        ],
      ),
    );
  }
}

class _QueueSummary extends StatelessWidget {
  const _QueueSummary({
    required this.orders,
    required this.units,
    required this.mine,
  });

  final int orders;
  final int units;
  final int mine;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 17, 18, 17),
      decoration: BoxDecoration(
        color: AppColors.forest,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TO PICK',
                  style: TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.1,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFB9CBBE),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  plural(orders, 'order'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  unitsLabel(units),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFFCBD8CF),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: const Color(0xFF2C4B3E),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              mine == 0 ? 'None started' : plural(mine, 'started order'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: AppColors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.caption});

  final String title;
  final String caption;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(title),
          const SizedBox(height: 3),
          Text(caption, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _QueueList extends StatelessWidget {
  const _QueueList({required this.items, required this.onOpen});

  final List<PickQueueItem> items;
  final ValueChanged<PickQueueItem> onOpen;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      sliver: SliverList.separated(
        itemCount: items.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) => _PickOrderCard(
          item: items[index],
          onTap: () => onOpen(items[index]),
        ),
      ),
    );
  }
}

class _PickOrderCard extends StatelessWidget {
  const _PickOrderCard({required this.item, required this.onTap});

  final PickQueueItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final started = item.pickStartedAt;
    return SurfaceCard(
      onTap: onTap,
      borderColor: item.claimedByMe ? AppColors.sageInk : null,
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.orderNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: StatusPill(
                  text: item.claimedByMe
                      ? (started == null
                            ? 'Claimed'
                            : 'Started ${formatAge(started)}')
                      : friendlyOrder(item.orderStatus),
                  tone: item.claimedByMe
                      ? StatusTone.sage
                      : toneForOrder(item.orderStatus),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Row(
            children: [
              const Icon(
                Icons.person_outline_rounded,
                size: 15,
                color: AppColors.muted,
              ),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  'For ${item.customerFirstName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Pill(
                text: plural(item.itemCount, 'item'),
                background: AppColors.surfaceMuted,
                foreground: AppColors.inkSoft,
                icon: Icons.list_alt_rounded,
              ),
              Pill(
                text: unitsLabel(item.units),
                background: AppColors.surfaceMuted,
                foreground: AppColors.inkSoft,
                icon: Icons.inventory_2_outlined,
              ),
              if (item.waitingForCustomer)
                const Pill(
                  text: 'Waiting on customer',
                  background: AppColors.amber,
                  foreground: AppColors.amberInk,
                  icon: Icons.hourglass_empty_rounded,
                ),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              Expanded(
                child: Text(
                  item.claimedByMe
                      ? 'Tap to continue picking'
                      : 'Tap to start picking',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.sageInk,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QueueSkeleton extends StatelessWidget {
  const _QueueSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBox(height: 96, radius: 20),
          SizedBox(height: 22),
          SkeletonBox(height: 14, width: 120),
          SizedBox(height: 12),
          SkeletonBox(height: 104, radius: 18),
          SizedBox(height: 10),
          SkeletonBox(height: 104, radius: 18),
        ],
      ),
    );
  }
}
