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
├── AdminPartners
├── AdminActions
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
      │    ├── Delivery
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
deliveries
reviews
notifications
authtokens
servicecategories
serviceproviders
```

Discovery also uses `blocks` (neighbourhoods inside a city) and `branches`
(the physical shops of a brand); see docs/22 and §15.

Platform-wide configuration is stored in a singleton `platformSettings` collection. It is not tenant-owned.

`authtokens` holds hashed, expiring one-time links for email verification and password reset (§7a).

`deliveries` is part of the MVP (see `11-delivery-system.md`), not a future addition — it is required for brand fulfillment and customer tracking as described in `01-product-requirements.md` and `18-development-roadmap.md` (Phase 10).

`servicecategories` and `serviceproviders` are the Phase 2a service-provider
tenant and its catalogue (§12c). The remaining v3 collections — offerings,
availability, bookings, proposals, service chat and reviews, commission entries,
seller invoices and payment claims — are listed in §44 and introduced in the
phase that needs them. There is no `payouts` collection: the platform bills
sellers, it does not pay them (docs/15).

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
accountType
passwordHash
passwordVersion
mustChangePassword
role
brandId
phone
avatar
isActive
emailVerifiedAt
createdAt
updatedAt
```

`emailVerifiedAt` is set when the account's email is proven. Self-registered
customers and brand owners start with `null` and cannot sign in until the
emailed link is opened; accounts created by the platform (staff, riders, admin
partners, demo seed) are created with a timestamp. Records that predate the
field (`undefined`) are treated as verified.

### Role

Allowed values:

```text
SUPER_ADMIN
ADMIN_PARTNER
BRAND_ADMIN
BRAND_EMPLOYEE
PICKER
RIDER
SERVICE_PROVIDER
CUSTOMER
```

`PICKER` (added October 2026, `22-marketplace-v2-plan.md` §E) is a brand-scoped
account with `accountType: BRAND`; it signs in only on the Staff app and has no
brand-team permissions.

`SERVICE_PROVIDER` (added v3, `24-marketplace-v3-plan.md` §3) has
`accountType: SERVICE` and a required `providerId` pointing at its
`ServiceProvider` tenant. It never has a `brandId`.

### `accountType`

```text
CUSTOMER        role CUSTOMER
BRAND           roles BRAND_ADMIN, BRAND_EMPLOYEE, PICKER, RIDER
SERVICE         role SERVICE_PROVIDER
PLATFORM_ADMIN  roles SUPER_ADMIN, ADMIN_PARTNER
```

Uniqueness is `(accountType, email)` (§7). A customer, a brand and a service
provider may share one email; two accounts of the same type may not.

`RIDER` (added October 2026, `20-partner-app.md`) is a brand-scoped account with `accountType: BRAND`; riders are plain `User` records, not a separate collection.

`ADMIN_PARTNER` (added October 2026, `21-next-features-plan.md` §G) is a delegated platform admin with `accountType: PLATFORM_ADMIN` and no `brandId`. Its ticked areas and read-only flag live on the `adminpartners` record (§12a).

`mustChangePassword` is `false` for normal accounts. It is set when an admin partner is created or has their password reset, so the temporary password cannot be kept; the API then refuses everything except `/auth/me`, `/auth/password` and `/auth/logout` until the partner chooses their own password.

### `brandId`

Required for:

```text
BRAND_ADMIN
BRAND_EMPLOYEE
PICKER
RIDER
```

Not required for:

```text
SUPER_ADMIN
ADMIN_PARTNER
CUSTOMER
SERVICE_PROVIDER
```

A customer is not a tenant member merely because they purchase from a brand.
A service provider is a tenant of its own (`ServiceProvider`), not a brand
member.

For a `BRAND_EMPLOYEE`, `brandId` is the **home brand** only. The active brand
for a request is the validated membership in the session (§12).

---

# 7. User Constraints

Email addresses are unique within an account type (`CUSTOMER`, `BRAND`,
`SERVICE`, or `PLATFORM_ADMIN`). A customer, a brand and a service provider may
share an email address; accounts in the same account type may not.

