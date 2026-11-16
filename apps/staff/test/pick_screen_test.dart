import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/core/widgets.dart';
import 'package:citycart_staff/data/api_client.dart';
import 'package:citycart_staff/data/models.dart';
import 'package:citycart_staff/data/repository.dart';
import 'package:citycart_staff/data/session_store.dart';
import 'package:citycart_staff/features/picker/pick_screen.dart';
import 'package:citycart_staff/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

PickLine _line(
  String id,
  String name, {
  int quantity = 2,
  String? status,
  int? pickedQty,
}) {
  return PickLine(
    id: id,
    productName: name,
    quantity: quantity,
    pickStatus: status,
    pickedQty: pickedQty,
  );
}

PickOrder _order({
  bool claimedByMe = true,
  String status = 'PROCESSING',
  DateTime? packedAt,
  required List<PickLine> lines,
}) {
  return PickOrder(
    id: 'o1',
    orderNumber: 'CC-2026-000042',
    orderStatus: status,
    lines: lines,
    claimedByMe: claimedByMe,
    pickStartedAt: DateTime(2026, 11, 16, 9),
    packedAt: packedAt,
  );
}

class _FakeRepository extends StaffRepository {
  _FakeRepository(this.order) : super(ApiClient(SessionStore()));

  PickOrder order;
  final List<String> claimed = [];
  final List<List<Map<String, dynamic>>> proposals = [];
  final List<String> searches = [];
  List<ProductOption> catalogue = const [
    ProductOption(id: 'p1', name: 'Basmati Rice 5 kg', sku: 'RICE-5'),
    ProductOption(id: 'p2', name: 'Sunflower Oil 1 L', sku: 'OIL-1'),
  ];

  @override
  Future<PickOrder> pickerOrder(String orderId) async => order;

  @override
  Future<PickOrder> claimOrder(String orderId) async {
    claimed.add(orderId);
    order = _order(claimedByMe: true, lines: order.lines);
    return order;
  }

  @override
  Future<PickOrder> packOrder(String orderId) async {
    order = _order(
      claimedByMe: true,
      status: 'READY_FOR_SHIPMENT',
      packedAt: DateTime(2026, 11, 16, 10),
      lines: order.lines,
    );
    return order;
  }

  @override
  Future<void> proposeChange({
    required String orderId,
    required bool restockRemoved,
    String? note,
    List<Map<String, dynamic>> substitutes = const [],
  }) async {
    proposals.add(substitutes);
  }

  @override
  Future<Page<ProductOption>> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
  }) async {
    searches.add(query);
    final term = query.trim().toLowerCase();
    final items = term.isEmpty
        ? catalogue
        : catalogue
              .where((product) => product.name.toLowerCase().contains(term))
              .toList(growable: false);
    return Page(
      items: items,
      pagination: Pagination(page: 1, pages: 1, total: items.length),
    );
  }
}

