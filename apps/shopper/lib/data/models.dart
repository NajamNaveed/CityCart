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

// --- Cart ------------------------------------------------------------------

/// One line in the cart. Prices come from the server; [issue] marks a line that
/// can no longer be bought (the server still returns it so the shopper can fix
/// or remove it). [availableQuantity] is only present when stock is too low.
class CartItem {
  const CartItem({
    required this.productId,
    this.name,
    this.slug,
    this.image,
    this.unitPrice,
    this.quantity = 1,
    this.lineTotal = 0,
    this.issue,
    this.availableQuantity,
  });

  final String productId;
  final String? name;
  final String? slug;
  final String? image;
  final double? unitPrice;
  final int quantity;
  final double lineTotal;
  final String? issue;
  final int? availableQuantity;

  bool get hasIssue => issue != null;

  factory CartItem.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CartItem(
      productId: text(map['productId']),
      name: optionalText(map['name']),
      slug: optionalText(map['slug']),
      image: optionalText(map['image']),
      unitPrice: optionalDouble(map['unitPrice']),
      quantity: asInt(map['quantity'], 1),
      lineTotal: asDouble(map['lineTotal']),
      issue: optionalText(map['issue']),
      availableQuantity: map['availableQuantity'] == null
          ? null
          : asInt(map['availableQuantity']),
    );
  }
}

/// The cart lines of one shop. Checkout turns each group into its own order.
class CartGroup {
  const CartGroup({
    required this.brandId,
    this.brandName,
    this.brandSlug,
    this.brandLogo,
    this.items = const <CartItem>[],
    this.subtotal = 0,
  });

  final String brandId;
  final String? brandName;
  final String? brandSlug;
  final String? brandLogo;
  final List<CartItem> items;
  final double subtotal;

  factory CartGroup.fromJson(dynamic raw) {
    final map = asMap(raw);
    final brand = asMap(map['brand']);
    return CartGroup(
      brandId: text(brand['_id']),
      brandName: optionalText(brand['name']),
      brandSlug: optionalText(brand['slug']),
      brandLogo: optionalText(brand['logo']),
      items: asList(map['items'])
          .map(CartItem.fromJson)
          .toList(growable: false),
      subtotal: asDouble(map['subtotal']),
    );
  }
}

class CartView {
  const CartView({
    this.groups = const <CartGroup>[],
    this.subtotal = 0,
    this.itemCount = 0,
    this.hasIssues = false,
  });

  final List<CartGroup> groups;
  final double subtotal;
  final int itemCount;
  final bool hasIssues;

  bool get isEmpty => groups.isEmpty;

  factory CartView.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CartView(
      groups: asList(map['groups'])
          .map(CartGroup.fromJson)
          .toList(growable: false),
      subtotal: asDouble(map['subtotal']),
      itemCount: asInt(map['itemCount']),
      hasIssues: map['hasIssues'] == true,
    );
  }
}

/// A cart line the shop area cannot deliver, used when the shopper changes
/// block with a non-empty cart.
class CartUndeliverable {
  const CartUndeliverable({required this.productId, this.name, this.brandName});

  final String productId;
  final String? name;
  final String? brandName;

  factory CartUndeliverable.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CartUndeliverable(
      productId: text(map['productId']),
      name: optionalText(map['name']),
      brandName: optionalText(map['brandName']),
    );
  }
}

class CartAreaCheck {
  const CartAreaCheck({
    this.deliverable = const <String>[],
    this.undeliverable = const <CartUndeliverable>[],
  });

  final List<String> deliverable;
  final List<CartUndeliverable> undeliverable;

  factory CartAreaCheck.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CartAreaCheck(
      deliverable: asStringList(map['deliverable']),
      undeliverable: asList(map['undeliverable'])
          .map(CartUndeliverable.fromJson)
          .toList(growable: false),
    );
  }
}

// --- Addresses -------------------------------------------------------------

class SavedAddress {
  const SavedAddress({
    required this.id,
    required this.label,
    required this.fullName,
    required this.phone,
    required this.addressLine,
    required this.city,
    this.state,
    this.postalCode,
    this.country,
    this.additionalInstructions,
    this.latitude,
    this.longitude,
    this.isDefault = false,
    this.blocks = const <AddressBlock>[],
  });

  final String id;
  final String label;
  final String fullName;
  final String phone;
  final String addressLine;
  final String city;
  final String? state;
  final String? postalCode;
  final String? country;
  final String? additionalInstructions;
  final double? latitude;
  final double? longitude;
  final bool isDefault;
  final List<AddressBlock> blocks;