The same email may be an employee of several brands. This is represented by
several `Employee` memberships for one `User` (§12), not by several `User`
rows.

On anonymization, the email is moved to
`deleted+<userId>@deleted.invalid`, which frees the original address
(`24-marketplace-v3-plan.md` §3.6).

Recommended:

```text
email: lowercase + unique
```

Passwords must never be stored in plaintext.

Only the password hash should be stored.

Sensitive authentication information must never be returned through normal user API responses.

---

# 7a. AuthToken Model

Collection:

```text
authtokens
```

Stores the one-time links behind email verification and password reset.

```text
_id
userId       -> User
type         EMAIL_VERIFY | PASSWORD_RESET
tokenHash    SHA-256 of the raw token (never the token itself), unique
expiresAt    TTL index (expireAfterSeconds: 0) removes the document
usedAt       set when claimed; a claimed token can never be used again
createdAt
updatedAt
```

The raw token is 32 random bytes and exists only in the emailed link. Consuming
a token is a single atomic `findOneAndUpdate` (unused + unexpired), so two
simultaneous clicks cannot both succeed. Issuing a new token deletes the
previous unused one of the same type. The TTL index makes expiry work without a
scheduled job (important on Render's free plan).

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
Delivery.brandId
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

Collection:

```text
employees
```

An `Employee` record is **one membership of one brand**, not the person's only
employment. The login lives on `User`; the brand-scoped role, permissions and
status live here.

```text
_id
userId          -> User
brandId         -> Brand
role            BRAND_ADMIN | BRAND_EMPLOYEE | PICKER
permissions     [String]
permissionHistory
jobTitle
isActive        Boolean
removedAt       Date | null
removedBy       -> User | null
removalReason   String | null
createdAt
updatedAt
```

Constraints and indexes:

```text
unique (userId, brandId) where isActive = true    one active membership per brand
index  (brandId, isActive)
index  (userId, isActive)
```

A user may therefore be an employee of several brands. Permissions are
per membership: a permission in Brand A has no effect in Brand B. `User.brandId`
is the home brand for a `BRAND_ADMIN`, `PICKER` or `RIDER`; for a
`BRAND_EMPLOYEE`, the active brand comes from the validated session and this
membership record.

Removal sets `isActive = false` and the audit fields. It does not delete
orders, payments, receipts, reviews or audit history, and it does not delete the
`User` while another active membership exists. Removing the last membership (or
an explicit purge) anonymizes the `User` and frees the email
(`24-marketplace-v3-plan.md` §3.6).

Employee permissions are defined in:

```text
02-user-roles-and-permissions.md
```

---

# 12a. AdminPartner Model

Collection:

```text
adminpartners
```

The delegated platform-admin record of an `ADMIN_PARTNER` user (mirrors the
Employee model: the login lives on `User`, the platform-admin data here).
Defined in `21-next-features-plan.md` §G.2.

```text
_id
userId          → User (unique)
permissions     [admin.brands | admin.users | admin.orders | admin.reviews |
                 admin.locations | admin.catalog | admin.settings | admin.analytics | admin.payments]
readOnly        Boolean, default false
isActive        Boolean, default true
createdBy       → User (the Super Admin who added them)
createdAt
updatedAt
```

Constraints:

* `userId` is unique: a user has at most one partner record.
* At most **5** records with `isActive: true` are allowed; the service refuses
  a sixth with `409 PARTNER_LIMIT_REACHED`, and deactivating one frees a seat.
* `permissions` is a closed list (unlike Employee permissions, which are open
  extensibility), stored with stable names so a renamed permission cannot grant
  more than intended.
* The Super Admin never has an `AdminPartner` record: the one-super-admin rule
  in §7 is unchanged.

Deactivation is mirrored on both records (`AdminPartner.isActive` and
`User.isActive`) inside one transaction, so a deactivated partner cannot
authenticate even with an already-issued token (the middleware reloads the
User on every request).

---

# 12b. AdminAction Model

Collection:

```text
adminactions
```

The platform audit log, written for every admin write by the Super Admin or an
admin partner (`21-next-features-plan.md` §G.2). Visible to the Super Admin only.

```text
_id
actor           → User (indexed)
actorRole       snapshot of the role at the time of the action
action          resource.action string, e.g. 'brand.terminate', 'settings.update'
target          { type, id, label }
details         short human-readable summary (max 500), never secrets
createdAt
updatedAt
```

`createdAt` is indexed descending for the Activity page. Logging is
best-effort: if the log write fails, the completed action is not turned into an
error response (the failure is reported on the server console).

---

# 12c. ServiceCategory and ServiceProvider Models (v3 Phase 2a)

## ServiceCategory

Collection:

```text
servicecategories
```

The catalogue tree a provider chooses from (`24-marketplace-v3-plan.md` §4.2).
Same shape and admin conventions as the product `Category` model (§13).

```text
_id
name
slug          unique, derived once from name
parentId      -> ServiceCategory (null at the root), indexed
order
image
isActive
createdAt
updatedAt
```

Only active categories are listed by `GET /services/categories`, and a provider
application must reference an active one. The seed creates four root
categories: Home Cleaning, Plumbing, Electrical, Repairs & Maintenance.

## ServiceProvider

Collection:

```text
serviceproviders
```

A tenant of its own (`24-marketplace-v3-plan.md` §4.1). It is **not** a brand:
it never holds a `brandId`, has exactly one owner and works in one block.

```text
_id
userId         -> User, unique (the owner, role SERVICE_PROVIDER)
displayName
legalName
slug           unique, derived once from displayName
categoryId     -> ServiceCategory, indexed
cityId         -> City, indexed; fixed at signup
blockId        -> Block, indexed; exactly one at a time
location       GeoJSON Point, 2dsphere indexed, required (pin inside blockId)
addressLine
phone
bio
avatar / coverImage
startingAtPrice  integer paisa (PKR minor units)
status           PENDING | ACTIVE | SUSPENDED | TERMINATED (indexed)
verification     UNVERIFIED | VERIFIED | REJECTED
ratingAvg / ratingCount
completedBookings
rankScore
billingStatus    ACTIVE | WARNING | RESTRICTED | FROZEN
blockChangedAt   month of the last BLOCK change (pin moves do not count)
blockHistory[]   { blockId, changedAt, changedBy }
approvedBy / approvedAt
createdAt / updatedAt
```

Rules enforced by the service layer:

* The application creates the `User` and the `ServiceProvider` in one
  transaction; a failure leaves neither.
* `blockId` must be active and belong to `cityId`; the pin must pass
  `assertPinInBlock`.
* Status, verification, role and the tenant ids are server-controlled; the
  client submits only owner/profile fields.
* A new provider is `PENDING` and `UNVERIFIED`. Verifying the inbox does not
  change either; the super admin approves it to `ACTIVE` / `VERIFIED`.
* `blockChangedAt` is set at signup and again only when the provider moves to a
  different block. A same-month block change answers `409 BLOCK_CHANGE_LIMIT`.
* The slug and category are immutable in Phase 2a; the city is fixed at signup.
* `userId` and `slug` are unique indexes, so a provider account or public
  address is never duplicated even under a race.

---

# 13. Category Model

Collection:

```text
categories
```

### Fields

```text
_id
name
slug
description
image
parentId
order
isActive
createdAt
updatedAt
```

Categories are **global**: one tree for the whole platform, owned by the super
admin (or a partner with `admin.catalog`). They do not belong to a brand.
(Changed in Marketplace v2, Phase 1 — see `docs/22-marketplace-v2-plan.md`.
Categories used to be brand-scoped.)

Example:

```text
Grocery
 ├── Cooking Oil & Ghee
 └── Pulses & Grains
Bakery
 └── Cakes
```

Rules:

- `parentId` is `null` for a top-level category. The tree is **two levels
  deep**: a parent must itself be top-level.
- `slug` is unique among siblings (`{ parentId, slug }` unique index).
- A product must point at an active **leaf** category (one with no active
  subcategories).
- A category with subcategories or products cannot be deactivated.

---

# 14. Product Model

Collection:

```text
products
```

A `Product` is a store's **listing** of a shared catalogue item (see §14.1,
Marketplace v2 Phase 1b, `docs/22-marketplace-v2-plan.md`). The store sets its
own price, SKU, status, stock and branches. `name`, `description`, `images` and
`categoryId` are **copied from the catalogue item** when the listing is created and
refreshed whenever the catalogue item changes, so cart, orders, shop pages and
search keep reading them from the product as before. A store cannot edit them on
the listing.

