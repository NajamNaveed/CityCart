import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/widgets.dart';
import 'data/models.dart';
import 'features/account/account_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/splash_screen.dart';
import 'features/availability/availability_screen.dart';
import 'features/bookings/booking_detail_screen.dart';
import 'features/bookings/bookings_screen.dart';
import 'features/brand_branches/brand_branches_screen.dart';
import 'features/brand_deliveries/brand_deliveries_screen.dart';
import 'features/brand_deliveries/brand_delivery_detail_screen.dart';
import 'features/brand_insights/brand_insights_screen.dart';
import 'features/brand_orders/brand_order_detail_screen.dart';
import 'features/brand_orders/brand_orders_screen.dart';
import 'features/brand_products/add_product_screen.dart';
import 'features/brand_products/brand_product_detail_screen.dart';
import 'features/brand_products/brand_products_screen.dart';
import 'features/brand_returns/brand_return_detail_screen.dart';
import 'features/brand_returns/brand_returns_screen.dart';
import 'features/brand_riders/brand_riders_screen.dart';
import 'features/brand_settings/brand_settings_screen.dart';
import 'features/brand_team/brand_team_screen.dart';
import 'features/home/home_screen.dart';
import 'features/messages/chat_thread_screen.dart';
import 'features/messages/messages_screen.dart';
import 'features/offerings/offerings_screen.dart';
import 'features/profile/provider_profile_screen.dart';
import 'features/reviews/reviews_screen.dart';
import 'features/shell/business_shell.dart';
import 'providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);

  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) => businessRedirect(
      status: session.status,
      location: state.matchedLocation,
      role: session.user?.role,
    ),
    errorBuilder: (context, state) => const NotFoundScreen(),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            BusinessShell(navigationShell: navigationShell),
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
                path: '/bookings',
                builder: (context, state) => const BookingsScreen(),
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
        path: '/bookings/:id',
        builder: (context, state) => BookingDetailScreen(
          bookingId: state.pathParameters['id']!,
          initial: state.extra is BusinessBooking
              ? state.extra as BusinessBooking
              : null,
        ),
      ),
      GoRoute(
        path: '/brand-orders',
        builder: (context, state) => BrandOrdersScreen(
          initialStatus: state.uri.queryParameters['status'],
        ),
      ),
      GoRoute(
        path: '/brand-orders/:id',
        builder: (context, state) => BrandOrderDetailScreen(
          orderId: state.pathParameters['id']!,
          initial: state.extra is BrandOrder ? state.extra as BrandOrder : null,
        ),
      ),
      GoRoute(
        path: '/brand-products',
        builder: (context, state) => BrandProductsScreen(
          initialStatus: state.uri.queryParameters['status'],
        ),
      ),
      GoRoute(
        path: '/brand-products/add',
        builder: (context, state) => const AddProductScreen(),
      ),
      GoRoute(
        path: '/brand-products/:id',
        builder: (context, state) => BrandProductDetailScreen(
          productId: state.pathParameters['id']!,
          initial: state.extra is BrandProduct
              ? state.extra as BrandProduct
              : null,
        ),
      ),
      GoRoute(
        path: '/brand-deliveries',
        builder: (context, state) => BrandDeliveriesScreen(
          initialStatus: state.uri.queryParameters['status'],
        ),
      ),
      GoRoute(
        path: '/brand-deliveries/:id',
        builder: (context, state) => BrandDeliveryDetailScreen(
          deliveryId: state.pathParameters['id']!,
          initial: state.extra is BrandDelivery
              ? state.extra as BrandDelivery
              : null,
        ),
      ),
      GoRoute(
        path: '/brand-returns',
        builder: (context, state) => BrandReturnsScreen(
          initialStatus: state.uri.queryParameters['status'],
        ),
      ),
      GoRoute(
        path: '/brand-returns/:id',
        builder: (context, state) => BrandReturnDetailScreen(
          returnId: state.pathParameters['id']!,
          initial: state.extra is BrandReturn
              ? state.extra as BrandReturn
              : null,
        ),
      ),
      GoRoute(
        path: '/brand-riders',
        builder: (context, state) => const BrandRidersScreen(),
      ),
      GoRoute(
        path: '/brand-team',
        builder: (context, state) => const BrandTeamScreen(),
      ),
      GoRoute(
        path: '/brand-branches',
        builder: (context, state) => const BrandBranchesScreen(),
      ),
      GoRoute(
        path: '/brand-insights',
        builder: (context, state) => const BrandInsightsScreen(),
      ),
      GoRoute(
        path: '/brand-settings',
        builder: (context, state) => const BrandSettingsScreen(),
      ),
      GoRoute(
        path: '/offerings',
        builder: (context, state) => const OfferingsScreen(),
      ),
      GoRoute(
        path: '/availability',
        builder: (context, state) => const AvailabilityScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProviderProfileScreen(),
      ),
      GoRoute(
        path: '/messages',
        builder: (context, state) => const MessagesScreen(),
      ),
      GoRoute(
        path: '/messages/job/:id',
        builder: (context, state) => ProviderChatScreen(
          kind: ProviderChatKind.job,
          routeId: state.pathParameters['id']!,
          initial: state.extra is ProviderChatThread
              ? state.extra as ProviderChatThread
              : null,
        ),
      ),
      GoRoute(
        path: '/messages/question/:id',
        builder: (context, state) => ProviderChatScreen(
          kind: ProviderChatKind.question,
          routeId: state.pathParameters['id']!,
          initial: state.extra is ProviderChatThread
              ? state.extra as ProviderChatThread
              : null,
        ),
      ),
      GoRoute(
        path: '/reviews',
        builder: (context, state) => const ReviewsScreen(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// Areas only a service provider has. The server refuses these endpoints for
/// a brand session anyway; this keeps the app from opening a dead screen.
const _providerOnlyPaths = <String>[
  '/bookings',
  '/offerings',
  '/availability',
  '/profile',
  '/messages',
  '/reviews',
];

bool _isProviderOnly(String location) {
  return _providerOnlyPaths.any(
    (path) => location == path || location.startsWith('$path/'),
  );
}

/// Areas only a shop owner has.
const _brandOnlyPaths = <String>[
  '/brand-orders',
  '/brand-products',
  '/brand-deliveries',
  '/brand-returns',
  '/brand-riders',
  '/brand-team',
  '/brand-branches',
  '/brand-insights',
  '/brand-settings',
];

bool _isBrandOnly(String location) {
  return _brandOnlyPaths.any(
    (path) => location == path || location.startsWith('$path/'),
  );
}

/// The one place that decides which screen may open. The server still enforces
/// every rule; this only keeps the app from showing a dead end.
String? businessRedirect({
  required SessionStatus status,
  required String location,
  String? role,
}) {
  final atLogin = location == '/login';
  final atSplash = location == '/splash';

  switch (status) {
    case SessionStatus.unknown:
      return atSplash ? null : '/splash';
    case SessionStatus.signedOut:
      return atLogin ? null : '/login';
    case SessionStatus.signedIn:
      if (atLogin || atSplash) return '/home';
      if (role == brandRole && _isProviderOnly(location)) return '/home';
      if (role == providerRole && _isBrandOnly(location)) return '/home';
      return null;
  }
}

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: EmptyPanel(
                icon: Icons.explore_off_outlined,
                title: 'This page moved',
                message:
                    'The link you opened no longer exists in CityCart '
                    'Business.',
                action: AppButton(
                  label: 'Back to Home',
                  icon: Icons.home_rounded,
                  expand: false,
                  onPressed: () => context.go('/home'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
