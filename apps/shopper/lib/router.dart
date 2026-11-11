import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/format.dart';
import 'core/theme.dart';
import 'core/widgets.dart';
import 'features/account/account_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/cart/cart_controller.dart';
import 'features/cart/cart_screen.dart';
import 'features/chat/chat_thread_screen.dart';
import 'features/checkout/checkout_screen.dart';
import 'features/explore/explore_screen.dart';
import 'features/home/home_screen.dart';
import 'features/onboarding/area_screen.dart';
import 'features/product/product_screen.dart';
import 'features/storefront/storefront_screen.dart';
import 'providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);
  final area = ref.watch(areaProvider);

  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: Listenable.merge([session, area]),
    redirect: (context, state) => shopperRedirect(
      status: session.status,
      hasArea: area.area != null,
      location: state.matchedLocation,
    ),
    errorBuilder: (context, state) => const NotFoundScreen(),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/area', builder: (context, state) => const AreaScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
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
                path: '/explore',
                builder: (context, state) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/cart',
                builder: (context, state) => const CartScreen(),
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
        path: '/checkout',
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/store/:brandId',
        builder: (context, state) =>
            StorefrontScreen(brandId: state.pathParameters['brandId']!),
      ),
      GoRoute(
        path: '/product/:productId',
        builder: (context, state) =>
            ProductScreen(productId: state.pathParameters['productId']!),
      ),
      GoRoute(
        path: '/chat/:conversationId',
        builder: (context, state) => ChatThreadScreen(
          conversationId: state.pathParameters['conversationId']!,
          title: state.uri.queryParameters['name'],
        ),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// The one place that decides which screen a shopper may open. The server
/// still enforces every rule; this only keeps the app from showing a dead end.
String? shopperRedirect({
  required SessionStatus status,
  required bool hasArea,
  required String location,
}) {
  final atLogin = location == '/login';
  final atSplash = location == '/splash';
  final atArea = location == '/area';

  switch (status) {
    case SessionStatus.unknown:
      return atSplash ? null : '/splash';
    case SessionStatus.signedOut:
      return atLogin ? null : '/login';
    case SessionStatus.signedIn:
      if (atLogin || atSplash) return hasArea ? '/home' : '/area';
      if (!hasArea && !atArea) return '/area';
      return null;
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _ShopperMark(size: 64),
            SizedBox(height: 22),
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

class _ShopperMark extends StatelessWidget {
  const _ShopperMark({this.size = 46});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.forest,
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(
        Icons.shopping_bag_rounded,
        size: size * 0.52,
        color: AppColors.surface,
      ),
    );
  }
}

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const items = [
      _NavItemData(0, Icons.home_outlined, Icons.home_rounded, 'Home'),
      _NavItemData(1, Icons.search_rounded, Icons.search_rounded, 'Explore'),
      _NavItemData(
        2,
        Icons.shopping_bag_outlined,
        Icons.shopping_bag_rounded,
        'Basket',
      ),
      _NavItemData(
        3,
        Icons.person_outline_rounded,
        Icons.person_rounded,
        'You',
      ),
    ];
    final index = navigationShell.currentIndex;
    final cart = ref.watch(cartProvider);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: ListenableBuilder(
        listenable: cart,
        builder: (context, _) => Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
              child: Row(
                children: [
                  for (final item in items)
                    _NavItem(
                      item: item,
                      active: index == item.branch,
                      badge: item.branch == 2 ? cart.itemCount : 0,
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
    this.badge = 0,
  });

  final _NavItemData item;
  final bool active;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.forest : AppColors.muted;
    return Expanded(
      child: Semantics(
        selected: active,
        button: true,
        label: badge > 0
            ? '${item.label}, ${itemCountLabel(badge)}'
            : item.label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
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
                    if (badge > 0)
                      Positioned(
                        top: -5,
                        right: -4,
                        child: Container(
                          constraints: const BoxConstraints(
                            minWidth: 17,
                            minHeight: 17,
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.clay,
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(
                              color: AppColors.surface,
                              width: 1.4,
                            ),
                          ),
                          child: Text(
                            badge > 99 ? '99+' : '$badge',
                            maxLines: 1,
                            style: const TextStyle(
                              fontSize: 9.5,
                              height: 1.1,
                              fontWeight: FontWeight.w700,
                              color: AppColors.white,
                            ),
                          ),
                        ),
                      ),
                  ],
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

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: EmptyState(
          icon: Icons.explore_off_outlined,
          title: 'This page moved',
          message:
              'The link you opened no longer exists. Go back to the shops.',
          action: AppButton(
            label: 'Back to Home',
            icon: Icons.home_rounded,
            expand: false,
            onPressed: () => context.go('/home'),
          ),
        ),
      ),
    );
  }
}
