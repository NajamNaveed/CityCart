import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/cart/cart_controller.dart';
import 'package:citycart_shopper/features/cart/cart_screen.dart';
import 'package:citycart_shopper/features/checkout/checkout_screen.dart';
import 'package:citycart_shopper/features/product/product_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

CartItem _item(int quantity) => CartItem(
  productId: 'p1',
  name: 'Linen Kurta',
  unitPrice: 4500,
  quantity: quantity,
  lineTotal: 4500.0 * quantity,
);

CartView _cart(int quantity) => CartView(
  groups: [
    CartGroup(
      brandId: 'b1',
      brandName: 'Loom & Co.',
      items: [_item(quantity)],
      subtotal: 4500.0 * quantity,
    ),
  ],
  subtotal: 4500.0 * quantity,
  itemCount: quantity,
);

const _home = SavedAddress(
  id: 'a1',
  label: 'Home',
  fullName: 'Sana Iqbal',
  phone: '0300 1234567',
  addressLine: 'House 12, Street 4',
  city: 'Lahore',
  latitude: 31.5,
  longitude: 74.3,
  isDefault: true,
  additionalInstructions: 'Gate on the left.',
);

const _placed = [
  PlacedOrder(
    id: 'o1',
    orderNumber: 'CC-2026-000001',
    brandId: 'b1',
    items: [
      PlacedOrderItem(
        productId: 'p1',
        productName: 'Linen Kurta',
        quantity: 1,
        unitPrice: 4500,
        totalPrice: 4500,
      ),
    ],
    total: 4500,
  ),
];

class _FakeRepository extends ShopperRepository {
  _FakeRepository({
    CartView? cart,
    this.savedAddresses = const [],
    this.placed = const [],
  }) : _state = cart ?? _cart(1),
       super(ApiClient(SessionStore()));

  CartView _state;
  final List<SavedAddress> savedAddresses;
  final List<PlacedOrder> placed;
  final List<String> quantityUpdates = [];
  final List<String> removals = [];
  final List<int> addQuantities = [];
  Map<String, dynamic>? orderPayload;

  @override
  Future<CartView> cart() async => _state;

  @override
  Future<CartView> addToCart(String productId, {int quantity = 1}) async {
    addQuantities.add(quantity);
    _state = _cart(quantity);
    return _state;
  }

  @override
  Future<CartView> updateCartItem(String productId, int quantity) async {
    quantityUpdates.add('$productId:$quantity');
    _state = _cart(quantity);
    return _state;
  }

  @override
  Future<CartView> removeCartItem(String productId) async {
    removals.add(productId);
    _state = const CartView();
    return _state;
  }

  @override
  Future<CartView> clearCart() async {
    _state = const CartView();
    return _state;
  }

  @override
  Future<List<SavedAddress>> addresses() async => savedAddresses;

