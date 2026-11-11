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
import 'package:citycart_business/features/availability/availability_screen.dart';
import 'package:citycart_business/features/bookings/booking_detail_screen.dart';
import 'package:citycart_business/features/bookings/bookings_screen.dart';
import 'package:citycart_business/features/brand_branches/brand_branches_screen.dart';
import 'package:citycart_business/features/brand_deliveries/brand_deliveries_screen.dart';
import 'package:citycart_business/features/brand_deliveries/brand_delivery_detail_screen.dart';
import 'package:citycart_business/features/brand_insights/brand_insights_screen.dart';
import 'package:citycart_business/features/brand_orders/brand_order_detail_screen.dart';
import 'package:citycart_business/features/brand_orders/brand_orders_screen.dart';
import 'package:citycart_business/features/brand_products/add_product_screen.dart';
import 'package:citycart_business/features/brand_products/brand_product_detail_screen.dart';
import 'package:citycart_business/features/brand_products/brand_products_screen.dart';
import 'package:citycart_business/features/brand_returns/brand_return_detail_screen.dart';
import 'package:citycart_business/features/brand_returns/brand_returns_screen.dart';
import 'package:citycart_business/features/brand_riders/brand_riders_screen.dart';
import 'package:citycart_business/features/brand_settings/brand_settings_screen.dart';
import 'package:citycart_business/features/brand_team/brand_team_screen.dart';
import 'package:citycart_business/features/home/home_screen.dart';
import 'package:citycart_business/features/messages/chat_thread_screen.dart';
import 'package:citycart_business/features/messages/messages_screen.dart';
import 'package:citycart_business/features/offerings/offerings_screen.dart';
import 'package:citycart_business/features/profile/provider_profile_screen.dart';
import 'package:citycart_business/features/reviews/reviews_screen.dart';
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

    test('shop owners cannot open provider service screens', () {
      for (final path in [
        '/offerings',
        '/availability',
        '/profile',
        '/messages',
        '/messages/job/bk1',
        '/reviews',
      ]) {
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: brandRole,
          ),
          '/home',
          reason: 'brand owners must not reach $path',
        );
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: providerRole,
          ),
          isNull,
        );
      }
    });

    test('providers cannot open shop order screens', () {
      for (final path in ['/brand-orders', '/brand-orders/o1']) {
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: providerRole,
          ),
          '/home',
          reason: 'provider accounts must not reach $path',
        );
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: brandRole,
          ),
          isNull,
        );
      }
    });

    test('providers cannot open shop delivery screens', () {
      for (final path in [
        '/brand-deliveries',
        '/brand-deliveries/d1',
        '/brand-returns',
        '/brand-returns/r1',
        '/brand-riders',
        '/brand-team',
        '/brand-branches',
        '/brand-insights',
        '/brand-settings',
      ]) {
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: providerRole,
          ),
          '/home',
          reason: 'provider accounts must not reach $path',
        );
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: brandRole,
          ),
          isNull,
        );
      }
    });

    test('providers cannot open shop product screens', () {
      for (final path in [
        '/brand-products',
        '/brand-products/add',
        '/brand-products/p1',
      ]) {
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: providerRole,
          ),
          '/home',
          reason: 'provider accounts must not reach $path',
        );
        expect(
          businessRedirect(
            status: SessionStatus.signedIn,
            location: path,
            role: brandRole,
          ),
          isNull,
        );
      }
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

    test('durations and clock minutes read naturally', () {
      expect(durationLabel(45), '45 min');
      expect(durationLabel(60), '1 hr');
      expect(durationLabel(90), '1 hr 30 min');
      expect(minuteLabel(540), '9:00 AM');
      expect(minuteLabel(1020), '5:00 PM');
      expect(minuteLabel(0), '12:00 AM');
    });

    test('greeting follows the local clock', () {
      expect(greetingFor(DateTime(2026, 1, 1, 8)), 'Good morning');
      expect(greetingFor(DateTime(2026, 1, 1, 14)), 'Good afternoon');
      expect(greetingFor(DateTime(2026, 1, 1, 20)), 'Good evening');
    });

    test('inbox times say today, yesterday and then a date', () {
      final now = DateTime(2026, 11, 11, 12);
      expect(chatTime(DateTime(2026, 11, 11, 9, 5)), startsWith('9:05'));
      expect(
        inboxTime(DateTime(2026, 11, 11, 9, 5), now: now),
        startsWith('9:05'),
      );
      expect(inboxTime(DateTime(2026, 11, 10, 18), now: now), 'Yesterday');
      expect(inboxTime(DateTime(2026, 11, 1, 18), now: now), '1 Nov');
      expect(inboxTime(DateTime(2025, 11, 1, 18), now: now), '1 Nov 2025');
    });
  });

  group('models', () {
    test('a provider profile reads its category, area and price', () {
      final profile = ProviderProfile.fromJson({
        '_id': 'p1',
        'displayName': 'Rapid Repairs',
        'status': 'ACTIVE',
        'category': {'name': 'Appliance repair'},
        'cityId': 'c1',
        'city': {'name': 'Faisalabad'},
        'blockId': 'bl1',
        'block': {'name': 'Gulberg'},
        'phone': '03001234567',
        'bio': 'We repair home appliances.',
        'ratingAvg': 4.8,
        'ratingCount': 12,
        'completedBookings': 30,
        'startingAtPrice': 150000,
      });

      expect(profile.displayName, 'Rapid Repairs');
      expect(profile.areaLabel, 'Gulberg, Faisalabad');
      expect(profile.isActive, isTrue);
      expect(profile.startingAtPrice, 150000);
      expect(profile.cityId, 'c1');
      expect(profile.blockId, 'bl1');
      expect(profile.bio, 'We repair home appliances.');
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

    test('a service offering reads its price, length and paused state', () {
      final offering = ServiceOffering.fromJson({
        '_id': 'o1',
        'title': 'AC repair visit',
        'description': 'Parts are extra.',
        'startingAtPrice': 150000,
        'durationMinutes': 60,
        'isActive': false,
        'images': ['https://example.com/ac.jpg'],
        'attributes': {'warranty': '30 days'},
      });

      expect(offering.title, 'AC repair visit');
      expect(offering.startingAtPricePaisa, 150000);
      expect(offering.durationMinutes, 60);
      expect(offering.isActive, isFalse);
      expect(offering.images, hasLength(1));
      expect(offering.attributes['warranty'], '30 days');
    });

    test('working hours group by day and count as published', () {
      final availability = ServiceAvailability.fromJson({
        'windows': [
          {
            'weekday': 1,
            'startMinute': 540,
            'endMinute': 1020,
            'slotMinutes': 60,
          },
          {
            'weekday': 3,
            'startMinute': 600,
            'endMinute': 900,
            'slotMinutes': 30,
          },
        ],
        'blackoutDates': ['2026-12-25'],
        'isPublished': true,
      });

      expect(availability.hasHours, isTrue);
      expect(availability.windowsFor(1), hasLength(1));
      expect(availability.windowsFor(1).first.dayName, 'Monday');
      expect(availability.windowsFor(2), isEmpty);
      expect(availability.blackoutDates, ['2026-12-25']);
      expect(weekdayName(3), 'Wednesday');
    });

    test('a provider inbox reads job chats and direct questions', () {
      final job = ProviderChatThread.fromBookingJson({
        '_id': 'cv1',
        'bookingId': 'bk1',
        'bookingNumber': 'SB-2026-000001',
        'serviceTitle': 'AC repair visit',
        'with': {'name': 'Sana Malik'},
        'lastMessagePreview': 'I am home now.',
        'lastMessageAt': '2026-11-11T09:30:00.000Z',
        'lastSenderRole': 'PROVIDER',
        'unread': 2,
      });
      final question = ProviderChatThread.fromDirectJson({
        '_id': 'cv2',
        'with': {'name': 'Bilal Ahmed'},
        'lastMessagePreview': 'Do you fix geysers?',
        'lastSenderRole': 'CUSTOMER',
      });

      expect(job.kind, ProviderChatKind.job);
      expect(job.routeId, 'bk1');
      expect(job.contextLabel, 'Job · AC repair visit · SB-2026-000001');
      expect(job.name, 'Sana Malik');
      expect(job.unread, 2);
      expect(job.lastFromMe, isTrue);
      expect(question.kind, ProviderChatKind.question);
      expect(question.routeId, 'cv2');
      expect(question.contextLabel, 'Question about your service');
      expect(question.lastFromMe, isFalse);
    });

    test('chat messages mark the owner’s own lines and system notes', () {
      final page = ChatMessagePage.fromJson({
        'messages': [
          {
            '_id': 'm1',
            'body': 'I am on my way.',
            'senderRole': 'PROVIDER',
            'mine': true,
            'createdAt': '2026-11-11T09:30:00.000Z',
          },
          {'_id': 'm2', 'body': 'Booking accepted.', 'senderRole': 'SYSTEM'},
        ],
        'hasMore': true,
      });

      expect(page.messages, hasLength(2));
      expect(page.messages.first.mine, isTrue);
      expect(page.messages.last.isSystem, isTrue);
      expect(page.hasMore, isTrue);
      expect(page.oldestId, 'm1');
    });

    test('reviews carry the summary, distribution and reply', () {
      final page = ProviderReviewPage.fromJson({
        'reviews': [
          {
            '_id': 'r1',
            'bookingId': 'bk1',
            'rating': 5,
            'comment': 'Quick and tidy.',
            'providerReply': {
              'body': 'Thank you!',
              'at': '2026-11-10T12:00:00.000Z',
            },
            'reviewerName': 'Sana Malik',
            'serviceTitle': 'AC repair visit',
          },
        ],
        'summary': {
          'average': 4.6,
          'count': 12,
          'distribution': {'1': 0, '2': 1, '3': 1, '4': 3, '5': 7},
        },
        'pagination': {'page': 1, 'limit': 10, 'pages': 2, 'total': 12},
      });

      final review = page.reviews.single;
      expect(review.rating, 5);
      expect(review.hasReply, isTrue);
      expect(review.providerReply?.body, 'Thank you!');
      expect(page.summary.average, 4.6);
      expect(page.summary.countFor(5), 7);
      expect(page.summary.shareFor(5), closeTo(7 / 12, 0.0001));
      expect(page.summary.shareFor(1), 0);
      expect(page.pagination.hasMore, isTrue);
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

    test('a brand order reads its items, totals, address and proposal', () {
      final detail = BrandOrderDetail.fromJson({
        'order': {
          '_id': 'o1',
          'orderNumber': 'CC-2026-000001',
          'orderStatus': 'PENDING',
          'paymentStatus': 'PENDING',
          'paymentMethod': 'COD',
          'subtotal': 5000,
          'deliveryFee': 150,
          'discount': 50,
          'total': 5100,
          'createdAt': '2026-11-11T09:30:00.000Z',
          'items': [
            {
              'productId': 'p1',
              'productName': 'Cotton kurta',
              'sku': 'K-1',
              'quantity': 2,
              'unitPrice': 2500,
              'totalPrice': 5000,
            },
          ],
          'shippingAddress': {
            'name': 'Sana Malik',
            'phone': '03001234567',
            'address': 'House 12, Street 4',
            'city': 'Faisalabad',
            'state': 'Punjab',
            'postalCode': '38000',
            'additionalInstructions': 'Call on arrival.',
          },
          'statusHistory': [
            {'status': 'PENDING', 'at': '2026-11-11T09:30:00.000Z'},
          ],
        },
        'payment': {'status': 'PENDING', 'method': 'COD', 'amount': 5100},
        'delivery': {
          '_id': 'd1',
          'status': 'PENDING',
          'assignedAgent': 'Bilal Ahmed',
        },
        'adjustment': {
          '_id': 'a1',
          'status': 'PROPOSED',
          'note': 'Only 1 kurta is left.',
        },
        'adjustments': [
          {'_id': 'a1', 'status': 'PROPOSED', 'note': 'Only 1 kurta is left.'},
        ],
      });

      final order = detail.order;
      expect(order.orderNumber, 'CC-2026-000001');
      expect(order.itemCount, 2);
      expect(order.totalPaisa, 510000);
      expect(order.isAwaitingAnswer, isTrue);
      expect(order.shippingAddress?.cityLine, 'Faisalabad, Punjab, 38000');
      expect(order.shippingAddress?.additionalInstructions, 'Call on arrival.');
      expect(detail.payment?.amountPaisa, 510000);
      expect(detail.delivery?.assignedAgent, 'Bilal Ahmed');
      expect(detail.pendingAdjustment?.id, 'a1');
      expect(detail.adjustments, hasLength(1));
      expect(brandOrderStatusLabel('READY_FOR_SHIPMENT'), 'Ready to ship');
      expect(brandOrderStatusDetail('PENDING'), contains('Confirm'));
      expect(paymentStatusLabel('PENDING'), 'Unpaid');
      expect(paymentMethodLabel('COD'), 'Cash on delivery');
    });

    test('a shop product reads rupee prices, state and stock', () {
      final detail = BrandProductDetail.fromJson({
        'product': {
          '_id': 'p1',
          'name': 'Cotton kurta',
          'status': 'ACTIVE',
          'isActive': true,
          'price': 2500.0,
          'compareAtPrice': 3000.5,
          'sku': 'KURTA-M',
          'images': ['https://example.com/kurta.jpg'],
        },
        'inventory': {
          'quantity': 12,
          'reservedQuantity': 2,
          'availableQuantity': 10,
          'lowStockThreshold': 3,
          'trackInventory': true,
          'stockStatus': 'IN_STOCK',
        },
      });

      expect(detail.product.pricePaisa, 250000);
      expect(detail.product.compareAtPricePaisa, 300050);
      expect(detail.product.isLive, isTrue);
      expect(detail.product.image, 'https://example.com/kurta.jpg');
      expect(detail.stock?.availableQuantity, 10);
      expect(stockQuantityLabel(detail.stock), '10 items left');
      expect(stockStatusLabel('LOW_STOCK'), 'Running low');
      expect(productStatusLabel('DRAFT'), 'Draft');

      final item = CatalogItem.fromJson({
        '_id': 'c1',
        'name': 'Dalda Ghee 1 kg',
        'manufacturer': 'Dalda',
        'size': {'value': 1, 'unit': 'kg'},
      });
      expect(item.manufacturer, 'Dalda');
      expect(item.sizeLabel, '1 kg');
    });

    test('deliveries, riders and returns read rupee amounts', () {
      final delivery = BrandDelivery.fromJson({
        '_id': 'd1',
        'orderId': 'o1',
        'orderNumber': 'CC-2026-000001',
        'status': 'OUT_FOR_DELIVERY',
        'deliveryFee': 64.97,
        'riderId': 'r1',
        'assignedAgent': 'Bilal Ahmed',
        'address': {
          'name': 'Sana Malik',
          'phone': '03001234567',
          'address': 'House 12, Street 4',
          'city': 'Faisalabad',
          'state': 'Punjab',
        },
      });
      expect(delivery.deliveryFeePaisa, 6497);
      expect(delivery.hasRider, isTrue);
      expect(delivery.isFinal, isFalse);
      expect(delivery.address?.name, 'Sana Malik');
      expect(brandDeliveryStatusLabel('OUT_FOR_DELIVERY'), 'Out for delivery');
      expect(brandDeliveryNextStatuses('OUT_FOR_DELIVERY'), [
        'DELIVERED',
        'FAILED',
      ]);
      expect(brandDeliveryNextStatuses('DELIVERED'), isEmpty);

      final entry = BrandReturn.fromJson({
        '_id': 'r1',
        'orderId': 'o1',
        'orderNumber': 'CC-2026-000001',
        'status': 'IN_TRANSIT',
        'source': 'DOOR',
        'returnedSubtotal': 241,
        'refundAmount': 12.5,
        'feeRefunded': true,
        'lines': [
          {
            'orderItemId': 'i1',
            'productName': 'Cotton kurta',
            'quantity': 2,
            'unitPrice': 120.5,
            'reason': 'DAMAGED',
            'restock': false,
            'hasPhoto': true,
          },
        ],
      });
      expect(entry.totalUnits, 2);
      expect(entry.lines.first.unitPricePaisa, 12050);
      expect(entry.lines.first.lineTotalPaisa, 24100);
      expect(entry.returnedSubtotalPaisa, 24100);
      expect(entry.refundAmountPaisa, 1250);
      expect(entry.lines.first.hasPhoto, isTrue);
      expect(returnStatusLabel('IN_TRANSIT'), 'On the way back');
      expect(returnReasonLabel('WRONG_ITEM'), 'Wrong item');

      final summary = BrandReturnSummary.fromJson({
        'IN_TRANSIT': {'count': 2, 'returnedSubtotal': 300.25},
        'RECEIVED': {'count': 1, 'returnedSubtotal': 100},
        'returnedSubtotal': 400.25,
        'refundAmount': 50.5,
      });
      expect(summary.inTransitCount, 2);
      expect(summary.inTransitSubtotalPaisa, 30025);
      expect(summary.receivedCount, 1);
      expect(summary.returnedSubtotalPaisa, 40025);
      expect(summary.refundAmountPaisa, 5050);

      final rider = BrandRider.fromJson({
        '_id': 'r1',
        'name': 'Bilal Ahmed',
        'email': 'bilal@example.com',
        'phone': '03001234567',
        'isActive': false,
      });
      expect(rider.isActive, isFalse);
      expect(rider.phone, '03001234567');
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
      expect(find.text('Messages'), findsOneWidget);
      expect(find.text('Reviews'), findsOneWidget);
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

    testWidgets('services show their price and a new one can be added', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        offerings: [_sampleOffering()],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const OfferingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('AC repair visit'), findsOneWidget);
      expect(find.text('From Rs 1,500 · 1 hr'), findsOneWidget);
      expect(find.text('Live'), findsOneWidget);

      await tester.tap(find.byKey(const Key('offering_add')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('offering_title')),
        'Geyser repair',
      );
      await tester.enterText(find.byKey(const Key('offering_price')), '2200');
      await tester.enterText(find.byKey(const Key('offering_duration')), '90');
      final submit = find.byKey(const Key('offering_save'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.createdOfferingTitle, 'Geyser repair');
      expect(fake.createdOfferingPrice, 220000);
      expect(fake.createdOfferingDuration, 90);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a service can be paused after confirming', (tester) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        offerings: [_sampleOffering()],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const OfferingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('offering_toggle_o1')));
      await tester.pumpAndSettle();
      expect(find.text('Pause this service?'), findsOneWidget);

      await tester.tap(find.text('Pause service'));
      await tester.pumpAndSettle();

      expect(fake.deactivatedOfferingId, 'o1');
      expect(tester.takeException(), isNull);
    });

    testWidgets('working hours and days off are shown and saved', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        availability: const ServiceAvailability(
          windows: [
            AvailabilityWindow(
              weekday: 1,
              startMinute: 540,
              endMinute: 1020,
              slotMinutes: 60,
            ),
          ],
          blackoutDates: ['2026-12-25'],
          isPublished: true,
        ),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const AvailabilityScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Monday'), findsOneWidget);
      expect(find.text('9:00 AM – 5:00 PM'), findsOneWidget);
      expect(find.text('1 hr slots'), findsOneWidget);
      expect(find.text('Friday 25 December'), findsOneWidget);

      await tester.tap(find.byKey(const Key('availability_remove_1_540')));
      await tester.pumpAndSettle();
      expect(find.text('9:00 AM – 5:00 PM'), findsNothing);

      final save = find.byKey(const Key('availability_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.savedWindows, isEmpty);
      expect(fake.savedBlackouts, ['2026-12-25']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('hours can be added for a weekday and saved', (tester) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const AvailabilityScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('You have not set hours yet'), findsOneWidget);
      final addHours = find.byKey(const Key('availability_add_empty'));
      await tester.ensureVisible(addHours);
      await tester.pumpAndSettle();
      await tester.tap(addHours);
      await tester.pumpAndSettle();

      final submit = find.byKey(const Key('availability_add_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(find.text('Monday'), findsOneWidget);
      expect(find.text('9:00 AM – 5:00 PM'), findsOneWidget);

      final save = find.byKey(const Key('availability_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.savedWindows, hasLength(1));
      expect(fake.savedWindows!.first.weekday, 1);
      expect(fake.savedWindows!.first.slotMinutes, 60);
      expect(tester.takeException(), isNull);
    });

    testWidgets('profile details and the service area can be changed', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        blocks: const [
          BlockOption(
            id: 'bl1',
            name: 'Gulberg',
            latitude: 31.5,
            longitude: 73.1,
          ),
          BlockOption(
            id: 'bl2',
            name: 'Peoples Colony',
            latitude: 31.4,
            longitude: 73.0,
          ),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const ProviderProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Rapid Repairs'), findsWidgets);
      await tester.enterText(
        find.byKey(const Key('profile_display_name')),
        'Rapid Home Repairs',
      );
      await tester.enterText(find.byKey(const Key('profile_price')), '1800');
      final save = find.byKey(const Key('profile_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.updatedDisplayName, 'Rapid Home Repairs');
      expect(fake.updatedPricePaisa, 180000);

      final area = find.byKey(const Key('profile_change_area'));
      await tester.ensureVisible(area);
      await tester.pumpAndSettle();
      await tester.tap(area);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('area_block_bl2')));
      await tester.pumpAndSettle();
      final apply = find.byKey(const Key('area_save'));
      await tester.ensureVisible(apply);
      await tester.pumpAndSettle();
      await tester.tap(apply);
      await tester.pumpAndSettle();

      expect(fake.changedBlockId, 'bl2');
      expect(fake.changedLatitude, 31.4);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the inbox mixes job chats and questions', (tester) async {
      final (container, _) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        chats: _sampleChats(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const MessagesScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sana Malik'), findsOneWidget);
      expect(find.text('Bilal Ahmed'), findsOneWidget);
      expect(find.text('2 new'), findsOneWidget);
      expect(find.textContaining('Job · AC repair visit'), findsOneWidget);
      expect(find.text('Do you fix geysers?'), findsOneWidget);

      await tester.tap(find.byKey(const Key('messages_filter_question')));
      await tester.pumpAndSettle();

      expect(find.text('Sana Malik'), findsNothing);
      expect(find.text('Bilal Ahmed'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a job chat loads, marks read and sends a reply', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        chatMessages: _sampleMessages(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            ProviderChatScreen(
              kind: ProviderChatKind.job,
              routeId: 'bk1',
              initial: _sampleChats().first,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sana Malik'), findsOneWidget);
      expect(find.text('Salam, when will you arrive?'), findsOneWidget);
      expect(find.text('I am on my way.'), findsOneWidget);
      expect(find.text('Load earlier messages'), findsOneWidget);
      expect(fake.markedReadId, 'bk1');

      await tester.enterText(
        find.byKey(const Key('chat_input')),
        'See you in 10 minutes.',
      );
      await tester.tap(find.byKey(const Key('chat_send')));
      await tester.pumpAndSettle();

      expect(fake.sentChatRouteId, 'bk1');
      expect(fake.sentChatBody, 'See you in 10 minutes.');
      expect(find.text('See you in 10 minutes.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('reviews show the summary and accept one reply', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        reviewPage: _sampleReviewPage(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const ReviewsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('4.6'), findsOneWidget);
      expect(find.text('from 12 reviews'), findsOneWidget);
      expect(find.text('Sana Malik'), findsOneWidget);
      expect(find.text('Quick and tidy.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('reviews_filter_5')));
      await tester.pumpAndSettle();
      expect(fake.lastReviewRating, 5);

      final reply = find.byKey(const Key('review_reply_r1'));
      await tester.ensureVisible(reply);
      await tester.pumpAndSettle();
      await tester.tap(reply);
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField), 'Thank you, Sana!');
      final submit = find.byKey(const Key('review_reply_submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(fake.repliedReviewId, 'r1');
      expect(fake.repliedReviewBody, 'Thank you, Sana!');
      expect(find.text('Reply posted.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('home opens the inbox and a job chat', (tester) async {
      final (container, _) = await _signedInWithFake(
        user: _providerUser,
        profile: _profile,
        chats: _sampleChats(),
        chatMessages: _sampleMessages(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const CityCartBusinessApp(),
        ),
      );
      await tester.pumpAndSettle();

      final messages = find.byKey(const Key('home_messages'));
      await tester.ensureVisible(messages);
      await tester.pumpAndSettle();
      await tester.tap(messages);
      await tester.pumpAndSettle();

      expect(find.text('Customer messages'), findsOneWidget);
      expect(find.text('Bilal Ahmed'), findsOneWidget);

      final job = find.byKey(const Key('chat_row_job_bk1'));
      await tester.ensureVisible(job);
      await tester.pumpAndSettle();
      await tester.tap(job);
      await tester.pumpAndSettle();

      expect(find.text('Salam, when will you arrive?'), findsOneWidget);
      expect(find.text('Sana Malik'), findsOneWidget);
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

    testWidgets('a shop home shows orders and opens the latest one', (
      tester,
    ) async {
      final orders = _sampleBrandOrders();
      final (container, _) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        orders: orders,
        orderDetail: BrandOrderDetail(order: orders.first),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const CityCartBusinessApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('2'), findsOneWidget);
      expect(find.text('orders to confirm'), findsOneWidget);
      expect(find.text('orders in total'), findsOneWidget);
      expect(find.text('CC-2026-000001'), findsWidgets);

      final openOrders = find.byKey(const Key('home_orders'));
      await tester.ensureVisible(openOrders);
      await tester.pumpAndSettle();
      await tester.tap(openOrders);
      await tester.pumpAndSettle();

      expect(find.text('Customer orders'), findsOneWidget);
      expect(find.byKey(const Key('brand_order_card_o1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('brand_order_card_o1')));
      await tester.pumpAndSettle();

      expect(find.text('Order details'), findsOneWidget);
      expect(find.text('Confirm order'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shop orders filter by state', (tester) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        orders: _sampleBrandOrders(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandOrdersScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CC-2026-000001'), findsOneWidget);
      expect(find.text('CC-2026-000002'), findsOneWidget);

      await tester.tap(find.byKey(const Key('brand_order_filter_confirmed')));
      await tester.pumpAndSettle();

      expect(fake.lastOrderStatus, 'CONFIRMED');
      expect(find.text('CC-2026-000002'), findsOneWidget);
      expect(find.text('CC-2026-000001'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a new order is confirmed after a plain approval', (
      tester,
    ) async {
      final order = _sampleBrandOrder();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        orders: [order],
        orderDetail: BrandOrderDetail(order: order),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(BrandOrderDetailScreen(orderId: 'o1', initial: order)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Confirm order'), findsOneWidget);
      await tester.tap(find.byKey(const Key('order_confirm')));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.text('The stock stays reserved for this customer.'),
        findsOneWidget,
      );

      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Confirm order'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.updatedOrderId, 'o1');
      expect(fake.updatedOrderStatus, 'CONFIRMED');
      expect(find.text('Order confirmed.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('rejecting an order warns before returning stock', (
      tester,
    ) async {
      final order = _sampleBrandOrder();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        orders: [order],
        orderDetail: BrandOrderDetail(order: order),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(BrandOrderDetailScreen(orderId: 'o1', initial: order)),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('order_reject')));
      await tester.pumpAndSettle();

      expect(find.textContaining('goes back into stock'), findsOneWidget);

      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Reject order'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.updatedOrderStatus, 'REJECTED');
      expect(find.text('Order rejected and stock returned.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a waiting change proposal blocks shipping until withdrawn', (
      tester,
    ) async {
      final order = _sampleBrandOrder(
        id: 'o3',
        number: 'CC-2026-000003',
        status: 'PROCESSING',
      );
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        orders: [order],
        orderDetail: BrandOrderDetail(
          order: order,
          pendingAdjustment: const BrandOrderAdjustment(
            id: 'a1',
            note: 'Only 2 left.',
          ),
        ),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(BrandOrderDetailScreen(orderId: 'o3', initial: order)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('order_adjustment_notice')), findsOneWidget);
      final readyButton = tester.widget<ElevatedButton>(
        find.descendant(
          of: find.byKey(const Key('order_ready')),
          matching: find.byType(ElevatedButton),
        ),
      );
      expect(readyButton.onPressed, isNull);

      await tester.tap(find.byKey(const Key('order_withdraw_adjustment')));
      await tester.pumpAndSettle();

      expect(find.text('Withdraw the change proposal?'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Withdraw'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.withdrawnOrderId, 'o3');
      expect(fake.withdrawnAdjustmentId, 'a1');
      expect(find.text('Proposal withdrawn.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('products show price, stock and filter by state', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        products: _sampleProducts(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandProductsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cotton kurta'), findsOneWidget);
      expect(find.text('Silk scarf'), findsOneWidget);
      expect(find.text('Rs 2,500'), findsOneWidget);
      expect(find.text('10 items left · KURTA-M'), findsOneWidget);

      await tester.tap(find.byKey(const Key('brand_product_filter_draft')));
      await tester.pumpAndSettle();

      expect(fake.lastProductStatus, 'DRAFT');
      expect(find.text('Silk scarf'), findsOneWidget);
      expect(find.text('Cotton kurta'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a price and product code can be changed', (tester) async {
      final product = _sampleProduct();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        products: [product],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandProductDetailScreen(productId: 'p1', initial: product),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final edit = find.byKey(const Key('product_edit_price'));
      await tester.ensureVisible(edit);
      await tester.pumpAndSettle();
      await tester.tap(edit);
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('product_price')), '2750');
      await tester.enterText(find.byKey(const Key('product_sku')), 'KURTA-L');
      final save = find.byKey(const Key('product_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.updatedProductPrice, 275000);
      expect(fake.updatedProductSku, 'KURTA-L');
      expect(find.text('Price updated.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('stock is added with a reason', (tester) async {
      final product = _sampleProduct();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        products: [product],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandProductDetailScreen(productId: 'p1', initial: product),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final add = find.byKey(const Key('stock_add'));
      await tester.ensureVisible(add);
      await tester.pumpAndSettle();
      await tester.tap(add);
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('stock_quantity')), '5');
      final save = find.byKey(const Key('stock_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.adjustedStockChange, 5);
      expect(fake.adjustedStockReason, 'STOCK_RECEIVED');
      expect(find.text('5 added to stock.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('hiding a live product asks first', (tester) async {
      final product = _sampleProduct();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        products: [product],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandProductDetailScreen(productId: 'p1', initial: product),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final visibility = find.byKey(const Key('product_visibility'));
      await tester.ensureVisible(visibility);
      await tester.pumpAndSettle();
      await tester.tap(visibility);
      await tester.pumpAndSettle();

      expect(find.text('Hide this product?'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Hide product'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.updatedProductStatus, 'INACTIVE');
      expect(fake.updatedProductActive, isFalse);
      expect(find.text('Product hidden.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an item from the catalogue is added at the shop price', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        catalog: _catalogItems,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _routeHarness(const AddProductScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('open_screen')));
      await tester.pumpAndSettle();

      expect(find.text('Dalda Ghee 1 kg'), findsOneWidget);
      await tester.tap(find.byKey(const Key('catalog_item_c1')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('add_price')), '1200');
      await tester.pumpAndSettle();
      final save = find.byKey(const Key('add_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.addedCatalogId, 'c1');
      expect(fake.addedPricePaisa, 120000);
      expect(fake.addedStatus, 'ACTIVE');
      expect(tester.takeException(), isNull);
    });

    testWidgets('deliveries show the parcel, the rider and the stage', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        deliveries: _sampleDeliveries(),
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandDeliveriesScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CC-2026-000001'), findsOneWidget);
      expect(find.text('Out for delivery'), findsOneWidget);
      expect(find.text('Bilal Ahmed'), findsWidgets);
      expect(find.text('No rider yet'), findsOneWidget);

      await tester.dragUntilVisible(
        find.byKey(const Key('delivery_filter_failed')),
        find.byKey(const Key('delivery_filters')),
        const Offset(-140, 0),
      );
      await tester.tap(find.byKey(const Key('delivery_filter_failed')));
      await tester.pumpAndSettle();

      expect(fake.lastDeliveryStatus, 'FAILED');
      expect(find.text('CC-2026-000003'), findsOneWidget);
      expect(find.text('CC-2026-000001'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a delivery is completed after the shop confirms', (
      tester,
    ) async {
      final delivery = _sampleDelivery();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        deliveries: [delivery],
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandDeliveryDetailScreen(deliveryId: 'd1', initial: delivery),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('delivery_move_delivered')));
      await tester.pumpAndSettle();

      expect(find.text('Mark delivered?'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Mark delivered'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.updatedDeliveryId, 'd1');
      expect(fake.updatedDeliveryStatus, 'DELIVERED');
      expect(find.text('Delivery completed.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed attempt keeps the reason with the delivery', (
      tester,
    ) async {
      final delivery = _sampleDelivery();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        deliveries: [delivery],
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandDeliveryDetailScreen(deliveryId: 'd1', initial: delivery),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('delivery_fail')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('delivery_failure_reason')),
        'Nobody home',
      );
      await tester.pumpAndSettle();
      final save = find.byKey(const Key('delivery_failure_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.updatedDeliveryStatus, 'FAILED');
      expect(fake.updatedDeliveryFailure, 'Nobody home');
      expect(find.text('Failed attempt recorded.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a rider is assigned from the delivery screen', (tester) async {
      final delivery = _sampleDelivery(
        status: 'PICKED_UP',
        riderId: '',
        assignedAgent: '',
      );
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        deliveries: [delivery],
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandDeliveryDetailScreen(deliveryId: 'd1', initial: delivery),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final assign = find.byKey(const Key('delivery_assign_rider'));
      await tester.ensureVisible(assign);
      await tester.pumpAndSettle();
      await tester.tap(assign);
      await tester.pumpAndSettle();

      expect(find.text('Who will deliver?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('rider_choice_r1')));
      await tester.pumpAndSettle();

      expect(fake.assignedDeliveryId, 'd1');
      expect(fake.assignedRiderId, 'r1');
      expect(find.text('Rider assigned.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('riders are filtered and turned off with a warning', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandRidersScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Bilal Ahmed'), findsOneWidget);
      expect(find.text('Nadia Iqbal'), findsNothing);

      await tester.tap(find.byKey(const Key('rider_filter_off')));
      await tester.pumpAndSettle();
      expect(fake.lastRiderActive, isFalse);
      expect(find.text('Nadia Iqbal'), findsOneWidget);
      expect(find.text('Bilal Ahmed'), findsNothing);

      await tester.tap(find.byKey(const Key('rider_actions_r2')));
      await tester.pumpAndSettle();
      expect(find.text('Turn rider on'), findsOneWidget);
      await tester.tap(find.byKey(const Key('rider_action_toggle')));
      await tester.pumpAndSettle();

      expect(find.text('Turn Nadia Iqbal on?'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Turn on'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.updatedRiderId, 'r2');
      expect(fake.updatedRiderActive, isTrue);
      expect(find.text('Nadia Iqbal can deliver again.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a rider is added with a sign-in the shop sets', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        riders: _sampleRiders,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandRidersScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('add_rider')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('rider_name')),
        'Ayesha Noor',
      );
      await tester.enterText(
        find.byKey(const Key('rider_phone')),
        '03211234567',
      );
      await tester.enterText(
        find.byKey(const Key('rider_email')),
        'ayesha@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('rider_password')),
        'secret123',
      );
      await tester.pumpAndSettle();
      final save = find.byKey(const Key('rider_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.createdRiderName, 'Ayesha Noor');
      expect(fake.createdRiderEmail, 'ayesha@example.com');
      expect(fake.createdRiderPhone, '03211234567');
      expect(fake.createdRiderPassword, 'secret123');
      expect(find.text('Ayesha Noor can now sign in.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('returns show totals and filter by stage', (tester) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        returns: _sampleReturns(),
        returnSummary: _returnSummary,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandReturnsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('parcel coming back'), findsOneWidget);
      expect(find.text('return received'), findsOneWidget);
      expect(find.text('Value of returned goods'), findsOneWidget);
      expect(find.text('Refunded to customers'), findsOneWidget);
      expect(find.text('Rs 662'), findsNWidgets(2));
      expect(find.byKey(const Key('return_card_rt1')), findsOneWidget);
      expect(find.byKey(const Key('return_card_rt2')), findsOneWidget);

      await tester.dragUntilVisible(
        find.byKey(const Key('return_filter_received')),
        find.byKey(const Key('return_filters')),
        const Offset(-140, 0),
      );
      await tester.ensureVisible(
        find.byKey(const Key('return_filter_received')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('return_filter_received')));
      await tester.pumpAndSettle();

      expect(fake.lastReturnStatus, 'RECEIVED');
      expect(find.byKey(const Key('return_card_rt2')), findsOneWidget);
      expect(find.byKey(const Key('return_card_rt1')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('receiving a return restocks only the chosen lines', (
      tester,
    ) async {
      final entry = _sampleReturn();
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        returns: [entry],
        returnSummary: _returnSummary,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(
            BrandReturnDetailScreen(returnId: 'rt1', initial: entry),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cotton kurta'), findsOneWidget);
      expect(find.text('Silk scarf'), findsOneWidget);
      expect(find.text('Damaged'), findsOneWidget);
      expect(find.text('Photo attached'), findsOneWidget);

      final restock = find.byKey(const Key('return_restock_1'));
      await tester.ensureVisible(restock);
      await tester.pumpAndSettle();
      await tester.tap(restock);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('return_receive')));
      await tester.pumpAndSettle();

      expect(find.text('Receive these goods?'), findsOneWidget);
      expect(
        find.textContaining('1 line goes back into stock'),
        findsOneWidget,
      );
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Receive goods'),
        ),
      );
      await tester.pumpAndSettle();

      expect(fake.receivedReturnId, 'rt1');
      expect(fake.receivedRestock, {0: false, 1: true});
      expect(find.text('Goods received.'), findsOneWidget);
      expect(find.byKey(const Key('return_received_notice')), findsOneWidget);
      expect(find.text('Back in stock'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('team access is filtered and a member gets a sign-in', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        shopProfile: _sampleShopProfile(),
        team: _sampleTeam(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandTeamScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Ayesha Khan'), findsOneWidget);
      expect(find.text('Imran Ali'), findsOneWidget);
      expect(find.text('Sana Yousaf'), findsNothing);

      await tester.dragUntilVisible(
        find.byKey(const Key('team_filter_removed')),
        find.byKey(const Key('team_filters')),
        const Offset(-140, 0),
      );
      await tester.ensureVisible(find.byKey(const Key('team_filter_removed')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('team_filter_removed')));
      await tester.pumpAndSettle();

      expect(fake.lastTeamActive, isFalse);
      expect(find.text('Sana Yousaf'), findsOneWidget);
      expect(find.text('Ayesha Khan'), findsNothing);

      await tester.dragUntilVisible(
        find.byKey(const Key('team_filter_active')),
        find.byKey(const Key('team_filters')),
        const Offset(140, 0),
      );
      await tester.ensureVisible(find.byKey(const Key('team_filter_active')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('team_filter_active')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('add_team_member')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('team_name')), 'Nadia Iqbal');
      await tester.enterText(
        find.byKey(const Key('team_email')),
        'nadia@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('team_password')),
        'secret123',
      );
      await tester.pumpAndSettle();

      final permission = find.byKey(const Key('team_permission_orders.view'));
      await tester.ensureVisible(permission);
      await tester.pumpAndSettle();
      await tester.tap(permission);
      await tester.pumpAndSettle();

      final save = find.byKey(const Key('team_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.createdTeamName, 'Nadia Iqbal');
      expect(fake.createdTeamEmail, 'nadia@example.com');
      expect(fake.createdTeamPassword, 'secret123');
      expect(fake.createdTeamRole, 'BRAND_EMPLOYEE');
      expect(fake.createdTeamPermissions, contains('orders.view'));
      expect(find.text('Nadia Iqbal can now sign in.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('branches are added in an area and closed with a warning', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        shopProfile: _sampleShopProfile(),
        branches: _sampleBranches,
        branchBlocks: _sampleBlocks,
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandBranchesScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Gulberg shop'), findsOneWidget);
      expect(find.text('DHA shop'), findsOneWidget);

      await tester.tap(find.byKey(const Key('branch_actions_br1')));
      await tester.pumpAndSettle();
      expect(find.text('Close Gulberg shop?'), findsOneWidget);
      await tester.tap(find.text('Close branch'));
      await tester.pumpAndSettle();

      expect(fake.toggledBranchId, 'br1');
      expect(fake.toggledBranchActive, isFalse);
      expect(find.text('Gulberg shop was closed.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('add_branch')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('branch_name')),
        'Johar shop',
      );
      await tester.tap(find.byKey(const Key('branch_area')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('DHA').last);
      await tester.pumpAndSettle();

      final save = find.byKey(const Key('branch_save'));
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.createdBranchName, 'Johar shop');
      expect(fake.createdBranchBlockId, 'bl2');
      expect(find.text('Johar shop is now open.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('insights show money, best sellers and stock warnings', (
      tester,
    ) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        shopProfile: _sampleShopProfile(),
        analytics: _sampleAnalytics(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandInsightsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('insight_revenue')), findsOneWidget);
      expect(find.text('Rs 54,000'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('Best sellers'), findsOneWidget);
      expect(find.text('Cotton kurta'), findsOneWidget);
      expect(find.text('Silk scarf'), findsOneWidget);
      expect(find.text('Out of stock'), findsOneWidget);
      expect(find.text('Where orders are'), findsOneWidget);
      expect(find.text('Where deliveries are'), findsOneWidget);

      final firstFrom = fake.analyticsFrom;
      await tester.tap(find.byKey(const Key('insight_range_7d')));
      await tester.pumpAndSettle();

      expect(fake.analyticsFrom, isNotNull);
      expect(fake.analyticsFrom, isNot(firstFrom));
      expect(fake.analyticsTo, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(tester.takeException(), isNull);
    });

    testWidgets('shop details and delivery defaults are saved', (tester) async {
      final (container, fake) = await _signedInWithFake(
        user: _brandUser,
        brand: _activeBrand,
        shopProfile: _sampleShopProfile(),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: _shell(const BrandSettingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('settings_name')), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('settings_name')),
        'Loom Home',
      );

      final monday = find.byKey(const Key('settings_day_Monday'));
      await tester.dragUntilVisible(
        monday,
        find.byType(ListView),
        const Offset(0, -250),
      );
      expect(find.text('Opening hours'), findsOneWidget);
      await tester.ensureVisible(monday);
      await tester.pumpAndSettle();
      await tester.tap(monday);
      await tester.pumpAndSettle();

      final fee = find.byKey(const Key('settings_delivery_fee'));
      await tester.dragUntilVisible(
        fee,
        find.byType(ListView),
        const Offset(0, -250),
      );
      expect(find.text('Delivery defaults'), findsOneWidget);
      await tester.enterText(fee, '175');
      await tester.pumpAndSettle();

      final save = find.byKey(const Key('settings_save'));
      await tester.dragUntilVisible(
        save,
        find.byType(ListView),
        const Offset(0, -250),
      );
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(fake.savedShopName, 'Loom Home');
      expect(fake.savedDeliveryFee, 175);
      expect(fake.savedClosedDays, containsAll(<String>['Monday', 'Sunday']));
      expect(find.text('Shop details saved.'), findsOneWidget);
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

const _activeBrand = BrandSummary(
  id: 'b1',
  name: 'Loom & Co.',
  slug: 'loom-co',
  status: 'ACTIVE',
);

const _profile = ProviderProfile(
  id: 'p1',
  displayName: 'Rapid Repairs',
  status: 'ACTIVE',
  slug: 'rapid-repairs',
  categoryName: 'Appliance repair',
  cityId: 'c1',
  cityName: 'Faisalabad',
  blockId: 'bl1',
  blockName: 'Gulberg',
  phone: '03001234567',
  bio: 'We repair home appliances.',
  ratingAvg: 4.8,
  ratingCount: 12,
  completedBookings: 30,
  startingAtPrice: 150000,
);

ServiceOffering _sampleOffering() {
  return const ServiceOffering(
    id: 'o1',
    title: 'AC repair visit',
    description: 'Parts are extra.',
    startingAtPricePaisa: 150000,
    durationMinutes: 60,
  );
}

List<ProviderChatThread> _sampleChats() {
  final now = DateTime.now();
  return [
    ProviderChatThread(
      kind: ProviderChatKind.job,
      routeId: 'bk1',
      name: 'Sana Malik',
      contextLabel: 'Job · AC repair visit · SB-2026-000001',
      preview: 'I am home now.',
      lastMessageAt: now,
      lastSenderRole: 'CUSTOMER',
      unread: 2,
    ),
    ProviderChatThread(
      kind: ProviderChatKind.question,
      routeId: 'cv1',
      name: 'Bilal Ahmed',
      contextLabel: 'Question about your service',
      preview: 'Do you fix geysers?',
      lastMessageAt: now.subtract(const Duration(hours: 2)),
      lastSenderRole: 'CUSTOMER',
    ),
  ];
}

ChatMessagePage _sampleMessages() {
  return const ChatMessagePage(
    messages: [
      ChatMessage(
        id: 'm1',
        body: 'Salam, when will you arrive?',
        senderRole: 'CUSTOMER',
      ),
      ChatMessage(
        id: 'm2',
        body: 'I am on my way.',
        senderRole: 'PROVIDER',
        mine: true,
      ),
    ],
    hasMore: true,
  );
}

ProviderReviewPage _sampleReviewPage() {
  return const ProviderReviewPage(
    reviews: [
      ServiceReview(
        id: 'r1',
        rating: 5,
        comment: 'Quick and tidy.',
        reviewerName: 'Sana Malik',
        serviceTitle: 'AC repair visit',
      ),
    ],
    summary: ReviewSummary(
      average: 4.6,
      count: 12,
      distribution: {1: 0, 2: 1, 3: 1, 4: 3, 5: 7},
    ),
  );
}

BrandOrder _sampleBrandOrder({
  String id = 'o1',
  String number = 'CC-2026-000001',
  String status = 'PENDING',
  int totalPaisa = 510000,
}) {
  final placed = DateTime.now().subtract(const Duration(hours: 3));
  return BrandOrder(
    id: id,
    orderNumber: number,
    orderStatus: status,
    paymentStatus: status == 'REJECTED' ? 'CANCELLED' : 'PENDING',
    paymentMethod: 'COD',
    subtotalPaisa: totalPaisa - 20000,
    deliveryFeePaisa: 20000,
    totalPaisa: totalPaisa,
    items: [
      BrandOrderItem(
        productId: 'pr1',
        productName: 'Cotton kurta',
        sku: 'LK-KURTA-01',
        quantity: 2,
        unitPricePaisa: 245000,
        totalPricePaisa: 490000,
      ),
    ],
    shippingAddress: const BrandShippingAddress(
      name: 'Sana Malik',
      phone: '03001234567',
      address: 'House 12, Street 4, Gulberg',
      city: 'Faisalabad',
      state: 'Punjab',
      postalCode: '38000',
      additionalInstructions: 'Call before arriving.',
    ),
    statusHistory: [
      BrandOrderEvent(status: 'PENDING', at: placed),
      if (status != 'PENDING') BrandOrderEvent(status: status, at: placed),
    ],
    createdAt: placed,
  );
}

List<BrandOrder> _sampleBrandOrders() {
  return [
    _sampleBrandOrder(),
    _sampleBrandOrder(
      id: 'o2',
      number: 'CC-2026-000002',
      status: 'CONFIRMED',
      totalPaisa: 480000,
    ),
    _sampleBrandOrder(
      id: 'o3',
      number: 'CC-2026-000003',
      status: 'PROCESSING',
      totalPaisa: 355000,
    ),
    _sampleBrandOrder(id: 'o4', number: 'CC-2026-000004', totalPaisa: 260000),
  ];
}

BrandProduct _sampleProduct({
  String id = 'p1',
  String name = 'Cotton kurta',
  String status = 'ACTIVE',
  bool isActive = true,
  int pricePaisa = 250000,
  int compareAtPaisa = 0,
  String sku = 'KURTA-M',
  BrandStock? stock,
}) {
  return BrandProduct(
    id: id,
    name: name,
    status: status,
    isActive: isActive,
    pricePaisa: pricePaisa,
    compareAtPricePaisa: compareAtPaisa,
    sku: sku,
    stock:
        stock ??
        const BrandStock(
          quantity: 12,
          reservedQuantity: 2,
          availableQuantity: 10,
          lowStockThreshold: 3,
          trackInventory: true,
          stockStatus: 'IN_STOCK',
        ),
  );
}

List<BrandProduct> _sampleProducts() {
  return [
    _sampleProduct(compareAtPaisa: 300000),
    _sampleProduct(
      id: 'p2',
      name: 'Silk scarf',
      status: 'DRAFT',
      pricePaisa: 150000,
      sku: 'SCARF-1',
      stock: const BrandStock(
        quantity: 4,
        reservedQuantity: 0,
        availableQuantity: 4,
        lowStockThreshold: 0,
        trackInventory: true,
        stockStatus: 'IN_STOCK',
      ),
    ),
    _sampleProduct(
      id: 'p3',
      name: 'Woollen shawl',
      status: 'INACTIVE',
      isActive: false,
      pricePaisa: 450000,
      sku: 'SHAWL-2',
      stock: const BrandStock(
        quantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        lowStockThreshold: 0,
        trackInventory: true,
        stockStatus: 'OUT_OF_STOCK',
      ),
    ),
  ];
}

const _catalogItems = [
  CatalogItem(
    id: 'c1',
    name: 'Dalda Ghee 1 kg',
    manufacturer: 'Dalda',
    sizeLabel: '1 kg',
  ),
  CatalogItem(
    id: 'c2',
    name: 'Tapal Danedar Tea',
    manufacturer: 'Tapal',
    sizeLabel: '500 g',
  ),
];

BrandDelivery _sampleDelivery({
  String id = 'd1',
  String status = 'OUT_FOR_DELIVERY',
  String orderNumber = 'CC-2026-000001',
  String riderId = 'r1',
  String assignedAgent = 'Bilal Ahmed',
  String trackingReference = '',
  String failureReason = '',
}) {
  return BrandDelivery(
    id: id,
    orderId: 'o1',
    orderNumber: orderNumber,
    status: status,
    deliveryFeePaisa: 6497,
    assignedAgent: assignedAgent,
    riderId: riderId.isEmpty ? null : riderId,
    trackingReference: trackingReference,
    failureReason: failureReason,
    address: const BrandShippingAddress(
      name: 'Sana Malik',
      phone: '03001234567',
      address: 'House 12, Street 4',
      city: 'Faisalabad',
      state: 'Punjab',
      additionalInstructions: 'Call on arrival.',
    ),
    createdAt: DateTime(2026, 11, 10, 15, 20),
  );
}

List<BrandDelivery> _sampleDeliveries() {
  return [
    _sampleDelivery(),
    _sampleDelivery(
      id: 'd2',
      status: 'READY_FOR_PICKUP',
      orderNumber: 'CC-2026-000002',
      riderId: '',
      assignedAgent: '',
    ),
    _sampleDelivery(
      id: 'd3',
      status: 'FAILED',
      orderNumber: 'CC-2026-000003',
      failureReason: 'Nobody home',
    ),
  ];
}

const _sampleRiders = [
  BrandRider(
    id: 'r1',
    name: 'Bilal Ahmed',
    email: 'bilal@example.com',
    phone: '03001234567',
  ),
  BrandRider(
    id: 'r2',
    name: 'Nadia Iqbal',
    email: 'nadia@example.com',
    phone: '03111222333',
    isActive: false,
  ),
];

BrandReturn _sampleReturn({
  String id = 'rt1',
  String status = 'IN_TRANSIT',
  String orderNumber = 'CC-2026-000001',
}) {
  return BrandReturn(
    id: id,
    orderId: 'o1',
    orderNumber: orderNumber,
    deliveryId: 'd1',
    status: status,
    lines: const [
      BrandReturnLine(
        orderItemId: 'i1',
        productName: 'Cotton kurta',
        quantity: 2,
        unitPricePaisa: 12050,
        reason: 'DAMAGED',
        hasPhoto: true,
      ),
      BrandReturnLine(
        orderItemId: 'i2',
        productName: 'Silk scarf',
        quantity: 1,
        unitPricePaisa: 9000,
        reason: 'NOT_WANTED',
      ),
    ],
    returnedSubtotalPaisa: 33100,
    refundAmountPaisa: 33100,
    createdAt: DateTime(2026, 11, 10, 16),
    receivedAt: status == 'RECEIVED' ? DateTime(2026, 11, 11, 9) : null,
  );
}

List<BrandReturn> _sampleReturns() {
  return [
    _sampleReturn(),
    _sampleReturn(id: 'rt2', status: 'RECEIVED', orderNumber: 'CC-2026-000002'),
  ];
}

const _returnSummary = BrandReturnSummary(
  inTransitCount: 1,
  inTransitSubtotalPaisa: 33100,
  receivedCount: 1,
  receivedSubtotalPaisa: 33100,
  returnedSubtotalPaisa: 66200,
  refundAmountPaisa: 66200,
);

BrandProfile _sampleShopProfile() {
  return const BrandProfile(
    id: 'b1',
    name: 'Loom & Co.',
    slug: 'loom-co',
    status: 'ACTIVE',
    cityId: 'c1',
    street: '12 Main Road',
    area: 'Gulberg',
    city: 'Lahore',
    supportPhone: '042 1234567',
    supportEmail: 'help@loom.co',
    opensAt: '09:00',
    closesAt: '21:00',
    closedDays: ['Sunday'],
    deliveryFee: 150,
    estimatedDeliveryTime: '30-45 minutes',
    minimumOrderValue: 500,
    deliveryNote: 'Delivered by the shop',
  );
}

List<TeamMember> _sampleTeam() {
  return const [
    TeamMember(
      id: 'e1',
      name: 'Ayesha Khan',
      email: 'ayesha@example.com',
      role: 'BRAND_EMPLOYEE',
      jobTitle: 'Store supervisor',
      permissions: ['orders.view', 'orders.manage'],
    ),
    TeamMember(
      id: 'e2',
      name: 'Imran Ali',
      email: 'imran@example.com',
      role: 'PICKER',
    ),
    TeamMember(
      id: 'e3',
      name: 'Sana Yousaf',
      email: 'sana@example.com',
      role: 'BRAND_EMPLOYEE',
      isActive: false,
      removedAt: null,
    ),
  ];
}

const _sampleBranches = [
  BrandBranch(
    id: 'br1',
    name: 'Gulberg shop',
    blockId: 'bl1',
    blockName: 'Gulberg',
    address: '12 Main Road',
    phone: '03001234567',
  ),
  BrandBranch(
    id: 'br2',
    name: 'DHA shop',
    blockId: 'bl2',
    blockName: 'DHA',
    isActive: false,
  ),
];

const _sampleBlocks = [
  BranchBlock(id: 'bl1', name: 'Gulberg'),
  BranchBlock(id: 'bl2', name: 'DHA'),
];

BrandAnalytics _sampleAnalytics() {
  return const BrandAnalytics(
    from: '2026-11-01',
    to: '2026-11-11',
    summary: AnalyticsSummary(
      orders: 12,
      deliveredOrders: 9,
      cancelledOrders: 1,
      pendingOrders: 2,
      revenuePaisa: 5400000,
      averageOrderValuePaisa: 600000,
      customers: 8,
      repeatCustomers: 2,
      productsSold: 31,
      lowStockProducts: 1,
      outOfStockProducts: 1,
    ),
    salesTrend: [
      SalesPoint(date: '2026-11-03', orders: 3, revenuePaisa: 1800000),
      SalesPoint(date: '2026-11-07', orders: 4, revenuePaisa: 2400000),
      SalesPoint(date: '2026-11-10', orders: 2, revenuePaisa: 1200000),
    ],
    orderStatuses: [
      StatusCount(status: 'DELIVERED', count: 9),
      StatusCount(status: 'PENDING', count: 2),
    ],
    topProducts: [
      TopProduct(
        productId: 'p1',
        name: 'Cotton kurta',
        unitsSold: 12,
        revenuePaisa: 2400000,
      ),
    ],
    inventoryAlerts: [
      InventoryAlert(
        productId: 'p2',
        name: 'Silk scarf',
        available: 0,
        threshold: 3,
        status: 'OUT_OF_STOCK',
      ),
    ],
    deliveryStatuses: [StatusCount(status: 'DELIVERED', count: 8)],
  );
}

/// Builds a container whose session has already been restored, so the home
/// providers see a signed-in owner before the first frame.
Future<ProviderContainer> _signedIn({
  required AppUser user,
  ProviderProfile? profile,
  BrandSummary? brand,
  List<BusinessBooking> bookings = const [],
  BusinessBooking? detail,
  List<ServiceOffering> offerings = const [],
  ServiceAvailability? availability,
  List<BlockOption> blocks = const [],
  List<ProviderChatThread> chats = const [],
  ChatMessagePage chatMessages = const ChatMessagePage(),
  ProviderReviewPage reviewPage = const ProviderReviewPage(),
  List<BrandOrder> orders = const [],
  BrandOrderDetail? orderDetail,
  List<BrandProduct> products = const [],
  List<CatalogItem> catalog = const [],
  List<BrandDelivery> deliveries = const [],
  List<BrandRider> riders = const [],
  List<BrandReturn> returns = const [],
  BrandReturnSummary returnSummary = const BrandReturnSummary(),
  BrandProfile? shopProfile,
  List<TeamMember> team = const [],
  List<BrandBranch> branches = const [],
  List<BranchBlock> branchBlocks = const [],
  BrandAnalytics? analytics,
}) async {
  final result = await _signedInWithFake(
    user: user,
    profile: profile,
    brand: brand,
    bookings: bookings,
    detail: detail,
    offerings: offerings,
    availability: availability,
    blocks: blocks,
    chats: chats,
    chatMessages: chatMessages,
    reviewPage: reviewPage,
    orders: orders,
    orderDetail: orderDetail,
    products: products,
    catalog: catalog,
    deliveries: deliveries,
    riders: riders,
    returns: returns,
    returnSummary: returnSummary,
    shopProfile: shopProfile,
    team: team,
    branches: branches,
    branchBlocks: branchBlocks,
    analytics: analytics,
  );
  return result.$1;
}

Future<(ProviderContainer, _FakeRepository)> _signedInWithFake({
  required AppUser user,
  ProviderProfile? profile,
  BrandSummary? brand,
  List<BusinessBooking> bookings = const [],
  BusinessBooking? detail,
  List<ServiceOffering> offerings = const [],
  ServiceAvailability? availability,
  List<BlockOption> blocks = const [],
  List<ProviderChatThread> chats = const [],
  ChatMessagePage chatMessages = const ChatMessagePage(),
  ProviderReviewPage reviewPage = const ProviderReviewPage(),
  List<BrandOrder> orders = const [],
  BrandOrderDetail? orderDetail,
  List<BrandProduct> products = const [],
  List<CatalogItem> catalog = const [],
  List<BrandDelivery> deliveries = const [],
  List<BrandRider> riders = const [],
  List<BrandReturn> returns = const [],
  BrandReturnSummary returnSummary = const BrandReturnSummary(),
  BrandProfile? shopProfile,
  List<TeamMember> team = const [],
  List<BrandBranch> branches = const [],
  List<BranchBlock> branchBlocks = const [],
  BrandAnalytics? analytics,
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
    offerings: offerings,
    availability: availability,
    blocks: blocks,
    chats: chats,
    chatMessages: chatMessages,
    reviewPage: reviewPage,
    orders: orders,
    orderDetail: orderDetail,
    products: products,
    catalog: catalog,
    deliveries: deliveries,
    riders: riders,
    returns: returns,
    returnSummary: returnSummary,
    shopProfile: shopProfile,
    team: team,
    branches: branches,
    branchBlocks: branchBlocks,
    analytics: analytics,
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

/// A placeholder page that pushes [screen], so a screen that closes itself
/// with a result can be tested without the full router.
Widget _routeHarness(Widget screen) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: const TextScaler.linear(1.3)),
      child: child!,
    ),
    home: Builder(
      builder: (context) => Scaffold(
        body: Center(
          child: TextButton(
            key: const Key('open_screen'),
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute<void>(builder: (context) => screen)),
            child: const Text('Open'),
          ),
        ),
      ),
    ),
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
    this.offerings = const [],
    this.availability,
    this.blocks = const [],
    this.chats = const [],
    this.chatMessages = const ChatMessagePage(),
    this.reviewPage = const ProviderReviewPage(),
    this.orders = const [],
    this.orderDetail,
    this.products = const [],
    this.catalog = const [],
    this.deliveries = const [],
    this.riders = const [],
    this.returns = const [],
    this.returnSummary = const BrandReturnSummary(),
    this.shopProfile,
    this.team = const [],
    this.branches = const [],
    this.branchBlocks = const [],
    this.analytics,
  }) : super(ApiClient(store));

  final AppUser user;
  final ProviderProfile? profile;
  final BrandSummary? brand;
  final List<BusinessBooking> bookings;
  final BusinessBooking? detail;
  final List<ServiceOffering> offerings;
  final ServiceAvailability? availability;
  final List<BlockOption> blocks;
  final List<ProviderChatThread> chats;
  final ChatMessagePage chatMessages;
  final ProviderReviewPage reviewPage;
  final List<BrandOrder> orders;
  final BrandOrderDetail? orderDetail;
  final List<BrandProduct> products;
  final List<CatalogItem> catalog;
  final List<BrandDelivery> deliveries;
  final List<BrandRider> riders;
  final List<BrandReturn> returns;
  final BrandReturnSummary returnSummary;
  BrandProfile? shopProfile;
  final List<TeamMember> team;
  final List<BrandBranch> branches;
  final List<BranchBlock> branchBlocks;
  final BrandAnalytics? analytics;
  final Map<String, BrandProduct> _editedProducts = {};
  final Map<String, BrandRider> _editedRiders = {};
  final Map<String, BrandDelivery> _editedDeliveries = {};
  final Map<String, BrandReturn> _receivedReturns = {};
  final Map<String, TeamMember> _editedTeam = {};
  final Map<String, BrandBranch> _editedBranches = {};

  String? lastBookingStatus;
  int? acceptedPricePaisa;
  var acceptedOffer = false;
  int? proposedPricePaisa;
  String? proposedScope;
  int? completedAmountPaisa;
  String? lastOrderStatus;
  int? lastOrderLimit;
  String? updatedOrderId;
  String? updatedOrderStatus;
  String? withdrawnOrderId;
  String? withdrawnAdjustmentId;

  String? lastDeliveryStatus;
  String? updatedDeliveryId;
  String? updatedDeliveryStatus;
  String? updatedDeliveryFailure;
  bool? lastRiderActive;
  String? assignedDeliveryId;
  String? assignedRiderId;
  var assignCalled = false;
  String? savedDeliveryTracking;
  String? savedDeliveryAgent;
  String? createdRiderName;
  String? createdRiderEmail;
  String? createdRiderPhone;
  String? createdRiderPassword;
  String? updatedRiderId;
  bool? updatedRiderActive;
  String? resetRiderId;
  String? resetRiderPasswordValue;
  String? lastReturnStatus;
  String? receivedReturnId;
  Map<int, bool>? receivedRestock;

  bool? lastTeamActive;
  String? createdTeamName;
  String? createdTeamEmail;
  String? createdTeamPassword;
  String? createdTeamRole;
  List<String>? createdTeamPermissions;
  String? removedTeamId;
  String? updatedTeamId;
  bool? updatedTeamActive;
  List<String>? updatedTeamPermissions;
  String? createdBranchName;
  String? createdBranchBlockId;
  String? createdBranchAddress;
  String? toggledBranchId;
  bool? toggledBranchActive;
  String? analyticsFrom;
  String? analyticsTo;
  String? savedShopName;
  double? savedDeliveryFee;
  List<String>? savedClosedDays;

  String? lastProductStatus;
  String? lastProductSearch;
  int? updatedProductPrice;
  int? updatedProductCompare;
  String? updatedProductSku;
  String? updatedProductStatus;
  bool? updatedProductActive;
  String? archivedProductId;
  int? adjustedStockChange;
  String? adjustedStockReason;
  int? savedStockThreshold;
  bool? savedStockTracking;
  String? addedCatalogId;
  int? addedPricePaisa;
  int? addedComparePaisa;
  String? addedSku;
  String? addedStatus;

  String? createdOfferingTitle;
  int? createdOfferingPrice;
  int? createdOfferingDuration;
  String? deactivatedOfferingId;
  List<AvailabilityWindow>? savedWindows;
  List<String>? savedBlackouts;
  String? updatedDisplayName;
  int? updatedPricePaisa;
  String? changedBlockId;
  double? changedLatitude;

  String? sentChatRouteId;
  String? sentChatBody;
  String? markedReadId;
  int? lastReviewRating;
  String? repliedReviewId;
  String? repliedReviewBody;

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

  @override
  Future<List<ServiceOffering>> providerOfferings() async => offerings;

  @override
  Future<ServiceOffering> createProviderOffering({
    required String title,
    required String description,
    required int startingAtPricePaisa,
    required int durationMinutes,
  }) async {
    createdOfferingTitle = title;
    createdOfferingPrice = startingAtPricePaisa;
    createdOfferingDuration = durationMinutes;
    return ServiceOffering(
      id: 'new',
      title: title,
      description: description,
      startingAtPricePaisa: startingAtPricePaisa,
      durationMinutes: durationMinutes,
    );
  }

  @override
  Future<ServiceOffering> updateProviderOffering(
    String offeringId, {
    String? title,
    String? description,
    int? startingAtPricePaisa,
    int? durationMinutes,
    bool? isActive,
  }) async {
    final current = offerings.isEmpty
        ? _sampleOffering()
        : offerings.firstWhere(
            (offering) => offering.id == offeringId,
            orElse: () => offerings.first,
          );
    return ServiceOffering(
      id: current.id,
      title: title ?? current.title,
      description: description ?? current.description,
      startingAtPricePaisa:
          startingAtPricePaisa ?? current.startingAtPricePaisa,
      durationMinutes: durationMinutes ?? current.durationMinutes,
      isActive: isActive ?? current.isActive,
    );
  }

  @override
  Future<ServiceOffering> deactivateProviderOffering(String offeringId) async {
    deactivatedOfferingId = offeringId;
    final current = offerings.isEmpty
        ? _sampleOffering()
        : offerings.firstWhere(
            (offering) => offering.id == offeringId,
            orElse: () => offerings.first,
          );
    return ServiceOffering(
      id: current.id,
      title: current.title,
      description: current.description,
      startingAtPricePaisa: current.startingAtPricePaisa,
      durationMinutes: current.durationMinutes,
      isActive: false,
    );
  }

  @override
  Future<ServiceAvailability> providerAvailability() async {
    return availability ?? const ServiceAvailability();
  }

  @override
  Future<ServiceAvailability> saveProviderAvailability({
    required List<AvailabilityWindow> windows,
    required List<String> blackoutDates,
  }) async {
    savedWindows = [...windows];
    savedBlackouts = [...blackoutDates];
    return ServiceAvailability(
      windows: windows,
      blackoutDates: blackoutDates,
      isPublished: windows.isNotEmpty,
    );
  }

  @override
  Future<ProviderProfile> updateProviderProfile({
    required String displayName,
    required String phone,
    required String bio,
    required String addressLine,
    required int startingAtPricePaisa,
  }) async {
    updatedDisplayName = displayName;
    updatedPricePaisa = startingAtPricePaisa;
    return profile!;
  }

  @override
  Future<List<BlockOption>> cityBlocks(String cityId) async => blocks;

  @override
  Future<ProviderProfile> changeProviderBlock({
    required String blockId,
    required double latitude,
    required double longitude,
  }) async {
    changedBlockId = blockId;
    changedLatitude = latitude;
    return profile!;
  }

  @override
  Future<List<ProviderChatThread>> providerChatInbox({int limit = 30}) async {
    return chats;
  }

  @override
  Future<ChatMessagePage> bookingChatMessages(
    String bookingId, {
    String? before,
    int limit = 30,
  }) async {
    return chatMessages;
  }

  @override
  Future<ChatMessagePage> directChatMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    return chatMessages;
  }

  @override
  Future<ChatMessage> sendBookingChatMessage(
    String bookingId,
    String body,
  ) async {
    sentChatRouteId = bookingId;
    sentChatBody = body;
    return ChatMessage(
      id: 'sent',
      body: body,
      senderRole: 'PROVIDER',
      mine: true,
      createdAt: DateTime(2026, 11, 11, 12),
    );
  }

  @override
  Future<ChatMessage> sendDirectChatMessage(
    String conversationId,
    String body,
  ) async {
    sentChatRouteId = conversationId;
    sentChatBody = body;
    return ChatMessage(
      id: 'sent',
      body: body,
      senderRole: 'PROVIDER',
      mine: true,
      createdAt: DateTime(2026, 11, 11, 12),
    );
  }

  @override
  Future<void> markBookingChatRead(String bookingId) async {
    markedReadId = bookingId;
  }

  @override
  Future<void> markDirectChatRead(String conversationId) async {
    markedReadId = conversationId;
  }

  @override
  Future<ProviderReviewPage> providerReviews({
    int? rating,
    int page = 1,
    int limit = 10,
  }) async {
    lastReviewRating = rating;
    return reviewPage;
  }

  @override
  Future<data.Page<BrandOrder>> brandOrders({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    lastOrderStatus = status;
    lastOrderLimit = limit;
    final filtered = status == null
        ? orders
        : orders
              .where((order) => order.orderStatus == status)
              .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandOrderDetail> brandOrder(String orderId) async {
    var detail = orderDetail;
    if (detail == null) {
      final matches = orders.where((order) => order.id == orderId);
      detail = BrandOrderDetail(
        order: matches.isEmpty ? _sampleBrandOrder() : matches.first,
      );
    }
    var order = detail.order;
    if (updatedOrderId == orderId && updatedOrderStatus != null) {
      order = order.copyWith(orderStatus: updatedOrderStatus);
    }
    var pending = detail.pendingAdjustment;
    if (pending != null && withdrawnAdjustmentId == pending.id) pending = null;
    return BrandOrderDetail(
      order: order,
      payment: detail.payment,
      delivery: detail.delivery,
      adjustments: detail.adjustments,
      pendingAdjustment: pending,
    );
  }

  @override
  Future<BrandOrder> updateBrandOrderStatus(
    String orderId,
    String status,
  ) async {
    updatedOrderId = orderId;
    updatedOrderStatus = status;
    final matches = orders.where((order) => order.id == orderId);
    final current =
        orderDetail?.order ??
        (matches.isEmpty ? _sampleBrandOrder() : matches.first);
    return current.copyWith(
      orderStatus: status,
      paymentStatus: status == 'REJECTED' ? 'CANCELLED' : current.paymentStatus,
    );
  }

  @override
  Future<void> withdrawBrandAdjustment(
    String orderId,
    String adjustmentId,
  ) async {
    withdrawnOrderId = orderId;
    withdrawnAdjustmentId = adjustmentId;
  }

  BrandProduct _productRecord(String productId) {
    final edited = _editedProducts[productId];
    if (edited != null) return edited;
    for (final product in products) {
      if (product.id == productId) return product;
    }
    return _sampleProduct();
  }

  @override
  Future<data.Page<BrandProduct>> brandProducts({
    String? status,
    String? search,
    int page = 1,
    int limit = 12,
  }) async {
    lastProductStatus = status;
    lastProductSearch = search;
    final term = (search ?? '').trim().toLowerCase();
    final filtered = products
        .map((product) => _editedProducts[product.id] ?? product)
        .where(
          (product) =>
              (status == null || product.status == status) &&
              (term.isEmpty || product.name.toLowerCase().contains(term)),
        )
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandProductDetail> brandProduct(String productId) async {
    final product = _productRecord(productId);
    return BrandProductDetail(product: product, stock: product.stock);
  }

  @override
  Future<BrandProduct> updateBrandProduct(
    String productId, {
    int? pricePaisa,
    int? compareAtPricePaisa,
    String? sku,
    String? status,
    bool? isActive,
  }) async {
    if (pricePaisa != null) updatedProductPrice = pricePaisa;
    if (compareAtPricePaisa != null) {
      updatedProductCompare = compareAtPricePaisa;
    }
    if (sku != null) updatedProductSku = sku;
    if (status != null) updatedProductStatus = status;
    if (isActive != null) updatedProductActive = isActive;
    final updated = _productRecord(productId).copyWith(
      pricePaisa: pricePaisa,
      compareAtPricePaisa: compareAtPricePaisa,
      sku: sku,
      status: status,
      isActive: isActive,
    );
    _editedProducts[productId] = updated;
    return updated;
  }

  @override
  Future<void> archiveBrandProduct(String productId) async {
    archivedProductId = productId;
    _editedProducts[productId] = _productRecord(productId)
        .copyWith(status: 'ARCHIVED', isActive: false);
  }

  @override
  Future<BrandStock> setBrandStock(
    String productId, {
    int? quantity,
    int? lowStockThreshold,
    bool? trackInventory,
  }) async {
    if (lowStockThreshold != null) {
      savedStockThreshold = lowStockThreshold;
    }
    if (trackInventory != null) savedStockTracking = trackInventory;
    final current = _productRecord(productId);
    final existing = current.stock ?? const BrandStock();
    final stock = BrandStock(
      quantity: quantity ?? existing.quantity,
      reservedQuantity: existing.reservedQuantity,
      availableQuantity: quantity == null
          ? existing.availableQuantity
          : quantity - existing.reservedQuantity,
      lowStockThreshold: lowStockThreshold ?? existing.lowStockThreshold,
      trackInventory: trackInventory ?? existing.trackInventory,
      stockStatus: existing.stockStatus,
    );
    _editedProducts[productId] = current.copyWith(stock: stock);
    return stock;
  }

  @override
  Future<BrandStock> adjustBrandStock(
    String productId, {
    required int change,
    String? reason,
  }) async {
    adjustedStockChange = change;
    adjustedStockReason = reason;
    final current = _productRecord(productId);
    final existing = current.stock ?? const BrandStock();
    final available = existing.availableQuantity + change;
    final stock = BrandStock(
      quantity: existing.quantity + change,
      reservedQuantity: existing.reservedQuantity,
      availableQuantity: available,
      lowStockThreshold: existing.lowStockThreshold,
      trackInventory: existing.trackInventory,
      stockStatus: available <= 0
          ? 'OUT_OF_STOCK'
          : existing.stockStatus == 'OUT_OF_STOCK'
          ? 'IN_STOCK'
          : existing.stockStatus,
    );
    _editedProducts[productId] = current.copyWith(stock: stock);
    return stock;
  }

  @override
  Future<data.Page<CatalogItem>> catalogItems({
    String search = '',
    int page = 1,
    int limit = 20,
  }) async {
    final term = search.trim().toLowerCase();
    final filtered = catalog
        .where((item) => term.isEmpty || item.name.toLowerCase().contains(term))
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandProduct> addBrandProduct({
    required String catalogProductId,
    required int pricePaisa,
    int? compareAtPricePaisa,
    String? sku,
    String? status,
  }) async {
    addedCatalogId = catalogProductId;
    addedPricePaisa = pricePaisa;
    addedComparePaisa = compareAtPricePaisa;
    addedSku = sku;
    addedStatus = status;
    var item = const CatalogItem(id: 'new', name: 'New product');
    for (final candidate in catalog) {
      if (candidate.id == catalogProductId) {
        item = candidate;
        break;
      }
    }
    return BrandProduct(
      id: 'new',
      name: item.name,
      status: status ?? 'DRAFT',
      pricePaisa: pricePaisa,
      compareAtPricePaisa: compareAtPricePaisa ?? 0,
      sku: sku ?? '',
      image: item.image,
      stock: const BrandStock(
        quantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        stockStatus: 'OUT_OF_STOCK',
      ),
    );
  }

  BrandDelivery _deliveryRecord(String deliveryId) {
    final edited = _editedDeliveries[deliveryId];
    if (edited != null) return edited;
    for (final delivery in deliveries) {
      if (delivery.id == deliveryId) return delivery;
    }
    return _sampleDelivery();
  }

  @override
  Future<data.Page<BrandDelivery>> brandDeliveries({
    String? status,
    String? riderId,
    int page = 1,
    int limit = 12,
  }) async {
    lastDeliveryStatus = status;
    final filtered = deliveries
        .map((delivery) => _editedDeliveries[delivery.id] ?? delivery)
        .where((delivery) => status == null || delivery.status == status)
        .where((delivery) => riderId == null || delivery.riderId == riderId)
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandDelivery> brandDelivery(String deliveryId) async {
    return _deliveryRecord(deliveryId);
  }

  @override
  Future<BrandDelivery> updateBrandDeliveryStatus(
    String deliveryId,
    String status, {
    String? failureReason,
  }) async {
    updatedDeliveryId = deliveryId;
    updatedDeliveryStatus = status;
    updatedDeliveryFailure = failureReason;
    final current = _deliveryRecord(deliveryId);
    final updated = BrandDelivery(
      id: current.id,
      orderId: current.orderId,
      orderNumber: current.orderNumber,
      status: status,
      deliveryFeePaisa: current.deliveryFeePaisa,
      trackingReference: current.trackingReference,
      assignedAgent: current.assignedAgent,
      riderId: current.riderId,
      failureReason: failureReason ?? '',
      address: current.address,
      createdAt: current.createdAt,
    );
    _editedDeliveries[deliveryId] = updated;
    return updated;
  }

  @override
  Future<BrandDelivery> assignBrandDeliveryRider(
    String deliveryId,
    String? riderId,
  ) async {
    assignCalled = true;
    assignedDeliveryId = deliveryId;
    assignedRiderId = riderId;
    final current = _deliveryRecord(deliveryId);
    var agent = '';
    if (riderId != null) {
      for (final rider in riders) {
        if (rider.id == riderId) {
          agent = rider.name;
          break;
        }
      }
      if (agent.isEmpty) agent = 'Rider';
    }
    final updated = BrandDelivery(
      id: current.id,
      orderId: current.orderId,
      orderNumber: current.orderNumber,
      status: current.status,
      deliveryFeePaisa: current.deliveryFeePaisa,
      trackingReference: current.trackingReference,
      assignedAgent: agent,
      riderId: riderId,
      failureReason: current.failureReason,
      address: current.address,
      createdAt: current.createdAt,
    );
    _editedDeliveries[deliveryId] = updated;
    return updated;
  }

  @override
  Future<BrandDelivery> updateBrandDeliveryDetails(
    String deliveryId, {
    String? trackingReference,
    String? assignedAgent,
  }) async {
    savedDeliveryTracking = trackingReference;
    savedDeliveryAgent = assignedAgent;
    final current = _deliveryRecord(deliveryId);
    final updated = BrandDelivery(
      id: current.id,
      orderId: current.orderId,
      orderNumber: current.orderNumber,
      status: current.status,
      deliveryFeePaisa: current.deliveryFeePaisa,
      trackingReference: (trackingReference ?? '').isEmpty
          ? current.trackingReference
          : trackingReference!,
      assignedAgent: (assignedAgent ?? '').isEmpty
          ? current.assignedAgent
          : assignedAgent!,
      riderId: current.riderId,
      failureReason: current.failureReason,
      address: current.address,
      createdAt: current.createdAt,
    );
    _editedDeliveries[deliveryId] = updated;
    return updated;
  }

  BrandRider _riderRecord(String riderId) {
    final edited = _editedRiders[riderId];
    if (edited != null) return edited;
    for (final rider in riders) {
      if (rider.id == riderId) return rider;
    }
    return _sampleRiders.first;
  }

  @override
  Future<data.Page<BrandRider>> brandRiders({
    bool? isActive,
    int page = 1,
    int limit = 20,
  }) async {
    lastRiderActive = isActive;
    final filtered = riders
        .map((rider) => _editedRiders[rider.id] ?? rider)
        .where((rider) => isActive == null || rider.isActive == isActive)
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandRider> createBrandRider({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    createdRiderName = name;
    createdRiderEmail = email;
    createdRiderPassword = password;
    createdRiderPhone = phone;
    final rider = BrandRider(
      id: 'new',
      name: name,
      email: email,
      phone: phone ?? '',
    );
    _editedRiders[rider.id] = rider;
    return rider;
  }

  @override
  Future<BrandRider> updateBrandRider(
    String riderId, {
    String? name,
    String? phone,
    bool? isActive,
  }) async {
    updatedRiderId = riderId;
    updatedRiderActive = isActive;
    final current = _riderRecord(riderId);
    final updated = BrandRider(
      id: current.id,
      name: name ?? current.name,
      email: current.email,
      phone: phone ?? current.phone,
      isActive: isActive ?? current.isActive,
      createdAt: current.createdAt,
    );
    _editedRiders[riderId] = updated;
    return updated;
  }

  @override
  Future<void> resetBrandRiderPassword(
    String riderId, {
    required String password,
  }) async {
    resetRiderId = riderId;
    resetRiderPasswordValue = password;
  }

  BrandReturn _returnRecord(String returnId) {
    final received = _receivedReturns[returnId];
    if (received != null) return received;
    for (final entry in returns) {
      if (entry.id == returnId) return entry;
    }
    return _sampleReturn();
  }

  @override
  Future<data.Page<BrandReturn>> brandReturns({
    String? status,
    int page = 1,
    int limit = 12,
  }) async {
    lastReturnStatus = status;
    final filtered = returns
        .map((entry) => _receivedReturns[entry.id] ?? entry)
        .where((entry) => status == null || entry.status == status)
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<BrandReturnSummary> brandReturnSummary() async => returnSummary;

  @override
  Future<BrandReturn> brandReturn(String returnId) async {
    return _returnRecord(returnId);
  }

  @override
  Future<BrandReturn> receiveBrandReturn(
    String returnId, {
    required Map<int, bool> restockByIndex,
  }) async {
    receivedReturnId = returnId;
    receivedRestock = Map.of(restockByIndex);
    final current = _returnRecord(returnId);
    final received = BrandReturn(
      id: current.id,
      orderId: current.orderId,
      orderNumber: current.orderNumber,
      deliveryId: current.deliveryId,
      status: 'RECEIVED',
      source: current.source,
      lines: [
        for (var index = 0; index < current.lines.length; index++)
          BrandReturnLine(
            orderItemId: current.lines[index].orderItemId,
            productId: current.lines[index].productId,
            productName: current.lines[index].productName,
            quantity: current.lines[index].quantity,
            unitPricePaisa: current.lines[index].unitPricePaisa,
            reason: current.lines[index].reason,
            restock: restockByIndex[index] ?? false,
            restockedAt: (restockByIndex[index] ?? false)
                ? DateTime(2026, 11, 11, 12)
                : null,
            hasPhoto: current.lines[index].hasPhoto,
          ),
      ],
      returnedSubtotalPaisa: current.returnedSubtotalPaisa,
      feeRefunded: current.feeRefunded,
      refundAmountPaisa: current.refundAmountPaisa,
      receivedAt: DateTime(2026, 11, 11, 12),
      createdAt: current.createdAt,
    );
    _receivedReturns[returnId] = received;
    return received;
  }

  @override
  Future<ServiceReview> replyToProviderReview(
    String reviewId, {
    required String body,
  }) async {
    repliedReviewId = reviewId;
    repliedReviewBody = body;
    final review = reviewPage.reviews.isEmpty
        ? const ServiceReview(id: 'r0', rating: 5)
        : reviewPage.reviews.firstWhere(
            (item) => item.id == reviewId,
            orElse: () => reviewPage.reviews.first,
          );
    return ServiceReview(
      id: review.id,
      rating: review.rating,
      bookingId: review.bookingId,
      comment: review.comment,
      providerReply: ReviewReply(body: body, at: DateTime(2026, 11, 11, 12)),
      reviewerName: review.reviewerName,
      serviceTitle: review.serviceTitle,
      createdAt: review.createdAt,
    );
  }

  @override
  Future<BrandProfile> brandProfile() async {
    final profile = shopProfile;
    if (profile == null) throw StateError('No shop profile in this test.');
    return profile;
  }

  @override
  Future<BrandProfile> saveBrandProfile({
    required String brandId,
    required String name,
    required String description,
    required String street,
    required String area,
    required String city,
    required String supportPhone,
    required String supportEmail,
    required String opensAt,
    required String closesAt,
    required List<String> closedDays,
    required double? deliveryFee,
    required String estimatedDeliveryTime,
    required double? minimumOrderValue,
    required String deliveryNote,
  }) async {
    savedShopName = name;
    savedDeliveryFee = deliveryFee;
    savedClosedDays = closedDays;
    final current = shopProfile ?? _sampleShopProfile();
    final updated = BrandProfile(
      id: brandId,
      name: name,
      slug: current.slug,
      status: current.status,
      billingStatus: current.billingStatus,
      description: description,
      logo: current.logo,
      cityId: current.cityId,
      street: street,
      area: area,
      city: city,
      supportPhone: supportPhone,
      supportEmail: supportEmail,
      opensAt: opensAt,
      closesAt: closesAt,
      closedDays: closedDays,
      deliveryFee: deliveryFee,
      estimatedDeliveryTime: estimatedDeliveryTime,
      minimumOrderValue: minimumOrderValue,
      deliveryNote: deliveryNote,
    );
    shopProfile = updated;
    return updated;
  }

  TeamMember _teamRecord(String memberId) {
    final edited = _editedTeam[memberId];
    if (edited != null) return edited;
    return team.firstWhere(
      (member) => member.id == memberId,
      orElse: () => _sampleTeam().first,
    );
  }

  @override
  Future<data.Page<TeamMember>> teamMembers({
    bool? isActive,
    int page = 1,
    int limit = 20,
  }) async {
    lastTeamActive = isActive;
    final all = [
      for (final member in team) _editedTeam[member.id] ?? member,
      for (final entry in _editedTeam.entries)
        if (!team.any((member) => member.id == entry.key)) entry.value,
    ];
    final filtered = all
        .where((member) => isActive == null || member.isActive == isActive)
        .toList(growable: false);
    return data.Page(
      items: filtered,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: filtered.isEmpty ? 0 : 1,
        total: filtered.length,
      ),
    );
  }

  @override
  Future<TeamMember> createTeamMember({
    required String name,
    required String email,
    required String password,
    required String role,
    String? phone,
    String? jobTitle,
    List<String> permissions = const [],
  }) async {
    createdTeamName = name;
    createdTeamEmail = email;
    createdTeamPassword = password;
    createdTeamRole = role;
    createdTeamPermissions = permissions;
    final member = TeamMember(
      id: 'team-new',
      name: name,
      email: email,
      role: role,
      phone: phone ?? '',
      jobTitle: jobTitle ?? '',
      permissions: permissions,
    );
    _editedTeam[member.id] = member;
    return member;
  }

  @override
  Future<TeamMember> updateTeamMember(
    String memberId, {
    String? name,
    String? phone,
    String? jobTitle,
    bool? isActive,
  }) async {
    updatedTeamId = memberId;
    updatedTeamActive = isActive;
    final current = _teamRecord(memberId);
    final updated = TeamMember(
      id: current.id,
      name: name ?? current.name,
      email: current.email,
      role: current.role,
      phone: phone ?? current.phone,
      jobTitle: jobTitle ?? current.jobTitle,
      permissions: current.permissions,
      isActive: isActive ?? current.isActive,
      removedAt: current.removedAt,
      createdAt: current.createdAt,
    );
    _editedTeam[memberId] = updated;
    return updated;
  }

  @override
  Future<TeamMember> updateTeamMemberPermissions(
    String memberId, {
    required List<String> permissions,
  }) async {
    updatedTeamId = memberId;
    updatedTeamPermissions = permissions;
    final current = _teamRecord(memberId);
    final updated = TeamMember(
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      phone: current.phone,
      jobTitle: current.jobTitle,
      permissions: permissions,
      isActive: current.isActive,
      removedAt: current.removedAt,
      createdAt: current.createdAt,
    );
    _editedTeam[memberId] = updated;
    return updated;
  }

  @override
  Future<TeamMember> removeTeamMember(String memberId, {String? reason}) async {
    removedTeamId = memberId;
    final current = _teamRecord(memberId);
    final removed = TeamMember(
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      phone: current.phone,
      jobTitle: current.jobTitle,
      permissions: current.permissions,
      isActive: false,
      removedAt: DateTime(2026, 11, 11, 12),
      createdAt: current.createdAt,
    );
    _editedTeam[memberId] = removed;
    return removed;
  }

  @override
  Future<List<BrandBranch>> brandBranches() async {
    final all = [
      for (final branch in branches) _editedBranches[branch.id] ?? branch,
      for (final entry in _editedBranches.entries)
        if (!branches.any((branch) => branch.id == entry.key)) entry.value,
    ];
    return all;
  }

  @override
  Future<List<BranchBlock>> brandBranchBlocks(String cityId) async {
    return branchBlocks;
  }

  @override
  Future<BrandBranch> createBrandBranch({
    required String name,
    required String blockId,
    String? address,
    String? phone,
  }) async {
    createdBranchName = name;
    createdBranchBlockId = blockId;
    createdBranchAddress = address;
    final block = branchBlocks.firstWhere(
      (entry) => entry.id == blockId,
      orElse: () => const BranchBlock(id: 'bl1', name: 'Gulberg'),
    );
    final branch = BrandBranch(
      id: 'branch-new',
      name: name,
      blockId: blockId,
      blockName: block.name,
      address: address ?? '',
      phone: phone ?? '',
    );
    _editedBranches[branch.id] = branch;
    return branch;
  }

  @override
  Future<BrandBranch> updateBrandBranch(
    String branchId, {
    String? name,
    String? blockId,
    String? address,
    String? phone,
    bool? isActive,
  }) async {
    toggledBranchId = branchId;
    toggledBranchActive = isActive;
    final current =
        _editedBranches[branchId] ??
        branches.firstWhere(
          (branch) => branch.id == branchId,
          orElse: () => _sampleBranches.first,
        );
    final updated = BrandBranch(
      id: current.id,
      name: name ?? current.name,
      blockId: blockId ?? current.blockId,
      blockName: current.blockName,
      address: address ?? current.address,
      phone: phone ?? current.phone,
      isActive: isActive ?? current.isActive,
      latitude: current.latitude,
      longitude: current.longitude,
    );
    _editedBranches[branchId] = updated;
    return updated;
  }

  @override
  Future<BrandAnalytics> brandAnalytics({String? from, String? to}) async {
    analyticsFrom = from;
    analyticsTo = to;
    return analytics ?? _sampleAnalytics();
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
