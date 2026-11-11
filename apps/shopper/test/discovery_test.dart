import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/chat/chat_thread_controller.dart';
import 'package:citycart_shopper/features/chat/chat_thread_screen.dart';
import 'package:citycart_shopper/features/explore/explore_controller.dart';
import 'package:citycart_shopper/features/explore/explore_screen.dart';
import 'package:citycart_shopper/features/product/product_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _city = AreaSelection(cityId: 'c1', cityName: 'Lahore');

const _shop = DiscoverBrand(
  id: 'b1',
  name: 'Loom & Co.',
  slug: 'loom',
  nearestKm: 1.2,
  branches: [DiscoverBranch(id: 'br1', name: 'Main', blockName: 'Gulberg')],
  products: [
    ProductSummary(
      id: 'p1',
      name: 'Linen Kurta',
      price: 4500,
      availability: 'IN_STOCK',
    ),
  ],
);

class _FakeRepository extends ShopperRepository {
  _FakeRepository({this.reviews, this.messages})
    : super(ApiClient(SessionStore()));

  final ProductReviewPage? reviews;
  final ChatMessagePage? messages;
  final List<String> sent = [];

  @override
  Future<DiscoverResult> discover({
    required AreaSelection area,
    int page = 1,
    int limit = 12,
    String? query,
  }) async {
    if ((query ?? '').trim().isNotEmpty) {
      return const DiscoverResult(
        items: [],
        pagination: Pagination(total: 0, pages: 1),
      );
    }
    return const DiscoverResult(
      items: [_shop],
      pagination: Pagination(total: 1, pages: 1),
    );
  }

  @override
  Future<ProductReviewPage> productReviews(
    String productId, {
    int page = 1,
    int limit = 10,
  }) async {
    return reviews ??
        const ProductReviewPage(reviews: [], summary: RatingSummary());
  }

  @override
  Future<ChatMessagePage> chatMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    return messages ?? const ChatMessagePage(messages: []);
  }

  @override
  Future<ChatMessage> sendChatMessage(
    String conversationId,
    String body, {
    String? productId,
  }) async {
    sent.add(body);
    return ChatMessage(
      id: 'm-sent',
      body: body,
      mine: true,
      createdAt: DateTime(2026, 11, 11, 10, 5),
    );
  }

  @override
  Future<void> markChatRead(String conversationId) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
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

    testWidgets('explore lists nearby shops and explains an empty search', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final controller = ExploreController(_FakeRepository(), _city);
      await controller.loadInitial();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            exploreProvider.overrideWith((ref) => controller),
          ],
          home: const ExploreScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('Explore'), findsOneWidget);
      expect(find.text('Loom & Co.'), findsOneWidget);
      expect(find.text('Rs 4,500'), findsOneWidget);
      expect(find.text('Taking orders'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'zzz');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();

      expect(find.text('Nothing matches "zzz"'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a product shows its price, details and verified reviews', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        reviews: ProductReviewPage(
          reviews: [
            ProductReview(
              id: 'r1',
              rating: 5,
              title: 'Beautiful linen',
              comment: 'Fits well and washes nicely.',
              reviewerName: 'Ayesha K.',
              verifiedPurchase: true,
              createdAt: DateTime(2026, 10, 2),
            ),
          ],
          summary: const RatingSummary(
            average: 4.5,
            count: 2,
            distribution: {5: 1, 4: 1},
          ),
        ),
      );

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            shopperRepositoryProvider.overrideWithValue(repository),
            productProvider('p1').overrideWith(
              (ref) async => const Product(
                id: 'p1',
                brandId: 'b1',
                name: 'Linen Kurta',
                description: 'Soft washed linen.',
                price: 4500,
                compareAtPrice: 6000,
                availability: 'IN_STOCK',
                attributes: {
                  'Fabric': 'Linen',
                  'Sizes': ['S', 'M', 'L'],
                },
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

      expect(find.text('Linen Kurta'), findsWidgets);
      expect(find.text('Rs 4,500'), findsOneWidget);
      expect(find.text('25% off'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Soft washed linen.'), 200);
      expect(find.text('Soft washed linen.'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Fabric'), 200);
      expect(find.text('Fabric'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Ayesha K.'), 200);
      expect(find.text('Ayesha K.'), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Beautiful linen'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a chat thread shows messages and sends a reply', (
      tester,
    ) async {
      final prefs = await SharedPreferences.getInstance();
      final repository = _FakeRepository(
        messages: ChatMessagePage(
          messages: [
            ChatMessage(
              id: 'm1',
              body: 'Is this available in medium?',
              mine: true,
              createdAt: DateTime(2026, 11, 11, 10),
            ),
            ChatMessage(
              id: 'm2',
              body: 'Yes, it is. We can send it today.',
              createdAt: DateTime(2026, 11, 11, 10, 2),
            ),
          ],
        ),
      );
      final controller = ChatThreadController(repository, 'c1');
      await controller.loadInitial();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        _app(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            chatThreadProvider('c1').overrideWith((ref) => controller),
          ],
          home: const ChatThreadScreen(
            conversationId: 'c1',
            title: 'Loom & Co.',
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Loom & Co.'), findsOneWidget);
      expect(find.text('Is this available in medium?'), findsOneWidget);
      expect(find.text('Yes, it is. We can send it today.'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Please send it today.');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pump();
      await tester.pump();

      expect(find.text('Please send it today.'), findsOneWidget);
      expect(repository.sent, ['Please send it today.']);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const SizedBox());
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
