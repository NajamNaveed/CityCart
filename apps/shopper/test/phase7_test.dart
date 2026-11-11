import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/area_store.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/addresses/address_form_screen.dart';
import 'package:citycart_shopper/features/addresses/addresses_screen.dart';
import 'package:citycart_shopper/features/auth/login_screen.dart';
import 'package:citycart_shopper/features/help/help_screen.dart';
import 'package:citycart_shopper/features/messages/messages_screen.dart';
import 'package:citycart_shopper/features/notifications/notifications_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart' hide Block;
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

SavedAddress _address({
  String id = 'a1',
  String label = 'Home',
  String fullName = 'Ayesha Khan',
  String phone = '0300 1234567',
  String addressLine = 'House 9, Street 2',
  String city = 'Faisalabad',
  double? latitude = 31.418,
  double? longitude = 73.079,
  bool isDefault = false,
}) {
  return SavedAddress(
    id: id,
    label: label,
    fullName: fullName,
    phone: phone,
    addressLine: addressLine,
    city: city,
    latitude: latitude,
    longitude: longitude,
    isDefault: isDefault,
    blocks: latitude == null
        ? const []
        : const [AddressBlock(id: 'b1', name: 'Gulberg')],
  );
}

SavedAddress _copyAddress(SavedAddress address, {bool? isDefault}) {
  return SavedAddress(
    id: address.id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    additionalInstructions: address.additionalInstructions,
    latitude: address.latitude,
    longitude: address.longitude,
    isDefault: isDefault ?? address.isDefault,
    blocks: address.blocks,
  );
}

AppNotification _notification({
  required String id,
  required String title,
  String type = 'ORDER_CONFIRMED',
  String message = '',
  bool isRead = false,
  Map<String, dynamic> data = const {},
}) {
  return AppNotification(
    id: id,
    type: type,
    title: title,
    message: message,
    isRead: isRead,
    createdAt: DateTime(2026, 11, 11, 10),
    data: data,
  );
}

class _FakeRepository extends ShopperRepository {
  _FakeRepository({
    List<SavedAddress>? addresses,
    List<AppNotification>? notifications,
    int unread = 0,
    this.jobs = const [],
    this.directs = const [],
    this.stores = const [],
  }) : addressItems = addresses ?? const [],
       notificationItems = notifications ?? const [],
       unreadCount = unread,
       super(ApiClient(SessionStore()));

  List<SavedAddress> addressItems;
  final List<AppNotification> notificationItems;
  int unreadCount;
  final PublicSettings settings = const PublicSettings(
    supportEmail: 'help@citycart.pk',
    supportPhone: '0300 1112223',
  );
  final List<ServiceChatConversation> jobs;
  final List<DirectChatConversation> directs;
  final List<StoreChatConversation> stores;

  String? defaultId;
  String? deletedId;
  String? updatedId;
  double? createdLatitude;
  double? createdLongitude;
  String? createdLabel;
  String? readNotificationId;
  bool allNotificationsRead = false;
  String? deletedNotificationId;
  String? resetEmail;
  String? resendEmail;

  @override
  Future<List<SavedAddress>> addresses() async => addressItems;

  @override
  Future<SavedAddress> createAddress({
    required String label,
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required double latitude,
    required double longitude,
    String? state,
    String? postalCode,
    String? country,
    String? additionalInstructions,
    bool isDefault = false,
  }) async {
    createdLabel = label;
    createdLatitude = latitude;
    createdLongitude = longitude;
    return _address(
      id: 'a-new',
      label: label,
      fullName: fullName,
      phone: phone,
      addressLine: addressLine,
      city: city,
      latitude: latitude,
      longitude: longitude,
      isDefault: isDefault,
    );
  }

  @override
  Future<SavedAddress> updateAddress(
    String addressId, {
    required String label,
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required double latitude,
    required double longitude,
    String? state,
    String? postalCode,
    String? country,
    String? additionalInstructions,
  }) async {
    updatedId = addressId;
    return _address(
      id: addressId,
      label: label,
      fullName: fullName,
      phone: phone,
      addressLine: addressLine,
      city: city,
      latitude: latitude,
      longitude: longitude,
    );
  }

  @override
  Future<SavedAddress> setDefaultAddress(String addressId) async {
    defaultId = addressId;
    addressItems = [
      for (final address in addressItems)
        _copyAddress(address, isDefault: address.id == addressId),
    ];
    for (final address in addressItems) {
      if (address.id == addressId) return address;
    }
    return _address(id: addressId, isDefault: true);
  }

