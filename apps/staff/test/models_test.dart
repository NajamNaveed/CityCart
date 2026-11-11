import 'package:citycart_staff/data/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PickOrder', () {
    test('reads lines, totals and the live change request', () {
      final order = PickOrder.fromJson({
        '_id': 'order-1',
        'orderNumber': 'CC-1001',
        'orderStatus': 'PROCESSING',
        'customerFirstName': 'Ayesha',
        'claimedByMe': true,
        'items': [
          {
            '_id': 'line-1',
            'productName': 'Milk 1L',
            'quantity': 3,
            'pickStatus': 'SHORT',
            'pickedQty': 2,
          },
          {'_id': 'line-2', 'productName': 'Bread', 'quantity': 1},
        ],
        'activeAdjustment': {
          '_id': 'adj-1',
          'status': 'PROPOSED',
          'expiresAt': '2026-11-11T10:00:00.000Z',
        },
      });

      expect(order.orderNumber, 'CC-1001');
      expect(order.customerFirstName, 'Ayesha');
      expect(order.claimedByMe, isTrue);
      expect(order.units, 4);
      expect(order.decidedCount, 1);
      expect(order.pendingCount, 1);
      expect(order.isComplete, isFalse);
      expect(order.lines.first.shortfall, 1);
      expect(order.activeAdjustment?.status, 'PROPOSED');
    });

    test('a missing field falls back instead of throwing', () {
      final order = PickOrder.fromJson({
        'items': [
          {'productName': null},
        ],
      });

      expect(order.lines.single.productName, 'Item');
      expect(order.lines.single.quantity, 1);
      expect(order.customerFirstName, 'Customer');
      expect(order.isComplete, isFalse);
    });
  });

  group('ReturnRecord', () {
    test('reads lines, photos and restock state', () {
      final record = ReturnRecord.fromJson({
        '_id': 'return-1',
        'status': 'RECEIVED',
        'orderNumber': 'CC-2002',
        'returnedSubtotal': 900,
        'refundAmount': 950,
        'feeRefunded': true,
        'lines': [
          {
            'productName': 'Rice 5kg',
            'quantity': 2,
            'unitPrice': 450,
            'reason': 'DAMAGED',
            'restock': true,
            'hasPhoto': true,
          },
        ],
      });

      expect(record.isOpen, isFalse);
      expect(record.units, 2);
      expect(record.lines.single.reason, 'DAMAGED');
      expect(record.lines.single.restock, isTrue);
      expect(record.lines.single.hasPhoto, isTrue);
      expect(record.feeRefunded, isTrue);
    });

    test('summary reads both buckets', () {
      final summary = ReturnsSummary.fromJson({
        'IN_TRANSIT': {'count': 2, 'returnedSubtotal': 1200},
        'RECEIVED': {'count': 1, 'returnedSubtotal': 300},
        'returnedSubtotal': 1500,
        'refundAmount': 1400,
      });

      expect(summary.inTransit.count, 2);
      expect(summary.received.returnedSubtotal, 300);
      expect(summary.returnedSubtotal, 1500);
      expect(summary.refundAmount, 1400);
    });
  });

  group('Money records', () {
    test('a proof keeps its duplicate warnings and photo link', () {
      final proof = ProofRecord.fromJson({
        'paymentId': 'pay-1',
        'orderNumber': 'CC-3003',
        'amount': 2500,
        'verification': 'SUBMITTED',
        'wallet': 'JAZZCASH',
        'reference': 'TRX-77',
        'duplicateReference': true,
        'duplicateProof': false,
        'proofAvailable': true,
        'url': 'https://example.com/photo',
      });

      expect(proof.isPending, isTrue);
      expect(proof.amount, 2500);
      expect(proof.duplicateReference, isTrue);
      expect(proof.duplicateProof, isFalse);
      expect(proof.url, 'https://example.com/photo');
    });

    test('a receipt reads its lines and proof check', () {
      final receipt = ReceiptRecord.fromJson({
        '_id': 'receipt-1',
        'receiptNumber': 'RC-2026-000001',
        'orderNumber': 'CC-4004',
        'billedTo': 'Ayesha Khan',
        'amount': 2500,
        'subtotal': 2300,
        'deliveryFee': 200,
        'items': [
          {
            'productName': 'Milk 1L',
            'quantity': 2,
            'unitPrice': 1150,
            'totalPrice': 2300,
          },
        ],
        'proofVerification': {'status': 'VERIFIED'},
      });

      expect(receipt.receiptNumber, 'RC-2026-000001');
      expect(receipt.lines.single.totalPrice, 2300);
      expect(receipt.proofVerification, 'VERIFIED');
      expect(receipt.billedTo, 'Ayesha Khan');
    });

    test('cash collector groups parse totals', () {
      final collector = CashCollector.fromJson({
        'collectorId': 'rider-1',
        'name': 'Bilal',
        'count': 3,
        'total': 4500,
        'oldest': '2026-11-01T09:00:00.000Z',
      });

      expect(collector.name, 'Bilal');
      expect(collector.count, 3);
      expect(collector.total, 4500);
      expect(collector.oldest, isNotNull);
    });
  });

  group('AppUser', () {
    test('parses permissions and a restricted flag', () {
      final user = AppUser.fromJson({
        'id': 'user-1',
        'name': 'Sana',
        'role': 'BRAND_EMPLOYEE',
        'permissions': ['delivery.view', 'payments.view'],
        'access': {'restricted': true},
      });

      expect(user.isPicker, isFalse);
      expect(user.permissions, ['delivery.view', 'payments.view']);
      expect(user.accessRestricted, isTrue);
    });
  });
}
