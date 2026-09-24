# CityCart — Database Design

**Document:** `04-database-design.md`
**Status:** Approved for implementation
**Version:** 1.0

---

# 1. Purpose

This document defines the database architecture for CityCart.

It describes:

* MongoDB collections
* Document structures
* Relationships
* Tenant ownership
* Required fields
* Indexes
* Data integrity rules
* Order structure
* Cart structure
* Inventory structure
* Future extensibility

MongoDB with Mongoose will be used as the primary database.

---

# 2. Database Technology

CityCart will use:

```text
MongoDB
Mongoose ODM
```

MongoDB is selected because CityCart contains a mixture of:

* User-generated data
* Product/catalog data
* Nested order items
* Flexible product information
* Brand-specific resources
* Notifications
* Reviews

Mongoose will provide schema definitions, validation, references, indexes, and model-level behavior.

---

# 3. Database Architecture

CityCart will use a shared database with logical tenant isolation.

```text
MongoDB
│
├── Users
├── Cities
├── Brands
├── Stores
├── Employees
├── Categories
├── Products
├── Inventory
├── Carts
├── Orders
├── Payments
├── Reviews
└── Notifications
```

A Brand is the primary tenant.

Brand-owned resources must contain a reliable `brandId` reference where applicable.

---

# 4. Entity Relationship Overview

```text
City
 │
 └── Brand
      │
      ├── Store
      ├── Employee
      ├── Category
      │    └── Product
      │          └── Inventory
      │
      ├── Order
      │    ├── Payment
      │    └── Review
      │
      └── Notification


User
 ├── Customer
 ├── Brand Admin
 ├── Brand Employee
 └── Super Admin
```

A user may have additional profile information depending on their role.

---

# 5. Collections

Initial collections:

```text
users
cities
brands
stores
employees
categories
products
inventory
carts
orders
payments
reviews
notifications
```

Additional collections may be introduced later for:

```text
commissions
payouts
coupons
delivery
auditLogs
```

---

# 6. User Model

Collection:

```text
users
```

The User model represents authentication and identity.

### Core fields

```text
_id
name
email
passwordHash
role
brandId
phone
avatar
isActive
createdAt
updatedAt
```

### Role

Allowed values:

```text
SUPER_ADMIN
BRAND_ADMIN
BRAND_EMPLOYEE
CUSTOMER
```

### `brandId`

Required for:

```text
BRAND_ADMIN
BRAND_EMPLOYEE
```

Not required for:

```text
SUPER_ADMIN
CUSTOMER
```

A customer is not a tenant member merely because they purchase from a brand.

---

# 7. User Constraints

Email addresses should be unique.

Recommended:

```text
email: lowercase + unique
```

Passwords must never be stored in plaintext.

Only the password hash should be stored.

Sensitive authentication information must never be returned through normal user API responses.

---

# 8. City Model

Collection:

```text
cities
```

Cities define the geographic marketplace areas supported by CityCart.

### Fields

```text
_id
name
slug
state
country
description
image
isActive
createdAt
updatedAt
```

Example:

```json
{
  "name": "Lahore",
  "slug": "lahore",
  "state": "Punjab",
  "country": "Pakistan",
  "isActive": true
}
```

A city may contain multiple brands.

```text
City
 ├── Brand A
 ├── Brand B
 └── Brand C
```

---

# 9. Brand Model

Collection:

```text
brands
```

A Brand is the primary tenant.

### Fields

```text
_id
name
slug
description
logo
coverImage
cityId
status
contact
settings
createdAt
updatedAt
```

### Brand status

Initial statuses:

```text
PENDING
ACTIVE
SUSPENDED
REJECTED
```

Only an authorized Super Admin can perform platform-level brand approval or suspension.

---

# 10. Brand Ownership

Every brand-owned resource must be traceable to its brand.

Examples:

```text
Product.brandId
Category.brandId
Employee.brandId
Order.brandId
Inventory.brandId
Store.brandId
```

This is essential for tenant isolation.

---

# 11. Store Model

Collection:

```text
stores
```

A Brand may have one primary online store initially.

### Fields

```text
_id
brandId
name
slug
description
address
contact
businessHours
logo
banner
isActive
createdAt
updatedAt
```

The store must belong to a valid brand.

---

# 12. Employee Model

Employee information can be represented through the User model or a dedicated Employee model.

For the initial architecture, the recommended approach is:

```text
User
 +
brandId
 +
role
 +
permissions
```

If a dedicated `employees` collection becomes necessary later, it should reference the corresponding User.

### Employee-specific information

Potential fields:

```text
userId
brandId
permissions
jobTitle
isActive
createdAt
updatedAt
```

Employee permissions are defined in:

```text
02-user-roles-and-permissions.md
```

---

# 13. Category Model

Collection:

```text
categories
```

### Fields

```text
_id
brandId
name
slug
description
image
parentId
isActive
createdAt
updatedAt
```

Categories are brand-scoped.

Example:

```text
Brand A
 ├── Electronics
 │    ├── Phones
 │    └── Laptops
 └── Accessories
```

`parentId` allows hierarchical categories.

---

# 14. Product Model

Collection:

```text
products
```

### Fields

```text
_id
brandId
categoryId
name
slug
description
images
price
compareAtPrice
sku
stockTracking
isActive
status
attributes
createdAt
updatedAt
```

### Product status

```text
DRAFT
ACTIVE
INACTIVE
ARCHIVED
```

The exact publication workflow may be expanded later.

---

# 15. Product Ownership

Every product must belong to exactly one brand.

```text
Product
 └── brandId
```

A Brand Admin or authorized employee may only manage products belonging to their brand.

A product from Brand A must never be modified by Brand B.

---

# 16. Product Pricing

The product stores its current selling price.

Example:

```text
price = 2500
```

Optional:

```text
compareAtPrice = 3000
```

The final order price must be captured inside the Order Item.

This prevents historical orders from changing when a product price changes later.

---

# 17. Product Attributes

Products may have flexible attributes.

Example:

```json
{
  "color": "Black",
  "size": "XL",
  "material": "Cotton"
}
```

The exact product-attribute architecture can be expanded when variants are implemented.

---

# 18. Inventory Model

Collection:

```text
inventory
```

### Fields

```text
_id
brandId
productId
quantity
reservedQuantity
availableQuantity
lowStockThreshold
trackInventory
createdAt
updatedAt
```

Conceptually:

```text
availableQuantity =
quantity - reservedQuantity
```

The exact implementation may calculate rather than permanently store derived values.

---

# 19. Inventory Rules

Inventory must:

* Belong to a valid product
* Belong to the same brand as the product
* Prevent unauthorized modification
* Prevent invalid negative quantities
* Be validated during checkout
* Be updated consistently when orders are created/cancelled

Inventory operations should be handled by backend services rather than directly by controllers.

---

# 20. Cart Model

Collection:

```text
carts
```

A cart belongs to one customer.

### Fields

```text
_id
userId
items
createdAt
updatedAt
```

Each cart item contains:

```text
productId
brandId
quantity
```

The server should retrieve the current product information when calculating the cart and checkout totals.

The client must not be trusted to determine final prices.

---

# 21. Cart Example

```json
{
  "userId": "customer123",
  "items": [
    {
      "productId": "productA",
      "brandId": "brandA",
      "quantity": 2
    },
    {
      "productId": "productB",
      "brandId": "brandB",
      "quantity": 1
    }
  ]
}
```

A cart may contain products from multiple brands.

---

# 22. Order Model

Collection:

```text
orders
```

Orders are one of the most important entities in CityCart.

### Core fields

```text
_id
orderNumber
customerId
brandId
items
shippingAddress
subtotal
deliveryFee
discount
tax
total
paymentMethod
paymentStatus
orderStatus
notes
createdAt
updatedAt
```

---

# 23. Order Items

Order items should store a historical snapshot of important product information.

Example:

```text
items[]
 ├── productId
 ├── productName
 ├── sku
 ├── quantity
 ├── unitPrice
 ├── totalPrice
 └── image
```

The order must not depend on the current Product document to reconstruct historical pricing.

For example:

```text
Product price today = 3000
```

does not mean an old order containing:

```text
unitPrice = 2500
```

should change to 3000.

---

# 24. Multi-Brand Order Splitting

A customer's cart may contain multiple brands.

The backend creates separate orders.

Example:

```text
Cart
│
├── Brand A
│   ├── Product 1
│   └── Product 2
│
└── Brand B
    └── Product 3
```

Becomes:

```text
Order A
brandId = Brand A

Order B
brandId = Brand B
```

Each order is independently manageable by its respective brand.

---

# 25. Order Status

Initial order statuses:

```text
PENDING
CONFIRMED
PROCESSING
READY_FOR_SHIPMENT
SHIPPED
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
REJECTED
RETURN_REQUESTED
RETURNED
REFUNDED
```

Not every transition is valid.

The order service must enforce valid state transitions.

---

# 26. Payment Model

Collection:

```text
payments
```

### Fields

```text
_id
orderId
customerId
amount
method
status
transactionReference
provider
paidAt
createdAt
updatedAt
```

Initial payment method:

```text
COD
```

Possible future methods:

```text
CARD
BANK_TRANSFER
WALLET
ONLINE_GATEWAY
```

---

# 27. Payment Status

Initial statuses:

```text
PENDING
PAID
FAILED
REFUNDED
CANCELLED
```

Payment state and order state should remain separate.

For example:

```text
Order status = DELIVERED
Payment status = PAID
```

---

# 28. Review Model

Collection:

```text
reviews
```

### Fields

```text
_id
customerId
productId
brandId
orderId
rating
title
comment
isApproved
createdAt
updatedAt
```

A review should be associated with a real customer purchase where required by the business rules.

The customer should not be able to create unlimited reviews for the same qualifying purchase.

---

# 29. Notification Model

Collection:

```text
notifications
```

### Fields

```text
_id
userId
type
title
message
data
isRead
createdAt
```

Example:

```json
{
  "userId": "user123",
  "type": "ORDER_STATUS_CHANGED",
  "title": "Order Updated",
  "message": "Your order has been shipped.",
  "isRead": false
}
```

Notifications should only be visible to their intended recipient.

---

# 30. Relationships

Primary relationships:

```text
City
 └── Brands

Brand
 ├── Store
 ├── Employees
 ├── Categories
 ├── Products
 ├── Inventory
 ├── Orders
 └── Reviews

Category
 └── Products

Product
 └── Inventory

Customer
 ├── Cart
 ├── Orders
 ├── Reviews
 └── Notifications

Order
 └── Payment
```

---

# 31. Reference Strategy

MongoDB references should be used where entities have independent lifecycles.

Examples:

```text
Product → brandId
Product → categoryId

Order → customerId
Order → brandId

Payment → orderId

Review → productId
Review → customerId
```

Important historical information should be embedded as snapshots where necessary.

Orders are the primary example.

---

# 32. Embedded vs Referenced Data

Use embedded data when:

* Data belongs tightly to its parent
* Data is normally read with its parent
* Independent querying is unnecessary

Use references when:

* Data has an independent lifecycle
* Data is shared
* Data requires independent management
* The relationship is many-to-many or potentially large

Example:

```text
Order → references Customer
Order → embeds Order Items
```

---

# 33. Required Indexes

Indexes should be added based on common queries.

Initial recommended indexes:

### Users

```text
email: unique
```

### Cities

```text
slug: unique
```

### Brands

```text
slug: unique
cityId
status
```

### Stores

```text
brandId
slug
```

### Categories

```text
brandId
slug
parentId
```

### Products

```text
brandId
categoryId
slug
sku
status
```

### Inventory

```text
productId: unique
brandId
```

### Carts

```text
userId: unique
```

### Orders

```text
orderNumber: unique
customerId
brandId
orderStatus
createdAt
```

### Reviews

```text
productId
customerId
brandId
```

---

# 34. Compound Indexes

As query patterns become clearer, compound indexes should be introduced.

Potential examples:

```text
Products:
{ brandId: 1, status: 1 }

Orders:
{ brandId: 1, orderStatus: 1 }

Orders:
{ customerId: 1, createdAt: -1 }

Products:
{ brandId: 1, categoryId: 1 }
```

Indexes should be based on actual query patterns rather than added indiscriminately.

---

# 35. Data Integrity Rules

The application must enforce:

1. Every product belongs to a valid brand.
2. Every category belongs to a valid brand.
3. Product and category brand IDs must match.
4. Inventory and product brand IDs must match.
5. Brand employees belong to one brand.
6. Brand orders belong to one brand.
7. Customers can only access their own private resources.
8. Brand users can only access resources within their brand.
9. Order totals are calculated server-side.
10. Historical order prices are preserved.

---

# 36. Soft Deletion

Permanent deletion should be avoided for important business records.

For applicable entities, consider:

```text
isDeleted
deletedAt
```

or status-based deactivation.

Examples:

```text
Product → ARCHIVED
Brand → SUSPENDED
User → isActive = false
```

