# 07 — Marketplace and Shopping Experience

## 1. Purpose

This document defines how customers discover cities, brands, stores, categories, and products on CityCart.

It also defines the marketplace browsing experience, product discovery, product details, cart behavior, and the transition from shopping to checkout.

This document is the source of truth for implementing the customer-facing marketplace.

---

# 2. Marketplace Concept

CityCart is a **city-based multi-vendor marketplace**.

The customer shopping hierarchy is:

```text
City
 ↓
Brands
 ↓
Categories
 ↓
Products
 ↓
Product Details
 ↓
Cart
 ↓
Checkout
```

A customer can discover multiple local brands through one CityCart platform.

Each brand maintains its own:

* Store
* Products
* Categories
* Inventory
* Orders
* Brand information

---

# 3. Marketplace Entry

The customer should be able to enter the marketplace from the main CityCart website.

The marketplace should provide:

* City selection
* Brand discovery
* Product search
* Categories
* Featured products
* Featured brands
* Product filtering
* Product sorting

The experience should work for both:

```text
Guest customers
Authenticated customers
```

Authentication is required only for actions that need an account, such as checkout and order management.

---

# 4. City Selection

Cities are a core part of the marketplace.

Example:

```text
CityCart
 ├── Lahore
 ├── Faisalabad
 ├── Islamabad
 ├── Karachi
 └── Rawalpindi
```

The exact available cities are controlled by the platform.

A customer can select a city to discover brands and products available in that city.

---

# 5. City Availability

A city may have a status such as:

```text
active
inactive
```

Only active cities should normally appear in the customer marketplace.

Inactive cities may remain in the database for historical records.

Super Admin controls city availability.

---

# 6. Brand Discovery

Within a selected city, customers can browse available brands.

Example:

```text
Faisalabad
    ↓
Brand A
Brand B
Brand C
Brand D
```

Brand cards may display:

* Brand name
* Logo
* Cover image
* Short description
* Category
* Store status
* Location information

The marketplace must not expose private brand administration information.

---

# 7. Brand Storefront

Each brand has a public storefront.

Example:

```text
Brand Store
├── Brand Header
├── Description
├── Categories
├── Featured Products
├── All Products
└── Store Information
```

Customers can browse products belonging to that brand.

A brand storefront must never display products belonging to another brand.

---

# 8. Brand Store Status

Brands may have statuses such as:

```text
ACTIVE
INACTIVE
SUSPENDED
```

Only brands allowed by the platform should be visible to customers.

A suspended brand should not accept new orders.

Existing historical orders must remain accessible to authorized users.

---

# 9. Product Discovery

Customers can discover products through:

* City browsing
* Brand storefronts
* Categories
* Search
* Featured products
* Filters
* Sorting

Product cards should provide enough information for quick comparison.

Typical information:

```text
Product image
Product name
Brand
Price
Discount price
Availability
Rating
```

---

# 10. Product Ownership

Every product belongs to exactly one brand.

Conceptually:

```text
Product
   ↓
brandId
   ↓
Brand
```

Products must not exist without a valid brand association.

Customers should see the brand associated with each product.

---

# 11. Categories

Categories organize products.

Examples:

```text
Electronics
Fashion
Home & Living
Beauty
Food
Accessories
```

Categories may be:

* Platform-wide
* Brand-specific

The implementation must clearly distinguish between these two types.

Brand-specific categories must remain inside their brand's tenant boundary.

---

# 12. Product Search

CityCart should provide product search.

Search may initially use MongoDB queries and indexes.

Customers should be able to search by relevant product information such as:

```text
Product name
Brand
Category
```

Search results should respect:

* City
* Active brands
* Product availability
* Tenant relationships

---

# 13. Search Example

A customer searches:

```text
"wireless headphones"
```

CityCart may return:

```text
Wireless Headphones
 ├── Brand A
 ├── Brand B
 └── Brand C
```

If the customer has selected a city, results should be limited to products available within that marketplace context.

---

# 14. Filtering

The marketplace should support practical filters.

Initial filters may include:

```text
Category
Brand
Price range
Rating
Availability
```

