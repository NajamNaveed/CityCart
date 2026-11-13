// Every type here mirrors a response the server actually sends. Parsing is
// defensive: one unexpected field must never blank a whole screen.

String text(dynamic value, [String fallback = '']) {
  if (value is String) return value;
  if (value == null) return fallback;
  return value.toString();
}

String? optionalText(dynamic value) {
  if (value is String && value.trim().isNotEmpty) return value;
  return null;
}

int asInt(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('${value ?? ''}') ?? fallback;
}

double asDouble(dynamic value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  return double.tryParse('${value ?? ''}') ?? fallback;
}

DateTime? asDate(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

Map<String, dynamic> asMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

List<dynamic> asList(dynamic value) =>
    value is List ? value : const <dynamic>[];

class Pagination {
  const Pagination({this.page = 1, this.pages = 1, this.total = 0});

  final int page;
  final int pages;
  final int total;

  factory Pagination.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Pagination(
      page: asInt(map['page'], 1),
      pages: asInt(map['pages'], 1),
      total: asInt(map['total']),
    );
  }

  bool get hasMore => page < pages;
}

class Page<T> {
  const Page({required this.items, this.pagination = const Pagination()});

  final List<T> items;
  final Pagination pagination;

  bool get hasMore => pagination.hasMore;

  factory Page.fromJson(
    dynamic raw, {
    required String key,
    required T Function(dynamic) parse,
  }) {
    final map = asMap(raw);
    return Page(
      items: asList(map[key]).map(parse).toList(growable: false),
      pagination: Pagination.fromJson(map['pagination']),
    );
  }
}

class SettledCash {
  const SettledCash({required this.count, required this.total});

  final int count;
  final double total;

  factory SettledCash.fromJson(dynamic raw) {
    final map = asMap(raw);
    return SettledCash(
      count: asInt(map['settled']),
      total: asDouble(map['total']),
    );
  }
}

class Workspace {
  const Workspace({
    required this.brandId,
    required this.brandName,
    required this.role,
    this.membershipId,
  });

  final String brandId;
  final String brandName;
  final String role;
  final String? membershipId;

