import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/core/widgets.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/services/service_booking_screen.dart';
import 'package:citycart_shopper/features/services/service_provider_screen.dart';
import 'package:citycart_shopper/features/services/service_slots.dart';
import 'package:citycart_shopper/features/services/services_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

ServiceAvailability _weeklyHours({
  int startMinute = 8 * 60,
  int endMinute = 20 * 60,
  int slotMinutes = 60,
  List<String> blackouts = const [],
}) {
  return ServiceAvailability(
    windows: [
      for (var day = 0; day < 7; day++)
        ServiceWindow(
          weekday: day,
          weekdayName: _weekdayNames[day],
          startMinute: startMinute,
          endMinute: endMinute,
          start: '08:00',
          end: '20:00',
          slotMinutes: slotMinutes,
        ),
    ],
    blackoutDates: blackouts,
    isPublished: true,
  );
}

final _reviews = [
  ServiceReview(
    id: 'rev1',
    rating: 5,
    comment: 'The team was on time and left the kitchen spotless.',
    reviewerName: 'Ayesha K.',
    serviceTitle: 'Deep clean — 3 bedroom',
    createdAt: DateTime(2026, 11, 1),
    reply: ServiceReviewReply(
      body: 'Thank you! We are glad the kitchen shines again.',
    ),
  ),
];

final _offerings = [
  const ServiceOffering(
    id: 'o1',
    title: 'Deep clean — 3 bedroom',
    startingAtPricePaisa: 450000,
    durationMinutes: 180,
    images: ['https://example.com/deep.jpg'],
    attributes: {'teamSize': 2},
  ),
  const ServiceOffering(
    id: 'o2',
    title: 'Kitchen clean',
    startingAtPricePaisa: 150000,
    durationMinutes: 90,
  ),
];

ServiceProvider _provider({
  ServiceAvailability? availability,
  bool accepting = true,
}) {
  return ServiceProvider(
    id: 'sp1',
    displayName: 'Sana Home Cleaning',
    slug: 'sana-home-cleaning',
    bio: 'A small team that cares for homes around Gulberg.',
    startingAtPricePaisa: 150000,
    ratingAvg: 4.8,
    ratingCount: 12,
    completedBookings: 38,
    isNew: false,
    acceptingNewOrders: accepting,
    category: const ServiceCategoryRef(
      id: 'cat1',
      name: 'Home cleaning',
      slug: 'home-cleaning',
    ),
    city: const ServiceCityRef(id: 'c1', name: 'Faisalabad'),
    block: const ServiceBlockRef(
      id: 'b1',
      name: 'Gulberg',
      latitude: 31.418,
      longitude: 73.079,
    ),
    distanceKm: 2.4,
    offeringCount: _offerings.length,
    offerings: _offerings,
    topOfferings: _offerings.take(2).toList(),
    availability: availability ?? _weeklyHours(),
    reviews: _reviews,
  );
}

class _FakeRepository extends ShopperRepository {
  _FakeRepository({this.provider}) : super(ApiClient(SessionStore()));

  final ServiceProvider? provider;
  final List<ServiceCategory> categories = const [
    ServiceCategory(id: 'cat1', name: 'Home cleaning', slug: 'home-cleaning'),
    ServiceCategory(id: 'cat2', name: 'Repairs', slug: 'repairs'),
  ];
  List<SavedAddress> savedAddresses = const [];
  String? lastQuery;
  String? lastCategory;
  String? lastSort;
  Map<String, Object?>? request;

  @override
  Future<List<ServiceCategory>> serviceCategories() async => categories;

  @override
  Future<ServiceDiscoverResult> discoverServices({
    required AreaSelection area,
    String categoryId = '',
    String query = '',
    String sort = 'rank',
    int page = 1,
    int limit = 12,
  }) async {
    lastQuery = query;
    lastCategory = categoryId;
    lastSort = sort;
    final item = provider ?? _provider();
    return ServiceDiscoverResult(
      items: [item],
      pagination: const Pagination(page: 1, limit: 12, pages: 1, total: 1),
    );
  }

  @override
  Future<ServiceProvider> serviceProvider(String slug) async {
    return provider ?? _provider();
  }

  @override
  Future<List<SavedAddress>> addresses() async => savedAddresses;

