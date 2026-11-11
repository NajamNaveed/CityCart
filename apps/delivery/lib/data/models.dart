double asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('${value ?? ''}') ?? 0;
}

double? asNullableDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

int asInt(dynamic value) {
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}

String? asString(dynamic value) {
  if (value == null) return null;
  final text = '$value';
  return text.isEmpty ? null : text;
}

DateTime? asDate(dynamic value) {
  if (value == null) return null;
  final text = '$value';
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}

Map<String, dynamic> asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.map((key, item) => MapEntry('$key', item));
  return const {};
}

List<dynamic> asList(dynamic value) => value is List ? value : const [];

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.brandId,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String? brandId;

  bool get isRider => role == 'RIDER';

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: asString(json['id']) ?? '',
    name: asString(json['name']) ?? 'Rider',
    email: asString(json['email']) ?? '',
    role: asString(json['role']) ?? '',
    brandId: asString(json['brandId']),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    if (brandId != null) 'brandId': brandId,
  };
}

class DeliveryAddress {
  const DeliveryAddress({
    this.name,
    this.phone,
    this.address,
    this.city,
    this.postalCode,
    this.additionalInstructions,
  });

  final String? name;
  final String? phone;
  final String? address;
  final String? city;
  final String? postalCode;
  final String? additionalInstructions;

  String get line => [
    address,
    city,
  ].where((part) => (part ?? '').trim().isNotEmpty).join(', ');

  String get area => (city ?? '').trim().isEmpty ? line : city!.trim();

  factory DeliveryAddress.fromJson(Map<String, dynamic> json) =>
      DeliveryAddress(
        name: asString(json['name']),
        phone: asString(json['phone']),
        address: asString(json['address']),
        city: asString(json['city']),
        postalCode: asString(json['postalCode']),
        additionalInstructions: asString(json['additionalInstructions']),
      );
}

class DeliveryItem {
  const DeliveryItem({
    required this.itemId,
    required this.productName,
    required this.quantity,
    required this.lineTotal,
  });

  final String itemId;
  final String productName;
  final int quantity;
  final double lineTotal;

  factory DeliveryItem.fromJson(Map<String, dynamic> json) => DeliveryItem(
    itemId: asString(json['itemId']) ?? '',
    productName: asString(json['productName']) ?? 'Item',
    quantity: asInt(json['quantity']),
    lineTotal: asDouble(json['lineTotal']),
  );
}

class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
    latitude: asDouble(json['latitude']),
    longitude: asDouble(json['longitude']),
  );
}

/// Exactly what `GET /rider/deliveries` returns for one job. Every field is
/// authoritative on the server; the app only reads it.
class RiderDelivery {
  const RiderDelivery({
    required this.id,
    required this.status,
    required this.currency,
    required this.items,
    required this.paymentOptions,
    required this.amountToCollect,
    required this.deliveryFee,
    required this.returnedAmount,
    required this.feeRefunded,
    required this.cashCollected,
    required this.paymentPending,
    required this.paymentRejected,
    this.orderNumber,
    this.failureReason,
    this.trackingReference,
    this.assignedAt,
    this.updatedAt,
    this.address,
    this.deliveryLocation,
    this.paymentMethod,
    this.fulfilment,
    this.netTotal,
    this.paymentNote,
    this.proofStatus,
  });

  final String id;
  final String status;
  final String currency;
  final List<DeliveryItem> items;
  final List<String> paymentOptions;
  final double amountToCollect;
  final double deliveryFee;
  final double returnedAmount;
  final bool feeRefunded;
  final bool cashCollected;
  final bool paymentPending;
  final bool paymentRejected;

  final String? orderNumber;
  final String? failureReason;
  final String? trackingReference;
  final DateTime? assignedAt;
  final DateTime? updatedAt;
  final DeliveryAddress? address;
  final GeoPoint? deliveryLocation;
  final String? paymentMethod;
  final String? fulfilment;
  final double? netTotal;
  final String? paymentNote;
  final String? proofStatus;

  bool get isCod => paymentMethod == 'COD';

  factory RiderDelivery.fromJson(Map<String, dynamic> json) => RiderDelivery(
    id: asString(json['_id']) ?? asString(json['id']) ?? '',
    status: asString(json['status']) ?? 'PENDING',
    currency: asString(json['currency']) ?? 'PKR',
    items: asList(json['items'])
        .map((item) => DeliveryItem.fromJson(asMap(item)))
        .toList(growable: false),
    paymentOptions: asList(json['paymentOptions'])
        .map((option) => '$option')
        .toList(growable: false),
    amountToCollect: asDouble(json['amountToCollect']),
    deliveryFee: asDouble(json['deliveryFee']),
    returnedAmount: asDouble(json['returnedAmount']),
    feeRefunded: json['feeRefunded'] == true,
    cashCollected: json['cashCollected'] == true,
    paymentPending: json['paymentPending'] == true,
    paymentRejected: json['paymentRejected'] == true,
    orderNumber: asString(json['orderNumber']),
    failureReason: asString(json['failureReason']),
    trackingReference: asString(json['trackingReference']),
    assignedAt: asDate(json['assignedAt']),
    updatedAt: asDate(json['updatedAt']),
    address: json['address'] is Map
        ? DeliveryAddress.fromJson(asMap(json['address']))
        : null,
    deliveryLocation: json['deliveryLocation'] is Map
        ? GeoPoint.fromJson(asMap(json['deliveryLocation']))
        : null,
    paymentMethod: asString(json['paymentMethod']),
    fulfilment: asString(json['fulfilment']),
    netTotal: asNullableDouble(json['netTotal']),
    paymentNote: asString(json['paymentNote']),
    proofStatus: asString(json['proofStatus']),
  );
}

class DeliveryPage {
  const DeliveryPage({
    required this.items,
    required this.page,
    required this.pages,
    required this.total,
  });

  final List<RiderDelivery> items;
  final int page;
  final int pages;
  final int total;

  bool get hasMore => page < pages;
}

class CashInHand {
  const CashInHand({required this.count, required this.total});

  final int count;
  final double total;

  factory CashInHand.fromJson(Map<String, dynamic> json) =>
      CashInHand(count: asInt(json['count']), total: asDouble(json['total']));
}

/// The server-signed Cloudinary upload: the folder, timestamp and type are part
/// of the signature, so the app cannot choose a different one.
class ProofUpload {
  const ProofUpload({
    required this.uploadUrl,
    required this.apiKey,
    required this.timestamp,
    required this.signature,
    required this.folder,
    required this.allowedFormats,
    required this.type,
  });

  final String uploadUrl;
  final String apiKey;
  final int timestamp;
  final String signature;
  final String folder;
  final String allowedFormats;
  final String type;

  factory ProofUpload.fromJson(Map<String, dynamic> json) => ProofUpload(
    uploadUrl: asString(json['uploadUrl']) ?? '',
    apiKey: asString(json['apiKey']) ?? '',
    timestamp: asInt(json['timestamp']),
    signature: asString(json['signature']) ?? '',
    folder: asString(json['folder']) ?? '',
    allowedFormats: asString(json['allowedFormats']) ?? 'jpg,png,webp',
    type: asString(json['type']) ?? 'authenticated',
  );
}

class UploadedPhoto {
  const UploadedPhoto({required this.publicId, required this.fingerprint});

  final String publicId;
  final String fingerprint;

  Map<String, dynamic> toJson() => {
    'publicId': publicId,
    'fingerprint': fingerprint,
  };
}
