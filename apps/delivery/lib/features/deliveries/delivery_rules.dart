import '../../data/models.dart';

/// The delivery lifecycle, mirrored from
/// `server/src/config/deliveryTransitions.js`. The server still decides; this
/// only decides what the rider is offered.
const riderMovableStatuses = [
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED',
];

bool isClosedStatus(String status) =>
    status == 'DELIVERED' || status == 'CANCELLED' || status == 'RETURNED';

bool canStartDoorFlow(String status) => status == 'OUT_FOR_DELIVERY';

bool isWaitingOnStore(RiderDelivery delivery) =>
    delivery.paymentPending ||
    delivery.status == 'PENDING' ||
    delivery.status == 'PREPARING';

class NextAction {
  const NextAction({
    required this.status,
    required this.label,
    required this.helper,
  });

  final String status;
  final String label;
  final String helper;
}

/// The one button that moves a job forward. `OUT_FOR_DELIVERY` returns null
/// because it needs the door flow, not a plain status change.
NextAction? nextActionFor(String status) => switch (status) {
  'READY_FOR_PICKUP' => const NextAction(
    status: 'PICKED_UP',
    label: 'I have the parcel',
    helper: 'Tap once the store hands it to you.',
  ),
  'PICKED_UP' || 'IN_TRANSIT' => const NextAction(
    status: 'OUT_FOR_DELIVERY',
    label: 'Start the delivery',
    helper: "The customer will see that you're on the way.",
  ),
  'FAILED' => const NextAction(
    status: 'OUT_FOR_DELIVERY',
    label: 'Try this delivery again',
    helper: 'The job returns to your route.',
  ),
  _ => null,
};

enum CashKind { none, collect, waiting, rejected, proof, prepaid, collected }

class CashLine {
  const CashLine({required this.kind, this.amount = 0, this.proofStatus});

  final CashKind kind;
  final double amount;
  final String? proofStatus;
}

/// What the money card says, derived only from server fields.
CashLine cashLineFor(RiderDelivery? delivery) {
  if (delivery == null) return const CashLine(kind: CashKind.none);
  if (delivery.fulfilment == 'NONE') return const CashLine(kind: CashKind.none);
  if (delivery.paymentPending) return const CashLine(kind: CashKind.waiting);
  if (delivery.paymentRejected) {
    return CashLine(kind: CashKind.rejected, amount: delivery.amountToCollect);
  }
  if (delivery.amountToCollect > 0) {
    return CashLine(kind: CashKind.collect, amount: delivery.amountToCollect);
  }
  if (delivery.cashCollected) return const CashLine(kind: CashKind.collected);
  if (delivery.proofStatus != null) {
    return CashLine(kind: CashKind.proof, proofStatus: delivery.proofStatus);
  }
  return const CashLine(kind: CashKind.prepaid);
}

String friendlyProofStatus(String? status) => switch (status) {
  'SUBMITTED' => 'The store is checking this payment.',
  'VERIFIED' => 'The store checked this payment.',
  'REJECTED' => 'The store could not verify it. Collect again.',
  _ => 'The store is checking this payment.',
};

// --- The door answer (docs/22 §F) -------------------------------------------

class ReturnReason {
  const ReturnReason({
    required this.value,
    required this.label,
    required this.storeFault,
  });

  final String value;
  final String label;
  final bool storeFault;
}

const returnReasons = <ReturnReason>[
  ReturnReason(value: 'DAMAGED', label: 'Damaged', storeFault: true),
  ReturnReason(value: 'WRONG_ITEM', label: 'Wrong item', storeFault: true),
  ReturnReason(value: 'MISSING', label: 'Missing', storeFault: true),
  ReturnReason(
    value: 'NOT_WANTED',
    label: 'Customer changed mind',
    storeFault: false,
  ),
];

/// One order line while the rider is at the door. Starts fully kept; only what
/// comes back is changed. This is UI state — every figure is checked again by
/// the server.
class DoorLine {
  const DoorLine({
    required this.itemId,
    required this.productName,
    required this.quantity,
    required this.lineTotal,
    required this.kept,
    this.reason,
    this.photo,
    this.photoPath,
    this.photoBusy = false,
  });

