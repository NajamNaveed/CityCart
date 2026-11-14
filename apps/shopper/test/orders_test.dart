import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/cart/cart_controller.dart';
import 'package:citycart_shopper/features/orders/order_detail_screen.dart';
import 'package:citycart_shopper/features/orders/order_providers.dart';
import 'package:citycart_shopper/features/orders/orders_controller.dart';
import 'package:citycart_shopper/features/orders/orders_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:citycart_shopper/features/location/maps.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _address = OrderAddress(
  name: 'Sana Iqbal',
  phone: '0300 1234567',
  address: 'House 12, Street 4',
  city: 'Lahore',
  additionalInstructions: 'Gate on the left.',
);

const _items = [
  CustomerOrderItem(
    id: 'i1',
    productId: 'p1',
    productName: 'Linen Kurta',
    quantity: 1,
    unitPrice: 4500,
    totalPrice: 4500,
  ),
];

CustomerOrder _order({
  String status = 'PENDING',
  String paymentStatus = 'PENDING',
  String fulfilment = '',
}) => CustomerOrder(
  id: 'o1',
  orderNumber: 'CC-2026-000042',
  brandId: 'b1',
  items: _items,
  shippingAddress: _address,
  subtotal: 4500,
  deliveryFee: 250,
  total: 4750,
  currency: 'PKR',
  orderStatus: status,
  paymentStatus: paymentStatus,
  fulfilment: fulfilment.isEmpty ? null : fulfilment,
  statusHistory: [
    OrderStatusEvent(status: 'PENDING', at: DateTime(2026, 11, 10, 10)),
    OrderStatusEvent(status: status, at: DateTime(2026, 11, 10, 12)),
  ],
  createdAt: DateTime(2026, 11, 10, 10),
);

final _adjustment = OrderAdjustment(
  id: 'a1',
  note: 'The linen is short by one piece.',
  lines: [
    AdjustmentLine(
      productName: 'Linen Kurta',
      orderedQuantity: 2,
      supplyQuantity: 1,
      unitPrice: 4500,
      substitute: AdjustmentSubstitute(
        productName: 'Cotton Kurta',
        quantity: 1,
      ),
    ),
  ],
  totalsBefore: AdjustmentTotals(subtotal: 9000, total: 9250),
  totalsAfter: AdjustmentTotals(subtotal: 4500, total: 4750),
  totalsAfterRemoval: AdjustmentTotals(subtotal: 0, total: 0),
  expiresAt: DateTime(2026, 11, 11, 18),
  proposedByRole: 'PICKER',
);

class _FakeRepository extends ShopperRepository {
  _FakeRepository({this.orders = const [], this.details = const {}})
    : super(ApiClient(SessionStore()));

  final List<CustomerOrder> orders;
  final Map<String, OrderDetail> details;
  List<MyReview> reviews = const [];
  OrderReceipt? receipt;
  CartView cartState = const CartView();
  final List<String> cancelled = [];
  final List<String> adjustments = [];
  final List<int> addedQuantities = [];
  Map<String, dynamic>? reviewPayload;

  @override
  Future<Page<CustomerOrder>> myOrders({int page = 1, int limit = 10}) async {
    return Page(
      items: orders,
      pagination: Pagination(total: orders.length),
    );
  }

  @override
  Future<PublicBrand> brand(String brandId) async {
    return PublicBrand(id: brandId, name: 'Loom & Co.', slug: 'loom');
  }

  @override
  Future<OrderDetail> order(String orderId) async => details[orderId]!;

  @override
  Future<String> deliveryCode(String deliveryId) async => '4821';

  RiderPosition? riderState;

  @override
  Future<RiderPosition?> riderLocation(String deliveryId) async => riderState;

  @override
  Future<List<MyReview>> myReviews({String? orderId}) async => reviews;

  @override
  Future<OrderReceipt> receiptForOrder(String orderId) async => receipt!;

  @override
  Future<CustomerOrder> cancelOrder(String orderId) async {
    cancelled.add(orderId);
    return details[orderId]!.order;
  }

  @override
  Future<AdjustmentOutcome> respondToAdjustment(
    String orderId,
    String adjustmentId,
    String action,
  ) async {
    adjustments.add('$adjustmentId:$action');
    return const AdjustmentOutcome(refundAmount: 450);
  }

  @override
  Future<MyReview> createReview({
    required String orderId,
    required String productId,
    required int rating,
    String? title,
    String? comment,
  }) async {
    reviewPayload = {
      'orderId': orderId,
      'productId': productId,
      'rating': rating,
      'title': title,
      'comment': comment,
    };
    return MyReview(
      id: 'r1',
      productId: productId,
      orderId: orderId,
      rating: rating,
      title: title,
      comment: comment,
    );
  }

