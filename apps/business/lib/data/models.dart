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
    this.slug,
    this.legalName,
    this.categoryId,
    this.categoryName,
    this.cityId,
    this.cityName,
    this.blockId,
    this.blockName,
    this.addressLine,
    this.phone,
    this.bio,
    this.avatar,
    this.coverImage,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedBookings = 0,
    this.startingAtPrice,
  });

  final String id;
  final String displayName;
  final String status;
  final String? slug;
  final String? legalName;
  final String? categoryId;
  final String? categoryName;
  final String? cityId;
  final String? cityName;
  final String? blockId;
  final String? blockName;
  final String? addressLine;
  final String? phone;
  final String? bio;
  final String? avatar;
  final String? coverImage;
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
      slug: _optionalText(json['slug']),
      legalName: _optionalText(json['legalName']),
      categoryId: _optionalText(json['categoryId']),
      categoryName: category is Map ? category['name']?.toString() : null,
      cityId: _optionalText(json['cityId']),
      cityName: city is Map ? city['name']?.toString() : null,
      blockId: _optionalText(json['blockId']),
      blockName: block is Map ? block['name']?.toString() : null,
      addressLine: _optionalText(json['addressLine']),
      phone: _optionalText(json['phone']),
      bio: _optionalText(json['bio']),
      avatar: _optionalText(json['avatar']),
      coverImage: _optionalText(json['coverImage']),
      ratingAvg: _double(json['ratingAvg']),
      ratingCount: _int(json['ratingCount'], 0),
      completedBookings: _int(json['completedBookings'], 0),
      startingAtPrice: json['startingAtPrice'] is num
          ? (json['startingAtPrice'] as num).toInt()
          : int.tryParse('${json['startingAtPrice']}'),
    );
  }
}

/// One service a provider sells. Customers pick one when they book.
class ServiceOffering {
  const ServiceOffering({
    required this.id,
    required this.title,
    this.description = '',
    this.images = const <String>[],
    this.startingAtPricePaisa = 0,
    this.durationMinutes = 0,
    this.attributes = const <String, dynamic>{},
    this.isActive = true,
  });

  final String id;
  final String title;
  final String description;
  final List<String> images;
  final int startingAtPricePaisa;
  final int durationMinutes;
  final Map<String, dynamic> attributes;
  final bool isActive;

  factory ServiceOffering.fromJson(Map<String, dynamic> json) {
    final rawImages = json['images'];
    final rawAttributes = json['attributes'];
    return ServiceOffering(
      id: _text(json['_id'] ?? json['id']),
      title: _text(json['title'], 'Service'),
      description: _text(json['description']),
      images: rawImages is List
          ? rawImages
                .map((value) => value.toString().trim())
                .where((value) => value.isNotEmpty)
                .toList(growable: false)
          : const <String>[],
      startingAtPricePaisa: _int(json['startingAtPrice'], 0),
      durationMinutes: _int(json['durationMinutes'], 0),
      attributes: rawAttributes is Map
          ? Map<String, dynamic>.from(rawAttributes)
          : const <String, dynamic>{},
      isActive: json['isActive'] != false,
    );
  }
}