### Fields

```text
_id
brandId
catalogProductId
categoryId
name
slug
description
images
price
compareAtPrice
sku
isActive
status
attributes
createdAt
updatedAt
```

A store lists a catalogue item once (checked by the service for
`{ brandId, catalogProductId }` and by the `{ brandId, slug }` unique index).

Whether stock is tracked for a product is controlled by `Inventory.trackInventory` (§18), not by a separate field on Product. Keeping a single flag avoids the two documents disagreeing about which one is authoritative.

### Product status

```text
DRAFT
ACTIVE
INACTIVE
ARCHIVED
```

The exact publication workflow may be expanded later.

---

## 14.1 Catalogue Product Model

Collection:

```text
catalogproducts
```

One record per real-world item ("Dalda Ghee 1 kg"), shared by every store that
sells it. In this project "Brand" means a seller, so the maker of the item is
called `manufacturer`.

### Fields

```text
_id
name
slug
manufacturer
categoryId
description
images
size { value, unit }
barcode
scope
status
brandId
createdBy
reviewNote
reviewedBy
reviewedAt
mergedIntoId
createdAt
updatedAt
```

`scope`:

```text
GLOBAL   visible to every store once ACTIVE
PRIVATE  usable by one store only (brandId); needs no approval
```

`status`:

```text
ACTIVE
PENDING   a store asked for a new global item; waiting for an admin
REJECTED  an admin turned the request down (reviewNote tells the store why)
ARCHIVED  retired, or merged into another item (mergedIntoId)
```

Rules:

- `barcode` is unique across the catalogue (sparse index).
- A GLOBAL item's name (slug) is unique among GLOBAL items that are ACTIVE or
  PENDING. A PRIVATE item's name is unique within its store.
- `categoryId` must be an active leaf category (docs §13).
- Merging moves every listing to the target item and archives the duplicate.
  It is refused while one store lists both.
- An item cannot be archived while a store still lists it.

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

`trackInventory` is the single authoritative flag for whether a product's stock is tracked (see §14 — Product does not duplicate this flag). When `trackInventory` is `false`, checkout should skip quantity/availability checks for that product.

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
activeAdjustmentId
pickerId
pickStartedAt
packedAt
fulfilment
returnedAmount
feeRefunded
netTotal
createdAt
updatedAt
```

`activeAdjustmentId` points at the one waiting `OrderAdjustment` (null when none).
`pickerId`, `pickStartedAt` and `packedAt` record who is picking the order and
when picking started and packing finished (docs/08 §41.9).

`fulfilment` (`FULL`, `PARTIAL`, `NONE`), `returnedAmount`, `feeRefunded` and
`netTotal` are set once, when the delivery completes (docs/22 §F). `netTotal` is
what the customer actually owes or keeps; readers fall back to `total` for orders
from before door returns existed.

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
 ├── image
 ├── pickStatus      PICKED | SHORT | UNAVAILABLE (unset = not checked yet)
 └── pickedQty       units actually found (meaningful for SHORT)
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

# 25a. Delivery Model

Collection:

```text
deliveries
```

Delivery is tracked separately from Order and Payment, as required by `11-delivery-system.md`.

### Fields

```text
_id
orderId
brandId
customerId
status
address
deliveryFee
trackingReference
assignedAgent
riderId
assignedAt
deliveryCode
codeAttempts
failureReason
returnId
pendingCompletion
createdAt
updatedAt
```

`riderId` is a `User` (role `RIDER`) of the same brand; `assignedAgent` keeps the display name (set to the rider's name on assignment). `deliveryCode` is the six-digit proof-of-delivery code (`select: false`, shown only to the customer); `codeAttempts` counts wrong tries. Index `{ riderId, status }` serves the rider's own list (run `npm run sync-indexes` where auto-indexing is off). See `11-delivery-system.md` §12 and §19, and `20-partner-app.md`.

`pendingCompletion` (`select: false`, added October 2026) holds a rider's non-cash
door answer until the brand verifies the payment (`10-payment-system.md` §31): the
accepted/rejected `lines`, the `netTotal`, the `paymentId`, `submittedBy`,
`submittedAt`, and `rejectedAt` once the brand refuses. While it is present the
delivery stays `OUT_FOR_DELIVERY`; verification completes it and clears the field.

`address` is a snapshot, captured the same way as `Order.shippingAddress`, so a later profile change never alters an existing delivery record.

### Delivery status

Initial statuses (see `11-delivery-system.md`, §9):

```text
PENDING
PREPARING
READY_FOR_PICKUP
PICKED_UP
IN_TRANSIT
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
RETURNED
```

Delivery status, order status, and payment status are three separate fields and must never be merged.

A delivery record is created when its order reaches `READY_FOR_SHIPMENT` (see order status in §25).

`returnId` points at the door return created when the customer refused goods at
delivery (null when everything was accepted).

---

# 25b. Return Model

Collection:

```text
returns
```

One record per delivery that had refused goods (docs/22 §F, docs/08 §41.10).
The order lines stay a historical snapshot; the return records what came back,
why, and what the store decided to do with it.

### Fields

```text
_id
orderId
deliveryId          unique: one return per delivery
brandId
customerId
riderId             the rider who brought the goods back (empty for a courier)
source              DOOR
status              IN_TRANSIT | RECEIVED
lines[]
returnedSubtotal
feeRefunded
refundAmount
currency
receivedAt
receivedBy
createdAt
updatedAt
```

### Return lines

```text
orderItemId
productId
productName         snapshot
quantity            refused units (1 or more, never more than ordered)
unitPrice           snapshot
reason              DAMAGED | WRONG_ITEM | NOT_WANTED | MISSING
photo.publicId      optional private Cloudinary path
photo.fingerprint   optional ETag
restock             false by default (write off); true when the store marks it sellable
restockedAt
```

`feeRefunded` is true only when every unit was refused and at least one reason is
the store's fault (`DAMAGED`, `WRONG_ITEM`, `MISSING`). `refundAmount` is the
money actually refunded (prepaid orders only; zero for cash on delivery).

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
confirmedBy
brandId
collectedBy
collectedAt
settledAt
settledBy
collection           how the customer paid at the door (docs/10 §31)
collectionHistory    refused attempts, kept for the audit trail (`select: false`)
refundedAmount
refunds
createdAt
updatedAt
```