  factory Workspace.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Workspace(
      brandId: text(map['brandId']),
      brandName: text(map['brandName'], 'Brand'),
      role: text(map['role'], 'BRAND_EMPLOYEE'),
      membershipId: optionalText(map['membershipId']),
    );
  }
}

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.emailVerified = false,
    this.brandId,
    this.membershipId,
    this.permissions = const <String>[],
    this.accessRestricted = false,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final bool emailVerified;
  final String? brandId;
  final String? membershipId;
  final List<String> permissions;
  final bool accessRestricted;

  bool get isPicker => role == 'PICKER';

  factory AppUser.fromJson(dynamic raw) {
    final map = asMap(raw);
    final access = asMap(map['access']);
    return AppUser(
      id: text(map['id'] ?? map['_id']),
      name: text(map['name'], 'Team member'),
      email: text(map['email']),
      role: text(map['role'], 'BRAND_EMPLOYEE'),
      emailVerified: map['emailVerified'] == true,
      brandId: optionalText(map['brandId']),
      membershipId: optionalText(map['membershipId']),
      permissions: asList(map['permissions'])
          .whereType<String>()
          .toList(growable: false),
      accessRestricted: access['restricted'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    'emailVerified': emailVerified,
    if (brandId != null) 'brandId': brandId,
    if (membershipId != null) 'membershipId': membershipId,
    'permissions': permissions,
    if (accessRestricted) 'access': {'restricted': true},
  };
}

class LoginResult {
  const LoginResult({required this.user, required this.token});

  final AppUser user;
  final String token;

  factory LoginResult.fromJson(dynamic raw) {
    final map = asMap(raw);
    return LoginResult(
      user: AppUser.fromJson(map['user']),
      token: text(map['token']),
    );
  }
}

// --- Picking ---------------------------------------------------------------

class PickQueueItem {
  const PickQueueItem({
    required this.id,
    required this.orderNumber,
    required this.orderStatus,
    required this.itemCount,
    required this.units,
    this.createdAt,
    this.pickStartedAt,
    this.customerFirstName = 'Customer',
    this.claimedByMe = false,
    this.waitingForCustomer = false,
  });

  final String id;
  final String orderNumber;
  final String orderStatus;
  final int itemCount;
  final int units;
  final DateTime? createdAt;
  final DateTime? pickStartedAt;
  final String customerFirstName;
  final bool claimedByMe;
  final bool waitingForCustomer;

  factory PickQueueItem.fromJson(dynamic raw) {
    final map = asMap(raw);
    return PickQueueItem(
      id: text(map['_id']),
      orderNumber: text(map['orderNumber']),
      orderStatus: text(map['orderStatus'], 'CONFIRMED'),
      itemCount: asInt(map['itemCount']),
      units: asInt(map['units']),
      createdAt: asDate(map['createdAt']),
      pickStartedAt: asDate(map['pickStartedAt']),
      customerFirstName: text(map['customerFirstName'], 'Customer'),
      claimedByMe: map['claimedByMe'] == true,
      waitingForCustomer: map['waitingForCustomer'] == true,
    );
  }
}

class PickLine {
  const PickLine({
    required this.id,
    required this.productName,
    required this.quantity,
    this.productId,
    this.sku,
    this.image,
    this.pickStatus,
    this.pickedQty,
  });

  final String id;
  final String productName;
  final int quantity;
  final String? productId;
  final String? sku;
  final String? image;
  final String? pickStatus;
  final int? pickedQty;

  bool get isPicked => pickStatus == 'PICKED';
  bool get isShort => pickStatus == 'SHORT';
  bool get isUnavailable => pickStatus == 'UNAVAILABLE';
  bool get isDecided => isPicked || isShort || isUnavailable;

  /// Units that still need a home when the line is short.
  int get shortfall => quantity - (pickedQty ?? 0);

  factory PickLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    return PickLine(
      id: text(map['_id']),
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      productId: optionalText(map['productId']),
      sku: optionalText(map['sku']),
      image: optionalText(map['image']),
      pickStatus: optionalText(map['pickStatus']),
      pickedQty: map['pickedQty'] == null ? null : asInt(map['pickedQty']),
    );
  }
}

class ActiveAdjustment {
  const ActiveAdjustment({
    required this.id,
    this.status = 'PROPOSED',
    this.note,
    this.expiresAt,
    this.proposedByRole = 'BRAND_EMPLOYEE',
  });

  final String id;
  final String status;
  final String? note;
  final DateTime? expiresAt;
  final String proposedByRole;

  factory ActiveAdjustment.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ActiveAdjustment(
      id: text(map['_id']),
      status: text(map['status'], 'PROPOSED'),
      note: optionalText(map['note']),
      expiresAt: asDate(map['expiresAt']),
      proposedByRole: text(map['proposedByRole'], 'BRAND_EMPLOYEE'),
    );
  }
}

class PickOrder {
  const PickOrder({
    required this.id,
    required this.orderNumber,
    required this.orderStatus,
    required this.lines,
    this.createdAt,
    this.pickStartedAt,
    this.packedAt,
    this.claimedByMe = false,
    this.customerFirstName = 'Customer',
    this.activeAdjustment,
  });

  final String id;
  final String orderNumber;
  final String orderStatus;
  final List<PickLine> lines;
  final DateTime? createdAt;
  final DateTime? pickStartedAt;
  final DateTime? packedAt;
  final bool claimedByMe;
  final String customerFirstName;
  final ActiveAdjustment? activeAdjustment;

  int get units => lines.fold(0, (sum, line) => sum + line.quantity);
  int get decidedCount => lines.where((line) => line.isDecided).length;
  int get pendingCount => lines.length - decidedCount;
  bool get isComplete => lines.isNotEmpty && pendingCount == 0;