  @override
  Future<List<PlacedOrder>> placeOrder({
    required String fullName,
    required String phone,
    required String addressLine,
    required String city,
    required String deliveryNotes,
    required double latitude,
    required double longitude,
    String? state,
    String? postalCode,
    String? country,
    String? addressId,
    String? saveAsLabel,
    String paymentMethod = 'COD',
  }) async {
    orderPayload = {
      'fullName': fullName,
      'phone': phone,
      'addressLine': addressLine,
      'city': city,
      'deliveryNotes': deliveryNotes,
      'latitude': latitude,
      'longitude': longitude,
      'addressId': addressId,
      'saveAsLabel': saveAsLabel,
      'paymentMethod': paymentMethod,
    };
    _state = const CartView();
    return placed;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('basket and add to basket at 320 wide and 1.3 text', () {
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

    testWidgets('a basket line changes quantity and can be removed', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository();
      final controller = CartController(repository);
      await controller.load();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            cartProvider.overrideWith((ref) => controller),
          ],
          home: const CartScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('Your basket'), findsOneWidget);
      expect(find.text('Loom & Co.'), findsOneWidget);
      expect(find.text('Rs 4,500'), findsWidgets);
      expect(find.text('Continue to checkout'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.add_rounded));
      await tester.pump();
      await tester.pump();

      expect(repository.quantityUpdates, ['p1:2']);
      expect(find.text('2'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.delete_outline_rounded));
      await tester.pump();
      await tester.pump();

      expect(repository.removals, ['p1']);
      expect(find.text('Your basket is empty'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an empty basket offers the shops', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(cart: const CartView());
      final controller = CartController(repository);
      await controller.load();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            cartProvider.overrideWith((ref) => controller),
          ],
          home: const CartScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('Your basket is empty'), findsOneWidget);
      expect(find.text('Browse shops'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the product page adds the chosen quantity', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(cart: const CartView());
      final controller = CartController(repository);
      await controller.load();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            cartProvider.overrideWith((ref) => controller),
            productProvider('p1').overrideWith(
              (ref) async => const Product(
                id: 'p1',
                brandId: 'b1',
                name: 'Linen Kurta',
                price: 4500,
                availability: 'IN_STOCK',
              ),
            ),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
          ],
          home: const ProductScreen(productId: 'p1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('How many?'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add_rounded));
      await tester.pump();
      await tester.tap(find.text('Add to basket'));
      await tester.pump();
      await tester.pump();

      expect(repository.addQuantities, [2]);
      expect(find.text('2 added to your basket.'), findsOneWidget);
      expect(find.text('View basket'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('checkout at 320 wide and 1.3 text', () {
    setUp(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(320, 1400);
      view.devicePixelRatio = 1;
    });

    tearDown(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });

    testWidgets('a saved address is used and the delivery notes are sent', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        savedAddresses: const [_home],
        placed: _placed,
      );
      final controller = CartController(repository);
      await controller.load();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            cartProvider.overrideWith((ref) => controller),
          ],
          home: const CheckoutScreen(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('DELIVER TO'), findsOneWidget);
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Gate on the left.'), findsOneWidget);
      expect(find.text('Cash on delivery'), findsOneWidget);

      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();

      final payload = repository.orderPayload!;
      expect(payload['addressId'], 'a1');
      expect(payload['fullName'], 'Sana Iqbal');
      expect(payload['latitude'], 31.5);
      expect(payload['longitude'], 74.3);
      expect(payload['deliveryNotes'], 'Gate on the left.');
      expect(payload['paymentMethod'], 'COD');

      expect(find.text('Thank you!'), findsOneWidget);
      expect(find.text('Order CC-2026-000001'), findsOneWidget);
      expect(find.text('Pay on delivery'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a new address validates, picks a block and places the order', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        'citycart.shopper.area.cityId': 'c1',
        'citycart.shopper.area.cityName': 'Lahore',
      });
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(placed: _placed);
      final controller = CartController(repository);
      await controller.load();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            cartProvider.overrideWith((ref) => controller),
            blocksProvider('c1').overrideWith(
              (ref) async => [
                const Block(
                  id: 'b1',
                  cityId: 'c1',
                  name: 'Gulberg',
                  latitude: 31.52,
                  longitude: 74.34,
                ),
              ],
            ),
          ],
          home: const CheckoutScreen(),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).last, 'Gate on the left.');
      await tester.tap(find.text('Place order'));
      await tester.pump();
      expect(find.text('Enter the name for this delivery.'), findsOneWidget);
      expect(find.text('Choose the block your address is in.'), findsOneWidget);
      expect(repository.orderPayload, isNull);

      await tester.enterText(find.byType(TextFormField).at(0), 'Sana Iqbal');
      await tester.enterText(find.byType(TextFormField).at(1), '0300 1234567');
      await tester.enterText(
        find.byType(TextFormField).at(2),
        'House 12, Street 4',
      );
      await tester.pump();

      await tester.tap(find.text('Choose your block'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gulberg'));
      await tester.pumpAndSettle();
      expect(find.text('Gulberg'), findsOneWidget);

      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();

      final payload = repository.orderPayload!;
      expect(payload['addressId'], isNull);
      expect(payload['fullName'], 'Sana Iqbal');
      expect(payload['phone'], '0300 1234567');
      expect(payload['addressLine'], 'House 12, Street 4');
      expect(payload['city'], 'Lahore');
      expect(payload['latitude'], 31.52);
      expect(payload['longitude'], 74.34);
      expect(payload['deliveryNotes'], 'Gate on the left.');
      expect(find.text('Thank you!'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  test('cart, address and placed order parse the server shape', () {
    final cart = CartView.fromJson({
      'groups': [
        {
          'brand': {'_id': 'b1', 'name': 'Loom & Co.', 'slug': 'loom'},
          'items': [
            {
              'productId': 'p1',
              'name': 'Linen Kurta',
              'unitPrice': 4500,
              'quantity': 2,
              'lineTotal': 9000,
              'issue': 'INSUFFICIENT_STOCK',
              'availableQuantity': 1,
            },
          ],
          'subtotal': 9000,
        },
      ],
      'subtotal': 9000,
      'itemCount': 2,
      'hasIssues': true,
    });
    expect(cart.itemCount, 2);
    expect(cart.groups.single.brandName, 'Loom & Co.');
    expect(cart.groups.single.items.single.quantity, 2);
    expect(cart.groups.single.items.single.availableQuantity, 1);
    expect(cart.hasIssues, isTrue);

    final address = SavedAddress.fromJson({
      '_id': 'a1',
      'label': 'Home',
      'fullName': 'Sana Iqbal',
      'phone': '0300 1234567',
      'addressLine': 'House 12, Street 4',
      'city': 'Lahore',
      'latitude': 31.5,
      'longitude': 74.3,
      'isDefault': true,
      'blocks': [
        {'_id': 'bl1', 'name': 'Gulberg'},
      ],
    });
    expect(address.canDeliver, isTrue);
    expect(address.summary, 'House 12, Street 4, Lahore');
    expect(address.blocks.single.name, 'Gulberg');

    final order = PlacedOrder.fromJson({
      '_id': 'o1',
      'orderNumber': 'CC-2026-000001',
      'brandId': 'b1',
      'items': [
        {
          'productId': 'p1',
          'productName': 'Linen Kurta',
          'quantity': 2,
          'unitPrice': 4500,
          'totalPrice': 9000,
        },
      ],
      'total': 9000,
      'currency': 'PKR',
      'orderStatus': 'PENDING',
      'paymentStatus': 'PENDING',
    });
    expect(order.orderNumber, 'CC-2026-000001');
    expect(order.items.single.totalPrice, 9000);
    expect(order.total, 9000);
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
