import 'package:flutter_test/flutter_test.dart';

import 'package:citycart_delivery/data/models.dart';
import 'package:citycart_delivery/features/deliveries/delivery_rules.dart';

RiderDelivery _delivery({
  String status = 'OUT_FOR_DELIVERY',
  String? fulfilment = 'FULL',
  double amountToCollect = 0,
  double deliveryFee = 0,
  bool paymentPending = false,
  bool paymentRejected = false,
  bool cashCollected = false,
  String? proofStatus,
  List<DeliveryItem> items = const [],
  List<String> paymentOptions = const [
    'CASH',
    'BANK_TRANSFER',
    'WALLET',
    'CARD_MACHINE',
  ],
}) {
  return RiderDelivery(
    id: 'delivery-1',
    status: status,
    currency: 'PKR',
    items: items,
    paymentOptions: paymentOptions,
    amountToCollect: amountToCollect,
    deliveryFee: deliveryFee,
    returnedAmount: 0,
    feeRefunded: false,
    cashCollected: cashCollected,
    paymentPending: paymentPending,
    paymentRejected: paymentRejected,
    fulfilment: fulfilment,
    proofStatus: proofStatus,
  );
}

DeliveryItem _item(String id, String name, int quantity, double total) =>
    DeliveryItem(
      itemId: id,
      productName: name,
      quantity: quantity,
      lineTotal: total,
    );

DoorLine _line(
  String id,
  int quantity,
  double total, {
  int? kept,
  String? reason,
}) => DoorLine(
  itemId: id,
  productName: id,
  quantity: quantity,
  lineTotal: total,
  kept: kept ?? quantity,
  reason: reason,
);