Orders and financial records should generally remain historically available.

---

# 37. Timestamps

Major collections should include:

```text
createdAt
updatedAt
```

Mongoose timestamps should be enabled where appropriate.

Example:

```text
{
  timestamps: true
}
```

---

# 38. Schema Validation

Mongoose schemas must define appropriate:

* Required fields
* Data types
* Enum values
* Default values
* Minimum/maximum values
* References
* Indexes

Application-level validation should complement schema validation.

---

# 39. Data Consistency During Checkout

Checkout is a critical database operation.

The backend should:

1. Load cart.
2. Validate products.
3. Validate product status.
4. Validate inventory.
5. Calculate prices.
6. Group items by brand.
7. Create brand orders.
8. Update/reserve inventory.
9. Create payment records where applicable.
10. Clear or update the cart.

Where multiple database writes must remain consistent, MongoDB transactions should be considered.

---

# 40. Concurrency and Inventory

Inventory can be affected by simultaneous customers.

Example:

```text
Stock = 1

Customer A → Checkout
Customer B → Checkout
```

The system must prevent both customers from successfully purchasing the same final unit.

Atomic database operations or transactions should be used where appropriate.

---

# 41. Customer Address Data

Order shipping information should be stored as a snapshot.

For example:

```text
shippingAddress:
 ├── fullName
 ├── phone
 ├── addressLine
 ├── city
 ├── state
 ├── postalCode
 └── country
```

This prevents an old order from changing when a customer later updates their profile address.

---

# 42. Security Considerations

Database access must follow these rules:

* Never expose password hashes.
* Never expose authentication secrets.
* Never trust client-supplied `brandId` for authorization.
* Validate ObjectIds before querying.
* Prevent unauthorized document access.
* Restrict sensitive fields in API responses.
* Use environment variables for database credentials.
* Never commit database credentials to Git.
* Avoid logging sensitive customer or authentication information.

---

# 43. Database Backup and Recovery

Production database backups must eventually be configured.

The system should have:

* Automated backups where supported
* Recovery procedures
* Data retention policies
* Production/staging separation

Backup strategy is part of the deployment and production-readiness work.

---

# 44. Future Collections

The architecture should allow future collections such as:

```text
commissions
payouts
coupons
deliveries
deliveryAgents
auditLogs
wishlists
productVariants
promotions
searchIndexes
```

These should only be introduced when their requirements are defined.

---

# 45. Database Naming Rules

Use consistent naming.

Recommended:

```text
Collections → plural
Fields → camelCase
IDs → ObjectId references
Enums → uppercase values
```

Examples:

```text
products
brandId
categoryId
orderStatus
paymentStatus
```

---

# 46. AI Implementation Rules

AI coding agents working with the database must follow these rules:

1. Read this document before creating or modifying models.
2. Do not create duplicate models for an existing entity.
3. Do not remove `brandId` from a brand-owned resource without an architectural decision.
4. Do not trust client-provided ownership fields.
5. Do not modify historical order pricing through current product data.
6. Add indexes intentionally.
7. Validate references and ownership.
8. Add tests for cross-brand access.
9. Do not expose sensitive fields.
10. Update this document when the database architecture materially changes.

---

# 47. Database Acceptance Criteria

The database architecture is ready for implementation when:

* [ ] All MVP entities have defined schemas.
* [ ] User roles are represented correctly.
* [ ] Brand ownership is defined.
* [ ] Product/category ownership is defined.
* [ ] Inventory relationships are defined.
* [ ] Cart structure supports multiple brands.
* [ ] Checkout can create separate brand orders.
* [ ] Orders preserve historical product pricing.
* [ ] Payment records are separated from orders.
* [ ] Customer reviews are associated with purchases.
* [ ] Notifications are user-scoped.
* [ ] Required indexes are defined.
* [ ] Tenant isolation can be enforced through database queries.
* [ ] Inventory concurrency is considered.
* [ ] Sensitive fields are protected.
* [ ] Database transactions are considered for critical operations.

---

# 48. Source-of-Truth Rule

This document defines the intended CityCart database structure.

The following documents must remain consistent with it:

```text
01-product-requirements.md
02-user-roles-and-permissions.md
03-system-architecture.md
05-api-specification.md
06-authentication-and-security.md
```

Any major schema change should be documented before implementation.

---

## Document Status

**Current status:** Approved for implementation

**Next document:**

```text
05-api-specification.md
```