  factory PickOrder.fromJson(dynamic raw) {
    final map = asMap(raw);
    final adjustment = map['activeAdjustment'];
    return PickOrder(
      id: text(map['_id']),
      orderNumber: text(map['orderNumber']),
      orderStatus: text(map['orderStatus'], 'PROCESSING'),
      lines: asList(map['items'])
          .map(PickLine.fromJson)
          .toList(growable: false),
      createdAt: asDate(map['createdAt']),
      pickStartedAt: asDate(map['pickStartedAt']),
      packedAt: asDate(map['packedAt']),
      claimedByMe: map['claimedByMe'] == true,
      customerFirstName: text(map['customerFirstName'], 'Customer'),
      activeAdjustment: adjustment == null
          ? null
          : ActiveAdjustment.fromJson(adjustment),
    );
  }
}

class ProductOption {
  const ProductOption({
    required this.id,
    required this.name,
    this.sku,
    this.image,
  });

  final String id;
  final String name;
  final String? sku;
  final String? image;

  factory ProductOption.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ProductOption(
      id: text(map['_id']),
      name: text(map['name'], 'Product'),
      sku: optionalText(map['sku']),
      image: optionalText(map['image']),
    );
  }
}

// --- Orders ----------------------------------------------------------------

class ShippingAddress {
  const ShippingAddress({
    this.name = '',
    this.phone = '',
    this.address = '',
    this.city,
    this.state,
    this.postalCode,
    this.additionalInstructions,
  });

  final String name;
  final String phone;
  final String address;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? additionalInstructions;

  String get oneLine {
    final parts = [
      address,
      if (city != null && city!.trim().isNotEmpty) city!,
      if (state != null && state!.trim().isNotEmpty) state!,
    ];
    return parts.where((part) => part.trim().isNotEmpty).join(', ');
  }

  factory ShippingAddress.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ShippingAddress(
      name: text(map['name']),
      phone: text(map['phone']),
      address: text(map['address']),
      city: optionalText(map['city']),
      state: optionalText(map['state']),
      postalCode: optionalText(map['postalCode']),
      additionalInstructions: optionalText(map['additionalInstructions']),
    );
  }
}

class OrderLine {
  const OrderLine({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
    this.sku,
    this.image,
    this.pickStatus,
    this.pickedQty,
  });

  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;
  final String? sku;
  final String? image;
  final String? pickStatus;
  final int? pickedQty;

  factory OrderLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderLine(
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      totalPrice: asDouble(map['totalPrice']),
      sku: optionalText(map['sku']),
      image: optionalText(map['image']),
      pickStatus: optionalText(map['pickStatus']),
      pickedQty: map['pickedQty'] == null ? null : asInt(map['pickedQty']),
    );
  }
}

class OrderRecord {
  const OrderRecord({
    required this.id,
    required this.orderNumber,
    required this.orderStatus,
    required this.lines,
    required this.total,
    this.createdAt,
    this.address = const ShippingAddress(),
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.tax = 0,
    this.paymentMethod,
    this.paymentStatus,
    this.currency = 'PKR',
  });

  final String id;
  final String orderNumber;
  final String orderStatus;
  final List<OrderLine> lines;
  final double total;
  final DateTime? createdAt;
  final ShippingAddress address;
  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double tax;
  final String? paymentMethod;
  final String? paymentStatus;
  final String currency;

  int get units => lines.fold(0, (sum, line) => sum + line.quantity);

  factory OrderRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderRecord(
      id: text(map['_id'] ?? map['id']),
      orderNumber: text(map['orderNumber']),
      orderStatus: text(map['orderStatus'], 'CONFIRMED'),
      lines: asList(map['items'])
          .map(OrderLine.fromJson)
          .toList(growable: false),
      total: asDouble(map['total']),
      createdAt: asDate(map['createdAt']),
      address: ShippingAddress.fromJson(map['shippingAddress']),
      subtotal: asDouble(map['subtotal']),
      deliveryFee: asDouble(map['deliveryFee']),
      discount: asDouble(map['discount']),
      tax: asDouble(map['tax']),
      paymentMethod: optionalText(map['paymentMethod']),
      paymentStatus: optionalText(map['paymentStatus']),
      currency: text(map['currency'], 'PKR'),
    );
  }
}