  @override
  Future<CartView> cart() async => cartState;

  @override
  Future<CartView> addToCart(String productId, {int quantity = 1}) async {
    addedQuantities.add(quantity);
    cartState = CartView(
      groups: [
        CartGroup(
          brandId: 'b1',
          brandName: 'Loom & Co.',
          items: [
            CartItem(
              productId: productId,
              name: 'Linen Kurta',
              unitPrice: 4500,
              quantity: quantity,
              lineTotal: 4500.0 * quantity,
            ),
          ],
          subtotal: 4500.0 * quantity,
        ),
      ],
      subtotal: 4500.0 * quantity,
      itemCount: quantity,
    );
    return cartState;
  }

  @override
  Future<CartView> updateCartItem(String productId, int quantity) async =>
      cartState;

  @override
  Future<CartView> removeCartItem(String productId) async => cartState;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('orders at 320 wide and 1.3 text', () {
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

    testWidgets('the list names every order and its shop', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(orders: [_order()]);
      final controller = OrdersController(repository);
      await controller.loadInitial();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            ordersProvider.overrideWith((ref) => controller),
          ],
          home: const OrdersScreen(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Your orders'), findsOneWidget);
      expect(find.text('CC-2026-000042'), findsOneWidget);
      expect(find.text('Loom & Co.'), findsOneWidget);
      expect(find.text('Waiting for the store'), findsOneWidget);
      expect(find.text('1 item'), findsOneWidget);
      expect(find.text('Rs 4,750'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an empty list points the shopper to the shops', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final controller = OrdersController(_FakeRepository());
      await controller.loadInitial();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            ordersProvider.overrideWith((ref) => controller),
          ],
          home: const OrdersScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('No orders yet'), findsOneWidget);
      expect(find.text('Start shopping'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('order detail at 320 wide and 1.3 text', () {
    setUp(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(320, 1000);
      view.devicePixelRatio = 1;
    });

    tearDown(() {
      final view =
          TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });

    testWidgets('an order on its way shows progress and the door code', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(
        order: _order(status: 'OUT_FOR_DELIVERY'),
        payment: const OrderPayment(status: 'PENDING', amount: 4750),
        delivery: const OrderDelivery(id: 'd1', status: 'OUT_FOR_DELIVERY'),
      );
      final repository = _FakeRepository(details: {'o1': detail});

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            deliveryCodeProvider('d1').overrideWith((ref) async => '4821'),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CC-2026-000042'), findsWidgets);
      expect(find.text('Arriving today'), findsWidgets);
      expect(find.text('Progress'), findsOneWidget);
      expect(find.text('Your delivery code'), findsOneWidget);
      expect(find.text('4821'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Pay in cash when your order arrives.'),
        250,
      );
      await tester.pumpAndSettle();
      expect(find.text('Pay in cash when your order arrives.'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Order again'), 250);
      await tester.pumpAndSettle();
      expect(find.text('Order again'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a sharing rider shows the live map, marker and trail', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(
        order: _order(status: 'OUT_FOR_DELIVERY'),
        payment: const OrderPayment(status: 'PENDING', amount: 4750),
        delivery: const OrderDelivery(id: 'd1', status: 'OUT_FOR_DELIVERY'),
      );
      final repository = _FakeRepository(details: {'o1': detail})
        ..riderState = RiderPosition(
          latitude: 31.5,
          longitude: 74.3,
          recordedAt: DateTime.now(),
        );

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            deliveryCodeProvider('d1').overrideWith((ref) async => '4821'),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.byType(RiderTrackingMap), 250);
      await tester.pumpAndSettle();

      expect(find.text('Your rider'), findsOneWidget);
      expect(find.byIcon(Icons.two_wheeler_rounded), findsOneWidget);
      expect(find.text('Last seen just now.'), findsOneWidget);
      expect(
        find.text('The line shows the way since you opened this page.'),
        findsNothing,
      );

      // The next poll finds the rider a street further along, so the trail and
      // the heading arrow appear.
      repository.riderState = RiderPosition(
        latitude: 31.501,
        longitude: 74.3,
        recordedAt: DateTime.now(),
      );
      await tester.pump(const Duration(seconds: 15));
      await tester.pumpAndSettle();

      expect(
        find.text('The line shows the way since you opened this page.'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.navigation_rounded), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a delivered paid order shows the receipt and lets it open', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(
        order: _order(status: 'DELIVERED', paymentStatus: 'PAID'),
        payment: const OrderPayment(
          status: 'PAID',
          amount: 4750,
          collectionMethod: 'COD',
        ),
        delivery: const OrderDelivery(id: 'd1', status: 'DELIVERED'),
      );
      final repository = _FakeRepository(details: {'o1': detail})
        ..receipt = const OrderReceipt(
          id: 'r1',
          receiptNumber: 'RC-9',
          orderNumber: 'CC-2026-000042',
          brandName: 'Loom & Co.',
          amount: 4750,
          subtotal: 4500,
          deliveryFee: 250,
          items: [
            ReceiptItem(
              productName: 'Linen Kurta',
              quantity: 1,
              totalPrice: 4500,
            ),
          ],
        );

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            receiptProvider('o1')
                .overrideWith((ref) async => repository.receipt!),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Rate'), 200);
      expect(find.text('Rate'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Receipt RC-9'), 200);
      expect(find.text('Receipt RC-9'), findsOneWidget);
      expect(find.text('Paid with cash on delivery.'), findsOneWidget);

      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();

      expect(find.text('Total paid'), findsOneWidget);
      expect(find.text('Rs 4,750'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a shop change proposal can be accepted', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(
        order: _order(status: 'CONFIRMED'),
        adjustment: _adjustment,
        adjustments: [_adjustment],
      );
      final repository = _FakeRepository(details: {'o1': detail});

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('A picker needs to change this order'), findsOneWidget);
      expect(find.text('The linen is short by one piece.'), findsOneWidget);
      expect(find.text('You ordered 2; 1 item can be sent'), findsOneWidget);
      expect(find.text('Instead: Cotton Kurta × 1'), findsOneWidget);
      expect(find.text('New total'), findsOneWidget);
      expect(find.text('Accept the change'), findsOneWidget);
      expect(find.text('Remove unavailable items'), findsOneWidget);
      expect(find.text('Cancel the whole order'), findsOneWidget);

      await tester.ensureVisible(find.text('Accept the change'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Accept the change'));
      await tester.pumpAndSettle();

      expect(repository.adjustments, ['a1:ACCEPT']);
      expect(
        find.text(
          'Change accepted. Your order is updated. Rs 450 will be refunded.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a waiting order can be cancelled and it warns first', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(order: _order());
      final repository = _FakeRepository(details: {'o1': detail});

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Cancel order'));
      await tester.tap(find.text('Cancel order'));
      await tester.pumpAndSettle();

      expect(find.text('Cancel this order?'), findsOneWidget);

      await tester.tap(find.text('Yes, cancel it'));
      await tester.pumpAndSettle();

      expect(repository.cancelled, ['o1']);
      expect(find.text('Your order was cancelled.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a delivered item can be reviewed with stars', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(
        order: _order(status: 'DELIVERED', paymentStatus: 'PAID'),
        payment: const OrderPayment(status: 'PAID', amount: 4750),
        delivery: const OrderDelivery(id: 'd1', status: 'DELIVERED'),
      );
      final repository = _FakeRepository(details: {'o1': detail});

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Rate'));
      await tester.tap(find.text('Rate'));
      await tester.pumpAndSettle();

      expect(find.text('Review this item'), findsOneWidget);
      await tester.tap(find.byTooltip('5 stars'));
      await tester.pump();
      await tester.ensureVisible(find.text('Post review'));
      await tester.tap(find.text('Post review'));
      await tester.pumpAndSettle();

      final payload = repository.reviewPayload!;
      expect(payload['orderId'], 'o1');
      expect(payload['productId'], 'p1');
      expect(payload['rating'], 5);
      expect(find.text('Thanks for reviewing this item.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('order again adds every line to the basket', (tester) async {
      final prefs = await SharedPreferences.getInstance();
      final detail = OrderDetail(order: _order(status: 'DELIVERED'));
      final repository = _FakeRepository(details: {'o1': detail});
      final cart = CartController(repository);
      await cart.load();
      addTearDown(cart.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            cartProvider.overrideWith((ref) => cart),
            orderDetailProvider('o1').overrideWith((ref) async => detail),
            brandProvider('b1').overrideWith(
              (ref) async =>
                  const PublicBrand(id: 'b1', name: 'Loom & Co.', slug: 'loom'),
            ),
            myReviewsProvider('o1').overrideWith((ref) async => const []),
          ],
          home: const OrderDetailScreen(orderId: 'o1'),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Order again'), 250);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Order again'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Order again'));
      await tester.pumpAndSettle();

      expect(repository.addedQuantities, [1]);
      expect(find.text('1 item added to your basket.'), findsOneWidget);
      expect(find.text('View basket'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  test('the server order shape parses into the shopper models', () {
    final detail = OrderDetail.fromJson({
      'order': {
        '_id': 'o1',
        'orderNumber': 'CC-2026-000042',
        'brandId': 'b1',
        'items': [
          {
            '_id': 'i1',
            'productId': 'p1',
            'productName': 'Linen Kurta',
            'quantity': 2,
            'unitPrice': 4500,
            'totalPrice': 9000,
          },
        ],
        'shippingAddress': {
          'name': 'Sana Iqbal',
          'phone': '0300 1234567',
          'address': 'House 12, Street 4',
          'city': 'Lahore',
          'additionalInstructions': 'Gate on the left.',
        },
        'subtotal': 9000,
        'deliveryFee': 250,
        'total': 9250,
        'netTotal': 4750,
        'returnedAmount': 4500,
        'feeRefunded': true,
        'currency': 'PKR',
        'orderStatus': 'RETURNED',
        'paymentStatus': 'PAID',
        'fulfilment': 'PARTIAL',
        'statusHistory': [
          {'status': 'PENDING', 'at': '2026-11-10T10:00:00.000Z'},
          {'status': 'RETURNED', 'at': '2026-11-10T18:00:00.000Z'},
        ],
        'createdAt': '2026-11-10T10:00:00.000Z',
      },
      'payment': {
        '_id': 'pay1',
        'status': 'PAID',
        'method': 'COD',
        'amount': 4750,
        'currency': 'PKR',
        'paidAt': '2026-11-10T18:30:00.000Z',
        'collection': {'method': 'COD', 'wallet': 'JAZZCASH'},
      },
      'delivery': {
        '_id': 'd1',
        'status': 'OUT_FOR_DELIVERY',
        'trackingReference': 'TR-77',
        'assignedAgent': 'Ali',
        'paymentPending': true,
      },
      'adjustment': {
        '_id': 'a1',
        'status': 'PROPOSED',
        'note': 'Short on linen.',
        'proposedByRole': 'PICKER',
        'lines': [
          {
            'productName': 'Linen Kurta',
            'orderedQuantity': 2,
            'supplyQuantity': 1,
            'unitPrice': 4500,
            'substitute': {
              'productName': 'Cotton Kurta',
              'quantity': 1,
              'unitPrice': 4500,
            },
          },
        ],
        'totalsBefore': {'subtotal': 9000, 'total': 9250},
        'totalsAfter': {'subtotal': 4500, 'total': 4750},
        'totalsAfterRemoval': {'subtotal': 0, 'total': 0},
        'expiresAt': '2026-11-11T18:00:00.000Z',
      },
      'return': {
        'status': 'RECEIVED',
        'lines': [
          {
            'orderItemId': 'i1',
            'productName': 'Linen Kurta',
            'quantity': 1,
            'unitPrice': 4500,
            'reason': 'DAMAGED',
          },
        ],
        'returnedSubtotal': 4500,
        'feeRefunded': 250,
        'refundAmount': 4750,
        'currency': 'PKR',
      },
    });

    final order = detail.order;
    expect(order.orderNumber, 'CC-2026-000042');
    expect(order.items.single.totalPrice, 9000);
    expect(order.payableTotal, 4750);
    expect(order.itemCount, 2);
    expect(order.canCancel, isFalse);
    expect(order.isProblem, isTrue);
    expect(order.fulfilment, 'PARTIAL');
    expect(order.statusHistory.length, 2);

    final payment = detail.payment!;
    expect(payment.status, 'PAID');
    expect(payment.collectionWallet, 'JAZZCASH');

    final delivery = detail.delivery!;
    expect(delivery.codeVisible, isTrue);
    expect(delivery.hasTracking, isTrue);
    expect(delivery.paymentPending, isTrue);

    final adjustment = detail.adjustment!;
    expect(adjustment.isProposed, isTrue);
    expect(adjustment.proposedByLabel, 'a picker');
    expect(adjustment.lines.single.orderedQuantity, 2);
    expect(adjustment.lines.single.supplyQuantity, 1);
    expect(adjustment.lines.single.substitute!.productName, 'Cotton Kurta');
    expect(adjustment.totalsAfter.total, 4750);
    expect(adjustment.expiresAt, isNotNull);

    final returnDoc = detail.returnDoc!;
    expect(returnDoc.lines.single.reason, 'DAMAGED');
    expect(returnDoc.refundAmount, 4750);
    expect(returnDoc.byItem()['i1']!.quantity, 1);
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