  bool get canDeliver => latitude != null && longitude != null;

  /// One line for a picker: street, then city.
  String get summary =>
      [addressLine, city].where((value) => value.isNotEmpty).join(', ');

  factory SavedAddress.fromJson(dynamic raw) {
    final map = asMap(raw);
    return SavedAddress(
      id: text(map['_id']),
      label: text(map['label'], 'Address'),
      fullName: text(map['fullName']),
      phone: text(map['phone']),
      addressLine: text(map['addressLine']),
      city: text(map['city']),
      state: optionalText(map['state']),
      postalCode: optionalText(map['postalCode']),
      country: optionalText(map['country']),
      additionalInstructions: optionalText(map['additionalInstructions']),
      latitude: optionalDouble(map['latitude']),
      longitude: optionalDouble(map['longitude']),
      isDefault: map['isDefault'] == true,
      blocks: asList(map['blocks'])
          .map(AddressBlock.fromJson)
          .toList(growable: false),
    );
  }
}

class AddressBlock {
  const AddressBlock({required this.id, required this.name});

  final String id;
  final String name;

  factory AddressBlock.fromJson(dynamic raw) {
    final map = asMap(raw);
    return AddressBlock(id: text(map['_id']), name: text(map['name'], 'Area'));
  }
}

// --- Placed orders ---------------------------------------------------------

/// The part of a created order the confirmation needs. The server returns one
/// order per shop in the cart.
class PlacedOrder {
  const PlacedOrder({
    required this.id,
    required this.orderNumber,
    required this.brandId,
    this.items = const <PlacedOrderItem>[],
    this.total = 0,
    this.currency = 'PKR',
    this.orderStatus = 'PENDING',
    this.paymentStatus = 'PENDING',
    this.createdAt,
  });

  final String id;
  final String orderNumber;
  final String brandId;
  final List<PlacedOrderItem> items;
  final double total;
  final String currency;
  final String orderStatus;
  final String paymentStatus;
  final DateTime? createdAt;

  factory PlacedOrder.fromJson(dynamic raw) {
    final map = asMap(raw);
    return PlacedOrder(
      id: text(map['_id']),
      orderNumber: text(map['orderNumber']),
      brandId: text(map['brandId']),
      items: asList(map['items'])
          .map(PlacedOrderItem.fromJson)
          .toList(growable: false),
      total: asDouble(map['total']),
      currency: text(map['currency'], 'PKR'),
      orderStatus: text(map['orderStatus'], 'PENDING'),
      paymentStatus: text(map['paymentStatus'], 'PENDING'),
      createdAt: asDate(map['createdAt']),
    );
  }
}

class PlacedOrderItem {
  const PlacedOrderItem({
    required this.productId,
    required this.productName,
    this.quantity = 1,
    this.unitPrice = 0,
    this.totalPrice = 0,
    this.image,
  });

  final String productId;
  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;
  final String? image;

  factory PlacedOrderItem.fromJson(dynamic raw) {
    final map = asMap(raw);
    return PlacedOrderItem(
      productId: text(map['productId']),
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      totalPrice: asDouble(map['totalPrice']),
      image: optionalText(map['image']),
    );
  }
}

// --- Customer orders -------------------------------------------------------

class CustomerOrder {
  const CustomerOrder({
    required this.id,
    required this.orderNumber,
    this.brandId = '',
    this.brandName,
    this.items = const <CustomerOrderItem>[],
    this.shippingAddress = const OrderAddress(),
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.tax = 0,
    this.total = 0,
    this.netTotal,
    this.returnedAmount = 0,
    this.feeRefunded = false,
    this.currency = 'PKR',
    this.orderStatus = 'PENDING',
    this.paymentStatus = 'PENDING',
    this.paymentMethod = 'COD',
    this.fulfilment,
    this.statusHistory = const <OrderStatusEvent>[],
    this.createdAt,
  });

  final String id;
  final String orderNumber;
  final String brandId;
  final String? brandName;
  final List<CustomerOrderItem> items;
  final OrderAddress shippingAddress;
  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double tax;
  final double total;
  final double? netTotal;
  final double returnedAmount;
  final bool feeRefunded;
  final String currency;
  final String orderStatus;
  final String paymentStatus;
  final String paymentMethod;
  final String? fulfilment;
  final List<OrderStatusEvent> statusHistory;
  final DateTime? createdAt;

  /// What the shopper actually owes after anything refused at the door.
  double get payableTotal => netTotal ?? total;

  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  /// The server only lets a customer cancel an unpaid order that the shop has
  /// not started (docs/08 §21).
  bool get canCancel => orderStatus == 'PENDING' && paymentStatus != 'PAID';

