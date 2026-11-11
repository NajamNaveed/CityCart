import 'package:citycart_staff/core/format.dart';
import 'package:citycart_staff/core/status.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('money keeps paisa only when they exist', () {
    expect(formatMoney(2450), 'Rs 2,450');
    expect(formatMoney(2450.5), 'Rs 2,450.50');
    expect(formatMoney(null), 'Rs 0');
    expect(formatMoney(1200, currency: 'USD'), 'USD 1,200');
  });

  test('shop words replace status codes', () {
    expect(friendlyOrder('READY_FOR_SHIPMENT'), 'Ready to ship');
    expect(friendlyDelivery('OUT_FOR_DELIVERY'), 'Out for delivery');
    expect(friendlyReturn('IN_TRANSIT'), 'Coming back');
    expect(friendlyVerification('SUBMITTED'), 'Waiting for a check');
    expect(friendlyPaymentMethod('COD'), 'Cash on delivery');
    expect(friendlyPaymentMethod('SOMETHING_NEW'), 'Something new');
    expect(friendlyReturnReason('MISSING'), 'Missing from the bag');
    expect(friendlyCollectionMethod('CARD_MACHINE'), 'Card machine');
  });

  test('status tones stay inside the palette', () {
    expect(toneForOrder('DELIVERED'), StatusTone.sage);
    expect(toneForDelivery('FAILED'), StatusTone.danger);
    expect(toneForVerification('REJECTED'), StatusTone.danger);
    expect(toneForReturn('RECEIVED'), StatusTone.sage);
    expect(toneForOrder('SOMETHING_NEW'), StatusTone.muted);
  });

  test('units and lines read naturally', () {
    expect(unitsLabel(1), '1 unit');
    expect(unitsLabel(4), '4 units');
    expect(linesLabel(2), '2 lines');
    expect(initialsOf('Ayesha Khan'), 'AK');
    expect(initialsOf('Bilal'), 'B');
    expect(firstNameOf('Ayesha Khan'), 'Ayesha');
  });
}