  @override
  Future<ServiceBookingCreated> requestServiceBooking({
    required String providerId,
    required String offeringId,
    required DateTime scheduledStart,
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required double latitude,
    required double longitude,
    String? note,
    int? customerOfferPaisa,
  }) async {
    request = {
      'providerId': providerId,
      'offeringId': offeringId,
      'scheduledStart': scheduledStart.toUtc().toIso8601String(),
      'fullName': fullName,
      'phone': phone,
      'addressLine': addressLine,
      'city': city,
      'latitude': latitude,
      'longitude': longitude,
      'note': note,
      'offer': customerOfferPaisa,
    };
    return const ServiceBookingCreated(id: 'bk1', bookingNumber: 'CC-SVC-0001');
  }
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

Future<List<Override>> _overrides(_FakeRepository repository) async {
  final prefs = await SharedPreferences.getInstance();
  return [
    sharedPreferencesProvider.overrideWithValue(prefs),
    shopperRepositoryProvider.overrideWithValue(repository),
  ];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'citycart.shopper.area.cityId': 'c1',
      'citycart.shopper.area.cityName': 'Faisalabad',
      'citycart.shopper.area.blockId': 'b1',
      'citycart.shopper.area.blockName': 'Gulberg',
      'citycart.shopper.area.latitude': 31.418,
      'citycart.shopper.area.longitude': 73.079,
    });
  });

  group('service slot maths', () {
    // 2 December 2026 is a Wednesday, weekday 3 for the server.
    final wednesday = DateTime.utc(2026, 12, 2);
    final availability = ServiceAvailability(
      windows: const [
        ServiceWindow(
          weekday: 3,
          weekdayName: 'Wednesday',
          startMinute: 9 * 60,
          endMinute: 12 * 60,
          start: '09:00',
          end: '12:00',
          slotMinutes: 60,
        ),
      ],
      isPublished: true,
    );

    test('a 60 minute job fits every hour in a three hour window', () {
      final now = DateTime.utc(2026, 11, 25, 10);
      final slots = serviceSlotsFor(
        day: wednesday,
        availability: availability,
        durationMinutes: 60,
        nowUtc: now,
      );
      expect(slots, [
        DateTime.utc(2026, 12, 2, 4),
        DateTime.utc(2026, 12, 2, 5),
        DateTime.utc(2026, 12, 2, 6),
      ]);
      expect(formatKarachiTime(slots.first), '9:00 AM');
    });

    test('a 90 minute job only starts where the whole job fits', () {
      final slots = serviceSlotsFor(
        day: wednesday,
        availability: availability,
        durationMinutes: 90,
        nowUtc: DateTime.utc(2026, 11, 25, 10),
      );
      expect(slots, [
        DateTime.utc(2026, 12, 2, 4),
        DateTime.utc(2026, 12, 2, 5),
      ]);
    });

    test('times already passed are not offered', () {
      final slots = serviceSlotsFor(
        day: wednesday,
        availability: availability,
        durationMinutes: 60,
        nowUtc: serviceInstant(wednesday, 10 * 60 + 30),
      );
      expect(slots, [DateTime.utc(2026, 12, 2, 6)]);
      expect(formatKarachiTime(slots.single), '11:00 AM');
    });

    test('a blackout date offers nothing', () {
      final closed = ServiceAvailability(
        windows: availability.windows,
        blackoutDates: const ['2026-12-02'],
        isPublished: true,
      );
      expect(
        serviceSlotsFor(
          day: wednesday,
          availability: closed,
          durationMinutes: 60,
          nowUtc: DateTime.utc(2026, 11, 25, 10),
        ),
        isEmpty,
      );
    });

    test('an unpublished provider offers calm suggested times', () {
      final slots = serviceSlotsFor(
        day: wednesday,
        availability: const ServiceAvailability(),
        durationMinutes: 60,
        nowUtc: DateTime.utc(2026, 11, 25, 10),
      );
      expect(slots, hasLength(6));
      expect(formatKarachiTime(slots.first), '8:00 AM');
      expect(formatKarachiTime(slots.last), '6:00 PM');
    });

    test('the first open day skips days the provider is closed', () {
      final sundayOnly = ServiceAvailability(
        windows: const [
          ServiceWindow(
            weekday: 0,
            weekdayName: 'Sunday',
            startMinute: 9 * 60,
            endMinute: 12 * 60,
            start: '09:00',
            end: '12:00',
            slotMinutes: 60,
          ),
        ],
        isPublished: true,
      );
      final provider = _provider(availability: sundayOnly);
      final first = firstServiceDay(
        provider: provider,
        durationMinutes: 60,
        nowUtc: DateTime.utc(2026, 11, 25, 10),
      );
      expect(first, DateTime.utc(2026, 11, 29));
    });
  });

  test('service JSON keeps prices in paisa and dates in UTC', () {
    final provider = ServiceProvider.fromJson({
      '_id': 'sp9',
      'displayName': 'Sana Home Cleaning',
      'slug': 'sana-home-cleaning',
      'startingAtPrice': 150000,
      'ratingAvg': 4.8,
      'ratingCount': 12,
      'completedBookings': 38,
      'isNew': false,
      'acceptingNewOrders': true,
      'category': {'_id': 'cat1', 'name': 'Home cleaning', 'slug': 'home'},
      'city': {'_id': 'c1', 'name': 'Faisalabad'},
      'block': {
        '_id': 'b1',
        'name': 'Gulberg',
        'center': {'lat': 31.418, 'lng': 73.079},
      },
      'distanceKm': 2.4,
      'offeringCount': 2,
      'offerings': [
        {
          '_id': 'o1',
          'title': 'Deep clean',
          'startingAtPrice': 450000,
          'durationMinutes': 180,
          'images': ['https://example.com/deep.jpg'],
        },
      ],
      'availability': {
        'windows': [
          {
            'weekday': 3,
            'weekdayName': 'Wednesday',
            'startMinute': 540,
            'endMinute': 720,
            'start': '09:00',
            'end': '12:00',
            'slotMinutes': 60,
          },
        ],
        'blackoutDates': ['2026-12-25'],
        'isPublished': true,
      },
      'reviews': [
        {
          '_id': 'rev1',
          'rating': 5,
          'comment': 'Great work.',
          'reviewerName': 'Ayesha K.',
          'providerReply': {'body': 'Thank you!'},
        },
      ],
    });

    expect(provider.startingAtPrice, 1500);
    expect(provider.offerings.single.startingAtPrice, 4500);
    expect(provider.block?.latitude, 31.418);
    expect(provider.availability.isPublished, isTrue);
    expect(provider.availability.windows.single.start, '09:00');
    expect(provider.reviews.single.reply?.body, 'Thank you!');
  });

  group('services at 320 wide and 1.3 text', () {
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

    testWidgets('discovery names the provider, price and rating', (
      tester,
    ) async {
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServicesScreen(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Services'), findsOneWidget);
      expect(find.text('All services'), findsOneWidget);
      expect(find.text('Home cleaning'), findsWidgets);
      expect(find.text('Sana Home Cleaning'), findsOneWidget);
      expect(find.text('From Rs 1,500'), findsOneWidget);
      expect(find.text('1 provider nearby'), findsOneWidget);
      expect(find.text('Not taking requests'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('searching sends the words and category to the server', (
      tester,
    ) async {
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServicesScreen(),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'deep clean');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repository.lastQuery, 'deep clean');

      await tester.scrollUntilVisible(
        find.text('Repairs'),
        120,
        scrollable: find.descendant(
          of: find.byType(FilterChips<String>),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Repairs'));
      await tester.pumpAndSettle();
      expect(repository.lastCategory, 'cat2');
      expect(repository.lastSort, 'rank');
      expect(tester.takeException(), isNull);
    });
  });

  group('provider page at 320 wide and 1.3 text', () {
    setUp(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(320, 800);
      view.devicePixelRatio = 1;
    });

    tearDown(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });

    testWidgets('shows the services, working hours and reviews', (
      tester,
    ) async {
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServiceProviderScreen(slug: 'sana-home-cleaning'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sana Home Cleaning'), findsWidgets);
      expect(find.text('Home cleaning • Gulberg'), findsOneWidget);
      expect(find.text('Request a booking'), findsOneWidget);
      expect(find.textContaining('small team that cares'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Deep clean — 3 bedroom'), 220);
      expect(find.text('Deep clean — 3 bedroom'), findsWidgets);
      expect(find.text('3 hr • From Rs 4,500'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Working hours'), 220);
      expect(find.text('Working hours'), findsOneWidget);
      expect(find.text('8:00 AM – 8:00 PM'), findsWidgets);

      await tester.scrollUntilVisible(
        find.textContaining('left the kitchen spotless'),
        220,
      );
      expect(find.text('Ayesha K.'), findsOneWidget);
      expect(find.textContaining('Thank you!'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a paused provider cannot be booked', (tester) async {
      final repository = _FakeRepository(provider: _provider(accepting: false));
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServiceProviderScreen(slug: 'sana-home-cleaning'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Not taking requests'), findsWidgets);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Not taking requests'),
      );
      expect(button.onPressed, isNull);
      expect(tester.takeException(), isNull);
    });
  });

  group('booking request at 320 wide and 1.3 text', () {
    setUp(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(320, 1200);
      view.devicePixelRatio = 1;
    });

    tearDown(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });

    testWidgets('asks for a time before sending', (tester) async {
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServiceBookingScreen(
            slug: 'sana-home-cleaning',
            offeringId: 'o1',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Send booking request'));
      await tester.pumpAndSettle();

      expect(find.text('Choose a time for the visit.'), findsOneWidget);
      expect(repository.request, isNull);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sends the chosen time, address and offer', (tester) async {
      final repository = _FakeRepository();
      final provider = _provider();
      final now = DateTime.now().toUtc();
      final day = firstServiceDay(
        provider: provider,
        durationMinutes: 180,
        nowUtc: now,
      )!;
      final firstSlot = serviceSlotsFor(
        day: day,
        availability: provider.availability,
        durationMinutes: 180,
        nowUtc: now,
      ).first;
      final slotLabel = formatKarachiTime(firstSlot);

      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServiceBookingScreen(
            slug: 'sana-home-cleaning',
            offeringId: 'o1',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text(slotLabel).first,
        220,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text(slotLabel).first);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('booking-name')),
        220,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byKey(const ValueKey('booking-name')),
        'Ayesha Khan',
      );
      await tester.enterText(
        find.byKey(const ValueKey('booking-phone')),
        '0300 1234567',
      );
      await tester.enterText(
        find.byKey(const ValueKey('booking-address')),
        'House 9, Street 2, Gulberg',
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('booking-offer')),
        220,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byKey(const ValueKey('booking-note')),
        'Gate code 42.',
      );
      await tester.enterText(
        find.byKey(const ValueKey('booking-offer')),
        '4000',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Send booking request'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(repository.request, isNotNull);
      expect(repository.request!['providerId'], 'sp1');
      expect(repository.request!['offeringId'], 'o1');
      expect(repository.request!['fullName'], 'Ayesha Khan');
      expect(repository.request!['phone'], '0300 1234567');
      expect(repository.request!['addressLine'], 'House 9, Street 2, Gulberg');
      expect(repository.request!['city'], 'Faisalabad');
      expect(repository.request!['latitude'], 31.418);
      expect(repository.request!['longitude'], 73.079);
      expect(repository.request!['note'], 'Gate code 42.');
      expect(repository.request!['offer'], 400000);
      expect(
        DateTime.parse(repository.request!['scheduledStart'] as String),
        firstSlot,
      );

      expect(find.text('Request sent'), findsOneWidget);
      expect(find.text('CC-SVC-0001'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a saved address fills the form and its pin', (tester) async {
      final repository = _FakeRepository();
      repository.savedAddresses = const [
        SavedAddress(
          id: 'a1',
          label: 'Home',
          fullName: 'Ayesha Khan',
          phone: '0300 1112223',
          addressLine: 'House 9, Street 2',
          city: 'Faisalabad',
          latitude: 31.42,
          longitude: 73.08,
        ),
      ];
      await tester.pumpWidget(
        _app(
          overrides: await _overrides(repository),
          home: const ServiceBookingScreen(
            slug: 'sana-home-cleaning',
            offeringId: 'o1',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('Home'),
        220,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();

      final name = tester.widget<TextFormField>(
        find.byKey(const ValueKey('booking-name')),
      );
      final address = tester.widget<TextFormField>(
        find.byKey(const ValueKey('booking-address')),
      );
      expect(name.controller?.text, 'Ayesha Khan');
      expect(address.controller?.text, 'House 9, Street 2');
      expect(tester.takeException(), isNull);
    });
  });
}