  bool get isProblem =>
      orderStatus == 'CANCELLED' ||
      orderStatus == 'REJECTED' ||
      orderStatus == 'RETURN_REQUESTED' ||
      orderStatus == 'RETURNED' ||
      orderStatus == 'REFUNDED';

  factory CustomerOrder.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CustomerOrder(
      id: text(map['_id']),
      orderNumber: text(map['orderNumber']),
      brandId: text(map['brandId']),
      brandName: optionalText(map['brandName']),
      items: asList(map['items'])
          .map(CustomerOrderItem.fromJson)
          .toList(growable: false),
      shippingAddress: OrderAddress.fromJson(map['shippingAddress']),
      subtotal: asDouble(map['subtotal']),
      deliveryFee: asDouble(map['deliveryFee']),
      discount: asDouble(map['discount']),
      tax: asDouble(map['tax']),
      total: asDouble(map['total']),
      netTotal: optionalDouble(map['netTotal']),
      returnedAmount: asDouble(map['returnedAmount']),
      feeRefunded: map['feeRefunded'] == true,
      currency: text(map['currency'], 'PKR'),
      orderStatus: text(map['orderStatus'], 'PENDING'),
      paymentStatus: text(map['paymentStatus'], 'PENDING'),
      paymentMethod: text(map['paymentMethod'], 'COD'),
      fulfilment: optionalText(map['fulfilment']),
      statusHistory: asList(map['statusHistory'])
          .map(OrderStatusEvent.fromJson)
          .toList(growable: false),
      createdAt: asDate(map['createdAt']),
    );
  }
}

class CustomerOrderItem {
  const CustomerOrderItem({
    required this.id,
    required this.productId,
    required this.productName,
    this.quantity = 1,
    this.unitPrice = 0,
    this.totalPrice = 0,
    this.image,
  });

  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;
  final String? image;

  factory CustomerOrderItem.fromJson(dynamic raw) {
    final map = asMap(raw);
    return CustomerOrderItem(
      id: text(map['_id']),
      productId: text(map['productId']),
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      totalPrice: asDouble(map['totalPrice']),
      image: optionalText(map['image']),
    );
  }
}

class OrderAddress {
  const OrderAddress({
    this.name = '',
    this.phone = '',
    this.address = '',
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.additionalInstructions,
  });

  final String name;
  final String phone;
  final String address;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? country;
  final String? additionalInstructions;

  /// "Lahore, Punjab" without empty commas.
  String get placeLine => [
    city,
    state,
    postalCode,
  ].where((part) => (part ?? '').trim().isNotEmpty).join(', ');

  factory OrderAddress.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderAddress(
      name: text(map['name']),
      phone: text(map['phone']),
      address: text(map['address']),
      city: optionalText(map['city']),
      state: optionalText(map['state']),
      postalCode: optionalText(map['postalCode']),
      country: optionalText(map['country']),
      additionalInstructions: optionalText(map['additionalInstructions']),
    );
  }
}

class OrderStatusEvent {
  const OrderStatusEvent({required this.status, this.at});

  final String status;
  final DateTime? at;

  factory OrderStatusEvent.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderStatusEvent(status: text(map['status']), at: asDate(map['at']));
  }
}

// --- Order payments, deliveries and changes --------------------------------

class OrderPayment {
  const OrderPayment({
    this.id = '',
    this.status = 'PENDING',
    this.method = 'COD',
    this.amount = 0,
    this.currency = 'PKR',
    this.paidAt,
    this.collectionMethod,
    this.collectionWallet,
  });

  final String id;
  final String status;
  final String method;
  final double amount;
  final String currency;
  final DateTime? paidAt;
  final String? collectionMethod;
  final String? collectionWallet;

  factory OrderPayment.fromJson(dynamic raw) {
    final map = asMap(raw);
    final collection = asMap(map['collection']);
    return OrderPayment(
      id: text(map['_id']),
      status: text(map['status'], 'PENDING'),
      method: text(map['method'], 'COD'),
      amount: asDouble(map['amount']),
      currency: text(map['currency'], 'PKR'),
      paidAt: asDate(map['paidAt']),
      collectionMethod: optionalText(collection['method']),
      collectionWallet: optionalText(collection['wallet']),
    );
  }
}

class OrderDelivery {
  const OrderDelivery({
    this.id = '',
    this.status = 'PENDING',
    this.trackingReference,
    this.assignedAgent,
    this.failureReason,
    this.paymentPending = false,
  });