class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.status,
    required this.amount,
    this.method,
    this.currency = 'PKR',
    this.paidAt,
    this.transactionReference,
    this.provider,
    this.collectionMethod,
    this.collectionWallet,
    this.collectionReference,
    this.verification,
    this.proofAvailable = false,
  });

  final String id;
  final String status;
  final double amount;
  final String? method;
  final String currency;
  final DateTime? paidAt;
  final String? transactionReference;
  final String? provider;
  final String? collectionMethod;
  final String? collectionWallet;
  final String? collectionReference;
  final String? verification;
  final bool proofAvailable;

  factory PaymentRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    final collection = asMap(map['collection']);
    final proof = asMap(collection['proof']);
    return PaymentRecord(
      id: text(map['_id']),
      status: text(map['status'], 'PENDING'),
      amount: asDouble(map['amount']),
      method: optionalText(map['method']),
      currency: text(map['currency'], 'PKR'),
      paidAt: asDate(map['paidAt']),
      transactionReference: optionalText(map['transactionReference']),
      provider: optionalText(map['provider']),
      collectionMethod: optionalText(collection['method']),
      collectionWallet: optionalText(collection['wallet']),
      collectionReference: optionalText(collection['reference']),
      verification: optionalText(collection['verification']),
      proofAvailable: optionalText(proof['publicId']) != null,
    );
  }
}

class OrderDetailBundle {
  const OrderDetailBundle({
    required this.order,
    this.payment,
    this.delivery,
    this.adjustments = const [],
  });

  final OrderRecord order;
  final PaymentRecord? payment;
  final DeliveryRecord? delivery;
  final List<OrderAdjustmentView> adjustments;

  factory OrderDetailBundle.fromJson(dynamic raw) {
    final map = asMap(raw);
    final delivery = map['delivery'];
    return OrderDetailBundle(
      order: OrderRecord.fromJson(map['order']),
      payment: map['payment'] == null
          ? null
          : PaymentRecord.fromJson(map['payment']),
      delivery: delivery == null ? null : DeliveryRecord.fromJson(delivery),
      adjustments: asList(map['adjustments'])
          .map(OrderAdjustmentView.fromJson)
          .toList(growable: false),
    );
  }
}

class OrderAdjustmentView {
  const OrderAdjustmentView({
    required this.id,
    required this.status,
    required this.lines,
    this.note = '',
    this.createdAt,
    this.respondedAt,
    this.proposedByRole,
    this.totalsBefore = 0,
    this.totalsAfter = 0,
    this.responseAction,
    this.responseNote,
  });

  final String id;
  final String status;
  final List<OrderAdjustmentLine> lines;
  final String note;
  final DateTime? createdAt;
  final DateTime? respondedAt;
  final String? proposedByRole;
  final double totalsBefore;
  final double totalsAfter;
  final String? responseAction;
  final String? responseNote;

  factory OrderAdjustmentView.fromJson(dynamic raw) {
    final map = asMap(raw);
    final response = asMap(map['response']);
    return OrderAdjustmentView(
      id: text(map['_id']),
      status: text(map['status'], 'PROPOSED'),
      note: text(map['note']),
      createdAt: asDate(map['createdAt']),
      respondedAt: asDate(map['respondedAt']),
      proposedByRole: optionalText(map['proposedByRole']),
      totalsBefore: asDouble(asMap(map['totalsBefore'])['total']),
      totalsAfter: asDouble(asMap(map['totalsAfter'])['total']),
      responseAction: optionalText(response['action']),
      responseNote: optionalText(response['note']),
      lines: asList(map['lines'])
          .map(OrderAdjustmentLine.fromJson)
          .toList(growable: false),
    );
  }
}

class OrderAdjustmentLine {
  const OrderAdjustmentLine({
    required this.productName,
    required this.orderedQuantity,
    required this.supplyQuantity,
    this.substituteName,
  });

  final String productName;
  final int orderedQuantity;
  final int supplyQuantity;
  final String? substituteName;

  factory OrderAdjustmentLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    final substitute = asMap(map['substitute']);
    return OrderAdjustmentLine(
      productName: text(map['productName'], 'Item'),
      orderedQuantity: asInt(map['orderedQuantity']),
      supplyQuantity: asInt(map['supplyQuantity']),
      substituteName: optionalText(substitute['productName']),
    );
  }
}

