import 'package:citycart_shopper/core/theme.dart';
import 'package:citycart_shopper/data/api_client.dart';
import 'package:citycart_shopper/data/models.dart';
import 'package:citycart_shopper/data/repository.dart';
import 'package:citycart_shopper/data/session_store.dart';
import 'package:citycart_shopper/features/bookings/booking_detail_screen.dart';
import 'package:citycart_shopper/features/bookings/bookings_screen.dart';
import 'package:citycart_shopper/features/messages/messages_screen.dart';
import 'package:citycart_shopper/features/messages/service_chat_controller.dart';
import 'package:citycart_shopper/features/messages/service_chat_screen.dart';
import 'package:citycart_shopper/providers.dart';
import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

const _start = '2026-12-02T06:00:00.000Z';

final _activeProposal = {
  '_id': 'p1',
  'pricePaisa': 480000,
  'scope': 'Two cleaners for three hours.',
  'scheduledStart': _start,
  'scheduledEnd': '2026-12-02T09:00:00.000Z',
  'expiresAt': '2026-12-01T06:00:00.000Z',
  'status': 'ACTIVE',
  'createdAt': '2026-11-30T06:00:00.000Z',
};

ServiceBooking _booking({
  String status = 'PROPOSED',
  bool providerDeclined = false,
}) {
  final hasOffer = status == 'PROPOSED';
  final scheduled = switch (status) {
    'REQUESTED' || 'PROPOSED' || 'DECLINED' => null,
    _ => _start,
  };
  final finished = status == 'COMPLETED' || status == 'CONFIRMED';
  return ServiceBooking.fromJson({
    '_id': 'bk1',
    'bookingNumber': 'CC-SVC-0001',
    'status': status,
    'offering': {
      'offeringId': 'o1',
      'title': 'Deep clean — 3 bedroom',
      'slug': 'deep-clean',
      'durationMinutes': 180,
      'startingAtPrice': 450000,
      'image': null,
    },
    'requestedStart': _start,
    'scheduledStart': scheduled,
    'scheduledEnd': scheduled == null ? null : '2026-12-02T09:00:00.000Z',
    'note': 'Gate code 42.',
    'customerOfferPaisa': 400000,
    'cancellation': providerDeclined
        ? {
            'by': 'PROVIDER',
            'reason': 'Fully booked that day.',
            'late': false,
            'at': '2026-12-01T07:00:00.000Z',
          }
        : null,
    'proposals': hasOffer ? [_activeProposal] : const [],
    'activeProposal': hasOffer ? _activeProposal : null,
    'agreedPricePaisa': hasOffer || status == 'REQUESTED' ? null : 480000,
    'finalAmountPaisa': finished ? 480000 : null,
    'completionNote': finished ? 'The team finished and cleaned up.' : null,
    'autoConfirmAt': status == 'COMPLETED' ? '2026-12-05T06:00:00.000Z' : null,
    'events': [
      {
        'type': 'REQUESTED',
        'byRole': 'CUSTOMER',
        'at': '2026-11-30T05:00:00.000Z',
      },
      if (status != 'REQUESTED')
        {
          'type': 'PROPOSED',
          'byRole': 'PROVIDER',
          'at': '2026-11-30T06:00:00.000Z',
        },
    ],
    'address': {
      'fullName': 'Ayesha Khan',
      'phone': '0300 1234567',
      'addressLine': 'House 9, Street 2',
      'city': 'Faisalabad',
      'blockId': 'b1',
      'blockName': 'Gulberg',
      'pin': {'lat': 31.418, 'lng': 73.079},
    },
    'provider': {
      '_id': 'sp1',
      'displayName': 'Sana Home Cleaning',
      'slug': 'sana-home-cleaning',
      'avatar': null,
      'phone': '0300 7654321',
    },
    'conversationId': 'conv1',
    'canChat': const {
      'ACCEPTED',
      'IN_PROGRESS',
      'COMPLETED',
      'CONFIRMED',
    }.contains(status),
    'unread': 2,
    'createdAt': '2026-11-30T05:00:00.000Z',
    'updatedAt': '2026-11-30T06:00:00.000Z',
  });
}

class _FakeRepository extends ShopperRepository {
  _FakeRepository({
    ServiceBooking? booking,
    this.bookings,
    this.jobs = const [],
    this.directs = const [],
    this.directMessages = const [],
  }) : booking = booking ?? _booking(),
       super(ApiClient(SessionStore()));