void main() {
  group('what the rider is offered next', () {
    test('a ready parcel is picked up, not marked delivered', () {
      expect(nextActionFor('READY_FOR_PICKUP')?.status, 'PICKED_UP');
    });

    test('picked up and in transit both start the delivery', () {
      expect(nextActionFor('PICKED_UP')?.status, 'OUT_FOR_DELIVERY');
      expect(nextActionFor('IN_TRANSIT')?.status, 'OUT_FOR_DELIVERY');
    });

    test('at the door needs the door flow, not a plain status change', () {
      expect(nextActionFor('OUT_FOR_DELIVERY'), isNull);
      expect(canStartDoorFlow('OUT_FOR_DELIVERY'), isTrue);
      expect(canStartDoorFlow('IN_TRANSIT'), isFalse);
    });

    test('a failed attempt returns to the route', () {
      expect(nextActionFor('FAILED')?.status, 'OUT_FOR_DELIVERY');
    });

    test('closed jobs have no next action', () {
      expect(isClosedStatus('DELIVERED'), isTrue);
      expect(isClosedStatus('RETURNED'), isTrue);
      expect(isClosedStatus('CANCELLED'), isTrue);
      expect(isClosedStatus('OUT_FOR_DELIVERY'), isFalse);
      expect(nextActionFor('DELIVERED'), isNull);
    });
  });

  group('what the money card says', () {
    test('nothing to collect when no goods are handed over', () {
      expect(cashLineFor(_delivery(fulfilment: 'NONE')).kind, CashKind.none);
    });

    test('a held payment is the store\'s decision', () {
      expect(
        cashLineFor(_delivery(paymentPending: true, amountToCollect: 0)).kind,
        CashKind.waiting,
      );
    });

    test('a refused payment shows the amount to collect again', () {
      final line = cashLineFor(
        _delivery(paymentRejected: true, amountToCollect: 1250),
      );
      expect(line.kind, CashKind.rejected);
      expect(line.amount, 1250);
    });

    test('unpaid cash is collected at the door', () {
      final line = cashLineFor(_delivery(amountToCollect: 900));
      expect(line.kind, CashKind.collect);
      expect(line.amount, 900);
    });

    test('paid orders never ask for cash again', () {
      expect(
        cashLineFor(_delivery(cashCollected: true)).kind,
        CashKind.collected,
      );
      expect(
        cashLineFor(_delivery(proofStatus: 'SUBMITTED')).kind,
        CashKind.proof,
      );
      expect(cashLineFor(_delivery()).kind, CashKind.prepaid);
    });
  });

  group('the door answer', () {
    final items = [_item('a', 'Rice', 2, 500), _item('b', 'Oil', 1, 400)];

    test('every line starts fully kept', () {
      final lines = doorLinesFrom(_delivery(items: items));
      expect(lines.map((line) => line.kept), [2, 1]);
      expect(doorLinesReady(lines), isTrue);
    });

    test('a rejected line needs a reason before continuing', () {
      final line = withKept(_line('a', 2, 500), 1);
      expect(line.rejected, 1);
      expect(line.isComplete, isFalse);
      expect(doorLinesReady([line]), isFalse);
      expect(doorLinesReady([line.copyWith(reason: 'DAMAGED')]), isTrue);
    });

    test('keeping every unit clears the return details', () {
      final line = _line('a', 2, 500, kept: 1, reason: 'DAMAGED');
      final kept = withKept(line, 2);
      expect(kept.reason, isNull);
      expect(kept.photo, isNull);
      expect(kept.rejected, 0);
    });

    test('a partial return is valued by its share of the line', () {
      final lines = [withKept(_line('a', 3, 100), 2)];
      expect(estimateCompletion(lines, _delivery()).acceptedTotal, 66.67);
      expect(estimateCompletion(lines, _delivery()).returnedTotal, 33.33);
    });

    test('the delivery fee is refunded only when everything is refused for a store fault', () {
      final allDamaged = [
        _line('a', 2, 500, kept: 0, reason: 'DAMAGED'),
        _line('b', 1, 400, kept: 0, reason: 'MISSING'),
      ];
      final estimate = estimateCompletion(
        allDamaged,
        _delivery(amountToCollect: 1000, deliveryFee: 100),
      );
      expect(estimate.acceptedTotal, 0);
      expect(estimate.returnedTotal, 900);
      expect(estimate.everythingRejected, isTrue);
      expect(estimate.feeRefunded, isTrue);
      expect(estimate.netTotal, 0);
      expect(estimate.refundTotal, 1000);
    });

    test('a customer change of mind does not refund the delivery fee', () {
      final allRefused = [
        _line('a', 2, 500, kept: 0, reason: 'NOT_WANTED'),
        _line('b', 1, 400, kept: 0, reason: 'NOT_WANTED'),
      ];
      final estimate = estimateCompletion(
        allRefused,
        _delivery(amountToCollect: 1000, deliveryFee: 100),
      );
      expect(estimate.everythingRejected, isTrue);
      expect(estimate.feeRefunded, isFalse);
      expect(estimate.netTotal, 100);
    });

    test('a partial return keeps the fee', () {
      final lines = [
        _line('a', 2, 500, kept: 1, reason: 'WRONG_ITEM'),
        _line('b', 1, 400),
      ];
      final estimate = estimateCompletion(
        lines,
        _delivery(amountToCollect: 1000, deliveryFee: 100),
      );
      expect(estimate.hasRejected, isTrue);
      expect(estimate.everythingRejected, isFalse);
      expect(estimate.feeRefunded, isFalse);
      expect(estimate.netTotal, 750);
    });

    test('the payload carries every line exactly once and only sends reasons for returns', () {
      final lines = [
        _line('a', 2, 500, kept: 1, reason: 'DAMAGED'),
        _line('b', 1, 400),
      ];
      final payload = linesPayload(lines);
      expect(payload, hasLength(2));
      expect(payload.first, {
        'itemId': 'a',
        'acceptedQty': 1,
        'rejectedQty': 1,
        'reason': 'DAMAGED',
      });
      expect(payload.last, {'itemId': 'b', 'acceptedQty': 1, 'rejectedQty': 0});
    });
  });

  group('the payment at the door', () {
    test('cash needs nothing else', () {
      const cash = DoorPayment();
      expect(paymentReady(cash), isTrue);
      expect(collectionPayload(cash), {'method': 'CASH'});
    });

    test('a wallet needs a reference, a photo and the wallet name', () {
      const missing = DoorPayment(method: 'WALLET');
      expect(paymentReady(missing), isFalse);

      final withReference = missing.copyWith(reference: 'JC-778812');
      expect(paymentReady(withReference), isFalse);

      final ready = withReference.copyWith(
        wallet: 'EASYPAISA',
        proof: const UploadedPhoto(
          publicId: 'private/job/1',
          fingerprint: 'fp',
        ),
      );
      expect(paymentReady(ready), isTrue);
      expect(collectionPayload(ready), {
        'method': 'WALLET',
        'wallet': 'EASYPAISA',
        'reference': 'JC-778812',
        'proof': {'publicId': 'private/job/1', 'fingerprint': 'fp'},
      });
    });

    test('a bank transfer never carries a wallet', () {
      final payment = DoorPayment(
        method: 'BANK_TRANSFER',
        reference: 'TRX-1',
        proof: const UploadedPhoto(publicId: 'p', fingerprint: 'f'),
      );
      expect(collectionPayload(payment).containsKey('wallet'), isFalse);
    });

    test('only methods the server offered are shown', () {
      final delivery = _delivery(
        paymentOptions: const ['CASH', 'BANK_TRANSFER'],
      );
      expect(methodsFor(delivery).map((method) => method.value), [
        'CASH',
        'BANK_TRANSFER',
      ]);
    });
  });
}