// --- Deliveries ------------------------------------------------------------

class DeliveryRecord {
  const DeliveryRecord({
    required this.id,
    required this.status,
    this.orderId,
    this.orderNumber,
    this.address = const ShippingAddress(),
    this.deliveryFee = 0,
    this.trackingReference,
    this.riderId,
    this.assignedAgent,
    this.assignedAt,
    this.failureReason,
    this.returnId,
    this.createdAt,
  });

  final String id;
  final String status;
  final String? orderId;
  final String? orderNumber;
  final ShippingAddress address;
  final double deliveryFee;
  final String? trackingReference;
  final String? riderId;
  final String? assignedAgent;
  final DateTime? assignedAt;
  final String? failureReason;
  final String? returnId;
  final DateTime? createdAt;

  bool get hasRider => riderId != null && riderId!.isNotEmpty;

  String get riderLabel {
    if (assignedAgent != null && assignedAgent!.trim().isNotEmpty) {
      return assignedAgent!;
    }
    return hasRider ? 'Assigned' : 'Not assigned';
  }

  factory DeliveryRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    return DeliveryRecord(
      id: text(map['_id']),
      status: text(map['status'], 'PENDING'),
      orderId: optionalText(map['orderId']),
      orderNumber: optionalText(map['orderNumber']),
      address: ShippingAddress.fromJson(map['address']),
      deliveryFee: asDouble(map['deliveryFee']),
      trackingReference: optionalText(map['trackingReference']),
      riderId: optionalText(map['riderId']),
      assignedAgent: optionalText(map['assignedAgent']),
      assignedAt: asDate(map['assignedAt']),
      failureReason: optionalText(map['failureReason']),
      returnId: optionalText(map['returnId']),
      createdAt: asDate(map['createdAt']),
    );
  }
}

class Rider {
  const Rider({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final bool isActive;

  factory Rider.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Rider(
      id: text(map['_id']),
      name: text(map['name'], 'Rider'),
      email: optionalText(map['email']),
      phone: optionalText(map['phone']),
      isActive: map['isActive'] != false,
    );
  }
}

// --- Returns ---------------------------------------------------------------

class ReturnLine {
  const ReturnLine({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    this.orderItemId,
    this.productId,
    this.reason,
    this.restock = false,
    this.restockedAt,
    this.hasPhoto = false,
  });

  final String productName;
  final int quantity;
  final double unitPrice;
  final String? orderItemId;
  final String? productId;
  final String? reason;
  final bool restock;
  final DateTime? restockedAt;
  final bool hasPhoto;

  factory ReturnLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReturnLine(
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      orderItemId: optionalText(map['orderItemId']),
      productId: optionalText(map['productId']),
      reason: optionalText(map['reason']),
      restock: map['restock'] == true,
      restockedAt: asDate(map['restockedAt']),
      hasPhoto: map['hasPhoto'] == true,
    );
  }
}

class ReturnRecord {
  const ReturnRecord({
    required this.id,
    required this.status,
    required this.lines,
    required this.returnedSubtotal,
    required this.refundAmount,
    this.orderId,
    this.orderNumber,
    this.deliveryId,
    this.source,
    this.feeRefunded = false,
    this.currency = 'PKR',
    this.receivedAt,
    this.createdAt,
  });

  final String id;
  final String status;
  final List<ReturnLine> lines;
  final double returnedSubtotal;
  final double refundAmount;
  final String? orderId;
  final String? orderNumber;
  final String? deliveryId;
  final String? source;
  final bool feeRefunded;
  final String currency;
  final DateTime? receivedAt;
  final DateTime? createdAt;

  bool get isOpen => status == 'IN_TRANSIT';
  int get units => lines.fold(0, (sum, line) => sum + line.quantity);