`brandId`, `collectedBy`, `collectedAt`, `settledAt` and `settledBy` record who holds cash-on-delivery money and when it was handed over (`10-payment-system.md` §11a). Index `{ brandId, collectedBy, settledAt }`.

`collection` (added October 2026) is an embedded document written when the rider
answers the door. Cash writes it in the completion transaction; a non-cash answer
writes it while the payment is still `PENDING`:

```text
method          CASH | BANK_TRANSFER | WALLET | CARD_MACHINE
wallet          JAZZCASH | EASYPAISA | OTHER (WALLET only)
reference       transaction id / approval code (never a card number)
proof           { publicId, fingerprint }  private Cloudinary asset (non-cash only)
submittedAt     when the rider sent this attempt
verification    SUBMITTED | VERIFIED | REJECTED
verifiedBy      User
verifiedAt
note            decision reason (required when REJECTED)
duplicateReference / duplicateProof   booleans
proofDeletedAt  set when the retention job removed the photo
```

`collectionHistory` keeps each refused attempt (same shape) when the rider collects
again, so nothing the brand saw is overwritten.

A non-cash collection sets the payment's `method` too (`BANK_TRANSFER`, `WALLET` or
`CARD_MACHINE`) and `collection.verification: SUBMITTED`, but leaves `status:
PENDING` until the brand verifies it; it never sets `collectedBy`. Verification marks
the payment `PAID` and completes the delivery in one transaction. Indexes:
`{ brandId, 'collection.verification', paidAt }` for the verification queue,
`{ brandId, 'collection.reference' }` and `{ 'collection.proof.fingerprint' }` for
duplicate flags.

