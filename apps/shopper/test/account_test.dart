import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/account/account_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeRepository extends ShopperRepository {
  _FakeRepository({this.unread = 0, this.notificationItems = const []})
    : super(ApiClient(SessionStore()));

  final int unread;
  final List<AppNotification> notificationItems;

  @override
  Future<NotificationPage> notifications({int page = 1, int limit = 20}) async {
    return NotificationPage(
      items: notificationItems,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: 1,
        total: notificationItems.length,
      ),
      unreadCount: unread,
    );
  }
}

class _SignedInSession extends SessionController {
  _SignedInSession(ShopperRepository repository)
    : super(repository, SessionStore(), ApiClient(SessionStore()));

  @override
  SessionStatus get status => SessionStatus.signedIn;

  @override
  AppUser get user =>
      const AppUser(id: 'u1', name: 'Ayesha Khan', email: 'ayesha@example.com');
}

AppNotification _update(String id) {
  return AppNotification(
    id: id,
    type: 'ORDER_CONFIRMED',
    title: 'Order confirmed',
    message: 'Your order is being packed.',
    createdAt: DateTime(2026, 11, 11, 10),
    data: const {'orderId': 'o1'},
  );
}

Widget _app({required Widget home, required List<Override> overrides}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: const TextScaler.linear(1.3)),
        child: child!,
      ),
      home: home,
    ),
  );
}

Widget _routedApp({
  required GoRouter router,
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: const TextScaler.linear(1.3)),
        child: child!,
      ),
    ),
  );
}

void _phoneView() {
  final view =
      TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
  view.physicalSize = const Size(320, 900);
  view.devicePixelRatio = 1;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));
  setUp(() {
    SharedPreferences.setMockInitialValues({
      'citycart.shopper.area.cityId': 'c1',
      'citycart.shopper.area.cityName': 'Faisalabad',
      'citycart.shopper.area.blockId': 'b1',
      'citycart.shopper.area.blockName': 'Gulberg',
    });
  });

  tearDown(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.resetPhysicalSize();
    view.resetDevicePixelRatio();
  });

  group('account at 320 wide and 1.3 text', () {
    testWidgets('shows the profile, area and a capped unread badge', (
      tester,
    ) async {
      _phoneView();
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        unread: 12,
        notificationItems: [_update('n1')],
      );

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            sessionProvider.overrideWithValue(_SignedInSession(repository)),
          ],
          home: const AccountScreen(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Ayesha'), findsOneWidget);
      expect(find.text('Ayesha Khan'), findsOneWidget);
      expect(find.text('ayesha@example.com'), findsWidgets);

      await tester.scrollUntilVisible(find.text('Delivery area'), 200);
      expect(find.text('Gulberg, Faisalabad'), findsOneWidget);
      expect(find.text('12 unread updates'), findsOneWidget);
      expect(find.text('9+'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Help & support'), 200);
      expect(find.text('Saved addresses'), findsOneWidget);
      expect(find.text('Help & support'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the notifications row opens the inbox', (tester) async {
      _phoneView();
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(unread: 1);
      final router = GoRouter(
        initialLocation: '/account',
        routes: [
          GoRoute(
            path: '/account',
            builder: (context, state) => const AccountScreen(),
          ),
          GoRoute(
            path: '/notifications',
            builder: (context, state) =>
                const Scaffold(body: Center(child: Text('Inbox opened'))),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _routedApp(
          router: router,
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            sessionProvider.overrideWithValue(_SignedInSession(repository)),
          ],
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.scrollUntilVisible(find.text('Notifications'), 200);
      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle();

      expect(find.text('Inbox opened'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