  final String id;
  final String status;
  final String? trackingReference;
  final String? assignedAgent;
  final String? failureReason;
  final bool paymentPending;

  /// Statuses in which the server gives the shopper the door code (docs/11 §19).
  bool get codeVisible => const {
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'FAILED',
  }.contains(status);

  bool get hasTracking =>
      (trackingReference ?? '').isNotEmpty ||
      (assignedAgent ?? '').isNotEmpty ||
      status == 'FAILED';

  factory OrderDelivery.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderDelivery(
      id: text(map['_id']),
      status: text(map['status'], 'PENDING'),
      trackingReference: optionalText(map['trackingReference']),
      assignedAgent: optionalText(map['assignedAgent']),
      failureReason: optionalText(map['failureReason']),
      paymentPending: map['paymentPending'] == true,
    );
  }
}

class AdjustmentTotals {
  const AdjustmentTotals({
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.tax = 0,
    this.total = 0,
  });

  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double tax;
  final double total;

  factory AdjustmentTotals.fromJson(dynamic raw) {
    final map = asMap(raw);
    return AdjustmentTotals(
      subtotal: asDouble(map['subtotal']),
      deliveryFee: asDouble(map['deliveryFee']),
      discount: asDouble(map['discount']),
      tax: asDouble(map['tax']),
      total: asDouble(map['total']),
    );
  }
}

class AdjustmentSubstitute {
  const AdjustmentSubstitute({
    required this.productName,
    this.quantity = 1,
    this.unitPrice = 0,
  });

  final String productName;
  final int quantity;
  final double unitPrice;

  factory AdjustmentSubstitute.fromJson(dynamic raw) {
    final map = asMap(raw);
    return AdjustmentSubstitute(
      productName: text(map['productName'], 'Another item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
    );
  }
}

class AdjustmentLine {
  const AdjustmentLine({
    required this.productName,
    required this.orderedQuantity,
    required this.supplyQuantity,
    this.unitPrice = 0,
    this.substitute,
  });

  final String productName;
  final int orderedQuantity;
  final int supplyQuantity;
  final double unitPrice;
  final AdjustmentSubstitute? substitute;

  factory AdjustmentLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    final substitute = map['substitute'];
    return AdjustmentLine(
      productName: text(map['productName'], 'Item'),
      orderedQuantity: asInt(map['orderedQuantity'], 1),
      supplyQuantity: asInt(map['supplyQuantity']),
      unitPrice: asDouble(map['unitPrice']),
      substitute: substitute == null
          ? null
          : AdjustmentSubstitute.fromJson(substitute),
    );
  }
}

/// A shop's proposal to change an order it cannot fully supply (docs/21 §H).
class OrderAdjustment {
  const OrderAdjustment({
    required this.id,
    this.status = 'PROPOSED',
    this.note = '',
    this.lines = const <AdjustmentLine>[],
    this.totalsBefore = const AdjustmentTotals(),
    this.totalsAfter = const AdjustmentTotals(),
    this.totalsAfterRemoval = const AdjustmentTotals(),
    this.expiresAt,
    this.proposedByRole,
  });

  final String id;
  final String status;
  final String note;
  final List<AdjustmentLine> lines;
  final AdjustmentTotals totalsBefore;
  final AdjustmentTotals totalsAfter;
  final AdjustmentTotals totalsAfterRemoval;
  final DateTime? expiresAt;
  final String? proposedByRole;

  bool get isProposed => status == 'PROPOSED';

  /// "a picker" / "the shop" — who sent the proposal.
  String get proposedByLabel => switch (proposedByRole) {
    'PICKER' => 'a picker',
    'BRAND_EMPLOYEE' || 'BRAND_ADMIN' => 'the shop',
    _ => 'the shop',
  };

  factory OrderAdjustment.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderAdjustment(
      id: text(map['_id']),
      status: text(map['status'], 'PROPOSED'),
      note: text(map['note']),
      lines: asList(map['lines'])
          .map(AdjustmentLine.fromJson)
          .toList(growable: false),
      totalsBefore: AdjustmentTotals.fromJson(map['totalsBefore']),
      totalsAfter: AdjustmentTotals.fromJson(map['totalsAfter']),
      totalsAfterRemoval: AdjustmentTotals.fromJson(map['totalsAfterRemoval']),
      expiresAt: asDate(map['expiresAt']),
      proposedByRole: optionalText(map['proposedByRole']),
    );
  }
}

// --- Door returns ----------------------------------------------------------

