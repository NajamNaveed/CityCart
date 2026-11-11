import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/permissions.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

class HomeSnapshot {
  int? ordersTotal;
  int? deliveriesTotal;
  ReturnsSummary? returns;
  int? proofsWaiting;
  double? cashHeld;
  int? cashCollectors;
  bool loading = true;
  String? error;

  bool get hasAnything =>
      ordersTotal != null ||
      deliveriesTotal != null ||
      returns != null ||
      proofsWaiting != null ||
      cashHeld != null;
}

class HomeController extends ChangeNotifier {
  HomeController(this._repository, this._access);

  final StaffRepository _repository;
  final StaffAccess _access;
  final HomeSnapshot snapshot = HomeSnapshot();

  Future<void> load() async {
    snapshot.loading = true;
    snapshot.error = null;
    notifyListeners();

    var failures = 0;
    String? firstError;

    Future<void> run(Future<void> Function() task) async {
      try {
        await task();
      } catch (error) {
        failures++;
        firstError ??= error is ApiException
            ? error.message
            : 'Some figures could not be loaded.';
      }
    }

    await Future.wait([
      if (_access.orders)
        run(() async {
          final page = await _repository.brandOrders();
          snapshot.ordersTotal = page.pagination.total;
        }),
      if (_access.deliveries)
        run(() async {
          final page = await _repository.deliveries();
          snapshot.deliveriesTotal = page.pagination.total;
        }),
      if (_access.returns)
        run(() async {
          snapshot.returns = await _repository.returnsSummary();
        }),
      if (_access.money) ...[
        run(() async {
          final page = await _repository.proofs();
          snapshot.proofsWaiting = page.pagination.total;
        }),
        run(() async {
          final collectors = await _repository.outstandingCash();
          snapshot.cashCollectors = collectors.length;
          snapshot.cashHeld = collectors.fold<double>(
            0,
            (sum, collector) => sum + collector.total,
          );
        }),
      ],
    ]);

    snapshot.loading = false;
    snapshot.error = failures > 0 ? firstError : null;
    notifyListeners();
  }
}

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  HomeController? _controller;
  StaffAccess? _access;

  @override
  void initState() {
    super.initState();
    final access = ref.read(accessProvider);
    _access = access;
    _controller = HomeController(ref.read(staffRepositoryProvider), access);
    _controller!.addListener(_onChanged);
    _controller!.load();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _refresh() async {
    final access = ref.read(accessProvider);
    if (_access != access) {
      _controller?.removeListener(_onChanged);
      _controller?.dispose();
      _access = access;
      _controller = HomeController(ref.read(staffRepositoryProvider), access)
        ..addListener(_onChanged);
    }
    await _controller?.load();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final access = ref.watch(accessProvider);
    final user = session.user;
    final snapshot = _controller?.snapshot ?? HomeSnapshot();

    if (_access != access) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _refresh();
      });
    }

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.forest,
          backgroundColor: AppColors.surface,
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${greetingFor(DateTime.now())}, '
                          '${firstNameOf(user?.name)}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(fontSize: 25),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${friendlyRole(user?.role ?? '')} · '
                          '${formatShortDate(DateTime.now())}',
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
                    child: Avatar(name: user?.name ?? 'Team'),
                  ),
                ],
              ),
              if (session.profileIncomplete || session.isOffline) ...[
                const SizedBox(height: 14),
                NoticeCard(
                  title: session.isOffline
                      ? 'Working offline'
                      : 'Access not loaded',
                  message: session.isOffline
                      ? 'These figures may be out of date. Tap retry when you have signal.'
                      : 'Your permissions could not be loaded, so some areas may be hidden.',
                  icon: Icons.cloud_off_outlined,
                  tone: StatusTone.amber,
                  action: AppButton(
                    label: 'Retry',
                    variant: AppButtonVariant.outline,
                    expand: false,
                    height: 44,
                    onPressed: () async {
                      try {
                        await ref.read(sessionProvider).refreshProfile();
                        await _refresh();
                      } on ApiException catch (error) {
                        if (!context.mounted) return;
                        showAppSnack(context, error.message, error: true);
                      }
                    },
                  ),
                ),
              ],
              const SizedBox(height: 18),
              if (snapshot.loading && !snapshot.hasAnything)
                const LoadingList(count: 3)
              else ...[
                if (snapshot.error != null) ...[
                  ErrorNotice(message: snapshot.error!, onRetry: _refresh),
                  const SizedBox(height: 14),
                ],
                _GlanceGrid(snapshot: snapshot, access: access),
                const SizedBox(height: 24),
                const SectionLabel('Needs attention'),
                const SizedBox(height: 10),
                _AttentionList(snapshot: snapshot, access: access),
                const SizedBox(height: 24),
                const SectionLabel('Go to'),
                const SizedBox(height: 10),
                _ShortcutList(access: access),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GlanceGrid extends StatelessWidget {
  const _GlanceGrid({required this.snapshot, required this.access});

  final HomeSnapshot snapshot;
  final StaffAccess access;

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[
      if (access.orders)
        MetricTile(
          label: 'ORDERS',
          value: snapshot.ordersTotal == null ? '—' : '${snapshot.ordersTotal}',
          caption: 'on record',
          icon: Icons.receipt_long_outlined,
          onTap: () => context.go('/orders'),
        ),
      if (access.deliveries)
        MetricTile(
          label: 'DELIVERIES',
          value: snapshot.deliveriesTotal == null
              ? '—'
              : '${snapshot.deliveriesTotal}',
          caption: 'on record',
          tone: StatusTone.info,
          icon: Icons.local_shipping_outlined,
          onTap: () => context.go('/deliveries'),
        ),
      if (access.returns)
        MetricTile(
          label: 'COMING BACK',
          value: snapshot.returns == null
              ? '—'
              : '${snapshot.returns!.inTransit.count}',
          caption: snapshot.returns == null
              ? 'returns'
              : formatMoney(snapshot.returns!.inTransit.returnedSubtotal),
          tone: StatusTone.amber,
          icon: Icons.keyboard_return_rounded,
          onTap: () => context.go('/returns'),
        ),
      if (access.money) ...[
        MetricTile(
          label: 'TO CHECK',
          value: snapshot.proofsWaiting == null
              ? '—'
              : '${snapshot.proofsWaiting}',
          caption: 'payments',
          tone: StatusTone.clay,
          icon: Icons.verified_outlined,
          onTap: () => context.go('/money'),
        ),
        MetricTile(
          label: 'CASH HELD',
          value: snapshot.cashHeld == null
              ? '—'
              : formatMoney(snapshot.cashHeld),
          caption: snapshot.cashCollectors == null
              ? 'with riders'
              : plural(snapshot.cashCollectors!, 'rider'),
          tone: StatusTone.sage,
          icon: Icons.payments_outlined,
          onTap: () => context.go('/money'),
        ),
      ],
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = (constraints.maxWidth - 10) / 2;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: tiles
              .map((tile) => SizedBox(width: width, child: tile))
              .toList(growable: false),
        );
      },
    );
  }
}

