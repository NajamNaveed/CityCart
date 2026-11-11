import 'package:citycart_business/app.dart';
import 'package:citycart_business/core/format.dart';
import 'package:citycart_business/core/status.dart';
import 'package:citycart_business/core/theme.dart';
import 'package:citycart_business/data/api_client.dart';
import 'package:citycart_business/data/models.dart';
import 'package:citycart_business/data/models.dart' as data;
import 'package:citycart_business/data/repository.dart';
import 'package:citycart_business/data/session_store.dart';
import 'package:citycart_business/features/account/account_screen.dart';
import 'package:citycart_business/features/auth/login_screen.dart';
import 'package:citycart_business/features/bookings/booking_detail_screen.dart';
import 'package:citycart_business/features/bookings/bookings_screen.dart';
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

    test('shop owners cannot open the provider bookings area', () {
      expect(
        businessRedirect(
          status: SessionStatus.signedIn,
          location: '/bookings',
          role: brandRole,
        ),
        '/home',
      );
      expect(
        businessRedirect(
          status: SessionStatus.signedIn,
          location: '/bookings/bk1',
          role: brandRole,
        ),
        '/home',
      );
      expect(
        businessRedirect(
          status: SessionStatus.signedIn,
          location: '/bookings',
          role: providerRole,
        ),
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

    test('a booking reads the customer, schedule and prices', () {
      final booking = BusinessBooking.fromJson({
        '_id': 'bk1',
        'bookingNumber': 'SB-2026-000001',
        'status': 'REQUESTED',
        'offering': {
          'offeringId': 'o1',
          'title': 'AC repair visit',
          'durationMinutes': 60,
          'startingAtPrice': 150000,
        },
        'customer': {'_id': 'c1', 'name': 'Sana Malik', 'phone': '03001234567'},
        'address': {
          'fullName': 'Sana Malik',
          'phone': '03001234567',
          'addressLine': 'House 12, Street 4, Gulberg',
          'city': 'Faisalabad',
          'blockName': 'Gulberg',
        },
        'requestedStart': '2026-11-12T10:00:00.000Z',
        'customerOfferPaisa': 120000,
        'note': 'The AC is not cooling.',
      });

      expect(booking.customerName, 'Sana Malik');
      expect(booking.customerPhone, '03001234567');
      expect(booking.address?.areaLabel, 'Gulberg, Faisalabad');
      expect(booking.whenStart, isNotNull);
      expect(booking.headlinePricePaisa, 150000);
      expect(booking.canAcceptCustomerOffer, isTrue);
      expect(booking.canStart, isFalse);
      expect(booking.customerOfferPaisa, 120000);
      expect(money(booking.headlinePricePaisa), 'Rs 1,500');
    });

    test('booking labels speak in the owner’s language', () {
      expect(bookingStatusLabel('REQUESTED'), 'New request');
      expect(bookingStatusLabel('COMPLETED'), 'Awaiting customer');
      expect(bookingStatusLabel('CONFIRMED'), 'Done');
      expect(bookingEventLabel('STARTED'), 'You started the job');
      expect(bookingStatusDetail('COMPLETED'), contains('3 days'));
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

    testWidgets('the shell moves between Home, Bookings and Account', (
      tester,
    ) async {
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
      expect(find.text('Bookings'), findsWidgets);

      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.byIcon(Icons.event_note_outlined),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No bookings yet'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.person_outline_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Change your password'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('bookings show the customer and filter by state', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        bookings: [_sampleBooking()],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BookingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sana Malik'), findsOneWidget);
      expect(find.text('AC repair visit'), findsOneWidget);
      expect(find.text('New request'), findsOneWidget);
      expect(find.text('Rs 1,500'), findsOneWidget);
      expect(find.textContaining('Customer offered Rs 1,200'), findsOneWidget);

      await tester.tap(find.byKey(const Key('booking_filter_requested')));
      await tester.pumpAndSettle();
      expect(fake.lastBookingStatus, 'REQUESTED');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a new request can be accepted at the published price', (
      tester,
    ) async {
      final booking = _sampleBooking();
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        bookings: [booking],
        detail: booking,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BookingDetailScreen(bookingId: 'bk1', initial: booking),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sana Malik'), findsWidgets);
      expect(find.text('Accept request'), findsOneWidget);
      expect(find.text('Rs 1,500'), findsWidgets);

      await tester.tap(find.byKey(const Key('booking_accept')));
      await tester.pumpAndSettle();
      expect(find.text('Accept this request'), findsOneWidget);
      expect(find.text('Accept the customer’s offer'), findsOneWidget);

      final submit = find.byKey(const Key('booking_accept_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.acceptedPricePaisa, 150000);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the customer’s own offer can be accepted instead', (
      tester,
    ) async {
      final booking = _sampleBooking();
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        bookings: [booking],
        detail: booking,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BookingDetailScreen(bookingId: 'bk1', initial: booking),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('booking_accept')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Accept the customer’s offer'));
      await tester.pumpAndSettle();

      final submit = find.byKey(const Key('booking_accept_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      expect(find.text('Accept their offer'), findsOneWidget);
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.acceptedOffer, isTrue);
      expect(fake.acceptedPricePaisa, isNull);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a price proposal carries the price, time and scope', (
      tester,
    ) async {
      final booking = _sampleBooking();
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        bookings: [booking],
        detail: booking,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BookingDetailScreen(bookingId: 'bk1', initial: booking),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('booking_propose')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byType(TextFormField).at(1),
        'Parts, the visit and a 30-day check.',
      );
      final submit = find.byKey(const Key('booking_propose_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.proposedPricePaisa, 150000);
      expect(fake.proposedScope, 'Parts, the visit and a 30-day check.');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a running job is completed with its final amount', (
      tester,
    ) async {
      final booking = _sampleBooking(
        status: 'IN_PROGRESS',
        agreedPricePaisa: 150000,
      );
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        bookings: [booking],
        detail: booking,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BookingDetailScreen(bookingId: 'bk1', initial: booking),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('booking_complete')));
      await tester.pumpAndSettle();
      expect(find.text('Complete this job'), findsOneWidget);

      final submit = find.byKey(const Key('booking_complete_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.completedAmountPaisa, 150000);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a shop owner never sees the bookings tab', (tester) async {
      final container = await _signedIn(
        user: _brandUser,
        brand: const BrandSummary(
          id: 'b1',
          name: 'Loom & Co.',
          slug: 'loom-co',
          status: 'ACTIVE',
        ),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const CityCartBusinessApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Bookings'), findsNothing);
      expect(find.text('Account'), findsWidgets);
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
  List<BusinessBooking> bookings = const [],
  BusinessBooking? detail,
}) async {
  final result = await _signedInWithFake(
    user: user,
    profile: profile,
    brand: brand,
    bookings: bookings,
    detail: detail,
  );
  return result.$1;
}

Future<(ProviderContainer, _FakeRepository)> _signedInWithFake({
  required AppUser user,
  ProviderProfile? profile,
  BrandSummary? brand,
  List<BusinessBooking> bookings = const [],
  BusinessBooking? detail,
}) async {
  final prefs = await SharedPreferences.getInstance();
  final store = _FakeSessionStore('token', user);
  final repository = _FakeRepository(
    store,
    user: user,
    profile: profile,
    brand: brand,
    bookings: bookings,
    detail: detail,
  );
  final container = ProviderContainer(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      sessionStoreProvider.overrideWithValue(store),
      businessRepositoryProvider.overrideWithValue(repository),
    ],
  );
  await container.read(sessionProvider).restore();
  return (container, repository);
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
    this.bookings = const [],
    this.detail,
  }) : super(ApiClient(store));

  final AppUser user;
  final ProviderProfile? profile;
  final BrandSummary? brand;
  final List<BusinessBooking> bookings;
  final BusinessBooking? detail;

  String? lastBookingStatus;
  int? acceptedPricePaisa;
  var acceptedOffer = false;
  int? proposedPricePaisa;
  String? proposedScope;
  int? completedAmountPaisa;

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

  @override
  Future<data.Page<BusinessBooking>> providerBookings({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    lastBookingStatus = status;
    return data.Page(
      items: bookings,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: bookings.isEmpty ? 0 : 1,
        total: bookings.length,
      ),
    );
  }

  @override
  Future<BusinessBooking> providerBooking(String bookingId) async {
    return detail ?? bookings.first;
  }

  @override
  Future<BusinessBooking> acceptProviderBooking(
    String bookingId, {
    required int pricePaisa,
  }) async {
    acceptedPricePaisa = pricePaisa;
    return providerBooking(bookingId);
  }

  @override
  Future<BusinessBooking> acceptProviderOffer(String bookingId) async {
    acceptedOffer = true;
    return providerBooking(bookingId);
  }

  @override
  Future<BusinessBooking> proposeProviderBooking(
    String bookingId, {
    required int pricePaisa,
    required String scope,
    required DateTime scheduledStart,
    int? expiresInHours,
  }) async {
    proposedPricePaisa = pricePaisa;
    proposedScope = scope;
    return providerBooking(bookingId);
  }

  @override
  Future<BusinessBooking> completeProviderBooking(
    String bookingId, {
    required int finalAmountPaisa,
    String? completionNote,
  }) async {
    completedAmountPaisa = finalAmountPaisa;
    return providerBooking(bookingId);
  }
}

BusinessBooking _sampleBooking({
  String status = 'REQUESTED',
  int? agreedPricePaisa,
}) {
  final when = DateTime.now().add(const Duration(days: 2));
  return BusinessBooking(
    id: 'bk1',
    bookingNumber: 'SB-2026-000001',
    status: status,
    offering: const BookingOffering(
      id: 'o1',
      title: 'AC repair visit',
      durationMinutes: 60,
      startingAtPricePaisa: 150000,
    ),
    requestedStart: DateTime(when.year, when.month, when.day, 10),
    customer: const BookingCustomer(
      id: 'c1',
      name: 'Sana Malik',
      phone: '03001234567',
    ),
    address: const BookingAddress(
      fullName: 'Sana Malik',
      phone: '03001234567',
      addressLine: 'House 12, Street 4, Gulberg',
      city: 'Faisalabad',
      blockName: 'Gulberg',
    ),
    customerOfferPaisa: 120000,
    agreedPricePaisa: agreedPricePaisa,
    note: 'The AC is not cooling.',
  );
}