class OrderReturnLine {
  const OrderReturnLine({
    required this.orderItemId,
    required this.productName,
    this.quantity = 0,
    this.unitPrice = 0,
    this.reason,
  });

  final String orderItemId;
  final String productName;
  final int quantity;
  final double unitPrice;
  final String? reason;

  factory OrderReturnLine.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderReturnLine(
      orderItemId: text(map['orderItemId']),
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity']),
      unitPrice: asDouble(map['unitPrice']),
      reason: optionalText(map['reason']),
    );
  }
}

class OrderReturn {
  const OrderReturn({
    required this.id,
    this.status = '',
    this.lines = const <OrderReturnLine>[],
    this.returnedSubtotal = 0,
    this.feeRefunded = false,
    this.refundAmount = 0,
    this.currency = 'PKR',
    this.receivedAt,
    this.createdAt,
  });

  final String id;
  final String status;
  final List<OrderReturnLine> lines;
  final double returnedSubtotal;
  final bool feeRefunded;
  final double refundAmount;
  final String currency;
  final DateTime? receivedAt;
  final DateTime? createdAt;

  Map<String, OrderReturnLine> byItem() => {
    for (final line in lines) line.orderItemId: line,
  };

  factory OrderReturn.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderReturn(
      id: text(map['_id']),
      status: text(map['status']),
      lines: asList(map['lines'])
          .map(OrderReturnLine.fromJson)
          .toList(growable: false),
      returnedSubtotal: asDouble(map['returnedSubtotal']),
      feeRefunded: map['feeRefunded'] == true,
      refundAmount: asDouble(map['refundAmount']),
      currency: text(map['currency'], 'PKR'),
      receivedAt: asDate(map['receivedAt']),
      createdAt: asDate(map['createdAt']),
    );
  }
}

/// Everything the order screen shows: the order and the records attached to it.
class OrderDetail {
  const OrderDetail({
    required this.order,
    this.payment,
    this.delivery,
    this.adjustments = const <OrderAdjustment>[],
    this.adjustment,
    this.returnDoc,
  });

  final CustomerOrder order;
  final OrderPayment? payment;
  final OrderDelivery? delivery;
  final List<OrderAdjustment> adjustments;
  final OrderAdjustment? adjustment;
  final OrderReturn? returnDoc;

  factory OrderDetail.fromJson(dynamic raw) {
    final map = asMap(raw);
    final adjustment = map['adjustment'];
    final payment = map['payment'];
    final delivery = map['delivery'];
    final returnDoc = map['return'];
    return OrderDetail(
      order: CustomerOrder.fromJson(map['order']),
      payment: payment == null ? null : OrderPayment.fromJson(payment),
      delivery: delivery == null ? null : OrderDelivery.fromJson(delivery),
      adjustments: asList(map['adjustments'])
          .map(OrderAdjustment.fromJson)
          .toList(growable: false),
      adjustment: adjustment == null
          ? null
          : OrderAdjustment.fromJson(adjustment),
      returnDoc: returnDoc == null ? null : OrderReturn.fromJson(returnDoc),
    );
  }
}

/// The customer's answer to a shop's change proposal.
class AdjustmentOutcome {
  const AdjustmentOutcome({this.adjustment, this.order, this.refundAmount = 0});

  final OrderAdjustment? adjustment;
  final CustomerOrder? order;
  final double refundAmount;

  factory AdjustmentOutcome.fromJson(dynamic raw) {
    final map = asMap(raw);
    final adjustment = map['adjustment'];
    final order = map['order'];
    return AdjustmentOutcome(
      adjustment: adjustment == null
          ? null
          : OrderAdjustment.fromJson(adjustment),
      order: order == null ? null : CustomerOrder.fromJson(order),
      refundAmount: asDouble(map['refundAmount']),
    );
  }
}

// --- Receipts --------------------------------------------------------------

class ReceiptItem {
  const ReceiptItem({
    required this.productName,
    this.quantity = 1,
    this.unitPrice = 0,
    this.totalPrice = 0,
  });

  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;

  factory ReceiptItem.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ReceiptItem(
      productName: text(map['productName'], 'Item'),
      quantity: asInt(map['quantity'], 1),
      unitPrice: asDouble(map['unitPrice']),
      totalPrice: asDouble(map['totalPrice']),
    );
  }
}

class OrderReceipt {
  const OrderReceipt({
    required this.id,
    required this.receiptNumber,
    this.orderNumber = '',
    this.brandName = '',
    this.method = 'COD',
    this.collectionMethod,
    this.collectionWallet,
    this.amount = 0,
    this.currency = 'PKR',
    this.items = const <ReceiptItem>[],
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.tax = 0,
    this.issuedAt,
  });