Additional filters can be introduced later.

Filters must be validated server-side.

---

# 15. Sorting

Customers may sort products by:

```text
Newest
Price: Low → High
Price: High → Low
Rating
Popularity
```

Only supported sorting fields should be accepted by the API.

Clients must not be allowed to inject arbitrary database fields into sorting queries.

---

# 16. Pagination

Product listings must use pagination.

Example:

```http
GET /api/v1/products?page=1&limit=20
```

The API should return pagination information such as:

```json
{
  "page": 1,
  "limit": 20,
  "total": 100,
  "totalPages": 5
}
```

The backend must enforce a reasonable maximum page size.

---

# 17. Product Details

Each product should have a dedicated product details page.

The page may contain:

```text
Product images
Product name
Brand
Description
Price
Discount
Stock status
Category
Rating
Reviews
Quantity selector
Add to Cart
```

Only public product information should be displayed.

Internal fields such as supplier costs or internal inventory identifiers must not be exposed.

---

# 18. Product Images

Products may have multiple images.

Images should be stored using the configured external storage system such as Cloudinary.

The product model should store image references/URLs rather than large image binaries inside MongoDB.

Images should be:

* Validated
* Optimized where appropriate
* Properly sized
* Served through a reliable CDN/storage provider

---

# 19. Product Pricing

Product prices are controlled by the backend.

The frontend may display prices, but the backend remains authoritative.

Example:

```text
Frontend:
Product price = 1,500

Backend:
Product price = 1,500
```

During checkout, the server must retrieve the current product price rather than trusting the price submitted by the browser.

---

# 20. Product Availability

Products should have an availability state based on inventory.

Possible states:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

A customer must not be able to purchase more units than available inventory.

Inventory validation must happen again during checkout.

---

# 21. Cart

Customers can add products from multiple brands to one cart.

Example:

```text
Customer Cart

Brand A
 ├── Product A1 × 2
 └── Product A2 × 1

Brand B
 └── Product B1 × 3
```

The cart belongs to the customer.

Guests may optionally use a temporary client-side cart, but the persistent server-side cart is associated with an authenticated customer.

---

# 22. Cart Operations

The cart should support:

```text
Add product
Update quantity
Remove product
Clear cart
View cart
```

API examples:

```http
POST /api/v1/cart/items
PATCH /api/v1/cart/items/:productId
DELETE /api/v1/cart/items/:productId
GET /api/v1/cart
DELETE /api/v1/cart
```

Exact routes must remain consistent with the API specification.

---

# 23. Cart Validation

Every cart operation must validate:

* Product exists
* Product is active
* Brand is active
* Product is available
* Quantity is valid
* Quantity does not exceed allowed stock

The backend must not trust:

```text
price
discount
subtotal
brandId
```

provided by the client.

---

# 24. Multi-Brand Cart

CityCart intentionally allows products from different brands in one cart.

Example:

```text
Cart
│
├── Brand A
│     ├── Product A
│     └── Product B
│
└── Brand B
      └── Product C
```

This provides a unified shopping experience for the customer.

However, brands must remain isolated during order processing.

---

# 25. Cart Price Calculation

The backend calculates:

```text
item subtotal
+
brand/order-level charges where applicable
+
delivery charges where applicable
-
discounts where applicable
=
order total
```

The exact pricing rules must be implemented consistently across the application.

Frontend totals are for display only.

---

# 26. Stock Reservation

For the MVP, inventory should be validated during checkout.

The checkout process must prevent overselling.

Conceptual flow:

```text
Checkout request
      ↓
Load current products
      ↓
Check stock
      ↓
Calculate authoritative prices
      ↓
Create orders
      ↓
Reduce inventory
```

The implementation must handle concurrent checkout attempts safely.

---

# 27. Checkout Transition

The marketplace's responsibility ends at the shopping/cart stage.

Checkout is handled by the order system defined in:

```text
08-order-management.md
```

The marketplace passes the validated cart into the checkout process.

---

# 28. Guest Shopping

Guests should be able to:

* Browse cities
* Browse brands
* Browse categories
* Search products
* View product details

Authentication should be required for:

