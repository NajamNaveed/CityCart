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

double? optionalDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

DateTime? asDate(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

Map<String, dynamic> asMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

List<dynamic> asList(dynamic value) =>
    value is List ? value : const <dynamic>[];

List<String> asStringList(dynamic value) =>
    asList(value).whereType<String>().where((s) => s.isNotEmpty).toList();

class Pagination {
  const Pagination({
    this.page = 1,
    this.limit = 20,
    this.pages = 1,
    this.total = 0,
  });

  final int page;
  final int limit;
  final int pages;
  final int total;

  factory Pagination.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Pagination(
      page: asInt(map['page'], 1),
      limit: asInt(map['limit'], 20),
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

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    this.role = 'CUSTOMER',
    this.emailVerified = false,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final bool emailVerified;

  factory AppUser.fromJson(dynamic raw) {
    final map = asMap(raw);
    return AppUser(
      id: text(map['id']),
      name: text(map['name'], 'Shopper'),
      email: text(map['email']),
      role: text(map['role'], 'CUSTOMER'),
      emailVerified: map['emailVerified'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    'emailVerified': emailVerified,
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

/// A city the marketplace serves. Fetched with `?isActive=true`.
class City {
  const City({
    required this.id,
    required this.name,
    this.state,
    this.description,
    this.image,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? state;
  final String? description;
  final String? image;
  final bool isActive;

  factory City.fromJson(dynamic raw) {
    final map = asMap(raw);
    return City(
      id: text(map['_id']),
      name: text(map['name'], 'City'),
      state: optionalText(map['state']),
      description: optionalText(map['description']),
      image: optionalText(map['image']),
      isActive: map['isActive'] != false,
    );
  }
}

/// A neighbourhood inside a city. The centre pin is what the app uses when a
/// shopper picks a block instead of sharing a live position.
class Block {
  const Block({
    required this.id,
    required this.cityId,
    required this.name,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String cityId;
  final String name;
  final double? latitude;
  final double? longitude;

  String get label => name;

  factory Block.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Block(
      id: text(map['_id']),
      cityId: text(map['cityId']),
      name: text(map['name'], 'Area'),
      latitude: optionalDouble(map['latitude']),
      longitude: optionalDouble(map['longitude']),
    );
  }
}

/// The area the shopper chose to shop in. Kept on the device so the app opens
/// in the right place next time. A whole city is allowed; a block narrows it.
class AreaSelection {
  const AreaSelection({
    required this.cityId,
    required this.cityName,
    this.blockId,
    this.blockName,
    this.latitude,
    this.longitude,
  });

  final String cityId;
  final String cityName;
  final String? blockId;
  final String? blockName;
  final double? latitude;
  final double? longitude;

  bool get hasBlock => blockId != null && blockId!.isNotEmpty;

  String get label {
    if (hasBlock && (blockName ?? '').isNotEmpty) {
      return '$blockName, $cityName';
    }
    return cityName;
  }

  String get scope => hasBlock ? 'block' : 'city';

  Map<String, dynamic> discoverQuery() => {
    'scope': scope,
    'cityId': cityId,
    if (hasBlock) 'blockId': blockId,
  };

  factory AreaSelection.fromBlock({required City city, required Block block}) =>
      AreaSelection(
        cityId: city.id,
        cityName: city.name,
        blockId: block.id,
        blockName: block.name,
        latitude: block.latitude,
        longitude: block.longitude,
      );

  factory AreaSelection.cityOnly(City city) =>
      AreaSelection(cityId: city.id, cityName: city.name);
}

/// A product as it appears in a discovery row: enough for a card, no more.
class ProductSummary {
  const ProductSummary({
    required this.id,
    required this.name,
    this.price,
    this.compareAtPrice,
    this.image,
    this.availability = 'OUT_OF_STOCK',
    this.availableAt = const <String>[],
  });

  final String id;
  final String name;
  final double? price;
  final double? compareAtPrice;
  final String? image;
  final String availability;
  final List<String> availableAt;

  bool get inStock => availability != 'OUT_OF_STOCK';

  factory ProductSummary.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ProductSummary(
      id: text(map['_id']),
      name: text(map['name'], 'Item'),
      price: optionalDouble(map['price']),
      compareAtPrice: optionalDouble(map['compareAtPrice']),
      image: optionalText(map['image']),
      availability: text(map['availability'], 'OUT_OF_STOCK'),
      availableAt: asStringList(map['availableAt']),
    );
  }
}

class DiscoverBranch {
  const DiscoverBranch({
    required this.id,
    required this.name,
    this.address,
    this.phone,
    this.blockName,
    this.distanceKm,
  });

  final String id;
  final String name;
  final String? address;
  final String? phone;
  final String? blockName;
  final double? distanceKm;

  factory DiscoverBranch.fromJson(dynamic raw) {
    final map = asMap(raw);
    return DiscoverBranch(
      id: text(map['_id']),
      name: text(map['name'], 'Shop'),
      address: optionalText(map['address']),
      phone: optionalText(map['phone']),
      blockName: optionalText(map['blockName']),
      distanceKm: optionalDouble(map['distanceKm']),
    );
  }
}

class DiscoverBrand {
  const DiscoverBrand({
    required this.id,
    required this.name,
    required this.slug,
    this.logo,
    this.acceptingNewOrders = true,
    this.nearestKm,
    this.branchCount = 0,
    this.branches = const <DiscoverBranch>[],
    this.products = const <ProductSummary>[],
  });

  final String id;
  final String name;
  final String slug;
  final String? logo;
  final bool acceptingNewOrders;
  final double? nearestKm;
  final int branchCount;
  final List<DiscoverBranch> branches;
  final List<ProductSummary> products;

  String get placeLabel {
    final branch = branches.isNotEmpty ? branches.first : null;
    if (branch?.blockName != null) return branch!.blockName!;
    return '';
  }

  factory DiscoverBrand.fromJson(dynamic raw) {
    final map = asMap(raw);
    return DiscoverBrand(
      id: text(map['_id']),
      name: text(map['name'], 'Store'),
      slug: text(map['slug']),
      logo: optionalText(map['logo']),
      acceptingNewOrders: map['acceptingNewOrders'] != false,
      nearestKm: optionalDouble(map['nearestKm']),
      branchCount: asInt(map['branchCount']),
      branches: asList(map['branches'])
          .map(DiscoverBranch.fromJson)
          .toList(growable: false),
      products: asList(map['products'])
          .map(ProductSummary.fromJson)
          .toList(growable: false),
    );
  }
}

class DiscoverResult {
  const DiscoverResult({
    required this.items,
    this.pagination = const Pagination(),
    this.totalBranches = 0,
  });

  final List<DiscoverBrand> items;
  final Pagination pagination;
  final int totalBranches;

  bool get hasMore => pagination.hasMore;

  factory DiscoverResult.fromJson(dynamic raw) {
    final map = asMap(raw);
    final meta = asMap(map['meta']);
    return DiscoverResult(
      items: asList(map['items'])
          .map(DiscoverBrand.fromJson)
          .toList(growable: false),
      pagination: Pagination.fromJson(map['pagination']),
      totalBranches: asInt(meta['totalBranches']),
    );
  }
}

class PublicBrand {
  const PublicBrand({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.logo,
    this.coverImage,
    this.cityId,
  });

  final String id;
  final String name;
  final String slug;
  final String? description;
  final String? logo;
  final String? coverImage;
  final String? cityId;

  factory PublicBrand.fromJson(dynamic raw) {
    final map = asMap(raw);
    return PublicBrand(
      id: text(map['_id']),
      name: text(map['name'], 'Store'),
      slug: text(map['slug']),
      description: optionalText(map['description']),
      logo: optionalText(map['logo']),
      coverImage: optionalText(map['coverImage']),
      cityId: optionalText(map['cityId']),
    );
  }
}

class CategoryNode {
  const CategoryNode({
    required this.id,
    required this.name,
    this.slug,
    this.children = const <CategoryNode>[],
  });

  final String id;
  final String name;
  final String? slug;
  final List<CategoryNode> children;

  factory CategoryNode.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CategoryNode(
      id: text(map['_id']),
      name: text(map['name'], 'Category'),
      slug: optionalText(map['slug']),
      children: asList(map['children'])
          .map(CategoryNode.fromJson)
          .toList(growable: false),
    );
  }
}

/// A published product with its current stock state.
class Product {
  const Product({
    required this.id,
    required this.brandId,
    required this.name,
    this.description,
    this.images = const <String>[],
    this.price,
    this.compareAtPrice,
    this.sku,
    this.categoryId,
    this.slug,
    this.attributes = const <String, dynamic>{},
    this.createdAt,
    this.availability = 'OUT_OF_STOCK',
  });

  final String id;
  final String brandId;
  final String name;
  final String? description;
  final List<String> images;
  final double? price;
  final double? compareAtPrice;
  final String? sku;
  final String? categoryId;
  final String? slug;
  final Map<String, dynamic> attributes;
  final DateTime? createdAt;
  final String availability;

  String? get image => images.isEmpty ? null : images.first;

  bool get inStock => availability != 'OUT_OF_STOCK';

  factory Product.fromJson(dynamic raw) {
    final map = asMap(raw);
    return Product(
      id: text(map['_id']),
      brandId: text(map['brandId']),
      name: text(map['name'], 'Item'),
      description: optionalText(map['description']),
      images: asStringList(map['images']),
      price: optionalDouble(map['price']),
      compareAtPrice: optionalDouble(map['compareAtPrice']),
      sku: optionalText(map['sku']),
      categoryId: optionalText(map['categoryId']),
      slug: optionalText(map['slug']),
      attributes: asMap(map['attributes']),
      createdAt: asDate(map['createdAt']),
      availability: text(map['availability'], 'OUT_OF_STOCK'),
    );
  }
}

/// The star summary above a product's reviews. `distribution` maps 1–5 stars
/// to the number of reviews at that rating.
class RatingSummary {
  const RatingSummary({
    this.average = 0,
    this.count = 0,
    this.distribution = const <int, int>{},
  });

  final double average;
  final int count;
  final Map<int, int> distribution;

  int countFor(int stars) => distribution[stars] ?? 0;

  factory RatingSummary.fromJson(dynamic raw) {
    final map = asMap(raw);
    final rawDistribution = asMap(map['distribution']);
    final distribution = <int, int>{};
    for (var stars = 1; stars <= 5; stars++) {
      distribution[stars] = asInt(rawDistribution['$stars']);
    }
    return RatingSummary(
      average: asDouble(map['average']),
      count: asInt(map['count']),
      distribution: distribution,
    );
  }
}

class ProductReview {
  const ProductReview({
    required this.id,
    required this.rating,
    this.title,
    this.comment,
    this.reviewerName,
    this.verifiedPurchase = false,
    this.createdAt,
  });

  final String id;
  final int rating;
  final String? title;
  final String? comment;
  final String? reviewerName;
  final bool verifiedPurchase;
  final DateTime? createdAt;

  factory ProductReview.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ProductReview(
      id: text(map['_id']),
      rating: asInt(map['rating']).clamp(1, 5),
      title: optionalText(map['title']),
      comment: optionalText(map['comment']),
      reviewerName: optionalText(map['reviewerName']),
      verifiedPurchase: map['verifiedPurchase'] == true,
      createdAt: asDate(map['createdAt']),
    );
  }
}

class ProductReviewPage {
  const ProductReviewPage({
    required this.reviews,
    required this.summary,
    this.pagination = const Pagination(),
  });

  final List<ProductReview> reviews;
  final RatingSummary summary;
  final Pagination pagination;

  factory ProductReviewPage.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ProductReviewPage(
      reviews: asList(map['reviews'])
          .map(ProductReview.fromJson)
          .toList(growable: false),
      summary: RatingSummary.fromJson(map['summary']),
      pagination: Pagination.fromJson(map['pagination']),
    );
  }
}

/// A product preview carried inside a chat thread.
class ChatProduct {
  const ChatProduct({
    required this.id,
    required this.name,
    this.price,
    this.image,
    this.available = true,
  });

  final String id;
  final String name;
  final double? price;
  final String? image;
  final bool available;

  factory ChatProduct.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ChatProduct(
      id: text(map['_id']),
      name: text(map['name'], 'Item'),
      price: optionalDouble(map['price']),
      image: optionalText(map['image']),
      available: map['available'] != false,
    );
  }
}

/// What the server returns when a shopper opens chat from a product page.
class ProductChatContext {
  const ProductChatContext({
    required this.product,
    required this.brandId,
    required this.brandName,
    this.brandLogo,
    this.conversationId,
  });

  final ChatProduct product;
  final String brandId;
  final String brandName;
  final String? brandLogo;
  final String? conversationId;

  factory ProductChatContext.fromJson(dynamic raw) {
    final map = asMap(raw);
    final brand = asMap(map['brand']);
    return ProductChatContext(
      product: ChatProduct.fromJson(map['product']),
      brandId: text(brand['_id']),
      brandName: text(brand['name'], 'The shop'),
      brandLogo: optionalText(brand['logo']),
      conversationId: optionalText(map['conversationId']),
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
    this.product,
  });

  final String id;
  final String body;
  final String? conversationId;
  final String senderRole;
  final bool mine;
  final DateTime? createdAt;
  final ChatProduct? product;

  factory ChatMessage.fromJson(dynamic raw) {
    final map = asMap(raw);
    final product = map['product'];
    return ChatMessage(
      id: text(map['_id']),
      body: text(map['body']),
      conversationId: optionalText(map['conversationId']),
      senderRole: text(map['senderRole'], 'CUSTOMER'),
      mine: map['mine'] == true,
      createdAt: asDate(map['createdAt']),
      product: product is Map ? ChatProduct.fromJson(product) : null,
    );
  }
}

class ChatStartResult {
  const ChatStartResult({required this.conversationId, required this.message});

  final String conversationId;
  final ChatMessage message;

  factory ChatStartResult.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ChatStartResult(
      conversationId: text(map['conversationId']),
      message: ChatMessage.fromJson(map['message']),
    );
  }
}

class ChatMessagePage {
  const ChatMessagePage({required this.messages, this.hasMore = false});

  final List<ChatMessage> messages;
  final bool hasMore;

  factory ChatMessagePage.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ChatMessagePage(
      messages: asList(map['messages'])
          .map(ChatMessage.fromJson)
          .toList(growable: false),
      hasMore: map['hasMore'] == true,
    );
  }
}

class Storefront {
  const Storefront({
    required this.brand,
    required this.categories,
    required this.featuredProducts,
    this.storeName,
    this.banner,
  });

  final PublicBrand brand;
  final List<CategoryNode> categories;
  final List<Product> featuredProducts;
  final String? storeName;
  final String? banner;

  factory Storefront.fromJson(dynamic raw) {
    final map = asMap(raw);
    final store = asMap(map['store']);
    return Storefront(
      brand: PublicBrand.fromJson(map['brand']),
      categories: asList(map['categories'])
          .map(CategoryNode.fromJson)
          .toList(growable: false),
      featuredProducts: asList(map['featuredProducts'])
          .map(Product.fromJson)
          .toList(growable: false),
      storeName: optionalText(store['name']),
      banner: optionalText(store['banner']),
    );
  }
}