Future<void> _pumpPick(
  WidgetTester tester,
  _FakeRepository repository, {
  double width = 360,
  double height = 780,
  double textScale = 1,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [staffRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: const PickScreen(orderId: 'o1'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  testWidgets('an unclaimed order offers one claim action only', (
    tester,
  ) async {
    final repository = _FakeRepository(
      _order(
        claimedByMe: false,
        lines: [_line('l1', 'Basmati Rice 5 kg', status: 'PICKED')],
      ),
    );
    await _pumpPick(tester, repository);

    expect(find.text('This order is free'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Claim this order'), findsOneWidget);

    await tester.tap(find.text('Claim this order'));
    await tester.pumpAndSettle();

    expect(repository.claimed, ['o1']);
    expect(find.text('Ready to pack'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Pack order'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a fully picked order packs once and then offers the way back', (
    tester,
  ) async {
    final repository = _FakeRepository(
      _order(
        lines: [
          _line('l1', 'Basmati Rice 5 kg', quantity: 2, status: 'PICKED'),
        ],
      ),
    );
    await _pumpPick(tester, repository);

    expect(find.text('Ready to pack'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Pack order'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Send change request'), findsNothing);

    await tester.tap(find.text('Pack order'));
    await tester.pumpAndSettle();

    expect(find.text('Order packed'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Back to queue'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Pack order'), findsNothing);
    expect(find.byTooltip('Back'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'unfinished checking disables the next step and says what is left',
    (tester) async {
      final repository = _FakeRepository(
        _order(
          lines: [
            _line('l1', 'Basmati Rice 5 kg', status: 'PICKED'),
            _line('l2', 'Sunflower Oil 1 L', status: 'SHORT', pickedQty: 1),
            _line('l3', 'Green Tea 100 bags'),
          ],
        ),
      );
      await _pumpPick(tester, repository);

      expect(find.text('2 of 3 checked'), findsOneWidget);
      expect(
        find.text('Mark the remaining 1 line as picked, short or not found.'),
        findsOneWidget,
      );
      final button = tester.widget<AppButton>(find.byType(AppButton));
      expect(button.label, 'Send change request');
      expect(button.onPressed, isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('a short line can be substituted from the store catalogue', (
    tester,
  ) async {
    final repository = _FakeRepository(
      _order(
        lines: [
          _line('l1', 'Basmati Rice 5 kg', status: 'PICKED'),
          _line(
            'l2',
            'White Bread',
            quantity: 3,
            status: 'SHORT',
            pickedQty: 1,
          ),
        ],
      ),
    );
    await _pumpPick(tester, repository);

    expect(find.text('Change needed'), findsOneWidget);
    await tester.tap(find.text('Send change request'));
    await tester.pumpAndSettle();

    expect(find.text('Send a change request'), findsOneWidget);
    await tester.ensureVisible(find.text('Choose a substitute'));
    await tester.tap(find.text('Choose a substitute'));
    await tester.pumpAndSettle();

    // The catalogue is loaded before any search is typed.
    expect(repository.searches, ['']);
    expect(find.text('Products in this store'), findsOneWidget);
    expect(find.text('Basmati Rice 5 kg'), findsWidgets);
    expect(find.text('Sunflower Oil 1 L'), findsOneWidget);

    await tester.tap(find.text('Sunflower Oil 1 L'));
    await tester.pumpAndSettle();

    expect(find.text('Substitute'), findsOneWidget);
    await tester.ensureVisible(find.text('Send to customer'));
    await tester.tap(find.text('Send to customer'));
    await tester.pumpAndSettle();

    expect(repository.proposals, hasLength(1));
    expect(repository.proposals.single, hasLength(1));
    expect(repository.proposals.single.single['productId'], 'p2');
    expect(repository.proposals.single.single['orderItemId'], 'l2');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a search with no match still offers the whole catalogue', (
    tester,
  ) async {
    final repository = _FakeRepository(
      _order(
        lines: [_line('l1', 'White Bread', quantity: 2, status: 'UNAVAILABLE')],
      ),
    );
    await _pumpPick(tester, repository);
    await tester.tap(find.text('Send change request'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Choose a substitute'));
    await tester.tap(find.text('Choose a substitute'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'not stocked anywhere');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(
      find.text('No products match “not stocked anywhere”.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Show all products'));
    await tester.pumpAndSettle();

    expect(find.text('Products in this store'), findsOneWidget);
    expect(find.text('Basmati Rice 5 kg'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the picker screen holds together on a narrow phone', (
    tester,
  ) async {
    final repository = _FakeRepository(
      _order(
        lines: [
          _line('l1', 'Basmati Rice 5 kg', status: 'PICKED'),
          _line('l2', 'Sunflower Oil 1 L', status: 'UNAVAILABLE'),
        ],
      ),
    );
    await _pumpPick(tester, repository, width: 320, textScale: 1.3);

    expect(find.text('Change needed'), findsOneWidget);
    expect(
      find.widgetWithText(AppButton, 'Send change request'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