  final String itemId;
  final String productName;
  final int quantity;
  final double lineTotal;
  final int kept;
  final String? reason;
  final UploadedPhoto? photo;
  final String? photoPath;
  final bool photoBusy;

  int get rejected => quantity - kept;
  bool get isComplete => rejected == 0 || reason != null;

  DoorLine copyWith({
    int? kept,
    String? reason,
    bool clearReason = false,
    UploadedPhoto? photo,
    bool clearPhoto = false,
    String? photoPath,
    bool clearPhotoPath = false,
    bool? photoBusy,
  }) {
    return DoorLine(
      itemId: itemId,
      productName: productName,
      quantity: quantity,
      lineTotal: lineTotal,
      kept: kept ?? this.kept,
      reason: clearReason ? null : (reason ?? this.reason),
      photo: clearPhoto ? null : (photo ?? this.photo),
      photoPath: clearPhotoPath ? null : (photoPath ?? this.photoPath),
      photoBusy: photoBusy ?? this.photoBusy,
    );
  }
}

List<DoorLine> doorLinesFrom(RiderDelivery delivery) => delivery.items
    .map(
      (item) => DoorLine(
        itemId: item.itemId,
        productName: item.productName,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        kept: item.quantity,
      ),
    )
    .toList(growable: false);

DoorLine withKept(DoorLine line, int kept) {
  final value = kept.clamp(0, line.quantity).toInt();
  return line.copyWith(
    kept: value,
    clearReason: value == line.quantity,
    clearPhoto: value == line.quantity,
    clearPhotoPath: value == line.quantity,
  );
}

bool doorLinesReady(List<DoorLine> lines) =>
    lines.every((line) => line.isComplete);

double _roundMoney(double value) => (value * 100).round() / 100;

double _lineShare(DoorLine line, int units) {
  if (line.quantity <= 0) return 0;
  return _roundMoney(line.lineTotal * units / line.quantity);
}

class CompletionEstimate {
  const CompletionEstimate({
    required this.acceptedTotal,
    required this.returnedTotal,
    required this.fee,
    required this.feeRefunded,
    required this.netTotal,
    required this.refundTotal,
    required this.hasRejected,
    required this.everythingRejected,
  });

  final double acceptedTotal;
  final double returnedTotal;
  final double fee;
  final bool feeRefunded;
  final double netTotal;
  final double refundTotal;
  final bool hasRejected;
  final bool everythingRejected;
}

/// The rider's preview of the final money, following the same agreed rules as
/// `server/src/services/return.service.js`. The server's answer is the one
/// that counts.
CompletionEstimate estimateCompletion(
  List<DoorLine> lines,
  RiderDelivery delivery,
) {
  final accepted = _roundMoney(
    lines.fold<double>(0, (sum, line) => sum + _lineShare(line, line.kept)),
  );
  final returned = _roundMoney(
    lines.fold<double>(0, (sum, line) => sum + _lineShare(line, line.rejected)),
  );
  final fee = delivery.deliveryFee;
  final everythingRejected = lines.isNotEmpty && accepted == 0 && returned > 0;
  final hasStoreFault = lines.any(
    (line) =>
        line.rejected > 0 &&
        returnReasons.any((r) => r.value == line.reason && r.storeFault),
  );
  final feeRefunded = everythingRejected && hasStoreFault;
  final net = _roundMoney(
    delivery.amountToCollect - returned - (feeRefunded ? fee : 0),
  );
  return CompletionEstimate(
    acceptedTotal: accepted,
    returnedTotal: returned,
    fee: fee,
    feeRefunded: feeRefunded,
    netTotal: net < 0 ? 0 : net,
    refundTotal: _roundMoney(returned + (feeRefunded ? fee : 0)),
    hasRejected: returned > 0,
    everythingRejected: everythingRejected,
  );
}

bool anyRejected(List<DoorLine> lines) =>
    lines.any((line) => line.rejected > 0);