  ServiceBooking booking;
  final List<ServiceBooking>? bookings;
  List<ServiceChatConversation> jobs;
  List<DirectChatConversation> directs;
  List<ChatMessage> directMessages;

  String? acceptedId;
  String? declineId;
  String? confirmedId;
  String? disputeReason;
  String? cancelReason;
  String? reviewComment;
  int? reviewRating;
  String? sentJobChatId;
  String? sentDirectChatId;
  String? readJobChatId;
  String? readDirectChatId;
  String? loadedJobChatId;
  String? loadedDirectChatId;

  @override
  Future<Page<ServiceBooking>> serviceBookings({
    String? status,
    int page = 1,
    int limit = 10,
  }) async {
    final items = bookings ?? [booking];
    return Page(
      items: items,
      pagination: Pagination(
        page: 1,
        limit: limit,
        pages: 1,
        total: items.length,
      ),
    );
  }

  @override
  Future<ServiceBooking> serviceBooking(String bookingId) async => booking;

  @override
  Future<ServiceBooking> acceptBookingProposal(String bookingId) async {
    acceptedId = bookingId;
    booking = _booking(status: 'ACCEPTED');
    return booking;
  }

  @override
  Future<ServiceBooking> declineBookingProposal(String bookingId) async {
    declineId = bookingId;
    booking = _booking(status: 'DECLINED');
    return booking;
  }

  @override
  Future<ServiceBooking> confirmServiceBooking(String bookingId) async {
    confirmedId = bookingId;
    booking = _booking(status: 'CONFIRMED');
    return booking;
  }

  @override
  Future<ServiceBooking> disputeServiceBooking(
    String bookingId, {
    required String reason,
  }) async {
    disputeReason = reason;
    booking = _booking(status: 'DISPUTED');
    return booking;
  }

  @override
  Future<ServiceBooking> cancelServiceBooking(
    String bookingId, {
    required String reason,
  }) async {
    cancelReason = reason;
    booking = _booking(status: 'CANCELLED');
    return booking;
  }

