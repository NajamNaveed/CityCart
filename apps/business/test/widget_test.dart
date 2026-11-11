import 'package:citycart_business/app.dart';
import 'package:citycart_business/core/format.dart';
import 'package:citycart_business/core/theme.dart';
import 'package:citycart_business/data/api_client.dart';
import 'package:citycart_business/data/models.dart';
import 'package:citycart_business/data/repository.dart';
import 'package:citycart_business/data/session_store.dart';
import 'package:citycart_business/features/account/account_screen.dart';
import 'package:citycart_business/features/auth/login_screen.dart';
import 'package:citycart_business/features/home/home_screen.dart';
import 'package:citycart_business/providers.dart';
import 'package:citycart_business/router.dart';
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
        businessRedirect(status: SessionStatus.unknown, location: '/home'),
        '/splash',
      );
      expect(
        businessRedirect(status: SessionStatus.unknown, location: '/splash'),
        isNull,
      );
    });

    test('signed-out owners only see sign in', () {
      expect(
        businessRedirect(status: SessionStatus.signedOut, location: '/home'),
        '/login',
      );
      expect(
        businessRedirect(status: SessionStatus.signedOut, location: '/login'),
        isNull,
      );
    });

    test('signed-in owners land on home', () {
      expect(
        businessRedirect(status: SessionStatus.signedIn, location: '/login'),
        '/home',
      );
      expect(
        businessRedirect(status: SessionStatus.signedIn, location: '/home'),
        isNull,
      );
    });
  });

  group('formatting', () {
    test('money is shown in rupees, without decimals when whole', () {
      expect(money(250000), 'Rs 2,500');
      expect(money(245050), 'Rs 2,450.50');
      expect(money(null), '—');
    });

    test('initials survive a single name and an empty one', () {
      expect(initialsOf('Ali Raza'), 'AR');
      expect(initialsOf('Sana'), 'S');
      expect(initialsOf('  '), '?');
      expect(firstNameOf('Ali Raza'), 'Ali');
      expect(firstNameOf(''), 'there');
    });

    test('greeting follows the local clock', () {
      expect(greetingFor(DateTime(2026, 1, 1, 8)), 'Good morning');
      expect(greetingFor(DateTime(2026, 1, 1, 14)), 'Good afternoon');
      expect(greetingFor(DateTime(2026, 1, 1, 20)), 'Good evening');
    });
  });

  group('models', () {
    test('a provider profile reads its category, area and price', () {
      final profile = ProviderProfile.fromJson({
        '_id': 'p1',
        'displayName': 'Rapid Repairs',
        'status': 'ACTIVE',
        'category': {'name': 'Appliance repair'},
        'city': {'name': 'Faisalabad'},
        'block': {'name': 'Gulberg'},
        'phone': '03001234567',
        'ratingAvg': 4.8,
        'ratingCount': 12,
        'completedBookings': 30,
        'startingAtPrice': 150000,
      });

      expect(profile.displayName, 'Rapid Repairs');
      expect(profile.areaLabel, 'Gulberg, Faisalabad');
      expect(profile.isActive, isTrue);
      expect(profile.startingAtPrice, 150000);
      expect(money(profile.startingAtPrice), 'Rs 1,500');
    });

    test('a profile without an area says so', () {
      final profile = ProviderProfile.fromJson({
        'displayName': 'New Business',
        'status': 'PENDING',
      });
      expect(profile.areaLabel, 'Not set');
      expect(profile.isPending, isTrue);
    });

    test('a brand summary reads the shop state', () {
      final brand = BrandSummary.fromJson({
        '_id': 'b1',
        'name': 'Loom & Co.',
        'slug': 'loom-co',
        'status': 'ACTIVE',
      });
      expect(brand.name, 'Loom & Co.');
      expect(brand.isActive, isTrue);
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

    testWidgets('sign in offers both doors and validates', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
          home: const LoginScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('CityCart Business'), findsOneWidget);
      expect(find.text('Shop owner'), findsOneWidget);
      expect(find.text('Service provider'), findsOneWidget);

      await tester.tap(find.byKey(const Key('door_service')));
      await tester.pump();
      expect(find.text('Service provider'), findsOneWidget);

      final submit = find.byKey(const Key('login_submit'));
      await tester.scrollUntilVisible(submit, 150);
      await tester.pump();
      await tester.tap(submit);
      await tester.pump();

      expect(find.text('Enter your email.'), findsOneWidget);
      expect(find.text('Enter your password.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('provider home shows the business facts', (tester) async {
      final container = await _signedIn(user: _providerUser, profile: _profile);
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const HomeScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Ali'), findsWidgets);
      expect(find.text('Rapid Repairs'), findsOneWidget);
      expect(find.text('Live'), findsOneWidget);
      expect(find.text('4.8'), findsOneWidget);
      expect(find.text('12 reviews'), findsOneWidget);
      expect(find.text('Appliance repair'), findsOneWidget);
      expect(find.text('Gulberg, Faisalabad'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a pending shop is told why it is not live', (tester) async {
      final container = await _signedIn(
        user: _brandUser,
        brand: const BrandSummary(
          id: 'b1',
          name: 'Loom & Co.',
          slug: 'loom-co',
          status: 'PENDING',
        ),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const HomeScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Loom & Co.'), findsWidgets);
      expect(find.text('In review'), findsWidgets);
      expect(
        find.textContaining('waiting for CityCart approval'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('account offers password, server and sign out', (tester) async {
      final container = await _signedIn(user: _providerUser, profile: _profile);
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const AccountScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Ali Raza'), findsWidgets);
      expect(find.text('Change your password'), findsOneWidget);
      expect(find.text('CityCart Business 1.0.0'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.byKey(const Key('account_sign_out')),
        200,
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('account_sign_out')));
      await tester.pumpAndSettle();
      expect(find.text('Sign out?'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the shell moves between Home and Account', (tester) async {
      final container = await _signedIn(user: _providerUser, profile: _profile);
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const CityCartBusinessApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Rapid Repairs'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.person_outline_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Change your password'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}

const _providerUser = AppUser(
  id: 'u1',
  name: 'Ali Raza',
  email: 'ali@example.com',
  role: providerRole,
  providerId: 'p1',
  provider: ProviderSummary(
    id: 'p1',
    displayName: 'Rapid Repairs',
    status: 'ACTIVE',
  ),
);

const _brandUser = AppUser(
  id: 'u2',
  name: 'Hina Shah',
  email: 'hina@example.com',
  role: brandRole,
  brandId: 'b1',
);

const _profile = ProviderProfile(
  id: 'p1',
  displayName: 'Rapid Repairs',
  status: 'ACTIVE',
  categoryName: 'Appliance repair',
  cityName: 'Faisalabad',
  blockName: 'Gulberg',
  phone: '03001234567',
  ratingAvg: 4.8,
  ratingCount: 12,
  completedBookings: 30,
  startingAtPrice: 150000,
);

/// Builds a container whose session has already been restored, so the home
/// providers see a signed-in owner before the first frame.
Future<ProviderContainer> _signedIn({
  required AppUser user,
  ProviderProfile? profile,
  BrandSummary? brand,
}) async {
  final prefs = await SharedPreferences.getInstance();
  final store = _FakeSessionStore('token', user);
  final container = ProviderContainer(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      sessionStoreProvider.overrideWithValue(store),
      businessRepositoryProvider.overrideWithValue(
        _FakeRepository(store, user: user, profile: profile, brand: brand),
      ),
    ],
  );
  await container.read(sessionProvider).restore();
  return container;
}

Widget _app({required Widget home, List<Override> overrides = const []}) {
  return ProviderScope(overrides: overrides, child: _shell(home));
}

Widget _shell(Widget home) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: const TextScaler.linear(1.3)),
      child: child!,
    ),
    home: home,
  );
}

class _FakeSessionStore extends SessionStore {
  _FakeSessionStore(this._token, this._user);

  String? _token;
  AppUser? _user;

  @override
  String? get token => _token;

  @override
  AppUser? get user => _user;

  @override
  Future<void> load() async {}

  @override
  Future<void> save({required String token, required AppUser user}) async {
    _token = token;
    _user = user;
  }

  @override
  Future<void> clear() async {
    _token = null;
    _user = null;
  }
}

class _FakeRepository extends BusinessRepository {
  _FakeRepository(
    _FakeSessionStore store, {
    required this.user,
    this.profile,
    this.brand,
  }) : super(ApiClient(store));

  final AppUser user;
  final ProviderProfile? profile;
  final BrandSummary? brand;

  @override
  Future<AppUser> me() async => user;

  @override
  Future<ProviderProfile> currentProvider() async => profile!;

  @override
  Future<BrandSummary> currentBrand() async => brand!;

  @override
  Future<AuthResult> signIn({
    required AccessDoor door,
    required String email,
    required String password,
  }) async {
    return AuthResult(token: 'token', user: user);
  }
}