/// One entry per order line — the server requires every item exactly once.
/// Fully accepted jobs omit `lines` entirely, which the server reads as
/// "everything was delivered".
List<Map<String, dynamic>> linesPayload(List<DoorLine> lines) => lines
    .map(
      (line) => {
        'itemId': line.itemId,
        'acceptedQty': line.kept,
        'rejectedQty': line.rejected,
        if (line.rejected > 0 && line.reason != null) 'reason': line.reason,
        if (line.rejected > 0 && line.photo != null)
          'photo': line.photo!.toJson(),
      },
    )
    .toList(growable: false);

// --- Payment at the door ----------------------------------------------------

class PaymentMethodOption {
  const PaymentMethodOption({required this.value, required this.label});

  final String value;
  final String label;
}

const paymentMethods = <PaymentMethodOption>[
  PaymentMethodOption(value: 'CASH', label: 'Cash'),
  PaymentMethodOption(value: 'BANK_TRANSFER', label: 'Bank transfer'),
  PaymentMethodOption(value: 'WALLET', label: 'JazzCash or Easypaisa'),
  PaymentMethodOption(value: 'CARD_MACHINE', label: 'Card machine'),
];

const wallets = <String, String>{
  'JAZZCASH': 'JazzCash',
  'EASYPAISA': 'Easypaisa',
  'OTHER': 'Other wallet',
};

String paymentMethodLabel(String value) {
  for (final method in paymentMethods) {
    if (method.value == value) return method.label;
  }
  return value;
}

List<PaymentMethodOption> methodsFor(RiderDelivery delivery) => paymentMethods
    .where((method) => delivery.paymentOptions.contains(method.value))
    .toList(growable: false);

class DoorPayment {
  const DoorPayment({
    this.method = 'CASH',
    this.wallet = 'JAZZCASH',
    this.reference = '',
    this.proof,
    this.proofPath,
    this.busy = false,
  });

  final String method;
  final String wallet;
  final String reference;
  final UploadedPhoto? proof;
  final String? proofPath;
  final bool busy;

  bool get isCash => method == 'CASH';

  DoorPayment copyWith({
    String? method,
    String? wallet,
    String? reference,
    UploadedPhoto? proof,
    bool clearProof = false,
    String? proofPath,
    bool clearProofPath = false,
    bool? busy,
  }) {
    return DoorPayment(
      method: method ?? this.method,
      wallet: wallet ?? this.wallet,
      reference: reference ?? this.reference,
      proof: clearProof ? null : (proof ?? this.proof),
      proofPath: clearProofPath ? null : (proofPath ?? this.proofPath),
      busy: busy ?? this.busy,
    );
  }
}

bool paymentReady(DoorPayment payment) {
  if (payment.isCash) return true;
  if (payment.reference.trim().length < 3) return false;
  if (payment.proof == null) return false;
  return payment.method != 'WALLET' || wallets.containsKey(payment.wallet);
}

Map<String, dynamic> collectionPayload(DoorPayment payment) {
  if (payment.isCash) return {'method': 'CASH'};
  return {
    'method': payment.method,
    if (payment.method == 'WALLET') 'wallet': payment.wallet,
    'reference': payment.reference.trim(),
    'proof': payment.proof!.toJson(),
  };
}

/// A failed attempt needs a reason (the server requires one). These are quick
/// choices, not a closed list; "Something else" lets the rider type it.
const failureReasons = [
  'Customer did not answer',
  'Customer asked to reschedule',
  'Wrong or incomplete address',
  'Customer refused the order',
  'The store was not ready',
];

// --- Small device actions ---------------------------------------------------

String telUrl(String? phone) =>
    'tel:${(phone ?? '').replaceAll(RegExp(r'[^\d+]'), '')}';

String? mapsUrl(DeliveryAddress? address) {
  if (address == null) return null;
  final query = [
    address.address,
    address.city,
    address.postalCode,
  ].where((part) => (part ?? '').trim().isNotEmpty).join(', ');
  if (query.isEmpty) return null;
  return 'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(query)}';
}

String locationMapUrl(GeoPoint point) =>
    'https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}';
