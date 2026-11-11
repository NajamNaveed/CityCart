import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/features/auth/login_screen.dart';
import 'package:citycart_shopper/features/home/home_screen.dart';
import 'package:citycart_shopper/features/onboarding/area_screen.dart';
import 'package:citycart_shopper/features/storefront/storefront_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:citycart_shopper/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('router guard', () {
    test('waits on the splash screen until the session is known', () {
      expect(
        shopperRedirect(
          status: SessionStatus.unknown,
          hasArea: false,
          location: '/home',
        ),
        '/splash',
      );
    });

    test('signed-out shoppers only see sign in', () {
      expect(
        shopperRedirect(
          status: SessionStatus.signedOut,
          hasArea: false,
          location: '/home',
        ),
        '/login',
      );
      expect(
        shopperRedirect(
          status: SessionStatus.signedOut,
          hasArea: false,
          location: '/login',
        ),
        isNull,
      );
    });

    test('a signed-in shopper without an area is sent to choose one', () {
      expect(
        shopperRedirect(
          status: SessionStatus.signedIn,
          hasArea: false,
          location: '/home',
        ),
        '/area',
      );
      expect(
        shopperRedirect(
          status: SessionStatus.signedIn,
          hasArea: true,
          location: '/area',
        ),
        isNull,
      );
    });

    test('a signed-in shopper with an area lands on home', () {
      expect(
        shopperRedirect(
          status: SessionStatus.signedIn,
          hasArea: true,
          location: '/login',
        ),
        '/home',
      );
      expect(
        shopperRedirect(
          status: SessionStatus.signedIn,
          hasArea: true,
          location: '/home',
        ),
        isNull,
      );
    });
  });

  group('screens at 320 wide and 1.3 text', () {
    setUp(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(320, 640);
      view.devicePixelRatio = 1;
    });

    tearDown(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });

    testWidgets('sign in renders and validates without overflowing', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
          home: const LoginScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('CityCart'), findsOneWidget);
      expect(find.text('Sign in'), findsWidgets);

      await tester.tap(find.text('Create account'));
      await tester.pump();
      final submit = find.widgetWithText(FilledButton, 'Create account');
      await tester.ensureVisible(submit);
      await tester.pump();
      await tester.tap(submit);
      await tester.pump();

      expect(find.text('Enter your name.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('area screen lists the city and its blocks', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            citiesProvider.overrideWith(
              (ref) async => [const City(id: 'c1', name: 'Faisalabad')],
            ),
            blocksProvider('c1').overrideWith(
              (ref) async => [
                const Block(
                  id: 'b1',
                  cityId: 'c1',
                  name: 'Gulberg',
                  latitude: 31.5,
                  longitude: 73.1,
                ),
              ],
            ),
          ],
          home: const AreaScreen(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Where should we deliver?'), findsOneWidget);
      expect(find.text('All of Faisalabad'), findsOneWidget);
      expect(find.text('Gulberg'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('home shows nearby shops with real prices', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            homeFeedProvider.overrideWith(
              (ref) => const DiscoverResult(
                items: [
                  DiscoverBrand(
                    id: 'b1',
                    name: 'Loom & Co.',
                    slug: 'loom',
                    nearestKm: 1.2,
                    branches: [
                      DiscoverBranch(
                        id: 'br1',
                        name: 'Main',
                        blockName: 'Gulberg',
                      ),
                    ],
                    products: [
                      ProductSummary(
                        id: 'p1',
                        name: 'Linen Kurta',
                        price: 2450,
                        availability: 'IN_STOCK',
                      ),
                    ],
                  ),
                ],
                pagination: Pagination(total: 1, pages: 1),
              ),
            ),
          ],
          home: const HomeScreen(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Shops near you'), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -320));
      await tester.pump();
      expect(find.text('Loom & Co.'), findsOneWidget);
      expect(find.text('Linen Kurta'), findsOneWidget);
      expect(find.text('Rs 2,450'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('storefront shows the brand and its featured products', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            storefrontProvider('b1').overrideWith(
              (ref) async => const Storefront(
                brand: PublicBrand(
                  id: 'b1',
                  name: 'Loom & Co.',
                  slug: 'loom',
                  description: 'Everyday linen, made in Faisalabad.',
                ),
                categories: [],
                featuredProducts: [
                  Product(
                    id: 'p1',
                    brandId: 'b1',
                    name: 'Linen Kurta',
                    price: 4500,
                    availability: 'IN_STOCK',
                  ),
                ],
              ),
            ),
          ],
          home: const StorefrontScreen(brandId: 'b1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Loom & Co.'), findsWidgets);
      expect(find.text('New in store'), findsOneWidget);
      expect(find.text('Linen Kurta'), findsOneWidget);
      expect(find.text('Rs 4,500'), findsOneWidget);
      expect(find.text('In stock'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}

Widget _app({required Widget home, List<Override> overrides = const []}) {
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
