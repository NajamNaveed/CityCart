import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'core/widgets.dart';
import 'features/account/account_screen.dart';
import 'features/account/location_sharing.dart';
import 'features/auth/login_screen.dart';
import 'features/cash/cash_screen.dart';
import 'features/deliveries/delivery_screen.dart';
import 'features/deliveries/door_flow_screen.dart';
import 'features/deliveries/history_screen.dart';
import 'features/deliveries/today_screen.dart';
import 'providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);

  return GoRouter(
    initialLocation: '/today',
    refreshListenable: session,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final atLogin = location == '/login';
      final atSplash = location == '/splash';

      switch (session.status) {
        case SessionStatus.unknown:
          return atSplash ? null : '/splash';
        case SessionStatus.signedOut:
          return atLogin ? null : '/login';
        case SessionStatus.signedIn:
          if (atLogin || atSplash) return '/today';
          return null;
      }
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/today',
                builder: (context, state) => const TodayScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/cash',
                builder: (context, state) => const CashScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                builder: (context, state) => const AccountScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/delivery/:id',
        builder: (context, state) =>
            DeliveryScreen(deliveryId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/delivery/:id/complete',
        builder: (context, state) =>
            DoorFlowScreen(deliveryId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/history',
        builder: (context, state) => const HistoryScreen(),
      ),
    ],
  );
});

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

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  @override
  void initState() {
    super.initState();
    // The preference is remembered; sharing only starts when the rider had it on
    // and this app is in the foreground.
    Future.microtask(() {
      if (mounted) ref.read(locationSharingProvider).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final index = widget.navigationShell.currentIndex;
    return Scaffold(
      body: widget.navigationShell,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
            child: Row(
              children: [
                _NavItem(
                  icon: Icons.route_rounded,
                  label: 'Today',
                  active: index == 0,
                  onTap: () => widget.navigationShell.goBranch(
                    0,
                    initialLocation: index == 0,
                  ),
                ),
                _NavItem(
                  icon: Icons.payments_outlined,
                  label: 'Cash',
                  active: index == 1,
                  onTap: () => widget.navigationShell.goBranch(
                    1,
                    initialLocation: index == 1,
                  ),
                ),
                _NavItem(
                  icon: Icons.person_outline_rounded,
                  label: 'Account',
                  active: index == 2,
                  onTap: () => widget.navigationShell.goBranch(
                    2,
                    initialLocation: index == 2,
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

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.forest : AppColors.muted;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 46,
                height: 28,
                decoration: BoxDecoration(
                  color: active ? AppColors.sage : Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 21, color: color),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
