import 'package:flutter_test/flutter_test.dart';

import 'package:citycart_delivery/data/models.dart';

void main() {
  group('RiderDelivery.fromJson', () {
    test('reads the rider view without inventing fields', () {
      final delivery = RiderDelivery.fromJson({
        '_id': 'delivery-1',
        'orderNumber': 'CC-1001',
        'status': 'OUT_FOR_DELIVERY',
        'currency': 'PKR',
        'items': [
          {
            'itemId': 'item-1',
            'productName': 'Rice',
            'quantity': 2,
            'lineTotal': 500,
          },
        ],
        'paymentOptions': ['CASH', 'WALLET'],
        'amountToCollect': 1250,
        'deliveryFee': 100,
        'returnedAmount': 0,
        'feeRefunded': false,
        'cashCollected': false,
        'paymentPending': false,
        'paymentRejected': false,
        'address': {
          'name': 'Ayesha',
          'phone': '+92 300 1234567',
          'address': '12 Garden Road',
          'city': 'Lahore',
          'postalCode': '54000',
          'additionalInstructions': 'Call at the gate',
        },
        'deliveryLocation': {'latitude': 31.52, 'longitude': 74.35},
        'paymentMethod': 'COD',
        'fulfilment': 'FULL',
        'netTotal': 1250,
        'proofStatus': null,
      });

      expect(delivery.id, 'delivery-1');
      expect(delivery.status, 'OUT_FOR_DELIVERY');
      expect(delivery.items.single.productName, 'Rice');
      expect(delivery.items.single.quantity, 2);
      expect(delivery.paymentOptions, ['CASH', 'WALLET']);
      expect(delivery.amountToCollect, 1250);
      expect(delivery.address?.line, '12 Garden Road, Lahore');
      expect(delivery.deliveryLocation?.latitude, 31.52);
      expect(delivery.isCod, isTrue);
      expect(delivery.netTotal, 1250);
    });

    test('tolerates missing optional data', () {
      final delivery = RiderDelivery.fromJson({'status': 'PENDING'});

      expect(delivery.id, isEmpty);
      expect(delivery.currency, 'PKR');
      expect(delivery.items, isEmpty);
      expect(delivery.address, isNull);
      expect(delivery.deliveryLocation, isNull);
      expect(delivery.netTotal, isNull);
      expect(delivery.amountToCollect, 0);
    });

    test('keeps a zero net total as a real value', () {
      final delivery = RiderDelivery.fromJson({
        'netTotal': 0,
        'deliveryFee': '100',
      });
      expect(delivery.netTotal, 0);
      expect(delivery.deliveryFee, 100);
    });
  });

  test('AppUser keeps the rider identity and role', () {
    final user = AppUser.fromJson({
      'id': 'u1',
      'name': 'Bilal',
      'email': 'b@store.com',
      'role': 'RIDER',
    });
    expect(user.isRider, isTrue);
    expect(user.toJson(), {
      'id': 'u1',
      'name': 'Bilal',
      'email': 'b@store.com',
      'role': 'RIDER',
    });
  });

  test('CashInHand reads the server total', () {
    final cash = CashInHand.fromJson({'count': 3, 'total': 4500});
    expect(cash.count, 3);
    expect(cash.total, 4500);
  });

  test('ProofUpload keeps the signed fields it was given', () {
    final upload = ProofUpload.fromJson({
      'uploadUrl': 'https://api.cloudinary.com/v1_1/demo/image/upload',
      'apiKey': 'key',
      'timestamp': 1700000000,
      'signature': 'sig',
      'folder': 'private/delivery',
      'allowedFormats': 'jpg,png',
      'type': 'authenticated',
    });
    expect(upload.timestamp, 1700000000);
    expect(upload.folder, 'private/delivery');
    expect(upload.allowedFormats, 'jpg,png');
  });
}