  final String id;
  final String receiptNumber;
  final String orderNumber;
  final String brandName;
  final String method;
  final String? collectionMethod;
  final String? collectionWallet;
  final double amount;
  final String currency;
  final List<ReceiptItem> items;
  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double tax;
  final DateTime? issuedAt;

  factory OrderReceipt.fromJson(dynamic raw) {
    final map = asMap(raw);
    return OrderReceipt(
      id: text(map['_id']),
      receiptNumber: text(map['receiptNumber']),
      orderNumber: text(map['orderNumber']),
      brandName: text(map['brandName']),
      method: text(map['method'], 'COD'),
      collectionMethod: optionalText(map['collectionMethod']),
      collectionWallet: optionalText(map['collectionWallet']),
      amount: asDouble(map['amount']),
      currency: text(map['currency'], 'PKR'),
      items: asList(map['items'])
          .map(ReceiptItem.fromJson)
          .toList(growable: false),
      subtotal: asDouble(map['subtotal']),
      deliveryFee: asDouble(map['deliveryFee']),
      discount: asDouble(map['discount']),
      tax: asDouble(map['tax']),
      issuedAt: asDate(map['issuedAt']),
    );
  }
}

// --- My reviews ------------------------------------------------------------

class MyReview {
  const MyReview({
    required this.id,
    required this.productId,
    required this.orderId,
    this.rating = 0,
    this.title,
    this.comment,
    this.createdAt,
  });

  final String id;
  final String productId;
  final String orderId;
  final int rating;
  final String? title;
  final String? comment;
  final DateTime? createdAt;

  factory MyReview.fromJson(dynamic raw) {
    final map = asMap(raw);
    return MyReview(
      id: text(map['_id']),
      productId: text(map['productId']),
      orderId: text(map['orderId']),
      rating: asInt(map['rating']),
      title: optionalText(map['title']),
      comment: optionalText(map['comment']),
      createdAt: asDate(map['createdAt']),
    );
  }
}

// --- Services --------------------------------------------------------------

/// A kind of work a provider can offer: cleaning, repairs, tutoring and so on.
class ServiceCategory {
  const ServiceCategory({
    required this.id,
    required this.name,
    this.slug = '',
    this.order = 0,
    this.image,
  });

  final String id;
  final String name;
  final String slug;
  final int order;
  final String? image;

  factory ServiceCategory.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceCategory(
      id: text(map['_id']),
      name: text(map['name'], 'Service'),
      slug: text(map['slug']),
      order: asInt(map['order']),
      image: optionalText(map['image']),
    );
  }
}

/// One thing a provider sells, with its own price floor and length.
class ServiceOffering {
  const ServiceOffering({
    required this.id,
    required this.title,
    this.slug = '',
    this.description,
    this.images = const <String>[],
    this.startingAtPricePaisa = 0,
    this.durationMinutes = 0,
    this.attributes = const <String, dynamic>{},
  });

  final String id;
  final String title;
  final String slug;
  final String? description;
  final List<String> images;

  /// Whole paisa, as the server stores it. Divide by 100 for rupees.
  final int startingAtPricePaisa;
  final int durationMinutes;
  final Map<String, dynamic> attributes;

  double get startingAtPrice => startingAtPricePaisa / 100;
  String? get image => images.isEmpty ? null : images.first;

  factory ServiceOffering.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceOffering(
      id: text(map['_id']),
      title: text(map['title'], 'Service'),
      slug: text(map['slug']),
      description: optionalText(map['description']),
      images: asStringList(map['images']),
      startingAtPricePaisa: asInt(map['startingAtPrice']),
      durationMinutes: asInt(map['durationMinutes']),
      attributes: asMap(map['attributes']),
    );
  }
}

/// One working window in Karachi wall-clock minutes. `start` and `end` are
/// already formatted as `HH:MM` by the server.
class ServiceWindow {
  const ServiceWindow({
    required this.weekday,
    required this.weekdayName,
    required this.startMinute,
    required this.endMinute,
    this.start = '',
    this.end = '',
    this.slotMinutes = 60,
  });

  final int weekday;
  final String weekdayName;
  final int startMinute;
  final int endMinute;
  final String start;
  final String end;
  final int slotMinutes;

  factory ServiceWindow.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceWindow(
      weekday: asInt(map['weekday']),
      weekdayName: text(map['weekdayName'], 'Day'),
      startMinute: asInt(map['startMinute']),
      endMinute: asInt(map['endMinute']),
      start: text(map['start']),
      end: text(map['end']),
      slotMinutes: asInt(map['slotMinutes'], 60),
    );
  }
}