  factory ReturnRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReturnRecord(
      id: text(map['_id']),
      status: text(map['status'], 'IN_TRANSIT'),
      lines: asList(map['lines'])
          .map(ReturnLine.fromJson)
          .toList(growable: false),
      returnedSubtotal: asDouble(map['returnedSubtotal']),
      refundAmount: asDouble(map['refundAmount']),
      orderId: optionalText(map['orderId']),
      orderNumber: optionalText(map['orderNumber']),
      deliveryId: optionalText(map['deliveryId']),
      source: optionalText(map['source']),
      feeRefunded: map['feeRefunded'] == true,
      currency: text(map['currency'], 'PKR'),
      receivedAt: asDate(map['receivedAt']),
      createdAt: asDate(map['createdAt']),
    );
  }
}

class ReturnBucket {
  const ReturnBucket({this.count = 0, this.returnedSubtotal = 0});

  final int count;
  final double returnedSubtotal;

  factory ReturnBucket.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReturnBucket(
      count: asInt(map['count']),
      returnedSubtotal: asDouble(map['returnedSubtotal']),
    );
  }
}

class ReturnsSummary {
  const ReturnsSummary({
    this.inTransit = const ReturnBucket(),
    this.received = const ReturnBucket(),
    this.returnedSubtotal = 0,
    this.refundAmount = 0,
  });

  final ReturnBucket inTransit;
  final ReturnBucket received;
  final double returnedSubtotal;
  final double refundAmount;

  factory ReturnsSummary.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReturnsSummary(
      inTransit: ReturnBucket.fromJson(map['IN_TRANSIT']),
      received: ReturnBucket.fromJson(map['RECEIVED']),
      returnedSubtotal: asDouble(map['returnedSubtotal']),
      refundAmount: asDouble(map['refundAmount']),
    );
  }
}

// --- Money -----------------------------------------------------------------

class ReceiptLine {
  const ReceiptLine({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
  });

  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;

  factory ReceiptLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReceiptLine(
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      totalPrice: asDouble(map['totalPrice']),
    );
  }
}

class ReceiptRecord {
  const ReceiptRecord({
    required this.id,
    required this.receiptNumber,
    required this.amount,
    required this.lines,
    this.orderId,
    this.orderNumber,
    this.brandName,
    this.billedTo,
    this.method,
    this.currency = 'PKR',
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.tax = 0,
    this.issuedAt,
    this.paymentId,
    this.transactionReference,
    this.collectionMethod,
    this.collectionWallet,
    this.collectionReference,
    this.provider,
    this.collectedByName,
    this.proofVerification,
  });

  final String id;
  final String receiptNumber;
  final double amount;
  final List<ReceiptLine> lines;
  final String? orderId;
  final String? orderNumber;
  final String? brandName;
  final String? billedTo;
  final String? method;
  final String currency;
  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double tax;
  final DateTime? issuedAt;
  final String? paymentId;
  final String? transactionReference;
  final String? collectionMethod;
  final String? collectionWallet;
  final String? collectionReference;
  final String? provider;
  final String? collectedByName;
  final String? proofVerification;

  factory ReceiptRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    final proof = asMap(map['proofVerification']);
    return ReceiptRecord(
      id: text(map['_id']),
      receiptNumber: text(map['receiptNumber']),
      amount: asDouble(map['amount']),
      lines: asList(map['items'])
          .map(ReceiptLine.fromJson)
          .toList(growable: false),
      orderId: optionalText(map['orderId']),
      orderNumber: optionalText(map['orderNumber']),
      brandName: optionalText(map['brandName']),
      billedTo: optionalText(map['billedTo']),
      method: optionalText(map['method']),
      currency: text(map['currency'], 'PKR'),
      subtotal: asDouble(map['subtotal']),
      deliveryFee: asDouble(map['deliveryFee']),
      discount: asDouble(map['discount']),
      tax: asDouble(map['tax']),
      issuedAt: asDate(map['issuedAt']),
      paymentId: optionalText(map['paymentId']),
      transactionReference: optionalText(map['transactionReference']),
      collectionMethod: optionalText(map['collectionMethod']),
      collectionWallet: optionalText(map['collectionWallet']),
      collectionReference: optionalText(map['collectionReference']),
      provider: optionalText(map['provider']),
      collectedByName: optionalText(map['collectedByName']),
      proofVerification:
          optionalText(proof['status']) ??
          optionalText(map['proofVerification']),
    );
  }
}