Initial payment method:

```text
COD
```

Possible future methods:

```text
CARD
BANK_TRANSFER
WALLET
CARD_MACHINE
```

These are door collection methods, recorded by the rider from the seller's own
account (docs/10 §4). `ONLINE_GATEWAY` is not a future method: v3 removes it in
Phase 1.

---

# 26a. Receipt Model

Collection:

```text
receipts
```

One receipt per paid payment, issued by the system and never edited (no `updatedAt`).
Everything on it is a snapshot (`10-payment-system.md` §28).

```text
_id
receiptNumber        unique, RC-<year>-<6 digits>
paymentId            unique
orderId
orderNumber
brandId
brandName
customerId
billedTo             the customer's name only, never address or phone
method
amount
currency
items                [{ productName, quantity, unitPrice, totalPrice }]
subtotal
deliveryFee
discount
tax
transactionReference
provider
collectedBy          the user who took the cash (never shown to customers)
collectedByName
collectionMethod     CASH | BANK_TRANSFER | WALLET | CARD_MACHINE (door payments)
collectionWallet     JAZZCASH | EASYPAISA | OTHER (wallet only)
collectionReference  the transaction id / approval code (brand and admin views only)
issuedAt
createdAt
```

Indexes: `{ customerId, issuedAt }`, `{ brandId, issuedAt }`, `orderId`.
Counter documents `receipt-<year>` allocate the numbers.