class ServiceAvailability {
  const ServiceAvailability({
    this.windows = const <ServiceWindow>[],
    this.blackoutDates = const <String>[],
    this.updatedAt,
    this.isPublished = false,
  });

  final List<ServiceWindow> windows;
  final List<String> blackoutDates;
  final DateTime? updatedAt;
  final bool isPublished;

  bool isBlackout(String dateKey) => blackoutDates.contains(dateKey);

  factory ServiceAvailability.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceAvailability(
      windows: asList(map['windows'])
          .map(ServiceWindow.fromJson)
          .toList(growable: false),
      blackoutDates: asStringList(map['blackoutDates']),
      updatedAt: asDate(map['updatedAt']),
      isPublished: map['isPublished'] == true,
    );
  }
}

class ServiceReviewReply {
  const ServiceReviewReply({required this.body, this.at});

  final String body;
  final DateTime? at;

  factory ServiceReviewReply.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceReviewReply(body: text(map['body']), at: asDate(map['at']));
  }
}

class ServiceReview {
  const ServiceReview({
    required this.id,
    this.bookingId = '',
    this.providerId = '',
    this.rating = 0,
    this.comment,
    this.reply,
    this.reviewerName,
    this.serviceTitle,
    this.createdAt,
  });

  final String id;
  final String bookingId;
  final String providerId;
  final int rating;
  final String? comment;
  final ServiceReviewReply? reply;
  final String? reviewerName;
  final String? serviceTitle;
  final DateTime? createdAt;

  factory ServiceReview.fromJson(dynamic raw) {
    final map = asMap(raw);
    final reply = asMap(map['providerReply']);
    return ServiceReview(
      id: text(map['_id']),
      bookingId: text(map['bookingId']),
      providerId: text(map['providerId']),
      rating: asInt(map['rating']),
      comment: optionalText(map['comment']),
      reply: reply.isEmpty ? null : ServiceReviewReply.fromJson(reply),
      reviewerName: optionalText(map['reviewerName']),
      serviceTitle: optionalText(map['serviceTitle']),
      createdAt: asDate(map['createdAt']),
    );
  }
}

/// The public, approximate block a provider works in. The pin itself is never
/// sent to shoppers.
class ServiceBlockRef {
  const ServiceBlockRef({
    required this.id,
    required this.name,
    this.latitude,
    this.longitude,
    this.area,
  });

  final String id;
  final String name;
  final double? latitude;
  final double? longitude;
  final String? area;

  factory ServiceBlockRef.fromJson(dynamic raw) {
    final map = asMap(raw);
    final center = asMap(map['center']);
    return ServiceBlockRef(
      id: text(map['_id']),
      name: text(map['name'], 'Area'),
      latitude: optionalDouble(center['lat']),
      longitude: optionalDouble(center['lng']),
      area: optionalText(map['area']),
    );
  }
}

class ServiceCategoryRef {
  const ServiceCategoryRef({
    required this.id,
    required this.name,
    this.slug = '',
  });

  final String id;
  final String name;
  final String slug;

  factory ServiceCategoryRef.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceCategoryRef(
      id: text(map['_id']),
      name: text(map['name'], 'Service'),
      slug: text(map['slug']),
    );
  }
}

class ServiceCityRef {
  const ServiceCityRef({required this.id, required this.name});

  final String id;
  final String name;

  factory ServiceCityRef.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceCityRef(
      id: text(map['_id']),
      name: text(map['name'], 'City'),
    );
  }
}

/// A service provider as shoppers may see it: discovery rows and the published
/// provider page share one type. [offerings], [availability] and [reviews] are
/// only filled on the provider page.
class ServiceProvider {
  const ServiceProvider({
    required this.id,
    required this.displayName,
    required this.slug,
    this.bio,
    this.avatar,
    this.coverImage,
    this.startingAtPricePaisa = 0,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedBookings = 0,
    this.isNew = true,
    this.acceptingNewOrders = true,
    this.category,
    this.city,
    this.block,
    this.distanceKm,
    this.offeringCount = 0,
    this.topOfferings = const <ServiceOffering>[],
    this.offerings = const <ServiceOffering>[],
    this.availability = const ServiceAvailability(),
    this.reviews = const <ServiceReview>[],
  });