class ProofRecord {
  const ProofRecord({
    required this.paymentId,
    required this.amount,
    required this.verification,
    this.orderNumber,
    this.currency = 'PKR',
    this.method,
    this.wallet,
    this.reference,
    this.submittedAt,
    this.verifiedAt,
    this.note,
    this.duplicateReference = false,
    this.duplicateProof = false,
    this.proofAvailable = false,
    this.deliveryPending = false,
    this.url,
    this.expiresAt,
    this.confirmBy,
    this.secondsLeft,
    this.expiredAt,
  });

  final String paymentId;
  final double amount;
  final String verification;
  final String? orderNumber;
  final String currency;
  final String? method;
  final String? wallet;
  final String? reference;
  final DateTime? submittedAt;
  final DateTime? verifiedAt;
  final String? note;
  final bool duplicateReference;
  final bool duplicateProof;
  final bool proofAvailable;
  final bool deliveryPending;
  final String? url;
  final DateTime? expiresAt;

  /// Deadline for this brand to confirm the payment (docs/10 §31.3).
  final DateTime? confirmBy;

  /// Server-computed seconds left when this record was built.
  final int? secondsLeft;

  /// The window closed with no decision; the rider collects again.
  final DateTime? expiredAt;

  bool get isPending => verification == 'SUBMITTED';

  /// A pending record whose confirmation window has passed. The server may
  /// not have flipped it to rejected yet, so the screen stops offering a
  /// decision here.
  bool get isWindowClosed => isPending && secondsLeft != null && secondsLeft! <= 0;

  factory ProofRecord.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ProofRecord(
      paymentId: text(map['paymentId']),
      amount: asDouble(map['amount']),
      verification: text(map['verification'], 'SUBMITTED'),
      orderNumber: optionalText(map['orderNumber']),
      currency: text(map['currency'], 'PKR'),
      method: optionalText(map['method']),
      wallet: optionalText(map['wallet']),
      reference: optionalText(map['reference']),
      submittedAt: asDate(map['submittedAt']),
      verifiedAt: asDate(map['verifiedAt']),
      note: optionalText(map['note']),
      duplicateReference: map['duplicateReference'] == true,
      duplicateProof: map['duplicateProof'] == true,
      proofAvailable: map['proofAvailable'] == true,
      deliveryPending: map['deliveryPending'] == true,
      url: optionalText(map['url']),
      expiresAt: asDate(map['expiresAt']),
      confirmBy: asDate(map['confirmBy']),
      secondsLeft: map['secondsLeft'] == null ? null : asInt(map['secondsLeft']),
      expiredAt: asDate(map['expiredAt']),
    );
  }
}

class CashCollector {
  const CashCollector({
    required this.collectorId,
    required this.name,
    required this.count,
    required this.total,
    this.role,
    this.oldest,
  });

  final String collectorId;
  final String name;
  final int count;
  final double total;
  final String? role;
  final DateTime? oldest;

  factory CashCollector.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CashCollector(
      collectorId: text(map['collectorId']),
      name: text(map['name'], 'Rider'),
      count: asInt(map['count']),
      total: asDouble(map['total']),
      role: optionalText(map['role']),
      oldest: asDate(map['oldest']),
    );
  }
}

class CashPayment {
  const CashPayment({
    required this.paymentId,
    required this.orderNumber,
    required this.amount,
    this.collectedAt,
  });

  final String paymentId;
  final String orderNumber;
  final double amount;
  final DateTime? collectedAt;

  factory CashPayment.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CashPayment(
      paymentId: text(map['paymentId']),
      orderNumber: text(map['orderNumber']),
      amount: asDouble(map['amount']),
      collectedAt: asDate(map['collectedAt']),
    );
  }
}

class CollectorCash {
  const CollectorCash({required this.payments, required this.total});

  final List<CashPayment> payments;
  final double total;

  factory CollectorCash.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CollectorCash(
      payments: asList(map['payments'])
          .map(CashPayment.fromJson)
          .toList(growable: false),
      total: asDouble(map['total']),
    );
  }
}