The three `collection*` fields are a snapshot taken when the receipt is issued. The
proof's verification state is **not** copied; the brand's single-receipt view reads it
live from `payments.collection.verification` so a later decision is reflected without
editing an issued receipt.

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
readAt
createdAt
```

`readAt` (docs/12 §9-§10) is set when the recipient opens the notification.
The `type` values are governed by docs/12 §4; besides that initial list,
`NEW_REVIEW` was added per §4's "additional types may be added later" (§6
lists "New review received" as a brand notification).

Example:

```json
{
  "userId": "user123",
  "type": "ORDER_SHIPPED",
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
 ├── Deliveries
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
 ├── Payment
 └── Delivery
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

### Deliveries

```text
orderId: unique
brandId
customerId
status
trackingReference
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
6a. Every delivery belongs to exactly one order and one brand, and the delivery's brandId must match its order's brandId.
7. Customers can only access their own private resources.
8. Brand users can only access resources within their brand.
9. Order totals are calculated server-side.
10. Historical order prices are preserved.

---

# 36. Soft Deletion and Anonymization

Permanent deletion is avoided for important business records. v3 uses four
actions (`24-marketplace-v3-plan.md` §3.6):

| Action | Meaning | Used for |
|---|---|---|
| Archive | Hide from normal use, keep the row | Products, stores, brands, providers |
| Deactivate | `isActive = false` or a terminal status | Employees, riders, pickers, admin partners, cities, blocks, categories |
| Anonymize | Replace PII, free the email, keep the `_id` | The last membership of a person, a purged account |
| Hard delete | Remove the row | Transient data only: carts, unread notifications, expired tokens, device tokens |

Rules:

* Orders, payments, receipts, returns, reviews, bookings, invoices, commission
  entries and audit logs are never hard-deleted.
* Anonymizing a `User` sets `email` to
  `deleted+<userId>@deleted.invalid`, clears name/phone/avatar, replaces the
  password hash, increments `passwordVersion`, sets `isActive = false` and
  `deletedAt`, and deletes device tokens.
* The original email becomes reusable immediately after anonymization.
* An archived brand or provider keeps its financial history. Its name/slug may
  be released for reuse by renaming the archived slug
  (`slug~terminated~<id>`), never by deleting the row.
* Deactivation of a location or category can be reversed with an explicit
  restore action; permanent deletion is refused while active records reference
  the row.
* Cloudinary assets belonging to removed records are cleaned by a
  reference-counted job; payment proofs follow their own retention rule.

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

The architecture allows future collections. The v3 programme
(`24-marketplace-v3-plan.md`) adds these collections when their phase starts:

```text
serviceofferings
serviceavailabilities
servicebookings
serviceproposals
serviceconversations
servicemessages
servicereviews

commissionentries
sellerinvoices
sellerpaymentclaims
billingaudits
```

`servicecategories` and `serviceproviders` belong to Phase 2a and are already
implemented (§12c).

Still future and not part of v3:

```text
coupons
deliveryAgents
wishlists
productVariants
promotions
searchIndexes
```

`payouts` is no longer planned: the platform is the payee, not the payer
(`15-commission-and-payouts.md`).

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
11-delivery-system.md
```

Any major schema change should be documented before implementation.

---

## Document Status

**Current status:** Approved for implementation

**Next document:**

```text
05-api-specification.md
```

---

# Appendix: Location Models (Block and Branch)

Marketplace v2, Phase 2 (`docs/22-marketplace-v2-plan.md`).

## Block (zones)

Collection: `blocks`. A block is a neighbourhood of a city, drawn as a zone.

```text
_id
cityId
name
slug
center      GeoJSON Point, always INSIDE the zone (derived from the outline)
area        GeoJSON Polygon, one closed ring, counter-clockwise (optional)
isActive
createdAt
updatedAt
```

Rules:

- `area` is checked before it is stored: 3 to 100 corners, no repeated corners,
  edges must not cross, and the size must be between 0.01 km² and 1000 km².
- `center` is derived from the outline (the centroid, or a point inside the shape
  when the centroid falls outside a concave one). It cannot be edited on its own
  while an outline exists.
- A block with no `area` is a legacy, centre-only block. It holds only the shops
  whose home block it is, and is matched to shoppers by nearest centre.
- **Zones may overlap.** A shop in the overlap belongs to every block holding it.
- Indexes: `{ cityId, slug }` unique, `center` 2dsphere, `area` 2dsphere.

## Branch

```text
_id
brandId
blockId     the shop's home block, chosen by the brand
blockIds    every active block whose zone contains the shop's pin
name, address, phone
location    GeoJSON Point (the shop's pin)
isActive
```

- The pin must lie **inside** the home block's outline (legacy blocks: within 25 km
  of the centre). A new shop with no pin gets the block's centre.
- `blockIds` is maintained by the server only: when a shop is created or moved,
  and for every shop of the city when a zone is redrawn or a block is switched on
  or off. A shop with an empty `blockIds` is in no block and cannot be found by
  area; the admin is told how many such shops a change causes.

---

# Appendix: Saved Addresses and Delivery Pins

Marketplace v2, Phase 3.

## Address

Collection: `addresses`. A customer's saved delivery addresses (at most 10 each).

```text
_id
userId
label                    for example Home, Work
fullName, phone
addressLine, city, state, postalCode, country
additionalInstructions   standing delivery notes, offered again at checkout
location                 GeoJSON Point: the pin
isDefault
createdAt, updatedAt
```

- The pin must lie inside at least one active block (checked when saving), so a
  saved address is always somewhere we deliver.
- The blocks of an address are worked out from its pin when needed, never stored.
- The first address is the default. Deleting the default promotes the most recent
  remaining one.

## Order delivery fields

```text
shippingAddress       snapshot of the address as typed (unchanged)
deliveryLocation      GeoJSON Point: the delivery pin
deliveryBlockIds      the active blocks that held the pin when the order was placed
addressId             the saved address it came from, if any
```

The order keeps its own snapshot, so editing or deleting a saved address never
changes an old order. `deliveryBlockIds` is worked out by the server, never taken
from the client.
