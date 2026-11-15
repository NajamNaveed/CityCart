import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/api_exception.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/assistant/assistant_controller.dart';
import 'package:citycart_shopper/features/assistant/assistant_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _area = AreaSelection(cityId: 'c1', cityName: 'Faisalabad');

const _reply = ShopAssistantReply(
  reply: 'Roshan Home Care has a 5 kg bag for Rs 2,450.',
  products: [
    ProductSummary(
      id: 'p1',
      name: 'Super Kernel Rice 5kg',
      price: 2450,
      availability: 'LOW_STOCK',
      brandName: 'Roshan Home Care',
    ),
  ],
);

class _FakeRepository extends ShopperRepository {
  _FakeRepository({this.reply = _reply, this.failures = 0})
    : super(ApiClient(SessionStore()));

  final ShopAssistantReply reply;
  int failures;
  final List<String> asked = [];

  @override
  Future<ShopAssistantReply> askShopAssistant({
    required String message,
    String? cityId,
    double? latitude,
    double? longitude,
  }) async {
    asked.add(message);
    if (failures > 0) {
      failures--;
      throw ApiException(
        'You have reached today’s assistant limit. Try again tomorrow.',
        status: 429,
        code: 'AI_DAILY_LIMIT',
      );
    }
    return reply;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('assistant at 320 wide and 1.3 text', () {
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

    testWidgets('asks a question and shows the server’s product cards', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository();
      final controller = AssistantController(repository, _area);
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            assistantProvider.overrideWith((ref) => controller),
          ],
        ),
      );

      expect(find.text('What are you looking for?'), findsOneWidget);
      expect(find.text('Cheap rice'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'rice for a family of five');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      await tester.pump();
      await tester.pump();

      expect(find.text('rice for a family of five'), findsOneWidget);
      expect(
        find.text('Roshan Home Care has a 5 kg bag for Rs 2,450.'),
        findsOneWidget,
      );
      expect(find.text('Super Kernel Rice 5kg'), findsOneWidget);
      expect(find.text('Roshan Home Care'), findsOneWidget);
      expect(find.text('Rs 2,450'), findsOneWidget);
      expect(find.text('Low stock'), findsOneWidget);
      expect(repository.asked, ['rice for a family of five']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a degraded answer is labelled and still offers products', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        reply: const ShopAssistantReply(
          products: [
            ProductSummary(
              id: 'p2',
              name: 'Sunflower Oil 1L',
              price: 520,
              availability: 'IN_STOCK',
              brandName: 'Roshan Home Care',
            ),
          ],
          degraded: true,
        ),
      );
      final controller = AssistantController(repository, _area);
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            assistantProvider.overrideWith((ref) => controller),
          ],
        ),
      );

      await tester.enterText(find.byType(TextField), 'cheap oil');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      await tester.pump();
      await tester.pump();

      expect(find.text('Plain search results.'), findsOneWidget);
      expect(find.text('Sunflower Oil 1L'), findsOneWidget);
      expect(find.text('Rs 520'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed question can be retried without repeating it', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(failures: 1);
      final controller = AssistantController(repository, _area);
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            assistantProvider.overrideWith((ref) => controller),
          ],
        ),
      );

      await tester.enterText(find.byType(TextField), 'rice');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      await tester.pump();
      await tester.pump();

      expect(
        find.text('You have reached today’s assistant limit. Try again tomorrow.'),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);

      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Super Kernel Rice 5kg'), findsOneWidget);
      expect(find.text('rice'), findsOneWidget);
      expect(repository.asked, ['rice', 'rice']);
      expect(tester.takeException(), isNull);
    });
  });
}

Widget _app({required List<Override> overrides}) {
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
      home: const AssistantScreen(),
    ),
  );
}
