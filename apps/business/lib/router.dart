import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/widgets.dart';
import 'features/account/account_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/splash_screen.dart';
import 'features/home/home_screen.dart';
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
                path: '/account',
                builder: (context, state) => const AccountScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// The one place that decides which screen may open. The server still enforces
/// every rule; this only keeps the app from showing a dead end.
String? businessRedirect({
  required SessionStatus status,
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
      if (atLogin || atSplash) return '/home';
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