/// The usual Karachi weekday names, indexed the way the server numbers them
/// (0 = Sunday).
const weekdayNames = <String>[
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

String weekdayName(int weekday) {
  if (weekday < 0 || weekday >= weekdayNames.length) return 'Unknown day';
  return weekdayNames[weekday];
}

/// A weekly working window in Karachi wall-clock minutes.
class AvailabilityWindow {
  const AvailabilityWindow({
    required this.weekday,
    required this.startMinute,
    required this.endMinute,
    this.slotMinutes = 60,
  });

  final int weekday;
  final int startMinute;
  final int endMinute;
  final int slotMinutes;

  String get dayName => weekdayName(weekday);

  factory AvailabilityWindow.fromJson(Map<String, dynamic> json) {
    return AvailabilityWindow(
      weekday: _int(json['weekday'], 0),
      startMinute: _int(json['startMinute'], 0),
      endMinute: _int(json['endMinute'], 0),
      slotMinutes: _int(json['slotMinutes'], 60),
    );
  }

  Map<String, dynamic> toJson() => {
    'weekday': weekday,
    'startMinute': startMinute,
    'endMinute': endMinute,
    'slotMinutes': slotMinutes,
  };
}

class ServiceAvailability {
  const ServiceAvailability({
    this.windows = const <AvailabilityWindow>[],
    this.blackoutDates = const <String>[],
    this.isPublished = false,
    this.updatedAt,
  });

  final List<AvailabilityWindow> windows;
  final List<String> blackoutDates;
  final bool isPublished;
  final DateTime? updatedAt;

  bool get hasHours => windows.isNotEmpty;

  List<AvailabilityWindow> windowsFor(int weekday) {
    final list = windows
        .where((window) => window.weekday == weekday)
        .toList(growable: false);
    return list;
  }

  ServiceAvailability copyWith({
    List<AvailabilityWindow>? windows,
    List<String>? blackoutDates,
  }) {
    return ServiceAvailability(
      windows: windows ?? this.windows,
      blackoutDates: blackoutDates ?? this.blackoutDates,
      isPublished: (windows ?? this.windows).isNotEmpty,
      updatedAt: updatedAt,
    );
  }

  factory ServiceAvailability.fromJson(Map<String, dynamic> json) {
    final rawBlackouts = json['blackoutDates'];
    final windows = _mapList(json['windows'])
        .map(AvailabilityWindow.fromJson)
        .toList(growable: false);
    return ServiceAvailability(
      windows: windows,
      blackoutDates: rawBlackouts is List
          ? rawBlackouts
                .map((value) => value.toString().trim())
                .where((value) => value.isNotEmpty)
                .toList(growable: false)
          : const <String>[],
      isPublished: json['isPublished'] == true || windows.isNotEmpty,
      updatedAt: _date(json['updatedAt']),
    );
  }
}

/// An area a provider may work in, with its centre. The centre is used when an
/// owner changes area, so the app never asks them to type coordinates.
class BlockOption {
  const BlockOption({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;

  factory BlockOption.fromJson(Map<String, dynamic> json) {
    return BlockOption(
      id: _text(json['_id'] ?? json['id']),
      name: _text(json['name'], 'Area'),
      latitude: _double(json['latitude']),
      longitude: _double(json['longitude']),
    );
  }
}

/// The service as it was when the booking was placed. Later edits to the
/// offering never rewrite an existing booking.
class BookingOffering {
  const BookingOffering({
    required this.id,
    required this.title,
    this.durationMinutes = 0,
    this.startingAtPricePaisa = 0,
    this.image,
  });

  final String id;
  final String title;
  final int durationMinutes;
  final int startingAtPricePaisa;
  final String? image;

  factory BookingOffering.fromJson(Map<String, dynamic> json) {
    return BookingOffering(
      id: _text(json['offeringId']),
      title: _text(json['title'], 'Service'),
      durationMinutes: _int(json['durationMinutes'], 0),
      startingAtPricePaisa: _int(json['startingAtPrice'], 0),
      image: _optionalText(json['image']),
    );
  }
}

class BookingCustomer {
  const BookingCustomer({
    required this.id,
    required this.name,
    this.phone = '',
  });

  final String id;
  final String name;
  final String phone;

  factory BookingCustomer.fromJson(Map<String, dynamic> json) {
    return BookingCustomer(
      id: _text(json['_id']),
      name: _text(json['name'], 'Customer'),
      phone: _text(json['phone']),
    );
  }
}

class BookingAddress {
  const BookingAddress({
    required this.fullName,
    required this.phone,
    required this.addressLine,
    this.city = '',
    this.blockName = '',
    this.latitude,
    this.longitude,
  });

  final String fullName;
  final String phone;
  final String addressLine;
  final String city;
  final String blockName;
  final double? latitude;
  final double? longitude;

  String get areaLabel =>
      [blockName, city].where((value) => value.trim().isNotEmpty).join(', ');

  factory BookingAddress.fromJson(Map<String, dynamic> json) {
    final pin = _map(json['pin']);
    return BookingAddress(
      fullName: _text(json['fullName']),
      phone: _text(json['phone']),
      addressLine: _text(json['addressLine']),
      city: _text(json['city']),
      blockName: _text(json['blockName']),
      latitude: _optionalDouble(pin['lat']),
      longitude: _optionalDouble(pin['lng']),
    );
  }
}

/// One firm offer the provider sent. A counter-offer supersedes the earlier
/// one; the customer accepts or declines the active proposal.
class BookingProposal {
  const BookingProposal({
    required this.id,
    this.pricePaisa = 0,
    this.scope = '',
    this.scheduledStart,
    this.scheduledEnd,
    this.expiresAt,
    this.status = 'ACTIVE',
    this.createdAt,
  });

  final String id;
  final int pricePaisa;
  final String scope;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? expiresAt;
  final String status;
  final DateTime? createdAt;

  bool get isActive => status == 'ACTIVE';

  factory BookingProposal.fromJson(Map<String, dynamic> json) {
    return BookingProposal(
      id: _text(json['_id']),
      pricePaisa: _int(json['pricePaisa'], 0),
      scope: _text(json['scope']),
      scheduledStart: _date(json['scheduledStart']),
      scheduledEnd: _date(json['scheduledEnd']),
      expiresAt: _date(json['expiresAt']),
      status: _text(json['status'], 'ACTIVE'),
      createdAt: _date(json['createdAt']),
    );
  }
}

class BookingEvent {
  const BookingEvent({
    required this.type,
    this.byRole = '',
    this.at,
    this.note,
  });

  final String type;
  final String byRole;
  final DateTime? at;
  final String? note;

  factory BookingEvent.fromJson(Map<String, dynamic> json) {
    final meta = _map(json['meta']);
    return BookingEvent(
      type: _text(json['type']),
      byRole: _text(json['byRole']),
      at: _date(json['at']),
      note: _optionalText(json['note']) ?? _optionalText(meta['note']),
    );
  }
}

class BookingCancellation {
  const BookingCancellation({
    this.by = '',
    this.reason = '',
    this.late = false,
    this.at,
  });

  final String by;
  final String reason;
  final bool late;
  final DateTime? at;

  factory BookingCancellation.fromJson(Map<String, dynamic> json) {
    return BookingCancellation(
      by: _text(json['by']),
      reason: _text(json['reason']),
      late: json['late'] == true,
      at: _date(json['at']),
    );
  }
}

class BookingDispute {
  const BookingDispute({
    this.reason = '',
    this.at,
    this.resolvedAt,
    this.resolution = '',
    this.resolutionNote,
  });

  final String reason;
  final DateTime? at;
  final DateTime? resolvedAt;
  final String resolution;
  final String? resolutionNote;

  bool get isResolved => resolvedAt != null;

  factory BookingDispute.fromJson(Map<String, dynamic> json) {
    return BookingDispute(
      reason: _text(json['reason']),
      at: _date(json['at']),
      resolvedAt: _date(json['resolvedAt']),
      resolution: _text(json['resolution']),
      resolutionNote: _optionalText(json['resolutionNote']),
    );
  }
}

/// A booking as the provider sees it: the customer and job address are
/// included, and every lifecycle button is driven by [status].
class BusinessBooking {
  const BusinessBooking({
    required this.id,
    required this.bookingNumber,
    required this.status,
    required this.offering,
    this.requestedStart,
    this.scheduledStart,
    this.scheduledEnd,
    this.note,
    this.customerOfferPaisa,
    this.proposals = const <BookingProposal>[],
    this.activeProposal,
    this.agreedPricePaisa,
    this.finalAmountPaisa,
    this.completionNote,
    this.acceptedAt,
    this.startedAt,
    this.completedAt,
    this.confirmedAt,
    this.autoConfirmAt,
    this.confirmedBy = '',
    this.cancellation,
    this.dispute,
    this.events = const <BookingEvent>[],
    this.address,
    this.customer,
    this.conversationId,
    this.canChat = false,
    this.unread = 0,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String bookingNumber;
  final String status;
  final BookingOffering offering;
  final DateTime? requestedStart;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final String? note;
  final int? customerOfferPaisa;
  final List<BookingProposal> proposals;
  final BookingProposal? activeProposal;
  final int? agreedPricePaisa;
  final int? finalAmountPaisa;
  final String? completionNote;
  final DateTime? acceptedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? confirmedAt;
  final DateTime? autoConfirmAt;
  final String confirmedBy;
  final BookingCancellation? cancellation;
  final BookingDispute? dispute;
  final List<BookingEvent> events;
  final BookingAddress? address;
  final BookingCustomer? customer;
  final String? conversationId;
  final bool canChat;
  final int unread;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get customerName {
    final name = customer?.name.trim() ?? '';
    if (name.isNotEmpty) return name;
    final fallback = address?.fullName.trim() ?? '';
    return fallback.isEmpty ? 'Customer' : fallback;
  }

  String get customerPhone {
    final phone = customer?.phone.trim() ?? '';
    if (phone.isNotEmpty) return phone;
    return address?.phone.trim() ?? '';
  }

  DateTime? get whenStart => scheduledStart ?? requestedStart;

  int get headlinePricePaisa =>
      finalAmountPaisa ?? agreedPricePaisa ?? offering.startingAtPricePaisa;

  String get priceCaption {
    if (finalAmountPaisa != null) return 'Final amount';
    if (agreedPricePaisa != null) return 'Agreed price';
    return 'Starting price';
  }

  bool get isNewRequest => status == 'REQUESTED';
  bool get canAcceptCustomerOffer =>
      isNewRequest && (customerOfferPaisa ?? 0) > 0;
  bool get canPropose => status == 'REQUESTED' || status == 'PROPOSED';
  bool get canStart => status == 'ACCEPTED';
  bool get canComplete => status == 'IN_PROGRESS';
  bool get canCancel =>
      status == 'REQUESTED' ||
      status == 'PROPOSED' ||
      status == 'ACCEPTED' ||
      status == 'IN_PROGRESS';
  bool get isClosed =>
      status == 'CONFIRMED' || status == 'DECLINED' || status == 'CANCELLED';

  factory BusinessBooking.fromJson(Map<String, dynamic> json) {
    final address = _map(json['address']);
    final customer = _map(json['customer']);
    final active = _map(json['activeProposal']);
    final cancellation = _map(json['cancellation']);
    final dispute = _map(json['dispute']);
    return BusinessBooking(
      id: _text(json['_id']),
      bookingNumber: _text(json['bookingNumber']),
      status: _text(json['status'], 'REQUESTED'),
      offering: BookingOffering.fromJson(_map(json['offering'])),
      requestedStart: _date(json['requestedStart']),
      scheduledStart: _date(json['scheduledStart']),
      scheduledEnd: _date(json['scheduledEnd']),
      note: _optionalText(json['note']),
      customerOfferPaisa: _optionalInt(json['customerOfferPaisa']),
      proposals: _mapList(json['proposals'])
          .map(BookingProposal.fromJson)
          .toList(growable: false),
      activeProposal: active.isEmpty ? null : BookingProposal.fromJson(active),
      agreedPricePaisa: _optionalInt(json['agreedPricePaisa']),
      finalAmountPaisa: _optionalInt(json['finalAmountPaisa']),
      completionNote: _optionalText(json['completionNote']),
      acceptedAt: _date(json['acceptedAt']),
      startedAt: _date(json['startedAt']),
      completedAt: _date(json['completedAt']),
      confirmedAt: _date(json['confirmedAt']),
      autoConfirmAt: _date(json['autoConfirmAt']),
      confirmedBy: _text(json['confirmedBy']),
      cancellation: cancellation.isEmpty
          ? null
          : BookingCancellation.fromJson(cancellation),
      dispute: dispute.isEmpty ? null : BookingDispute.fromJson(dispute),
      events: _mapList(json['events'])
          .map(BookingEvent.fromJson)
          .toList(growable: false),
      address: address.isEmpty ? null : BookingAddress.fromJson(address),
      customer: customer.isEmpty ? null : BookingCustomer.fromJson(customer),
      conversationId: _optionalText(json['conversationId']),
      canChat: json['canChat'] == true,
      unread: _int(json['unread'], 0),
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
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

/// Which server route a provider conversation lives behind. Job chats are
/// keyed by the booking id; customer questions by the conversation id.
enum ProviderChatKind { job, question }

/// One row in the provider's Messages inbox. Both booking chats and direct
/// customer questions become the same simple shape.
class ProviderChatThread {
  const ProviderChatThread({
    required this.kind,
    required this.routeId,
    required this.name,
    this.contextLabel = '',
    this.preview = '',
    this.lastMessageAt,
    this.lastSenderRole = '',
    this.unread = 0,
  });

  final ProviderChatKind kind;
  final String routeId;
  final String name;
  final String contextLabel;
  final String preview;
  final DateTime? lastMessageAt;
  final String lastSenderRole;
  final int unread;

  bool get isJob => kind == ProviderChatKind.job;
  bool get lastFromMe => lastSenderRole == 'PROVIDER';
  String get kindLabel => isJob ? 'Job chat' : 'Question';

  factory ProviderChatThread.fromBookingJson(Map<String, dynamic> json) {
    final withMap = _map(json['with']);
    final service = _text(json['serviceTitle']);
    final number = _text(json['bookingNumber']);
    final details = [
      service,
      number,
    ].where((value) => value.isNotEmpty).join(' · ');
    return ProviderChatThread(
      kind: ProviderChatKind.job,
      routeId: _text(json['bookingId']),
      name: _text(withMap['name'], 'Customer'),
      contextLabel: details.isEmpty ? 'Job chat' : 'Job · $details',
      preview: _text(json['lastMessagePreview']),
      lastMessageAt: _date(json['lastMessageAt']),
      lastSenderRole: _text(json['lastSenderRole']),
      unread: _int(json['unread'], 0),
    );
  }

  factory ProviderChatThread.fromDirectJson(Map<String, dynamic> json) {
    final withMap = _map(json['with']);
    return ProviderChatThread(
      kind: ProviderChatKind.question,
      routeId: _text(json['_id']),
      name: _text(withMap['name'], 'Customer'),
      contextLabel: 'Question about your service',
      preview: _text(json['lastMessagePreview']),
      lastMessageAt: _date(json['lastMessageAt']),
      lastSenderRole: _text(json['lastSenderRole']),
      unread: _int(json['unread'], 0),
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    this.conversationId,
    this.senderRole = 'CUSTOMER',
    this.mine = false,
    this.createdAt,
    this.sentBy = '',
    this.product,
  });

  final String id;
  final String body;
  final String? conversationId;
  final String senderRole;
  final bool mine;
  final DateTime? createdAt;

  /// The team member who replied, when the shop side sent it.
  final String sentBy;

  /// The product a customer asked about, when the chat started from a page.
  final ChatProduct? product;

  bool get isSystem => senderRole == 'SYSTEM';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final product = json['product'];
    return ChatMessage(
      id: _text(json['_id']),
      body: _text(json['body']),
      conversationId: _optionalText(json['conversationId']),
      senderRole: _text(json['senderRole'], 'CUSTOMER'),
      mine: json['mine'] == true,
      createdAt: _date(json['createdAt']),
      sentBy: _text(json['sentBy']),
      product: product is Map
          ? ChatProduct.fromJson(Map<String, dynamic>.from(product))
          : null,
    );
  }
}

/// The product a customer started a conversation about.
class ChatProduct {
  const ChatProduct({
    required this.id,
    required this.name,
    this.pricePaisa = 0,
    this.image,
    this.available = true,
  });

  final String id;
  final String name;
  final int pricePaisa;
  final String? image;
  final bool available;

  factory ChatProduct.fromJson(Map<String, dynamic> json) {
    return ChatProduct(
      id: _text(json['_id']),
      name: _text(json['name'], 'Product'),
      pricePaisa: rupeesToPaisa(json['price']),
      image: _optionalText(json['image']),
      available: json['available'] != false,
    );
  }
}

/// One customer conversation in the shop's inbox.
class BrandChatThread {
  const BrandChatThread({
    required this.id,
    this.customerName = 'Customer',
    this.customerImage,
    this.canSend = false,
    this.lastMessageAt,
    this.preview = '',
    this.lastSenderRole = '',
    this.unread = 0,
  });

  final String id;
  final String customerName;
  final String? customerImage;
  final bool canSend;
  final DateTime? lastMessageAt;
  final String preview;
  final String lastSenderRole;
  final int unread;

  bool get lastFromShop => lastSenderRole == 'BRAND';

  factory BrandChatThread.fromJson(Map<String, dynamic> json) {
    final other = _map(json['with']);
    return BrandChatThread(
      id: _text(json['_id']),
      customerName: _text(other['name'], 'Customer'),
      customerImage: _optionalText(other['image']),
      canSend: json['canSend'] == true,
      lastMessageAt: _date(json['lastMessageAt']),
      preview: _text(json['lastMessagePreview']),
      lastSenderRole: _text(json['lastSenderRole']),
      unread: _int(json['unread'], 0),
    );
  }
}

class ChatMessagePage {
  const ChatMessagePage({
    this.messages = const <ChatMessage>[],
    this.hasMore = false,
  });

  final List<ChatMessage> messages;
  final bool hasMore;

  String? get oldestId => messages.isEmpty ? null : messages.first.id;

  factory ChatMessagePage.fromJson(Map<String, dynamic> json) {
    return ChatMessagePage(
      messages: _mapList(json['messages'])
          .map(ChatMessage.fromJson)
          .toList(growable: false),
      hasMore: json['hasMore'] == true,
    );
  }
}

class ReviewReply {
  const ReviewReply({this.body = '', this.at});

  final String body;
  final DateTime? at;

  factory ReviewReply.fromJson(Map<String, dynamic> json) {
    return ReviewReply(body: _text(json['body']), at: _date(json['at']));
  }
}

/// A customer review as the provider sees it. The customer's name is the short
/// label the server shares; the full order history stays private.
class ServiceReview {
  const ServiceReview({
    required this.id,
    required this.rating,
    this.bookingId = '',
    this.comment = '',
    this.providerReply,
    this.isApproved = true,
    this.reviewerName = 'Customer',
    this.serviceTitle = 'Service',
    this.createdAt,
  });

  final String id;
  final int rating;
  final String bookingId;
  final String comment;
  final ReviewReply? providerReply;
  final bool isApproved;
  final String reviewerName;
  final String serviceTitle;
  final DateTime? createdAt;

  bool get hasReply => providerReply != null;

  factory ServiceReview.fromJson(Map<String, dynamic> json) {
    final reply = _map(json['providerReply']);
    return ServiceReview(
      id: _text(json['_id']),
      rating: _int(json['rating'], 0),
      bookingId: _text(json['bookingId']),
      comment: _text(json['comment']),
      providerReply: reply.isEmpty ? null : ReviewReply.fromJson(reply),
      isApproved: json['isApproved'] != false,
      reviewerName: _text(json['reviewerName'], 'Customer'),
      serviceTitle: _text(json['serviceTitle'], 'Service'),
      createdAt: _date(json['createdAt']),
    );
  }
}

class ReviewSummary {
  const ReviewSummary({
    this.average = 0,
    this.count = 0,
    this.distribution = const <int, int>{},
  });

  final double average;
  final int count;
  final Map<int, int> distribution;

  int countFor(int stars) => distribution[stars] ?? 0;

  double shareFor(int stars) => count == 0 ? 0 : countFor(stars) / count;

  factory ReviewSummary.fromJson(Map<String, dynamic> json) {
    final raw = _map(json['distribution']);
    final distribution = <int, int>{};
    for (var stars = 1; stars <= 5; stars += 1) {
      distribution[stars] = _int(raw['$stars'], 0);
    }
    return ReviewSummary(
      average: _double(json['average']),
      count: _int(json['count'], 0),
      distribution: distribution,
    );
  }
}

class ProviderReviewPage {
  const ProviderReviewPage({
    this.reviews = const <ServiceReview>[],
    this.summary = const ReviewSummary(),
    this.pagination = const Pagination(),
  });

  final List<ServiceReview> reviews;
  final ReviewSummary summary;
  final Pagination pagination;

  factory ProviderReviewPage.fromJson(Map<String, dynamic> json) {
    return ProviderReviewPage(
      reviews: _mapList(json['reviews'])
          .map(ServiceReview.fromJson)
          .toList(growable: false),
      summary: ReviewSummary.fromJson(_map(json['summary'])),
      pagination: Pagination.fromJson(_map(json['pagination'])),
    );
  }
}

/// A customer review of one of this shop's products. Shops read these; the
/// server only returns approved reviews of the signed-in brand.
class BrandReview {
  const BrandReview({
    required this.id,
    required this.rating,
    this.title = '',
    this.comment = '',
    this.reviewerName = 'Customer',
    this.productId = '',
    this.productName = 'A product',
    this.createdAt,
  });

  final String id;
  final int rating;
  final String title;
  final String comment;
  final String reviewerName;
  final String productId;
  final String productName;
  final DateTime? createdAt;

  factory BrandReview.fromJson(Map<String, dynamic> json) {
    return BrandReview(
      id: _text(json['_id']),
      rating: _int(json['rating'], 0),
      title: _text(json['title']),
      comment: _text(json['comment']),
      reviewerName: _text(json['reviewerName'], 'Customer'),
      productId: _text(json['productId']),
      productName: _text(json['productName'], 'A product'),
      createdAt: _date(json['createdAt']),
    );
  }
}

class BrandReviewPage {
  const BrandReviewPage({
    this.reviews = const <BrandReview>[],
    this.summary = const ReviewSummary(),
    this.pagination = const Pagination(),
  });

  final List<BrandReview> reviews;
  final ReviewSummary summary;
  final Pagination pagination;

  factory BrandReviewPage.fromJson(Map<String, dynamic> json) {
    return BrandReviewPage(
      reviews: _mapList(json['reviews'])
          .map(BrandReview.fromJson)
          .toList(growable: false),
      summary: ReviewSummary.fromJson(_map(json['summary'])),
      pagination: Pagination.fromJson(_map(json['pagination'])),
    );
  }
}

/// One line of a shop order. Prices are snapshots taken when the order was
/// placed, so editing a product later never changes an existing order.
class BrandOrderItem {
  const BrandOrderItem({
    this.id = '',
    required this.productId,
    required this.productName,
    this.sku = '',
    this.quantity = 1,
    this.unitPricePaisa = 0,
    this.totalPricePaisa = 0,
    this.image,
    this.pickStatus = '',
  });

  /// The id of the order line itself, which a change proposal references.
  final String id;
  final String productId;
  final String productName;
  final String sku;
  final int quantity;
  final int unitPricePaisa;
  final int totalPricePaisa;
  final String? image;
  final String pickStatus;

  factory BrandOrderItem.fromJson(Map<String, dynamic> json) {
    return BrandOrderItem(
      id: _text(json['_id'] ?? json['id']),
      productId: _text(json['productId']),
      productName: _text(json['productName'], 'Product'),
      sku: _text(json['sku']),
      quantity: _int(json['quantity'], 1),
      unitPricePaisa: rupeesToPaisa(json['unitPrice']),
      totalPricePaisa: rupeesToPaisa(json['totalPrice']),
      image: _optionalText(json['image']),
      pickStatus: _text(json['pickStatus']),
    );
  }
}

/// One line of a change proposal: how many units the shop can supply of an
/// order item and, optionally, which same-shop product replaces the missing
/// units. The server validates the substitute and computes all prices.
class BrandAdjustmentLine {
  const BrandAdjustmentLine({
    required this.orderItemId,
    required this.supplyQuantity,
    this.substituteProductId,
    this.substituteQuantity = 0,
  });

  final String orderItemId;
  final int supplyQuantity;
  final String? substituteProductId;
  final int substituteQuantity;

  bool get hasSubstitute =>
      substituteProductId != null && substituteProductId!.isNotEmpty;
}

class BrandShippingAddress {
  const BrandShippingAddress({
    required this.name,
    required this.phone,
    required this.address,
    this.city = '',
    this.state = '',
    this.postalCode = '',
    this.additionalInstructions = '',
  });

  final String name;
  final String phone;
  final String address;
  final String city;
  final String state;
  final String postalCode;
  final String additionalInstructions;

  String get cityLine => [
    city,
    state,
    postalCode,
  ].where((value) => value.trim().isNotEmpty).join(', ');

  factory BrandShippingAddress.fromJson(Map<String, dynamic> json) {
    return BrandShippingAddress(
      name: _text(json['name'], 'Customer'),
      phone: _text(json['phone']),
      address: _text(json['address']),
      city: _text(json['city']),
      state: _text(json['state']),
      postalCode: _text(json['postalCode']),
      additionalInstructions: _text(json['additionalInstructions']),
    );
  }
}

class BrandOrderEvent {
  const BrandOrderEvent({required this.status, this.at});

  final String status;
  final DateTime? at;

  factory BrandOrderEvent.fromJson(Map<String, dynamic> json) {
    return BrandOrderEvent(
      status: _text(json['status']),
      at: _date(json['at']),
    );
  }
}

class BrandPayment {
  const BrandPayment({
    this.status = 'PENDING',
    this.method = 'COD',
    this.amountPaisa = 0,
  });

  final String status;
  final String method;
  final int amountPaisa;

  factory BrandPayment.fromJson(Map<String, dynamic> json) {
    return BrandPayment(
      status: _text(json['status'], 'PENDING'),
      method: _text(json['method'], 'COD'),
      amountPaisa: rupeesToPaisa(json['amount']),
    );
  }
}

class BrandDeliverySummary {
  const BrandDeliverySummary({
    required this.id,
    this.status = 'PENDING',
    this.assignedAgent = '',
    this.trackingReference = '',
  });

  final String id;
  final String status;
  final String assignedAgent;
  final String trackingReference;

  factory BrandDeliverySummary.fromJson(Map<String, dynamic> json) {
    return BrandDeliverySummary(
      id: _text(json['_id'] ?? json['id']),
      status: _text(json['status'], 'PENDING'),
      assignedAgent: _text(json['assignedAgent']),
      trackingReference: _text(json['trackingReference']),
    );
  }
}

/// A change proposal the shop sent because it cannot supply the full order.
/// While one is PROPOSED the order cannot move on to shipment.
class BrandOrderAdjustment {
  const BrandOrderAdjustment({
    required this.id,
    this.status = 'PROPOSED',
    this.note = '',
    this.createdAt,
  });

  final String id;
  final String status;
  final String note;
  final DateTime? createdAt;

  bool get isPending => status == 'PROPOSED';

  factory BrandOrderAdjustment.fromJson(Map<String, dynamic> json) {
    return BrandOrderAdjustment(
      id: _text(json['_id'] ?? json['id']),
      status: _text(json['status'], 'PROPOSED'),
      note: _text(json['note']),
      createdAt: _date(json['createdAt']),
    );
  }
}

/// A customer order as the shop sees it. Every order belongs to exactly one
/// shop, and the server scopes the list to the signed-in owner's shop.
class BrandOrder {
  const BrandOrder({
    required this.id,
    required this.orderNumber,
    required this.orderStatus,
    this.paymentStatus = 'PENDING',
    this.paymentMethod = 'COD',
    this.subtotalPaisa = 0,
    this.deliveryFeePaisa = 0,
    this.discountPaisa = 0,
    this.taxPaisa = 0,
    this.totalPaisa = 0,
    this.items = const <BrandOrderItem>[],
    this.shippingAddress,
    this.statusHistory = const <BrandOrderEvent>[],
    this.createdAt,
  });

  final String id;
  final String orderNumber;
  final String orderStatus;
  final String paymentStatus;
  final String paymentMethod;
  final int subtotalPaisa;
  final int deliveryFeePaisa;
  final int discountPaisa;
  final int taxPaisa;
  final int totalPaisa;
  final List<BrandOrderItem> items;
  final BrandShippingAddress? shippingAddress;
  final List<BrandOrderEvent> statusHistory;
  final DateTime? createdAt;

  int get itemCount => items.fold(0, (total, item) => total + item.quantity);

  bool get isAwaitingAnswer => orderStatus == 'PENDING';
  bool get isClosed => const [
    'DELIVERED',
    'CANCELLED',
    'REJECTED',
    'RETURNED',
  ].contains(orderStatus);

  BrandOrder copyWith({String? orderStatus, String? paymentStatus}) {
    return BrandOrder(
      id: id,
      orderNumber: orderNumber,
      orderStatus: orderStatus ?? this.orderStatus,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      paymentMethod: paymentMethod,
      subtotalPaisa: subtotalPaisa,
      deliveryFeePaisa: deliveryFeePaisa,
      discountPaisa: discountPaisa,
      taxPaisa: taxPaisa,
      totalPaisa: totalPaisa,
      items: items,
      shippingAddress: shippingAddress,
      statusHistory: statusHistory,
      createdAt: createdAt,
    );
  }

  factory BrandOrder.fromJson(Map<String, dynamic> json) {
    final address = _map(json['shippingAddress']);
    return BrandOrder(
      id: _text(json['_id'] ?? json['id']),
      orderNumber: _text(json['orderNumber'], 'Order'),
      orderStatus: _text(json['orderStatus'], 'PENDING'),
      paymentStatus: _text(json['paymentStatus'], 'PENDING'),
      paymentMethod: _text(json['paymentMethod'], 'COD'),
      subtotalPaisa: rupeesToPaisa(json['subtotal']),
      deliveryFeePaisa: rupeesToPaisa(json['deliveryFee']),
      discountPaisa: rupeesToPaisa(json['discount']),
      taxPaisa: rupeesToPaisa(json['tax']),
      totalPaisa: rupeesToPaisa(json['total']),
      items: _mapList(json['items'])
          .map(BrandOrderItem.fromJson)
          .toList(growable: false),
      shippingAddress: address.isEmpty
          ? null
          : BrandShippingAddress.fromJson(address),
      statusHistory: _mapList(json['statusHistory'])
          .map(BrandOrderEvent.fromJson)
          .toList(growable: false),
      createdAt: _date(json['createdAt']),
    );
  }
}

/// The detail response: the order plus its payment, delivery and any change
/// proposals. [pendingAdjustment] is the one waiting for the customer, if any.
class BrandOrderDetail {
  const BrandOrderDetail({
    required this.order,
    this.payment,
    this.delivery,
    this.adjustments = const <BrandOrderAdjustment>[],
    this.pendingAdjustment,
  });

  final BrandOrder order;
  final BrandPayment? payment;
  final BrandDeliverySummary? delivery;
  final List<BrandOrderAdjustment> adjustments;
  final BrandOrderAdjustment? pendingAdjustment;

  factory BrandOrderDetail.fromJson(Map<String, dynamic> json) {
    final orderRaw = json['order'];
    final payment = _map(json['payment']);
    final delivery = _map(json['delivery']);
    final adjustment = _map(json['adjustment']);
    final pending = adjustment.isEmpty
        ? null
        : BrandOrderAdjustment.fromJson(adjustment);
    return BrandOrderDetail(
      order: BrandOrder.fromJson(
        orderRaw is Map ? Map<String, dynamic>.from(orderRaw) : const {},
      ),
      payment: payment.isEmpty ? null : BrandPayment.fromJson(payment),
      delivery: delivery.isEmpty
          ? null
          : BrandDeliverySummary.fromJson(delivery),
      adjustments: _mapList(json['adjustments'])
          .map(BrandOrderAdjustment.fromJson)
          .toList(growable: false),
      pendingAdjustment: pending != null && pending.isPending ? pending : null,
    );
  }
}

/// Stock for one product. The server derives [availableQuantity] and
/// [stockStatus]; the app never calculates them itself.
class BrandStock {
  const BrandStock({
    this.quantity = 0,
    this.reservedQuantity = 0,
    this.availableQuantity = 0,
    this.lowStockThreshold = 0,
    this.trackInventory = true,
    this.stockStatus = 'OUT_OF_STOCK',
  });

  final int quantity;
  final int reservedQuantity;
  final int availableQuantity;
  final int lowStockThreshold;
  final bool trackInventory;
  final String stockStatus;

  factory BrandStock.fromJson(Map<String, dynamic> json) {
    final quantity = _int(json['quantity'], 0);
    final reserved = _int(json['reservedQuantity'], 0);
    return BrandStock(
      quantity: quantity,
      reservedQuantity: reserved,
      availableQuantity:
          _optionalInt(json['availableQuantity']) ?? (quantity - reserved),
      lowStockThreshold: _int(json['lowStockThreshold'], 0),
      trackInventory: json['trackInventory'] != false,
      stockStatus: _text(json['stockStatus'], 'OUT_OF_STOCK'),
    );
  }
}

/// One item this shop lists. Name, description and image come from the shared
/// catalogue item; price, SKU, state and stock belong to the shop.
class BrandProduct {
  const BrandProduct({
    required this.id,
    required this.name,
    this.description = '',
    this.sku = '',
    this.status = 'DRAFT',
    this.isActive = true,
    this.pricePaisa = 0,
    this.compareAtPricePaisa = 0,
    this.image,
    this.stock,
  });

  final String id;
  final String name;
  final String description;
  final String sku;
  final String status;
  final bool isActive;
  final int pricePaisa;
  final int compareAtPricePaisa;
  final String? image;
  final BrandStock? stock;

  bool get isArchived => status == 'ARCHIVED';
  bool get isLive => status == 'ACTIVE' && isActive;

  factory BrandProduct.fromJson(Map<String, dynamic> json) {
    final images = json['images'];
    final firstImage = images is List && images.isNotEmpty
        ? _optionalText(images.first)
        : null;
    final inventory = _map(json['inventory']);
    return BrandProduct(
      id: _text(json['_id'] ?? json['id']),
      name: _text(json['name'], 'Product'),
      description: _text(json['description']),
      sku: _text(json['sku']),
      status: _text(json['status'], 'DRAFT'),
      isActive: json['isActive'] != false,
      pricePaisa: rupeesToPaisa(json['price']),
      compareAtPricePaisa: rupeesToPaisa(json['compareAtPrice']),
      image: firstImage,
      stock: inventory.isEmpty ? null : BrandStock.fromJson(inventory),
    );
  }

  BrandProduct copyWith({
    String? status,
    bool? isActive,
    int? pricePaisa,
    int? compareAtPricePaisa,
    String? sku,
    BrandStock? stock,
  }) {
    return BrandProduct(
      id: id,
      name: name,
      description: description,
      sku: sku ?? this.sku,
      status: status ?? this.status,
      isActive: isActive ?? this.isActive,
      pricePaisa: pricePaisa ?? this.pricePaisa,
      compareAtPricePaisa: compareAtPricePaisa ?? this.compareAtPricePaisa,
      image: image,
      stock: stock ?? this.stock,
    );
  }
}

/// One product plus its stock, as the owner detail screen needs it.
class BrandProductDetail {
  const BrandProductDetail({required this.product, this.stock});

  final BrandProduct product;
  final BrandStock? stock;

  factory BrandProductDetail.fromJson(Map<String, dynamic> json) {
    final raw = json['product'];
    final product = BrandProduct.fromJson(
      raw is Map ? Map<String, dynamic>.from(raw) : const {},
    );
    final inventory = json['inventory'];
    return BrandProductDetail(
      product: product,
      stock: inventory is Map
          ? BrandStock.fromJson(Map<String, dynamic>.from(inventory))
          : product.stock,
    );
  }
}

/// A shared catalogue item a shop may list. The shop only chooses a price;
/// the name, description and image stay with the catalogue.
class CatalogItem {
  const CatalogItem({
    required this.id,
    required this.name,
    this.manufacturer = '',
    this.description = '',
    this.sizeLabel = '',
    this.image,
  });

  final String id;
  final String name;
  final String manufacturer;
  final String description;
  final String sizeLabel;
  final String? image;

  factory CatalogItem.fromJson(Map<String, dynamic> json) {
    final images = json['images'];
    final firstImage = images is List && images.isNotEmpty
        ? _optionalText(images.first)
        : null;
    final size = _map(json['size']);
    final value = _optionalDouble(size['value']);
    final unit = _text(size['unit']);
    return CatalogItem(
      id: _text(json['_id'] ?? json['id']),
      name: _text(json['name'], 'Catalogue item'),
      manufacturer: _text(json['manufacturer']),
      description: _text(json['description']),
      sizeLabel: value == null
          ? ''
          : unit.isEmpty
          ? '$value'
          : '${value % 1 == 0 ? value.toInt() : value} $unit',
      image: firstImage,
    );
  }
}

/// One delivery leg as the shop sees it. The server owns the status; the app
/// only shows the next move the shop is allowed to make.
class BrandDelivery {
  const BrandDelivery({
    required this.id,
    this.orderId = '',
    this.orderNumber = '',
    this.status = 'PENDING',
    this.deliveryFeePaisa = 0,
    this.trackingReference = '',
    this.assignedAgent = '',
    this.riderId,
    this.failureReason = '',
    this.address,
    this.createdAt,
  });

  final String id;
  final String orderId;
  final String orderNumber;
  final String status;
  final int deliveryFeePaisa;
  final String trackingReference;
  final String assignedAgent;
  final String? riderId;
  final String failureReason;
  final BrandShippingAddress? address;
  final DateTime? createdAt;

  bool get hasRider => (riderId ?? '').isNotEmpty;
  bool get isFinal =>
      const ['DELIVERED', 'CANCELLED', 'RETURNED'].contains(status);
  bool get isMoving =>
      const ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].contains(status);

  factory BrandDelivery.fromJson(Map<String, dynamic> json) {
    final address = _map(json['address']);
    return BrandDelivery(
      id: _text(json['_id'] ?? json['id']),
      orderId: _text(json['orderId']),
      orderNumber: _text(json['orderNumber']),
      status: _text(json['status'], 'PENDING'),
      deliveryFeePaisa: rupeesToPaisa(json['deliveryFee']),
      trackingReference: _text(json['trackingReference']),
      assignedAgent: _text(json['assignedAgent']),
      riderId: _optionalText(json['riderId']),
      failureReason: _text(json['failureReason']),
      address: address.isEmpty ? null : BrandShippingAddress.fromJson(address),
      createdAt: _date(json['createdAt']),
    );
  }
}

/// A person who delivers this shop's orders. The shop sets the password; the
/// rider signs in to the rider app with it.
class BrandRider {
  const BrandRider({
    required this.id,
    required this.name,
    this.email = '',
    this.phone = '',
    this.isActive = true,
    this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final String phone;
  final bool isActive;
  final DateTime? createdAt;

  factory BrandRider.fromJson(Map<String, dynamic> json) {
    return BrandRider(
      id: _text(json['_id'] ?? json['id']),
      name: _text(json['name'], 'Rider'),
      email: _text(json['email']),
      phone: _text(json['phone']),
      isActive: json['isActive'] != false,
      createdAt: _date(json['createdAt']),
    );
  }
}

/// One refused line in a door return, with the shop's restock decision.
class BrandReturnLine {
  const BrandReturnLine({
    required this.productName,
    this.orderItemId = '',
    this.productId = '',
    this.quantity = 1,
    this.unitPricePaisa = 0,
    this.reason = '',
    this.restock = false,
    this.restockedAt,
    this.hasPhoto = false,
  });

  final String orderItemId;
  final String productId;
  final String productName;
  final int quantity;
  final int unitPricePaisa;
  final String reason;
  final bool restock;
  final DateTime? restockedAt;
  final bool hasPhoto;

  int get lineTotalPaisa => quantity * unitPricePaisa;

  factory BrandReturnLine.fromJson(Map<String, dynamic> json) {
    return BrandReturnLine(
      orderItemId: _text(json['orderItemId']),
      productId: _text(json['productId']),
      productName: _text(json['productName'], 'Item'),
      quantity: _int(json['quantity'], 1),
      unitPricePaisa: rupeesToPaisa(json['unitPrice']),
      reason: _text(json['reason']),
      restock: json['restock'] == true,
      restockedAt: _date(json['restockedAt']),
      hasPhoto: json['hasPhoto'] == true,
    );
  }
}

/// Goods a customer refused at the door. The shop receives them and decides
/// line by line whether they go back into stock.
class BrandReturn {
  const BrandReturn({
    required this.id,
    this.orderId = '',
    this.orderNumber = '',
    this.deliveryId = '',
    this.status = 'IN_TRANSIT',
    this.source = 'DOOR',
    this.lines = const <BrandReturnLine>[],
    this.returnedSubtotalPaisa = 0,
    this.feeRefunded = false,
    this.refundAmountPaisa = 0,
    this.receivedAt,
    this.createdAt,
  });

  final String id;
  final String orderId;
  final String orderNumber;
  final String deliveryId;
  final String status;
  final String source;
  final List<BrandReturnLine> lines;
  final int returnedSubtotalPaisa;
  final bool feeRefunded;
  final int refundAmountPaisa;
  final DateTime? receivedAt;
  final DateTime? createdAt;

  bool get isReceived => status == 'RECEIVED';

  int get totalUnits => lines.fold(0, (total, line) => total + line.quantity);

  factory BrandReturn.fromJson(Map<String, dynamic> json) {
    return BrandReturn(
      id: _text(json['_id'] ?? json['id']),
      orderId: _text(json['orderId']),
      orderNumber: _text(json['orderNumber']),
      deliveryId: _text(json['deliveryId']),
      status: _text(json['status'], 'IN_TRANSIT'),
      source: _text(json['source'], 'DOOR'),
      lines: _mapList(json['lines'])
          .map(BrandReturnLine.fromJson)
          .toList(growable: false),
      returnedSubtotalPaisa: rupeesToPaisa(json['returnedSubtotal']),
      feeRefunded: json['feeRefunded'] == true,
      refundAmountPaisa: rupeesToPaisa(json['refundAmount']),
      receivedAt: _date(json['receivedAt']),
      createdAt: _date(json['createdAt']),
    );
  }
}

/// Totals for the returned-goods screen, counted by the server.
class BrandReturnSummary {
  const BrandReturnSummary({
    this.inTransitCount = 0,
    this.inTransitSubtotalPaisa = 0,
    this.receivedCount = 0,
    this.receivedSubtotalPaisa = 0,
    this.returnedSubtotalPaisa = 0,
    this.refundAmountPaisa = 0,
  });

  final int inTransitCount;
  final int inTransitSubtotalPaisa;
  final int receivedCount;
  final int receivedSubtotalPaisa;
  final int returnedSubtotalPaisa;
  final int refundAmountPaisa;

  factory BrandReturnSummary.fromJson(Map<String, dynamic> json) {
    final transit = _map(json['IN_TRANSIT']);
    final received = _map(json['RECEIVED']);
    return BrandReturnSummary(
      inTransitCount: _int(transit['count'], 0),
      inTransitSubtotalPaisa: rupeesToPaisa(transit['returnedSubtotal']),
      receivedCount: _int(received['count'], 0),
      receivedSubtotalPaisa: rupeesToPaisa(received['returnedSubtotal']),
      returnedSubtotalPaisa: rupeesToPaisa(json['returnedSubtotal']),
      refundAmountPaisa: rupeesToPaisa(json['refundAmount']),
    );
  }
}

/// The shop's public details and delivery defaults, as the brand owner edits
/// them. Money values are stored as rupees by the server, like product prices.
class BrandProfile {
  const BrandProfile({
    required this.id,
    required this.name,
    required this.slug,
    required this.status,
    this.billingStatus,
    this.description = '',
    this.logo,
    this.cityId,
    this.street = '',
    this.area = '',
    this.city = '',
    this.supportPhone = '',
    this.supportEmail = '',
    this.opensAt = '',
    this.closesAt = '',
    this.closedDays = const [],
    this.deliveryFee,
    this.estimatedDeliveryTime = '',
    this.minimumOrderValue,
    this.deliveryNote = '',
  });

  final String id;
  final String name;
  final String slug;
  final String status;
  final String? billingStatus;
  final String description;
  final String? logo;
  final String? cityId;
  final String street;
  final String area;
  final String city;
  final String supportPhone;
  final String supportEmail;
  final String opensAt;
  final String closesAt;
  final List<String> closedDays;
  final double? deliveryFee;
  final String estimatedDeliveryTime;
  final double? minimumOrderValue;
  final String deliveryNote;

  bool get hasSupportContact =>
      supportPhone.trim().isNotEmpty || supportEmail.trim().isNotEmpty;

  factory BrandProfile.fromJson(Map<String, dynamic> json) {
    final contact = _map(json['contact']);
    final address = _map(contact['address']);
    final hours = _map(contact['operatingHours']);
    final settings = _map(json['settings']);
    final closed = hours['closedDays'];
    return BrandProfile(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: _text(json['name'], 'Your shop'),
      slug: _text(json['slug']),
      status: _text(json['status'], 'PENDING'),
      billingStatus: _optionalText(json['billingStatus']),
      description: _text(json['description']),
      logo: _optionalText(json['logo']),
      cityId: _optionalText(json['cityId']),
      street: _text(address['street']),
      area: _text(address['area']),
      city: _text(address['city']),
      supportPhone: _text(contact['supportPhone']),
      supportEmail: _text(contact['supportEmail']),
      opensAt: _text(hours['opensAt']),
      closesAt: _text(hours['closesAt']),
      closedDays: closed is List
          ? closed.map((day) => day.toString()).toList(growable: false)
          : const [],
      deliveryFee: _optionalDouble(settings['deliveryFee']),
      estimatedDeliveryTime: _text(settings['estimatedDeliveryTime']),
      minimumOrderValue: _optionalDouble(settings['minimumOrderValue']),
      deliveryNote: _text(settings['deliveryNote']),
    );
  }
}

/// One physical shop of the brand.
class BrandBranch {
  const BrandBranch({
    required this.id,
    required this.name,
    required this.blockId,
    required this.blockName,
    this.address = '',
    this.phone = '',
    this.isActive = true,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String name;
  final String blockId;
  final String blockName;
  final String address;
  final String phone;
  final bool isActive;
  final double? latitude;
  final double? longitude;

  factory BrandBranch.fromJson(Map<String, dynamic> json) {
    return BrandBranch(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: _text(json['name'], 'Branch'),
      blockId: _text(json['blockId']),
      blockName: _text(json['blockName'], 'Area not set'),
      address: _text(json['address']),
      phone: _text(json['phone']),
      isActive: json['isActive'] != false,
      latitude: _optionalDouble(json['latitude']),
      longitude: _optionalDouble(json['longitude']),
    );
  }
}

/// A neighbourhood a branch can sit in.
class BranchBlock {
  const BranchBlock({
    required this.id,
    required this.name,
    this.isActive = true,
  });

  final String id;
  final String name;
  final bool isActive;

  factory BranchBlock.fromJson(Map<String, dynamic> json) {
    return BranchBlock(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: _text(json['name'], 'Area'),
      isActive: json['isActive'] != false,
    );
  }
}

/// A person who works in the shop: a team member with access, or a picker who
/// only works the packing queue.
class TeamMember {
  const TeamMember({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.phone = '',
    this.jobTitle = '',
    this.permissions = const [],
    this.isActive = true,
    this.removedAt,
    this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String phone;
  final String jobTitle;
  final List<String> permissions;
  final bool isActive;
  final DateTime? removedAt;
  final DateTime? createdAt;

  bool get isPicker => role == 'PICKER';
  bool get wasRemoved => removedAt != null;

  String get roleLabel => isPicker ? 'Picker' : 'Team member';

  String get statusLabel {
    if (!isActive) return 'Removed';
    return isPicker ? 'Picking orders' : 'Active';
  }

  factory TeamMember.fromJson(Map<String, dynamic> json) {
    final user = _map(json['user']);
    final rawPermissions = json['permissions'];
    return TeamMember(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: _text(user['name'] ?? json['name'], 'Team member'),
      email: _text(user['email'] ?? json['email']),
      role: _text(json['role'], 'BRAND_EMPLOYEE'),
      phone: _text(user['phone'] ?? json['phone']),
      jobTitle: _text(json['jobTitle']),
      permissions: rawPermissions is List
          ? rawPermissions
                .map((value) => value.toString())
                .toList(growable: false)
          : const [],
      isActive: json['isActive'] != false,
      removedAt: _date(json['removedAt']),
      createdAt: _date(json['createdAt']),
    );
  }
}

/// The numbers behind the shop's Insights screen.
class BrandAnalytics {
  const BrandAnalytics({
    required this.from,
    required this.to,
    required this.summary,
    this.salesTrend = const [],
    this.orderStatuses = const [],
    this.topProducts = const [],
    this.inventoryAlerts = const [],
    this.deliveryStatuses = const [],
  });

  final String from;
  final String to;
  final AnalyticsSummary summary;
  final List<SalesPoint> salesTrend;
  final List<StatusCount> orderStatuses;
  final List<TopProduct> topProducts;
  final List<InventoryAlert> inventoryAlerts;
  final List<StatusCount> deliveryStatuses;

  factory BrandAnalytics.fromJson(Map<String, dynamic> json) {
    final range = _map(json['range']);
    return BrandAnalytics(
      from: _text(range['from']),
      to: _text(range['to']),
      summary: AnalyticsSummary.fromJson(_map(json['summary'])),
      salesTrend: _mapList(json['salesTrend'])
          .map(SalesPoint.fromJson)
          .toList(growable: false),
      orderStatuses: _mapList(json['orderStatuses'])
          .map(StatusCount.fromJson)
          .toList(growable: false),
      topProducts: _mapList(json['topProducts'])
          .map(TopProduct.fromJson)
          .toList(growable: false),
      inventoryAlerts: _mapList(json['inventoryAlerts'])
          .map(InventoryAlert.fromJson)
          .toList(growable: false),
      deliveryStatuses: _mapList(json['deliveryStatuses'])
          .map(StatusCount.fromJson)
          .toList(growable: false),
    );
  }
}

class AnalyticsSummary {
  const AnalyticsSummary({
    this.orders = 0,
    this.deliveredOrders = 0,
    this.cancelledOrders = 0,
    this.pendingOrders = 0,
    this.revenuePaisa = 0,
    this.averageOrderValuePaisa = 0,
    this.customers = 0,
    this.repeatCustomers = 0,
    this.productsSold = 0,
    this.lowStockProducts = 0,
    this.outOfStockProducts = 0,
  });

  final int orders;
  final int deliveredOrders;
  final int cancelledOrders;
  final int pendingOrders;
  final int revenuePaisa;
  final int averageOrderValuePaisa;
  final int customers;
  final int repeatCustomers;
  final int productsSold;
  final int lowStockProducts;
  final int outOfStockProducts;

  factory AnalyticsSummary.fromJson(Map<String, dynamic> json) {
    return AnalyticsSummary(
      orders: _int(json['orders'], 0),
      deliveredOrders: _int(json['deliveredOrders'], 0),
      cancelledOrders: _int(json['cancelledOrders'], 0),
      pendingOrders: _int(json['pendingOrders'], 0),
      revenuePaisa: rupeesToPaisa(json['revenue']),
      averageOrderValuePaisa: rupeesToPaisa(json['averageOrderValue']),
      customers: _int(json['customers'], 0),
      repeatCustomers: _int(json['repeatCustomers'], 0),
      productsSold: _int(json['productsSold'], 0),
      lowStockProducts: _int(json['lowStockProducts'], 0),
      outOfStockProducts: _int(json['outOfStockProducts'], 0),
    );
  }
}

class SalesPoint {
  const SalesPoint({
    required this.date,
    this.orders = 0,
    this.revenuePaisa = 0,
  });

  final String date;
  final int orders;
  final int revenuePaisa;

  factory SalesPoint.fromJson(Map<String, dynamic> json) {
    return SalesPoint(
      date: _text(json['date']),
      orders: _int(json['orders'], 0),
      revenuePaisa: rupeesToPaisa(json['revenue']),
    );
  }
}

class StatusCount {
  const StatusCount({required this.status, this.count = 0});

  final String status;
  final int count;

  factory StatusCount.fromJson(Map<String, dynamic> json) {
    return StatusCount(
      status: _text(json['status']),
      count: _int(json['count'], 0),
    );
  }
}

class TopProduct {
  const TopProduct({
    this.productId = '',
    required this.name,
    this.unitsSold = 0,
    this.revenuePaisa = 0,
  });

  final String productId;
  final String name;
  final int unitsSold;
  final int revenuePaisa;

  factory TopProduct.fromJson(Map<String, dynamic> json) {
    return TopProduct(
      productId: _text(json['productId']),
      name: _text(json['productName'], 'Product'),
      unitsSold: _int(json['unitsSold'], 0),
      revenuePaisa: rupeesToPaisa(json['revenue']),
    );
  }
}

class InventoryAlert {
  const InventoryAlert({
    this.productId = '',
    required this.name,
    this.available = 0,
    this.threshold = 0,
    this.status = 'LOW_STOCK',
  });

  final String productId;
  final String name;
  final int available;
  final int threshold;
  final String status;

  bool get isOutOfStock => status == 'OUT_OF_STOCK';

  factory InventoryAlert.fromJson(Map<String, dynamic> json) {
    return InventoryAlert(
      productId: _text(json['productId']),
      name: _text(json['productName'], 'Product'),
      available: _int(json['availableQuantity'], 0),
      threshold: _int(json['lowStockThreshold'], 0),
      status: _text(json['status'], 'LOW_STOCK'),
    );
  }
}

/// Shop prices and order totals cross the API in decimal rupees ("64.97"),
/// not paisa. Screens use the same integer-paisa money format everywhere.
int rupeesToPaisa(Object? value) {
  if (value is num) return (value * 100).round();
  if (value == null) return 0;
  final parsed = double.tryParse('$value');
  return parsed == null ? 0 : (parsed * 100).round();
}

int _int(Object? value, int fallback) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value') ?? fallback;
}

int? _optionalInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value');
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

double? _optionalDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

String _text(Object? value, [String fallback = '']) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

String? _optionalText(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

DateTime? _date(Object? value) {
  if (value is! String || value.trim().isEmpty) return null;
  return DateTime.tryParse(value);
}

Map<String, dynamic> _map(Object? value) {
  return value is Map ? Map<String, dynamic>.from(value) : const {};
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

String roleName(String role) =>
    role == brandRole ? 'Shop owner' : 'Service provider';
