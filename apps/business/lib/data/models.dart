/// True when the account signs in to run a shop.
const brandRole = 'BRAND_ADMIN';

/// True when the account signs in to run a service business.
const providerRole = 'SERVICE_PROVIDER';

class ProviderSummary {
  const ProviderSummary({
    required this.id,
    required this.displayName,
    required this.status,
  });

  final String id;
  final String displayName;
  final String status;

  bool get isActive => status == 'ACTIVE';
  bool get isPending => status == 'PENDING';

  factory ProviderSummary.fromJson(Map<String, dynamic> json) {
    return ProviderSummary(
      id: (json['id'] ?? '').toString(),
      displayName: (json['displayName'] ?? 'Your business').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'displayName': displayName,
    'status': status,
  };
}

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.brandId,
    this.providerId,
    this.provider,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String? brandId;
  final String? providerId;
  final ProviderSummary? provider;

  bool get isBrand => role == brandRole;
  bool get isProvider => role == providerRole;

  String get businessName {
    if (provider != null && provider!.displayName.trim().isNotEmpty) {
      return provider!.displayName;
    }
    return isBrand ? 'Your shop' : 'Your service business';
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final rawProvider = json['provider'];
    return AppUser(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? 'Owner').toString(),
      email: (json['email'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      brandId: json['brandId']?.toString(),
      providerId: json['providerId']?.toString(),
      provider: rawProvider is Map
          ? ProviderSummary.fromJson(Map<String, dynamic>.from(rawProvider))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    if (brandId != null) 'brandId': brandId,
    if (providerId != null) 'providerId': providerId,
    if (provider != null) 'provider': provider!.toJson(),
  };
}

class AuthResult {
  const AuthResult({required this.token, required this.user});

  final String token;
  final AppUser user;
}

/// The shop a brand owner runs. The home screen shows the shop's review state
/// so an owner is never puzzled by a shop that is not live yet.
class BrandSummary {
  const BrandSummary({
    required this.id,
    required this.name,
    required this.slug,
    required this.status,
    this.billingStatus,
  });

  final String id;
  final String name;
  final String slug;
  final String status;
  final String? billingStatus;

  bool get isActive => status == 'ACTIVE';

  factory BrandSummary.fromJson(Map<String, dynamic> json) {
    return BrandSummary(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? 'Your shop').toString(),
      slug: (json['slug'] ?? '').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
      billingStatus: json['billingStatus']?.toString(),
    );
  }
}

/// The service business a provider runs. The home screen shows the profile as
/// customers see it, plus the review state that gates new bookings.
class ProviderProfile {
  const ProviderProfile({
    required this.id,
    required this.displayName,
    required this.status,
    this.categoryName,
    this.cityName,
    this.blockName,
    this.addressLine,
    this.phone,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedBookings = 0,
    this.startingAtPrice,
  });

  final String id;
  final String displayName;
  final String status;
  final String? categoryName;
  final String? cityName;
  final String? blockName;
  final String? addressLine;
  final String? phone;
  final double ratingAvg;
  final int ratingCount;
  final int completedBookings;
  final int? startingAtPrice;

  bool get isActive => status == 'ACTIVE';
  bool get isPending => status == 'PENDING';

  String get areaLabel {
    final parts = [
      blockName,
      cityName,
    ].whereType<String>().where((value) => value.trim().isNotEmpty);
    return parts.isEmpty ? 'Not set' : parts.join(', ');
  }

  factory ProviderProfile.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    final city = json['city'];
    final block = json['block'];
    return ProviderProfile(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      displayName: (json['displayName'] ?? 'Your business').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
      categoryName: category is Map ? category['name']?.toString() : null,
      cityName: city is Map ? city['name']?.toString() : null,
      blockName: block is Map ? block['name']?.toString() : null,
      addressLine: json['addressLine']?.toString(),
      phone: json['phone']?.toString(),
      ratingAvg: _double(json['ratingAvg']),
      ratingCount: _int(json['ratingCount'], 0),
      completedBookings: _int(json['completedBookings'], 0),
      startingAtPrice: json['startingAtPrice'] is num
          ? (json['startingAtPrice'] as num).toInt()
          : int.tryParse('${json['startingAtPrice']}'),
    );
  }
}

class Pagination {
  const Pagination({
    this.page = 1,
    this.limit = 20,
    this.pages = 0,
    this.total = 0,
  });

  final int page;
  final int limit;
  final int pages;
  final int total;

  bool get hasMore => page < pages;

  factory Pagination.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const Pagination();
    return Pagination(
      page: _int(json['page'], 1),
      limit: _int(json['limit'], 20),
      pages: _int(json['pages'], 0),
      total: _int(json['total'], 0),
    );
  }
}

class Page<T> {
  const Page({required this.items, required this.pagination});

  final List<T> items;
  final Pagination pagination;

  factory Page.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) item,
    String key,
  ) {
    final raw = json[key];
    final list = raw is List
        ? raw
              .whereType<Map>()
              .map((value) => item(Map<String, dynamic>.from(value)))
              .toList(growable: false)
        : <T>[];
    final pagination = Pagination.fromJson(
      json['pagination'] is Map
          ? Map<String, dynamic>.from(json['pagination'] as Map)
          : null,
    );
    return Page(items: list, pagination: pagination);
  }
}

int _int(Object? value, int fallback) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value') ?? fallback;
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

String roleName(String role) =>
    role == brandRole ? 'Shop owner' : 'Service provider';