  @override
  Future<ServiceReview> createBookingReview(
    String bookingId, {
    required int rating,
    String? comment,
  }) async {
    reviewRating = rating;
    reviewComment = comment;
    return ServiceReview(
      id: 'rev1',
      rating: rating,
      comment: comment,
      reviewerName: 'Ayesha Khan',
      serviceTitle: 'Deep clean — 3 bedroom',
      createdAt: DateTime(2026, 12, 6),
    );
  }

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
      items: const [],
      pagination: Pagination(page: 1, limit: limit, pages: 1, total: 0),
    );
  }

  @override
  Future<ChatMessagePage> bookingChatMessages(
    String bookingId, {
    String? before,
    int limit = 30,
  }) async {
    loadedJobChatId = bookingId;
    return const ChatMessagePage(messages: []);
  }

  @override
  Future<ChatMessagePage> directChatMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    loadedDirectChatId = conversationId;
    return ChatMessagePage(messages: directMessages);
  }

  @override
  Future<ChatMessage> sendBookingChatMessage(
    String bookingId,
    String body,
  ) async {
    sentJobChatId = bookingId;
    return ChatMessage(
      id: 'm-job',
      body: body,
      senderRole: 'CUSTOMER',
      mine: true,
      createdAt: DateTime(2026, 12, 1, 10),
    );
  }

  @override
  Future<ChatMessage> sendDirectChatMessage(
    String conversationId,
    String body,
  ) async {
    sentDirectChatId = conversationId;
    return ChatMessage(
      id: 'm-direct',
      body: body,
      senderRole: 'CUSTOMER',
      mine: true,
      createdAt: DateTime(2026, 12, 1, 10),
    );
  }

  @override
  Future<void> markBookingChatRead(String bookingId) async {
    readJobChatId = bookingId;
  }

  @override
  Future<void> markDirectChatRead(String conversationId) async {
    readDirectChatId = conversationId;
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

List<Override> _overrides(_FakeRepository repository) => [
  shopperRepositoryProvider.overrideWithValue(repository),
];

void _phoneView(WidgetTester tester, {double height = 900}) {
  final view =
      TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
  view.physicalSize = Size(320, height);
  view.devicePixelRatio = 1;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('en'));

  tearDown(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.resetPhysicalSize();
    view.resetDevicePixelRatio();
  });

  group('bookings list at 320 wide and 1.3 text', () {
    testWidgets('shows the next step and the price', (tester) async {
      _phoneView(tester);
      final repository = _FakeRepository(
        bookings: [
          _booking(),
          _booking(status: 'CONFIRMED'),
        ],
      );
      await tester.pumpWidget(
        _app(home: const BookingsScreen(), overrides: _overrides(repository)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Your bookings'), findsOneWidget);
      expect(find.text('Deep clean — 3 bedroom'), findsNWidgets(2));
      expect(find.text('Sana Home Cleaning'), findsNWidgets(2));
      expect(find.text('Offer to answer'), findsOneWidget);
      expect(find.text('Waiting for your answer'), findsOneWidget);
      expect(find.text('Completed'), findsOneWidget);
      expect(find.text('Starting from'), findsOneWidget);
      expect(find.text('Final amount'), findsOneWidget);
      expect(find.text('Rs 4,500'), findsOneWidget);
      expect(find.text('Rs 4,800'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an empty list points at services', (tester) async {
      _phoneView(tester);
      final repository = _FakeRepository(bookings: const []);
      await tester.pumpWidget(
        _app(home: const BookingsScreen(), overrides: _overrides(repository)),
      );
      await tester.pumpAndSettle();

      expect(find.text('No bookings yet'), findsOneWidget);
      expect(find.text('Find a service'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('booking detail at 320 wide and 1.3 text', () {
    testWidgets('accepting the offer uses the server and shows scheduled', (
      tester,
    ) async {
      _phoneView(tester, height: 1400);
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          home: const BookingDetailScreen(bookingId: 'bk1'),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Offer from Sana Home Cleaning'), findsOneWidget);
      expect(find.text('Rs 4,800'), findsOneWidget);
      expect(find.text('Two cleaners for three hours.'), findsOneWidget);
      expect(find.text('Accept offer'), findsOneWidget);
      expect(find.text('Decline offer'), findsOneWidget);

      await tester.tap(find.text('Accept offer'));
      await tester.pumpAndSettle();
      expect(find.text('Accept this offer?'), findsOneWidget);

      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Accept offer'),
        ),
      );
      await tester.pumpAndSettle();

      expect(repository.acceptedId, 'bk1');
      expect(find.text('Scheduled'), findsWidgets);
      expect(find.text('Message Sana Home Cleaning'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('confirming a finished job opens the review form', (
      tester,
    ) async {
      _phoneView(tester, height: 1600);
      final repository = _FakeRepository(
        booking: _booking(status: 'COMPLETED'),
      );
      await tester.pumpWidget(
        _app(
          home: const BookingDetailScreen(bookingId: 'bk1'),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('The job is done'), findsOneWidget);
      expect(find.text('Confirm and finish'), findsOneWidget);
      expect(find.text('Report a problem'), findsOneWidget);

      await tester.tap(find.text('Confirm and finish'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Yes, confirm'),
        ),
      );
      await tester.pumpAndSettle();

      expect(repository.confirmedId, 'bk1');
      expect(find.text('Job completed'), findsOneWidget);
      expect(find.text('How was the service?'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a review is posted once the job is confirmed', (tester) async {
      _phoneView(tester, height: 1600);
      final repository = _FakeRepository(
        booking: _booking(status: 'CONFIRMED'),
      );
      await tester.pumpWidget(
        _app(
          home: const BookingDetailScreen(bookingId: 'bk1'),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('How was the service?'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.byTooltip('5 stars'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('5 stars'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Post review'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Post review'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(repository.reviewRating, 5);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a provider-declined request shows the reason', (tester) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(
        booking: _booking(status: 'DECLINED', providerDeclined: true),
      );
      await tester.pumpWidget(
        _app(
          home: const BookingDetailScreen(bookingId: 'bk1'),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('The provider declined this request'), findsOneWidget);
      expect(
        find.textContaining('Reason: Fully booked that day.'),
        findsOneWidget,
      );
      expect(find.text('Offer declined'), findsNothing);
      expect(find.text('Accept offer'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a customer-declined offer reads as your own choice', (
      tester,
    ) async {
      _phoneView(tester, height: 1200);
      final repository = _FakeRepository(booking: _booking(status: 'DECLINED'));
      await tester.pumpWidget(
        _app(
          home: const BookingDetailScreen(bookingId: 'bk1'),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Offer declined'), findsOneWidget);
      expect(find.text('The provider declined this request'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('messages inbox at 320 wide and 1.3 text', () {
    testWidgets('merges booking and provider chats with unread badges', (
      tester,
    ) async {
      _phoneView(tester);
      final repository = _FakeRepository(
        jobs: [
          ServiceChatConversation(
            id: 'cv1',
            bookingId: 'bk1',
            bookingNumber: 'CC-SVC-0001',
            serviceTitle: 'Deep clean — 3 bedroom',
            status: 'ACCEPTED',
            withName: 'Sana Home Cleaning',
            lastMessageAt: DateTime(2026, 12, 1, 10),
            lastMessagePreview: 'See you at nine.',
            lastSenderRole: 'PROVIDER',
            unread: 2,
          ),
        ],
        directs: [
          DirectChatConversation(
            id: 'dc1',
            providerId: 'sp2',
            withName: 'Bilal Repairs',
            lastMessageAt: DateTime(2026, 11, 30, 9),
            lastMessagePreview: 'What needs fixing?',
            lastSenderRole: 'PROVIDER',
            unread: 1,
          ),
        ],
      );
      await tester.pumpWidget(
        _app(home: const MessagesScreen(), overrides: _overrides(repository)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Messages'), findsOneWidget);
      expect(find.text('Sana Home Cleaning'), findsOneWidget);
      expect(find.text('Bilal Repairs'), findsOneWidget);
      expect(find.text('Booking · Deep clean — 3 bedroom'), findsOneWidget);
      expect(find.text('Provider · Direct chat'), findsOneWidget);
      expect(find.text('See you at nine.'), findsOneWidget);
      expect(find.text('What needs fixing?'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the provider filter hides booking chats', (tester) async {
      _phoneView(tester);
      final repository = _FakeRepository(
        jobs: [
          const ServiceChatConversation(
            id: 'cv1',
            bookingId: 'bk1',
            serviceTitle: 'Deep clean',
            withName: 'Sana Home Cleaning',
            lastMessagePreview: 'See you at nine.',
          ),
        ],
        directs: [
          const DirectChatConversation(
            id: 'dc1',
            withName: 'Bilal Repairs',
            lastMessagePreview: 'What needs fixing?',
          ),
        ],
      );
      await tester.pumpWidget(
        _app(home: const MessagesScreen(), overrides: _overrides(repository)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Providers'));
      await tester.pumpAndSettle();

      expect(find.text('Bilal Repairs'), findsOneWidget);
      expect(find.text('Sana Home Cleaning'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('service chat at 320 wide and 1.3 text', () {
    testWidgets('a direct message is sent with the conversation id', (
      tester,
    ) async {
      _phoneView(tester);
      final repository = _FakeRepository(
        directMessages: [
          ChatMessage(
            id: 'm1',
            body: 'Hello, how can I help?',
            senderRole: 'PROVIDER',
            createdAt: DateTime(2026, 12, 1, 9),
          ),
        ],
      );
      await tester.pumpWidget(
        _app(
          home: const ServiceChatScreen(
            conversationId: 'dc1',
            kind: ServiceChatKind.direct,
            title: 'Bilal Repairs',
            subtitle: 'Provider chat',
          ),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(repository.loadedDirectChatId, 'dc1');
      expect(repository.readDirectChatId, 'dc1');
      expect(find.text('Hello, how can I help?'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Is Saturday free?');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(repository.sentDirectChatId, 'dc1');
      expect(find.text('Is Saturday free?'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a booking chat uses the booking id from the server route', (
      tester,
    ) async {
      _phoneView(tester);
      final repository = _FakeRepository();
      await tester.pumpWidget(
        _app(
          home: const ServiceChatScreen(
            conversationId: 'bk1',
            kind: ServiceChatKind.job,
            title: 'Sana Home Cleaning',
            subtitle: 'Booking chat',
          ),
          overrides: _overrides(repository),
        ),
      );
      await tester.pumpAndSettle();

      expect(repository.loadedJobChatId, 'bk1');
      expect(find.text('Start the conversation'), findsOneWidget);

      await tester.enterText(
        find.byType(TextField),
        'What time will you arrive?',
      );
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(repository.sentJobChatId, 'bk1');
      expect(find.text('What time will you arrive?'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
