import 'dart:convert' show jsonDecode, jsonEncode, utf8;
import 'dart:io' show ContentType, HttpServer;

import 'package:citycart_business/data/api_client.dart';
import 'package:citycart_business/data/models.dart';
import 'package:citycart_business/data/repository.dart';
import 'package:citycart_business/data/session_store.dart';
import 'package:flutter_test/flutter_test.dart';

// These checks hit a real loopback server, so they live in their own file:
// any file that runs a testWidgets binding stubs every HttpClient with a
// 400 mock, which would swallow the requests under test.

void main() {
  group('repository request paths', () {
    late HttpServer server;
    final requests = <({String method, String path, Object? body})>[];

    setUpAll(() async {
      server = await HttpServer.bind('127.0.0.1', 0);
      server.listen((request) async {
        final raw = await utf8.decodeStream(request);
        requests.add((
          method: request.method,
          path: request.uri.path,
          body: raw.isEmpty ? null : jsonDecode(raw),
        ));
        const okBody = <String, dynamic>{
          'success': true,
          'branches': <dynamic>[],
          'blocks': <dynamic>[],
          'provider': <String, dynamic>{'_id': 'p1', 'displayName': 'Rapid'},
          'booking': <String, dynamic>{'_id': 'bk1', 'bookingNumber': 'SB-1'},
          'bookings': <dynamic>[],
          'pagination': <String, dynamic>{
            'page': 1,
            'limit': 12,
            'pages': 0,
            'total': 0,
          },
          'offerings': <dynamic>[],
          'offering': <String, dynamic>{'_id': 'o1', 'title': 'AC repair'},
          'availability': <String, dynamic>{
            'windows': <dynamic>[],
            'blackoutDates': <dynamic>[],
          },
          'reviews': <dynamic>[],
          'summary': <String, dynamic>{
            'average': 0,
            'count': 0,
            'distribution': <String, dynamic>{},
          },
          'review': <String, dynamic>{'_id': 'r1'},
          'items': <dynamic>[],
          'conversations': <dynamic>[],
          'messages': <dynamic>[],
          'hasMore': false,
        };
        request.response
          ..statusCode = 200
          ..headers.contentType = ContentType.json
          ..write(jsonEncode(okBody));
        await request.response.close();
      });
    });

    tearDownAll(() async {
      await server.close(force: true);
    });

    setUp(() {
      requests.clear();
    });

    test('brand and provider endpoints hit the mounted server paths', () async {
      final api = ApiClient(
        _FakeSessionStore('token', _brandUser),
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final repository = BusinessRepository(api);

      await repository.brandBranches();
      await repository.currentProvider();
      await repository.providerBookings(status: 'REQUESTED');
      await repository.providerBooking('bk1');
      await repository.acceptProviderBooking('bk1', pricePaisa: 150000);
      await repository.acceptProviderOffer('bk1');
      await repository.declineProviderBooking('bk1', reason: 'Busy');
      await repository.proposeProviderBooking(
        'bk1',
        pricePaisa: 150000,
        scope: 'Parts included.',
        scheduledStart: DateTime.utc(2026, 11, 12, 10),
      );
      await repository.startProviderBooking('bk1');
      await repository.completeProviderBooking('bk1', finalAmountPaisa: 150000);
      await repository.cancelProviderBooking('bk1', reason: 'Too far');
      await repository.updateProviderProfile(
        displayName: 'Rapid Repairs',
        phone: '',
        bio: 'We fix things.',
        addressLine: 'House 12',
        startingAtPricePaisa: 150000,
      );
      await repository.changeProviderBlock(
        blockId: 'bl1',
        latitude: 31.5,
        longitude: 73.1,
      );
      await repository.providerOfferings();
      await repository.createProviderOffering(
        title: 'Geyser repair',
        description: 'Same day.',
        startingAtPricePaisa: 220000,
        durationMinutes: 90,
      );
      await repository.updateProviderOffering('o1', title: 'AC repair visit');
      await repository.deactivateProviderOffering('o1');
      await repository.providerAvailability();
      await repository.saveProviderAvailability(
        windows: const [],
        blackoutDates: const [],
      );
      await repository.providerReviews(rating: 5);
      await repository.replyToProviderReview('r1', body: 'Thank you!');
      await repository.cityBlocks('c1');

      expect(
        requests.map((request) => '${request.method} ${request.path}').toList(),
        [
          'GET /api/v1/branches/mine',
          'GET /api/v1/services/provider/me',
          'GET /api/v1/services/provider/bookings',
          'GET /api/v1/services/provider/bookings/bk1',
          'POST /api/v1/services/provider/bookings/bk1/accept',
          'POST /api/v1/services/provider/bookings/bk1/offer/accept',
          'POST /api/v1/services/provider/bookings/bk1/decline',
          'POST /api/v1/services/provider/bookings/bk1/propose',
          'POST /api/v1/services/provider/bookings/bk1/start',
          'POST /api/v1/services/provider/bookings/bk1/complete',
          'POST /api/v1/services/provider/bookings/bk1/cancel',
          'PATCH /api/v1/services/provider/me',
          'PATCH /api/v1/services/provider/block',
          'GET /api/v1/services/provider/offerings',
          'POST /api/v1/services/provider/offerings',
          'PATCH /api/v1/services/provider/offerings/o1',
          'DELETE /api/v1/services/provider/offerings/o1',
          'GET /api/v1/services/provider/availability',
          'PUT /api/v1/services/provider/availability',
          'GET /api/v1/services/provider/reviews',
          'POST /api/v1/services/provider/reviews/r1/reply',
          'GET /api/v1/blocks',
        ],
      );
    });

    test('a change proposal posts the server schema', () async {
      final api = ApiClient(
        _FakeSessionStore('token', _brandUser),
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final repository = BusinessRepository(api);

      await repository.proposeBrandAdjustment(
        'o1',
        note: 'Only 1 kurta is left.',
        restockRemoved: true,
        lines: const [
          BrandAdjustmentLine(
            orderItemId: 'i1',
            supplyQuantity: 1,
            substituteProductId: 'p2',
            substituteQuantity: 1,
          ),
          BrandAdjustmentLine(orderItemId: 'i2', supplyQuantity: 0),
        ],
      );

      expect(requests, hasLength(1));
      final request = requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/api/v1/brand/orders/o1/adjustments');
      expect(request.body, isA<Map<String, dynamic>>());
      final body = request.body! as Map<String, dynamic>;
      expect(body['note'], 'Only 1 kurta is left.');
      expect(body['restockRemoved'], isTrue);
      expect(body['lines'], hasLength(2));
      expect(body['lines'][0], <String, dynamic>{
        'orderItemId': 'i1',
        'supplyQuantity': 1,
        'substitute': <String, dynamic>{'productId': 'p2', 'quantity': 1},
      });
      expect(body['lines'][1], <String, dynamic>{
        'orderItemId': 'i2',
        'supplyQuantity': 0,
      });
    });
  });
}

const _brandUser = AppUser(
  id: 'u2',
  name: 'Hina Shah',
  email: 'hina@example.com',
  role: brandRole,
  brandId: 'b1',
);

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