* Persistent customer cart
* Checkout
* Order history
* Reviews
* Account management

---

# 29. Customer Account Context

Authenticated customers should have access to:

```text
My Profile
My Cart
My Orders
My Reviews
My Notifications
```

Marketplace pages should not expose another customer's account information.

---

# 30. Reviews and Ratings

Customers may review products after purchasing them.

The marketplace may display:

```text
Average rating
Review count
Customer reviews
```

Review creation and moderation rules are defined in:

```text
13-review-and-rating-system.md
```

Reviews must be associated with the correct product and customer.

---

# 31. Featured Content

CityCart may support:

```text
Featured brands
Featured products
Popular products
New products
```

For the MVP, this can be controlled through simple database fields.

Examples:

```text
isFeatured
```

Advanced recommendation algorithms are not part of the initial MVP.

---

# 32. Marketplace API Principles

Marketplace APIs must:

* Return only public data where appropriate.
* Enforce city/brand relationships.
* Validate query parameters.
* Use pagination.
* Prevent unauthorized data access.
* Never trust client-side pricing.
* Never expose internal security fields.
* Use consistent response structures.

---

# 33. Marketplace Performance

The marketplace should be designed for efficient browsing.

Initial optimization should include:

* Database indexes
* Pagination
* Limited response fields
* Optimized image delivery
* Query filtering
* Avoiding unnecessary database queries

Caching can be introduced later.

---

# 34. Marketplace Security

Marketplace endpoints must prevent:

* Unauthorized product modification
* Cross-brand product access
* Manipulation of prices
* Inventory manipulation
* Invalid quantities
* Query injection
* Unauthorized review manipulation

Only authorized brand users may modify their products.

Customers are read-only consumers of public marketplace data except for permitted customer actions.

---

# 35. Customer Shopping Flow

The complete initial flow is:

```text
Open CityCart
     ↓
Select City
     ↓
Browse Brands
     ↓
Open Brand Store
     ↓
Browse Categories
     ↓
View Products
     ↓
Search / Filter / Sort
     ↓
Open Product
     ↓
Add to Cart
     ↓
Continue Shopping
     ↓
Review Cart
     ↓
Checkout
```

---

# 36. Example Multi-Brand Shopping Flow

```text
Customer selects Faisalabad

        ↓

Brand A
 └── Shoes

Brand B
 └── Electronics

        ↓

Customer adds:

Brand A → Running Shoes
Brand B → Wireless Earbuds

        ↓

Single Cart

        ↓

Checkout

        ↓

Separate brand orders
```

The customer experiences one shopping session while each brand receives only its own order.

---

# 37. AI Implementation Rules

AI coding agents must:

1. Read this document before modifying marketplace functionality.
2. Follow the API specification.
3. Never trust client-side prices.
4. Never bypass inventory validation.
5. Preserve brand ownership boundaries.
6. Add tests for multi-brand cart behavior.
7. Add tests for unauthorized product access.
8. Keep marketplace logic separate from order-processing logic.
9. Avoid introducing unnecessary marketplace dependencies.
10. Report architectural conflicts before changing documented behavior.

---

# 38. Acceptance Criteria

The marketplace is considered implemented when:

* Customers can select active cities.
* Customers can browse brands.
* Customers can open brand storefronts.
* Customers can browse categories.
* Customers can search products.
* Customers can filter and sort products.
* Product listings use pagination.
* Customers can view product details.
* Products display correct brand information.
* Customers can add products to a cart.
* Customers can update and remove cart items.
* A cart can contain products from multiple brands.
* Backend validates product prices and stock.
* Customers cannot access private brand data.
* Customers cannot modify marketplace products.
* Product and brand tenant relationships are preserved.
* Marketplace APIs are validated and protected.

---

# 39. Source-of-Truth Rule

This document is the authoritative specification for CityCart's marketplace and customer shopping experience.

If AI-generated code or another document conflicts with this document, the conflict must be identified and resolved before implementation.

---

## Next Document

**08-order-management.md — Cart Checkout, Order Creation, Order Lifecycle, Brand Orders, and Customer Order Tracking**