  @override
  Future<void> deleteAddress(String addressId) async {
    deletedId = addressId;
    addressItems = addressItems
        .where((address) => address.id != addressId)
        .toList(growable: false);
  }

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
      unreadCount: unreadCount,
    );
  }

  @override
  Future<void> markNotificationRead(String notificationId) async {
    readNotificationId = notificationId;
    if (unreadCount > 0) unreadCount -= 1;
  }

  @override
  Future<void> markAllNotificationsRead() async {
    allNotificationsRead = true;
    unreadCount = 0;
  }

  @override
  Future<void> deleteNotification(String notificationId) async {
    deletedNotificationId = notificationId;
  }

  @override
  Future<PublicSettings> publicSettings() async => settings;

  @override
  Future<Page<ServiceChatConversation>> bookingChats({
    int page = 1,
    int limit = 20,
  }) async {
    return Page(
      items: jobs,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: 1,
        total: jobs.length,
      ),
    );
  }

  @override
  Future<Page<DirectChatConversation>> directChats({
    int page = 1,
    int limit = 20,
  }) async {
    return Page(
      items: directs,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: 1,
        total: directs.length,
      ),
    );
  }

  @override
  Future<Page<StoreChatConversation>> storeChats({
    int page = 1,
    int limit = 20,
  }) async {
    return Page(
      items: stores,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: 1,
        total: stores.length,
      ),
    );
  }

  @override
  Future<String> requestPasswordReset(String email) async {
    resetEmail = email;
    return 'If that email exists, a reset link is on its way.';
  }

  @override
  Future<String> resendVerification(String email) async {
    resendEmail = email;
    return 'If that email needs confirming, we sent a new link.';
  }
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

