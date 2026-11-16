import 'package:citycart_staff/core/permissions.dart';
import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/data/api_client.dart';
import 'package:citycart_staff/data/api_exception.dart';
import 'package:citycart_staff/data/models.dart';
import 'package:citycart_staff/data/repository.dart';
import 'package:citycart_staff/data/session_store.dart';
import 'package:citycart_staff/features/records/delivery_detail_screen.dart';
import 'package:citycart_staff/features/records/door_payment_card.dart';
import 'package:citycart_staff/features/records/order_detail_screen.dart';
import 'package:citycart_staff/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

const _access = StaffAccess(
  isPicker: false,
  orders: true,
  deliveries: true,
  returns: true,
  money: true,
  deliveryManage: true,
  paymentsManage: true,
  ridersView: true,
);

PaymentRecord _waitingPayment() => PaymentRecord(
  id: 'pay-1',
  status: 'PENDING',
  amount: 4850,
  method: 'BANK_TRANSFER',
  collectionMethod: 'BANK_TRANSFER',
  collectionReference: 'FT-771204',
  verification: 'SUBMITTED',
  proofAvailable: true,
  collectionSubmittedAt: DateTime.now().subtract(const Duration(minutes: 2)),
  collectionConfirmBy: DateTime.now().add(const Duration(minutes: 3)),
);

DeliveryRecord _heldDelivery() => const DeliveryRecord(
  id: 'del-1',
  status: 'OUT_FOR_DELIVERY',
  orderId: 'order-1',
  orderNumber: 'CC-2026-000042',
);

OrderDetailBundle _bundle(PaymentRecord payment) => OrderDetailBundle(
  order: OrderRecord(
    id: 'order-1',
    orderNumber: 'CC-2026-000042',
    orderStatus: 'OUT_FOR_DELIVERY',
    lines: const [
      OrderLine(
        productName: 'Basmati Rice 5 kg',
        quantity: 1,
        unitPrice: 4850,
        totalPrice: 4850,
      ),
    ],
    total: 4850,
    subtotal: 4850,
  ),
  payment: payment,
  delivery: _heldDelivery(),
);

class _FakeRepository extends StaffRepository {
  _FakeRepository({
    required this.bundle,
    required this.deliveryRecord,
    this.payment,
    this.paymentFails = false,
  }) : super(ApiClient(SessionStore()));

  final OrderDetailBundle bundle;
  final DeliveryRecord deliveryRecord;
  final PaymentRecord? payment;
  final bool paymentFails;

  @override
  Future<OrderDetailBundle> brandOrder(String orderId) async => bundle;

  @override
  Future<DeliveryRecord> delivery(String deliveryId) async => deliveryRecord;

  @override
  Future<PaymentRecord?> paymentForOrder(String orderId) async {
    if (paymentFails) {
      throw ApiException('Could not load the payment.', status: 500);
    }
    return payment;
  }
}

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  required _FakeRepository repository,
}) async {
  tester.view.physicalSize = const Size(320, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        staffRepositoryProvider.overrideWithValue(repository),
        accessProvider.overrideWithValue(_access),
      ],
      child: MaterialApp(theme: AppTheme.light, home: screen),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  group('DoorPaymentDetails', () {
    Future<void> pumpCard(
      WidgetTester tester,
      PaymentRecord payment, {
      bool paymentsManage = true,
      VoidCallback? onReviewProof,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: DoorPaymentDetails(
                payment: payment,
                paymentsManage: paymentsManage,
                onReviewProof: onReviewProof,
              ),
            ),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets(
      'a waiting non-cash payment explains the hold and offers a check',
      (tester) async {
        tester.view.physicalSize = const Size(320, 700);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await pumpCard(tester, _waitingPayment(), onReviewProof: () {});

        expect(find.text('Waiting for a check'), findsOneWidget);
        expect(find.text('Delivery held'), findsOneWidget);
        expect(find.text('Bank transfer'), findsOneWidget);
        expect(find.text('FT-771204'), findsOneWidget);
        expect(find.text('Review proof'), findsOneWidget);
        expect(find.textContaining('completes the delivery'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('a checked payment says the delivery is closed', (
      tester,
    ) async {
      await pumpCard(
        tester,
        PaymentRecord(
          id: 'pay-2',
          status: 'PAID',
          amount: 1200,
          collectionMethod: 'CARD_MACHINE',
          verification: 'VERIFIED',
        ),
      );

      expect(find.text('Checked'), findsOneWidget);
      expect(find.text('Review proof'), findsNothing);
      expect(find.textContaining('completed the delivery'), findsOneWidget);
    });

    testWidgets('cash reads as collected, without a proof action', (
      tester,
    ) async {
      await pumpCard(
        tester,
        PaymentRecord(
          id: 'pay-3',
          status: 'PAID',
          amount: 3000,
          method: 'COD',
          collectionMethod: 'CASH',
          paidAt: DateTime.now().subtract(const Duration(minutes: 5)),
        ),
      );

      expect(find.text('Paid in cash'), findsOneWidget);
      expect(find.text('Cash at the door'), findsOneWidget);
      expect(find.text('Review proof'), findsNothing);
    });

    testWidgets('checking is hidden without payment management access', (
      tester,
    ) async {
      await pumpCard(
        tester,
        _waitingPayment(),
        paymentsManage: false,
        onReviewProof: () {},
      );

      expect(find.text('Review proof'), findsNothing);
      expect(
        find.textContaining('needs payment management access'),
        findsOneWidget,
      );
    });
  });

  testWidgets('an order shows the waiting door payment and its check action', (
    tester,
  ) async {
    await _pump(
      tester,
      const OrderDetailScreen(orderId: 'order-1'),
      repository: _FakeRepository(
        bundle: _bundle(_waitingPayment()),
        deliveryRecord: _heldDelivery(),
      ),
    );

    expect(find.text('Waiting for a check'), findsOneWidget);
    expect(find.text('FT-771204'), findsOneWidget);
    expect(find.text('Review proof'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held delivery loads its payment even before completion', (
    tester,
  ) async {
    await _pump(
      tester,
      const DeliveryDetailScreen(deliveryId: 'del-1'),
      repository: _FakeRepository(
        bundle: _bundle(_waitingPayment()),
        deliveryRecord: _heldDelivery(),
        payment: _waitingPayment(),
      ),
    );

    expect(find.text('CUSTOMER PAYMENT'), findsOneWidget);
    expect(find.text('Delivery held'), findsOneWidget);
    expect(find.text('Review proof'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a failed payment lookup leaves the delivery readable', (
    tester,
  ) async {
    await _pump(
      tester,
      const DeliveryDetailScreen(deliveryId: 'del-1'),
      repository: _FakeRepository(
        bundle: _bundle(_waitingPayment()),
        deliveryRecord: _heldDelivery(),
        paymentFails: true,
      ),
    );

    expect(find.text('CUSTOMER PAYMENT'), findsNothing);
    expect(find.text('CC-2026-000042'), findsNWidgets(2));
    expect(find.text('DELIVERY ADDRESS'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