  final String id;
  final String displayName;
  final String slug;
  final String? bio;
  final String? avatar;
  final String? coverImage;
  final int startingAtPricePaisa;
  final double ratingAvg;
  final int ratingCount;
  final int completedBookings;
  final bool isNew;
  final bool acceptingNewOrders;
  final ServiceCategoryRef? category;
  final ServiceCityRef? city;
  final ServiceBlockRef? block;
  final double? distanceKm;
  final int offeringCount;
  final List<ServiceOffering> topOfferings;
  final List<ServiceOffering> offerings;
  final ServiceAvailability availability;
  final List<ServiceReview> reviews;

  double get startingAtPrice => startingAtPricePaisa / 100;
  bool get hasRating => ratingCount > 0;
  String get categoryName => category?.name ?? 'Service';
  String get placeLabel => block?.name ?? city?.name ?? '';

  /// The provider's public block centre, used as an approximate job pin when
  /// the shopper's chosen area has no coordinates.
  double? get blockLatitude => block?.latitude;
  double? get blockLongitude => block?.longitude;

  factory ServiceProvider.fromJson(dynamic raw) {
    final map = asMap(raw);
    final category = asMap(map['category']);
    final city = asMap(map['city']);
    final block = asMap(map['block']);
    return ServiceProvider(
      id: text(map['_id']),
      displayName: text(map['displayName'], 'Service provider'),
      slug: text(map['slug']),
      bio: optionalText(map['bio']),
      avatar: optionalText(map['avatar']),
      coverImage: optionalText(map['coverImage']),
      startingAtPricePaisa: asInt(map['startingAtPrice']),
      ratingAvg: asDouble(map['ratingAvg']),
      ratingCount: asInt(map['ratingCount']),
      completedBookings: asInt(map['completedBookings']),
      isNew: map['isNew'] != false,
      acceptingNewOrders: map['acceptingNewOrders'] != false,
      category: category.isEmpty ? null : ServiceCategoryRef.fromJson(category),
      city: city.isEmpty ? null : ServiceCityRef.fromJson(city),
      block: block.isEmpty ? null : ServiceBlockRef.fromJson(block),
      distanceKm: optionalDouble(map['distanceKm']),
      offeringCount: asInt(map['offeringCount']),
      topOfferings: asList(map['topOfferings'])
          .map(ServiceOffering.fromJson)
          .toList(growable: false),
      offerings: asList(map['offerings'])
          .map(ServiceOffering.fromJson)
          .toList(growable: false),
      availability: map['availability'] == null
          ? const ServiceAvailability()
          : ServiceAvailability.fromJson(map['availability']),
      reviews: asList(map['reviews'])
          .map(ServiceReview.fromJson)
          .toList(growable: false),
    );
  }
}

class ServiceDiscoverResult {
  const ServiceDiscoverResult({
    this.items = const <ServiceProvider>[],
    this.pagination = const Pagination(),
    this.scope = 'city',
  });

  final List<ServiceProvider> items;
  final Pagination pagination;
  final String scope;

  bool get hasMore => pagination.hasMore;

  factory ServiceDiscoverResult.fromJson(dynamic raw) {
    final map = asMap(raw);
    final meta = asMap(map['meta']);
    return ServiceDiscoverResult(
      items: asList(map['items'])
          .map(ServiceProvider.fromJson)
          .toList(growable: false),
      pagination: Pagination.fromJson(map['pagination']),
      scope: text(meta['scope'], 'city'),
    );
  }
}

/// The acknowledgement a booking request returns. The full booking belongs to
/// the bookings screen; this is all the confirmation needs.
class ServiceBookingCreated {
  const ServiceBookingCreated({
    required this.id,
    required this.bookingNumber,
    this.status = 'REQUESTED',
  });

  final String id;
  final String bookingNumber;
  final String status;

  factory ServiceBookingCreated.fromJson(dynamic raw) {
    final map = asMap(raw);
    return ServiceBookingCreated(
      id: text(map['_id']),
      bookingNumber: text(map['bookingNumber']),
      status: text(map['status'], 'REQUESTED'),
    );
  }
}

class DirectChatStart {
  const DirectChatStart({
    required this.conversationId,
    required this.providerName,
    this.providerImage,
    this.providerSlug,
  });

  final String conversationId;
  final String providerName;
  final String? providerImage;
  final String? providerSlug;

  factory DirectChatStart.fromJson(dynamic raw) {
    final map = asMap(raw);
    final provider = asMap(map['provider']);
    return DirectChatStart(
      conversationId: text(map['conversationId']),
      providerName: text(provider['name'], 'Provider'),
      providerImage: optionalText(provider['image']),
      providerSlug: optionalText(provider['slug']),
    );
  }
}