void _phoneView(WidgetTester tester, {double height = 900}) {
  final view =
      TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
  view.physicalSize = Size(320, height);
  view.devicePixelRatio = 1;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  tearDown(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.resetPhysicalSize();
    view.resetDevicePixelRatio();
  });

  group('saved addresses at 320 wide and 1.3 text', () {
    testWidgets('shows the default address and warns when a pin is missing', (
      tester,
    ) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        addresses: [
          _address(isDefault: true),
          _address(
            id: 'a2',
            label: 'Office',
            addressLine: 'Plot 7, Blue Area',
            latitude: null,
            longitude: null,
          ),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const AddressesScreen(),
          overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Office'), findsOneWidget);
      expect(find.text('Default'), findsOneWidget);
      expect(find.text('Make default'), findsOneWidget);
      expect(find.textContaining('No delivery pin saved'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('making an address default asks the server then reloads', (
      tester,
    ) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        addresses: [
          _address(isDefault: true),
          _address(id: 'a2', label: 'Office'),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const AddressesScreen(),
          overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Make default'));
      await tester.pumpAndSettle();

      expect(repository.defaultId, 'a2');
      expect(find.text('Default'), findsOneWidget);
      expect(find.text('Make default'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('removing an address waits for confirmation', (tester) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        addresses: [
          _address(isDefault: true),
          _address(id: 'a2', label: 'Office'),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const AddressesScreen(),
          overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Remove').first);
      await tester.pumpAndSettle();
      expect(find.text('Remove Home?'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pumpAndSettle();

      expect(repository.deletedId, 'a1');
      expect(find.text('Home'), findsNothing);
      expect(find.text('Office'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a new address saves the centre of the chosen block', (
      tester,
    ) async {
      _phoneView(tester, height: 1700);
      final prefs = await SharedPreferences.getInstance();
      final area = AreaController(AreaStore(prefs));
      await area.choose(
        const AreaSelection(cityId: 'c1', cityName: 'Faisalabad'),
      );
      final repository = _FakeRepository();

      final router = GoRouter(
        initialLocation: '/addresses/new',
        routes: [
          GoRoute(
            path: '/addresses',
            builder: (context, state) =>
                const Scaffold(body: Text('Address list')),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const AddressFormScreen(),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _routedApp(
          router: router,
          overrides: [
            shopperRepositoryProvider.overrideWithValue(repository),
            sharedPreferencesProvider.overrideWithValue(prefs),
            areaProvider.overrideWithValue(area),
            blocksProvider('c1').overrideWith(
              (ref) async => const [
                Block(
                  id: 'b2',
                  cityId: 'c1',
                  name: 'Gulberg',
                  latitude: 31.5,
                  longitude: 73.1,
                ),
                Block(id: 'b3', cityId: 'c1', name: 'Peoples Colony'),
              ],
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('New address'), findsOneWidget);
      await tester.tap(find.text('Choose the block for this address'));
      await tester.pumpAndSettle();
      expect(find.text('No delivery point yet'), findsOneWidget);
      await tester.tap(find.text('Gulberg'));
      await tester.pumpAndSettle();
      expect(find.text('House 9, Street 2'), findsNothing);

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'Home');
      await tester.enterText(fields.at(1), 'Ayesha Khan');
      await tester.enterText(fields.at(2), '0300 1234567');
      await tester.enterText(fields.at(3), 'House 9, Street 2');
      await tester.pump();

      await tester.tap(find.text('Add address'));
      await tester.pumpAndSettle();

      expect(repository.createdLabel, 'Home');
      expect(repository.createdLatitude, 31.5);
      expect(repository.createdLongitude, 73.1);
      expect(find.text('Address list'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('editing an address keeps its pin and saves changes', (
      tester,
    ) async {
      _phoneView(tester, height: 1700);
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        addresses: [_address(isDefault: true)],
      );

      final router = GoRouter(
        initialLocation: '/addresses/a1/edit',
        routes: [
          GoRoute(
            path: '/addresses',
            builder: (context, state) =>
                const Scaffold(body: Text('Address list')),
            routes: [
              GoRoute(
                path: ':addressId/edit',
                builder: (context, state) => AddressFormScreen(
                  addressId: state.pathParameters['addressId'],
                ),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _routedApp(
          router: router,
          overrides: [
            shopperRepositoryProvider.overrideWithValue(repository),
            sharedPreferencesProvider.overrideWithValue(prefs),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Edit address'), findsOneWidget);
      final street = find.byType(TextFormField).at(3);
      await tester.enterText(street, 'House 10, Street 5');
      await tester.pump();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(repository.updatedId, 'a1');
      expect(find.text('Address list'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('notifications at 320 wide and 1.3 text', () {
    testWidgets('opening an unread update marks it read', (tester) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        unread: 1,
        notifications: [
          _notification(
            id: 'n1',
            title: 'Order confirmed',
            message: 'The shop is packing your order.',
            data: const {'orderId': 'o1'},
          ),
          _notification(
            id: 'n2',
            title: 'Payment received',
            type: 'PAYMENT_RECEIVED',
            isRead: true,
          ),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const NotificationsScreen(),
          overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Order confirmed'), findsOneWidget);
      expect(find.text('Payment received'), findsOneWidget);
      expect(find.text('1 unread'), findsOneWidget);

      await tester.tap(find.text('Order confirmed'));
      await tester.pumpAndSettle();

      expect(repository.readNotificationId, 'n1');
      expect(find.text('You are all caught up'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('mark all read and remove both reach the server', (
      tester,
    ) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        unread: 2,
        notifications: [
          _notification(id: 'n1', title: 'Order confirmed'),
          _notification(id: 'n2', title: 'Booking accepted'),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const NotificationsScreen(),
          overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Mark all as read'));
      await tester.pumpAndSettle();
      expect(repository.allNotificationsRead, isTrue);
      expect(find.text('You are all caught up'), findsOneWidget);

      await tester.tap(find.byTooltip('Notification options').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(repository.deletedNotificationId, isNotNull);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('help shows the published contacts and answers', (tester) async {
    _phoneView(tester, height: 1400);
    await tester.pumpWidget(
      _app(
        home: const HelpScreen(),
        overrides: [
          shopperRepositoryProvider.overrideWithValue(_FakeRepository()),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Help & support'), findsOneWidget);
    expect(find.text('help@citycart.pk'), findsOneWidget);
    expect(find.text('0300 1112223'), findsOneWidget);
    expect(find.text('Where is my order?'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, -2200));
    await tester.pumpAndSettle();
    expect(find.text('How do I contact a shop or provider?'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the inbox merges shop, booking and provider chats', (
    tester,
  ) async {
    _phoneView(tester, height: 1200);
    final repository = _FakeRepository(
      jobs: const [
        ServiceChatConversation(
          id: 'cv1',
          bookingId: 'bk1',
          serviceTitle: 'Deep clean',
          withName: 'Sana Home Cleaning',
          lastMessagePreview: 'See you at nine.',
        ),
      ],
      directs: const [
        DirectChatConversation(
          id: 'dc1',
          withName: 'Bilal Repairs',
          lastMessagePreview: 'What needs fixing?',
        ),
      ],
      stores: const [
        StoreChatConversation(
          id: 'sc1',
          withName: 'Loom & Co.',
          lastMessagePreview: 'The linen kurta is back.',
          unread: 3,
        ),
      ],
    );
    await tester.pumpWidget(
      _app(
        home: const MessagesScreen(),
        overrides: [shopperRepositoryProvider.overrideWithValue(repository)],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sana Home Cleaning'), findsOneWidget);
    expect(find.text('Bilal Repairs'), findsOneWidget);
    expect(find.text('Loom & Co.'), findsOneWidget);
    expect(find.text('Shop · About a product'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);

    await tester.tap(find.text('Shops'));
    await tester.pumpAndSettle();
    expect(find.text('Loom & Co.'), findsOneWidget);
    expect(find.text('Sana Home Cleaning'), findsNothing);
    expect(find.text('Bilal Repairs'), findsNothing);

    await tester.tap(find.text('Bookings'));
    await tester.pumpAndSettle();
    expect(find.text('Sana Home Cleaning'), findsOneWidget);
    expect(find.text('Loom & Co.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('forgot password sends the email to the server', (tester) async {
    _phoneView(tester, height: 1400);
    final prefs = await SharedPreferences.getInstance();
    final repository = _FakeRepository();
    await tester.pumpWidget(
      _app(
        home: const LoginScreen(),
        overrides: [
          shopperRepositoryProvider.overrideWithValue(repository),
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.text('Reset your password'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'ayesha@example.com');
    await tester.tap(find.text('Send reset link'));
    await tester.pumpAndSettle();

    expect(repository.resetEmail, 'ayesha@example.com');
    expect(
      find.text('If that email exists, a reset link is on its way.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
