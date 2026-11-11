import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/permissions.dart';
import 'core/theme.dart';
import 'core/widgets.dart';
import 'data/models.dart';
import 'features/account/account_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'features/money/collector_screen.dart';
import 'features/money/money_screen.dart';
import 'features/money/proof_screen.dart';
import 'features/money/receipt_screen.dart';
import 'features/picker/pick_screen.dart';
import 'features/picker/queue_screen.dart';
import 'features/records/deliveries_screen.dart';
import 'features/records/delivery_detail_screen.dart';
import 'features/records/order_detail_screen.dart';
import 'features/records/orders_screen.dart';
import 'features/records/return_detail_screen.dart';
import 'features/records/returns_screen.dart';
import 'providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);
  final access = ref.watch(accessProvider);

  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) => staffRedirect(
      status: session.status,
      picker: session.user?.isPicker ?? false,
      access: access,
      location: state.matchedLocation,
    ),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell, access: access),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/orders',
                builder: (context, state) => const OrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/deliveries',
                builder: (context, state) => const DeliveriesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/returns',
                builder: (context, state) => const ReturnsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/money',
                builder: (context, state) => const MoneyScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/queue',
        builder: (context, state) => const PickerQueueScreen(),
      ),
      GoRoute(
        path: '/pick/:id',
        builder: (context, state) =>
            PickScreen(orderId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (context, state) =>
            OrderDetailScreen(orderId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/deliveries/:id',
        builder: (context, state) =>
            DeliveryDetailScreen(deliveryId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/returns/:id',
        builder: (context, state) =>
            ReturnDetailScreen(returnId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/receipts/order/:orderId',
        builder: (context, state) =>
            ReceiptScreen(orderId: state.pathParameters['orderId']!),
      ),
      GoRoute(
        path: '/receipts/:id',
        builder: (context, state) =>
            ReceiptScreen(receiptId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/verify/:paymentId',
        builder: (context, state) =>
            ProofScreen(paymentId: state.pathParameters['paymentId']!),
      ),
      GoRoute(
        path: '/cash/:collectorId',
        builder: (context, state) => CollectorScreen(
          collectorId: state.pathParameters['collectorId']!,
          initial: state.extra is CashCollector
              ? state.extra as CashCollector
              : null,
        ),
      ),
      GoRoute(
        path: '/account',
        builder: (context, state) => const AccountScreen(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// The one place that decides which doors a signed-in person can open.
/// Purely a convenience: every server route checks the same permission again.
String? staffRedirect({
  required SessionStatus status,
  required bool picker,
  required StaffAccess access,
  required String location,
}) {
  final atLogin = location == '/login';
  final atSplash = location == '/splash';

  switch (status) {
    case SessionStatus.unknown:
      return atSplash ? null : '/splash';
    case SessionStatus.signedOut:
      return atLogin ? null : '/login';
    case SessionStatus.signedIn:
      final home = picker ? '/queue' : '/home';
      if (atLogin || atSplash) return home;

      if (picker) {
        final allowed =
            location == '/queue' ||
            location == '/account' ||
            location.startsWith('/pick/');
        return allowed ? null : home;
      }

      if (location == '/queue' || location.startsWith('/pick/')) {
        return home;
      }
      if (_requires(location, '/orders') && !access.orders) return home;
      if (_requires(location, '/deliveries') && !access.deliveries) {
        return home;
      }
      if (_requires(location, '/returns') && !access.returns) return home;
      if (_requires(location, '/money') && !access.money) return home;
      if (_requires(location, '/receipts') && !access.money) return home;
      if (_requires(location, '/verify') && !access.money) return home;
      if (_requires(location, '/cash') && !access.money) return home;
      return null;
  }
}

bool _requires(String location, String base) =>
    location == base || location.startsWith('$base/');

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: 58),
            SizedBox(height: 20),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: AppColors.forest,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppShell extends StatelessWidget {
  const AppShell({
    super.key,
    required this.navigationShell,
    required this.access,
  });

  final StatefulNavigationShell navigationShell;
  final StaffAccess access;

  @override
  Widget build(BuildContext context) {
    final items = <_NavItemData>[
      const _NavItemData(0, Icons.home_outlined, Icons.home_rounded, 'Home'),
      if (access.orders)
        const _NavItemData(
          1,
          Icons.receipt_outlined,
          Icons.receipt_rounded,
          'Orders',
        ),
      if (access.deliveries)
        const _NavItemData(
          2,
          Icons.local_shipping_outlined,
          Icons.local_shipping_rounded,
          'Delivery',
        ),
      if (access.returns)
        const _NavItemData(
          3,
          Icons.keyboard_return,
          Icons.keyboard_return_rounded,
          'Returns',
        ),
      if (access.money)
        const _NavItemData(
          4,
          Icons.account_balance_wallet_outlined,
          Icons.account_balance_wallet_rounded,
          'Money',
        ),
    ];
    final index = navigationShell.currentIndex;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: items.length < 2
          ? null
          : Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.line)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
                  child: Row(
                    children: [
                      for (final item in items)
                        _NavItem(
                          item: item,
                          active: index == item.branch,
                          onTap: () => navigationShell.goBranch(
                            item.branch,
                            initialLocation: index == item.branch,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}

class _NavItemData {
  const _NavItemData(this.branch, this.icon, this.activeIcon, this.label);

  final int branch;
  final IconData icon;
  final IconData activeIcon;
  final String label;
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final _NavItemData item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.forest : AppColors.muted;
    return Expanded(
      child: Semantics(
        selected: active,
        button: true,
        label: item.label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 44,
                  height: 26,
                  decoration: BoxDecoration(
                    color: active ? AppColors.sage : Colors.transparent,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    active ? item.activeIcon : item.icon,
                    size: 20,
                    color: color,
                  ),
                ),
                const SizedBox(height: 3),
                SizedBox(
                  width: double.infinity,
                  height: 15,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      item.label,
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: color,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