class _AttentionList extends StatelessWidget {
  const _AttentionList({required this.snapshot, required this.access});

  final HomeSnapshot snapshot;
  final StaffAccess access;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    if (access.returns && (snapshot.returns?.inTransit.count ?? 0) > 0) {
      rows.add(
        _AttentionRow(
          icon: Icons.inventory_2_outlined,
          title:
              '${plural(snapshot.returns!.inTransit.count, 'return')} coming back',
          detail: 'Check the goods and decide what goes back on the shelf.',
          tone: StatusTone.clay,
          onTap: () => context.go('/returns'),
        ),
      );
    }
    if (access.money && (snapshot.proofsWaiting ?? 0) > 0) {
      rows.add(
        _AttentionRow(
          icon: Icons.verified_outlined,
          title: '${plural(snapshot.proofsWaiting!, 'payment')} to check',
          detail: 'Riders sent proof of a bank or wallet transfer.',
          tone: StatusTone.amber,
          onTap: () => context.go('/money'),
        ),
      );
    }
    if (access.money && (snapshot.cashCollectors ?? 0) > 0) {
      rows.add(
        _AttentionRow(
          icon: Icons.payments_outlined,
          title: '${formatMoney(snapshot.cashHeld)} with riders',
          detail: 'Count the cash and settle it when it reaches the store.',
          tone: StatusTone.sage,
          onTap: () => context.go('/money'),
        ),
      );
    }
    if (rows.isEmpty) {
      rows.add(
        const _AttentionRow(
          icon: Icons.check_circle_outline_rounded,
          title: 'Nothing needs you right now',
          detail: 'New orders, returns and payment checks show up here.',
          tone: StatusTone.sage,
          onTap: null,
        ),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const SizedBox(height: 9),
          rows[i],
        ],
      ],
    );
  }
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({
    required this.icon,
    required this.title,
    required this.detail,
    required this.tone,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String detail;
  final StatusTone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      StatusTone.sage => (AppColors.sage, AppColors.sageInk),
      StatusTone.clay => (AppColors.claySoft, AppColors.clay),
      StatusTone.amber => (AppColors.amber, AppColors.amberInk),
      StatusTone.danger => (AppColors.dangerSoft, AppColors.danger),
      StatusTone.info => (AppColors.infoSoft, AppColors.info),
      _ => (AppColors.paperDeep, AppColors.muted),
    };
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon, size: 20, color: foreground),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (onTap != null)
            const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}

class _ShortcutList extends StatelessWidget {
  const _ShortcutList({required this.access});

  final StaffAccess access;

  @override
  Widget build(BuildContext context) {
    final items = <(IconData, String, String, String)>[
      if (access.orders)
        (Icons.receipt_long_outlined, 'Orders', 'Look up an order', '/orders'),
      if (access.deliveries)
        (
          Icons.local_shipping_outlined,
          'Deliveries',
          'Track jobs and assign riders',
          '/deliveries',
        ),
      if (access.returns)
        (
          Icons.keyboard_return_rounded,
          'Returns',
          'Take returned goods back in',
          '/returns',
        ),
      if (access.money)
        (
          Icons.payments_outlined,
          'Money',
          'Receipts, payment checks and cash',
          '/money',
        ),
    ];
    return SurfaceCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.line),
            ListTile(
              onTap: () => context.go(items[i].$4),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 15,
                vertical: 3,
              ),
              leading: Icon(items[i].$1, size: 21, color: AppColors.forest),
              title: Text(
                items[i].$2,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                items[i].$3,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              trailing: const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.muted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
