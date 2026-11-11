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
  });

  final String id;
  final String body;
  final String? conversationId;
  final String senderRole;
  final bool mine;
  final DateTime? createdAt;

  bool get isSystem => senderRole == 'SYSTEM';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: _text(json['_id']),
      body: _text(json['body']),
      conversationId: _optionalText(json['conversationId']),
      senderRole: _text(json['senderRole'], 'CUSTOMER'),
      mine: json['mine'] == true,
      createdAt: _date(json['createdAt']),
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

/// One line of a shop order. Prices are snapshots taken when the order was
/// placed, so editing a product later never changes an existing order.
class BrandOrderItem {
  const BrandOrderItem({
    required this.productId,
    required this.productName,
    this.sku = '',
    this.quantity = 1,
    this.unitPricePaisa = 0,
    this.totalPricePaisa = 0,
    this.image,
    this.pickStatus = '',
  });

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
