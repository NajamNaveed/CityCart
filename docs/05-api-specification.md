# CityCart — API Specification

**Document:** `05-api-specification.md`
**Status:** Approved for implementation
**Version:** 1.0

---

# 1. Purpose

This document defines the REST API contract for CityCart.

It establishes:

* API versioning
* Endpoint conventions
* Authentication
* Authorization
* Request and response formats
* Resource endpoints
* Pagination
* Filtering
* Error handling
* Status codes
* Multi-tenant API rules

The API must remain consistent with:

```text
01-product-requirements.md
02-user-roles-and-permissions.md
03-system-architecture.md
04-database-design.md
```

---

# 2. API Base URL

All APIs use:

```text
/api/v1
```

Example:

```text
GET /api/v1/products
```

Production base URL will be configured through an environment variable.

---

# 3. API Design Principles

CityCart APIs must follow these principles:

1. REST-style resource endpoints.
2. Consistent HTTP methods.
3. Consistent response structures.
4. Server-side authorization.
5. Server-side validation.
6. Tenant isolation.
7. Pagination for potentially large collections.
8. No sensitive information in responses.
9. Versioned APIs.
10. Predictable error responses.

---

# 4. HTTP Methods

| Method   | Purpose                    |
| -------- | -------------------------- |
| `GET`    | Retrieve data              |
| `POST`   | Create resource            |
| `PUT`    | Replace/update resource    |
| `PATCH`  | Partially update resource  |
| `DELETE` | Delete/deactivate resource |

`PATCH` should generally be preferred when only selected fields are being modified.

---

# 5. Authentication

Authentication uses JWT-based authentication with HTTP-only cookies.

Login:

```text
POST /api/v1/auth/login
```

Successful login establishes the authenticated session.

Protected requests use the authentication cookie automatically.

---

# 6. Authentication Endpoints

## Register

```text
POST /api/v1/auth/register
```

### Request

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "StrongPassword123"
}
```

Public registration creates a `CUSTOMER` by default.
Customer and brand accounts use separate email namespaces and authenticate through their respective login portals. The same normalized email may be used once in each portal.

Users must not be allowed to register themselves as:

```text
SUPER_ADMIN
ADMIN_PARTNER
BRAND_ADMIN
BRAND_EMPLOYEE
```

`POST /api/v1/auth/admin/login` accepts both `SUPER_ADMIN` and `ADMIN_PARTNER`
(web only). The same generic `401` is returned for a wrong password, an
unknown email, a deactivated partner, and an account using the wrong portal.
A newly created or reset partner signs in with the temporary password and is
then restricted to `GET /auth/me`, `PATCH /auth/password` and
`POST /auth/logout` until they choose their own password; every other request
answers `403` with `code: "PASSWORD_CHANGE_REQUIRED"`.

---

## Login

```text
POST /api/v1/auth/login
```

### Request

```json
{
  "email": "john@example.com",
  "password": "StrongPassword123"
}
```

### Success

```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "CUSTOMER"
  }
}
```

The JWT must not be returned unnecessarily in the JSON response when HTTP-only cookies are being used.

### Native app clients

The shopper mobile app (docs/19) sends `X-Client: mobile` on `POST /auth/login`
and `POST /auth/register`. For that request only, the response also contains
the session token and no cookie is set:

```json
{
  "success": true,
  "message": "Login successful",
  "user": { "id": "user_id", "name": "John Doe", "email": "john@example.com", "role": "CUSTOMER" },
  "token": "<jwt>"
}
```

The app then authenticates every request with `Authorization: Bearer <token>`.
This is for customers only: `POST /auth/brand/login` and `/auth/admin/login`
answer `403` with `code: "WEB_ONLY"` to `X-Client: mobile`, and a Bearer token
of a seller or admin account is refused with `403 WEB_ONLY` on every endpoint.
The web client does not send `X-Client` and never receives a token in a body.
See docs/06 (Native App Sessions).

### Partner app sign-in

```text
POST /api/v1/auth/partner/login        (header X-Client: partner)
```

Body `{ "email", "password" }`. Only `RIDER` and `BRAND_EMPLOYEE` accounts can
sign in; any other account, a wrong password and an unknown email all answer the
same `401`. Without the header: `403 PARTNER_APP_ONLY`. The response contains the
token (marked as a partner token, one staff session long) and sets no cookie.
See `20-partner-app.md`.

---

## Logout

```text
POST /api/v1/auth/logout
```

Clears the authentication cookie.

---

## Current User

```text
GET /api/v1/auth/me
```

Returns the authenticated user's safe profile information.

An `ADMIN_PARTNER` additionally receives its areas and mode:

```json
{ "role": "ADMIN_PARTNER", "permissions": ["admin.brands", "admin.orders"], "readOnly": false }
```

While `mustChangePassword` is set, the user object includes
`"mustChangePassword": true`. This endpoint stays reachable in that state so the
dashboard can show the password form.

## Change Password

```text
PATCH /api/v1/auth/password
```

Available to authenticated `BRAND_ADMIN`, `SUPER_ADMIN` and `ADMIN_PARTNER`
accounts (and anyone in the forced first-sign-in state). The request requires
the current password, a new password, and its confirmation. Successful changes
rotate the password version, invalidating other sessions while issuing a fresh
cookie for the current staff tab, and clear `mustChangePassword`.

---

# 7. User Endpoints

Base:

```text
/api/v1/users
```

## Get Current Profile

```text
GET /api/v1/users/me
```

Authenticated users can access their own profile.

---

## Update Current Profile

```text
PATCH /api/v1/users/me
```

Example:

```json
{
  "name": "John Updated",
  "phone": "+923001234567"
}
```

Users cannot update their own:

```text
role
brandId
permissions
```

---

## Platform User Management

Super Admin only:

```text
GET    /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
```

These endpoints must not expose password hashes or sensitive authentication data.

The searchable directory is available at:

```text
GET /api/v1/admin/users?search=&role=&isActive=&page=1&limit=20
```

It returns safe user profiles, brand/staff labels, order counts, and pagination. Password hashes and authentication fields are never returned.

---

# 8. City Endpoints

Base:

```text
/api/v1/cities
```

## List Cities

```text
GET /api/v1/cities
```

Public.

Optional query:

```text
?isActive=true
```

---

## Get City

```text
GET /api/v1/cities/:id
```

Public.

---

## Create City

```text
POST /api/v1/cities
```

Required:

```text
SUPER_ADMIN
```

Example:

```json
{
  "name": "Lahore",
  "state": "Punjab",
  "country": "Pakistan"
}
```

---

## Update City

```text
PATCH /api/v1/cities/:id
```

Super Admin only.

---

## Delete/Deactivate City

```text
DELETE /api/v1/cities/:id
```

Super Admin only.

Where possible, deactivation should be preferred over destructive deletion.

---

# 9. Brand Endpoints

Base:

```text
/api/v1/brands
```

## List Brands

```text
GET /api/v1/brands
```

Public.

Supported filters may include:

```text
?cityId=
?status=
?search=
```

Public users should normally only receive active brands.

---

## Get Brand

```text
GET /api/v1/brands/:id
```

Public for active brands.

---

## Create Brand

```text
POST /api/v1/brands
```

Authorization:

```text
SUPER_ADMIN
```

Future versions may allow a controlled brand-application workflow.

---

## Update Brand

```text
PATCH /api/v1/brands/:id
```

Allowed:

```text
SUPER_ADMIN
BRAND_ADMIN → own brand only
```

Brand administrators can read their own full profile and settings through:

```text
GET /api/v1/brands/me
```

The server derives the brand from the authenticated account. Brand profile updates may include validated contact and fulfillment settings.

## Platform Settings

Super Admin only:

```text
GET   /api/v1/admin/settings
PATCH /api/v1/admin/settings
```

Settings are persisted in the singleton platform settings document. The API validates supported fields and does not accept a client-supplied tenant or singleton key.

## Analytics

Brand analytics is available at `GET /api/v1/brand/analytics` (also `GET /api/v1/analytics/brand` for the analytics module convention) to `BRAND_ADMIN` and employees with `analytics.view`. Scope is derived from the authenticated user's brand. Super Admin platform analytics is available at `GET /api/v1/admin/analytics` (also `GET /api/v1/analytics/admin`). Both endpoints accept optional UTC date-only `from` and `to` query parameters in `YYYY-MM-DD` format; the default is the last 30 days.

---

## Suspend Brand

```text
PATCH /api/v1/brands/:id/status
```

Super Admin only.

Example:

```json
{
  "status": "SUSPENDED"
}
```

---

# 10. Store Endpoints

Base:

```text
/api/v1/stores
```

## Get Store

```text
GET /api/v1/stores/:id
```

Public for active stores.

---

## Get My Brand Store

```text
GET /api/v1/stores/me
```

Allowed:

```text
BRAND_ADMIN
authorized BRAND_EMPLOYEE
```

---

## Update Store

```text
PATCH /api/v1/stores/:id
```

Authorization requires:

```text
store.update
+
correct brand ownership
```

---

# 11. Category Endpoints

Base:

```text
/api/v1/categories
```

## List Categories

```text
GET /api/v1/categories
```

Query:

```text
?brandId=
```

Public users may retrieve active categories.

---

## Get Category

```text
GET /api/v1/categories/:id
```

---

## Create Category

```text
POST /api/v1/categories
```

Required:

```text
categories.create
```

The server determines the user's brand.

---

## Update Category

```text
PATCH /api/v1/categories/:id
```

Required:

```text
categories.update
```

The category must belong to the user's brand.

---

## Delete Category

```text
DELETE /api/v1/categories/:id
```

Required:

```text
categories.delete
```

The backend should check whether products or child categories depend on the category before deleting it.

---

# 12. Product Endpoints

Base:

```text
/api/v1/products
```

## List Products

```text
GET /api/v1/products
```

Supported query parameters:

```text
?cityId=
?brandId=
?categoryId=
?search=
?minPrice=
?maxPrice=
?status=
?page=
?limit=
?sort=
```

Public users should normally receive only active products.

---

## Get Product

```text
GET /api/v1/products/:id
```

Public if the product is active.

---

## Create Product

```text
POST /api/v1/products
```

Required:

```text
products.create
```

The backend automatically associates the product with the authenticated user's brand.

---

## Update Product

```text
PATCH /api/v1/products/:id
```

Required:

```text
products.update
```

The product must belong to the authenticated user's brand.

---

## Delete Product

```text
DELETE /api/v1/products/:id
```

Required:

```text
products.delete
```

Archiving/deactivation should generally be preferred over permanent deletion.

---

# 13. Inventory Endpoints

Base:

```text
/api/v1/inventory
```

## Get Inventory

```text
GET /api/v1/inventory
```

Required:

```text
inventory.view
```

Brand users receive only their brand's inventory.

---

## Get Product Inventory

```text
GET /api/v1/inventory/:productId
```

Required:

```text
inventory.view
```

---

## Update Inventory

```text
PATCH /api/v1/inventory/:productId
```

Required:

```text
inventory.manage
```

Example:

```json
{
  "quantity": 50
}
```

The server must validate:

* Product exists
* Product belongs to user's brand
* Quantity is valid
* User has permission

## Batch Update Inventory

```text
PATCH /api/v1/inventory/batch
```

Required permission: `inventory.manage`. The request contains an `updates` array of unique product IDs and a quantity and/or low-stock threshold for each row. The backend derives brand scope from the authenticated account, verifies all products belong to that scope before writing, and returns per-row results so stock conflicts can be retried.

---

# 14. Cart Endpoints

Base:

```text
/api/v1/cart
```

Customers only.

## Get Cart

```text
GET /api/v1/cart
```

Returns the authenticated customer's cart.

---

## Add Item

```text
POST /api/v1/cart/items
```

Example:

```json
{
  "productId": "product_id",
  "quantity": 2
}
```

The server retrieves:

* Product
* Brand
* Current price
* Availability

The client must not define the authoritative price.

---

## Update Cart Item

```text
PATCH /api/v1/cart/items/:productId
```

Example:

```json
{
  "quantity": 3
}
```

---

## Remove Cart Item

```text
DELETE /api/v1/cart/items/:productId
```

---

## Clear Cart

```text
DELETE /api/v1/cart
```

---

# 15. Order Endpoints

Base:

```text
/api/v1/orders
```

## Create Orders / Checkout

```text
POST /api/v1/orders
```

Customer only.

Example:

```json
{
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+923001234567",
    "addressLine": "Example Street",
    "city": "Lahore",
    "state": "Punjab",
    "postalCode": "54000",
    "country": "Pakistan"
  },
  "paymentMethod": "COD"
}
```

The backend must:

1. Retrieve the customer's cart.
2. Validate products.
3. Validate stock.
4. Retrieve current prices.
5. Group items by brand.
6. Calculate totals.
7. Create separate brand orders.
8. Update inventory.
9. Create payment records.
10. Clear the cart.

---

# 16. Customer Order Endpoints

## My Orders

```text
GET /api/v1/orders/my
```

Returns only the authenticated customer's orders.

---

## Get My Order

```text
GET /api/v1/orders/:id
```

The order must belong to the authenticated customer unless the user is an authorized brand/platform administrator.

Besides `order`, `payment` and `delivery`, the response carries the order's change proposals (docs/21 §H):

```json
{
  "success": true,
  "order": { },
  "payment": { },
  "delivery": { },
  "adjustments": [ ],
  "adjustment": { }
}
```

`adjustments` is the full history, newest first. `adjustment` is the one waiting for an answer, or the latest proposal when none is waiting. Both are empty (`[]` / `null`) when the brand never proposed a change.

---

## Cancel My Order

```text
PATCH /api/v1/orders/:id/cancel
```

Cancellation is allowed only when the order is in an eligible state.

The backend determines whether cancellation is allowed.

A waiting change proposal is closed with the cancellation and its substitute reservation is released.

---

## Answer an Order Change

```text
POST /api/v1/orders/:id/adjustments/:adjustmentId/respond
```

Customer only, and only for their own order and proposal (docs/21 §H.3).

Example:

```json
{
  "action": "ACCEPT"
}
```

| `action`     | Result |
| ------------ | ------ |
| `ACCEPT`     | Keep the units the brand can supply **and** the substitutes; the order is rewritten from the proposal. |
| `REMOVE`     | Keep only the units the brand can supply; the affected lines' missing units are removed (no substitutes). |
| `CANCEL_ORDER` | Cancel the whole order and return its stock. |

The proposal, the order lines, the total and the payment change in one database transaction. Only the first answer is applied; a second answer, a withdrawal or the expiry sweep loses the atomic `PROPOSED → resolved` update.

Response:

```json
{
  "success": true,
  "message": "Response recorded",
  "adjustment": { },
  "order": { },
  "refundAmount": 0
}
```

`refundAmount` is the part of an online payment returned because the new total is lower (docs/10 §30). It is `0` for cash on delivery.

Errors:

```text
404  proposal not found (or not this customer's)
409  ADJUSTMENT_NOT_PENDING   already answered, withdrawn or closed
409  ADJUSTMENT_EXPIRED       the 24-hour window passed (nothing changes)
409  ADJUSTMENT_INCREASES_TOTAL  online order would cost more
409  ONLINE_PAYMENT_NOT_COMPLETED  the online payment is not paid yet
409  REFUND_EXCEEDS_PAID      the refund would exceed what was paid
409  ORDER_CHANGED            a concurrent request changed the order
400  validation failed (unknown action, malformed ids)
```

---

# 17. Brand Order Endpoints

## Brand Orders

```text
GET /api/v1/brand/orders
```

Required:

```text
orders.view
```

Returns only orders belonging to the authenticated user's brand.

---

## Get Brand Order

```text
GET /api/v1/brand/orders/:id
```

Required:

```text
orders.view
```

The order must belong to the user's brand. Like the customer endpoint, the response includes `adjustments` (history, newest first) and `adjustment` (the waiting proposal, or the latest one).

---

## Update Order Status

```text
PATCH /api/v1/brand/orders/:id/status
```

Required:

```text
orders.manage
```

Example:

```json
{
  "status": "PROCESSING"
}
```

The backend must validate legal status transitions.

While a change proposal is waiting for the customer, `READY_FOR_SHIPMENT` is refused with:

```json
{
  "success": false,
  "message": "A change proposal is waiting for the customer. Resolve it before shipping.",
  "code": "ADJUSTMENT_PENDING",
  "adjustmentId": "..."
}
```

The final lines are not settled until the proposal is answered, withdrawn or expired.

---

## Propose an Order Change

```text
POST /api/v1/brand/orders/:id/adjustments
```

Required:

```text
orders.adjust
```

Brand admin or employee, scoped to the authenticated user's brand. Allowed only while the order is `PENDING`, `CONFIRMED` or `PROCESSING`, and only when no other proposal is waiting (docs/21 §H.1–H.2).

Example:

```json
{
  "note": "The blue version is out of stock; we can send the grey one instead.",
  "restockRemoved": false,
  "lines": [
    {
      "orderItemId": "665f1c2a5b1e4c0012ab34cd",
      "supplyQuantity": 1,
      "substitute": { "productId": "665f1c2a5b1e4c0012ab9999", "quantity": 1 }
    },
    {
      "orderItemId": "665f1c2a5b1e4c0012ab34ce",
      "supplyQuantity": 0,
      "substitute": null
    }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `note` | Required message shown to the customer (max 500 characters). |
| `restockRemoved` | Optional, default `false`: return the units the brand cannot supply to stock. Leave off when the units are missing or damaged. |
| `lines[].orderItemId` | An item id from this order. |
| `lines[].supplyQuantity` | Units of the original product the brand can supply, `0..ordered`. |
| `lines[].substitute` | Optional same-brand product + quantity, at today's price. The substitute replaces missing units only. |

The backend validates every line against the order (item belongs to the order, at most once; supply never exceeds the ordered quantity; a substitute is a different, active product of the same brand), computes both totals server-side, reserves substitute stock in the same transaction, and returns `201`:

```json
{
  "success": true,
  "message": "Proposal sent to the customer",
  "adjustment": { }
}
```

The proposal expires 24 hours after it was sent. The customer is notified with `ADJUSTMENT_PROPOSED`.

Errors:

```text
404  order or line not found (another brand's order is also 404)
403  PERMISSION_DENIED (no orders.adjust)
409  NOT_ADJUSTABLE            the order is past processing or already ended
409  ADJUSTMENT_PENDING        another proposal is waiting
409  ONLINE_PAYMENT_NOT_COMPLETED  an online order is not paid yet
400  DUPLICATE_ORDER_ITEM / ORDER_ITEM_NOT_FOUND / NO_CHANGE
400  SUBSTITUTE_WITHOUT_SHORTAGE / SUBSTITUTE_TOO_MANY / SUBSTITUTE_SAME_PRODUCT
409  SUBSTITUTE_UNAVAILABLE    inactive/foreign product or not enough stock
```

---

## Withdraw an Order Change

```text
POST /api/v1/brand/orders/:id/adjustments/:adjustmentId/withdraw
```

Required:

```text
orders.adjust
```

The brand takes back a proposal that is still waiting. Substitute stock is released, the order becomes adjustable again and the customer sees it as withdrawn. Only one withdrawal can win the atomic `PROPOSED → WITHDRAWN` update; a later answer or expiry receives `409 ADJUSTMENT_NOT_PENDING` (or `ADJUSTMENT_EXPIRED`).

```json
{
  "success": true,
  "message": "Proposal withdrawn",
  "adjustment": { }
}
```

---

# 18. Super Admin Order Endpoints

Super Admin may access platform-wide order information:

```text
GET /api/v1/admin/orders
GET /api/v1/admin/orders/:id
```

These endpoints must remain separate from brand-scoped endpoints where doing so improves authorization clarity.

A platform admin's order detail is read-only and includes the order's `adjustments` and `adjustment` (docs/21 §H.4). Only the brand can propose, withdraw or answer a change; only the customer can answer it.

---

# 18a. Platform Admin Partner Endpoints

Feature G (`21-next-features-plan.md` §G). **Super Admin only** — a partner can
never manage the team, whatever areas they hold.

```text
GET    /api/v1/admin/partners             list the team (page, limit)
POST   /api/v1/admin/partners             add a partner
PATCH  /api/v1/admin/partners/:id         name, phone, permissions, readOnly, isActive
DELETE /api/v1/admin/partners/:id         deactivate (the seat is freed)
PATCH  /api/v1/admin/partners/:id/password  set a new temporary password
```

Add body:

```json
{
  "name": "Pat Partner",
  "email": "pat@example.com",
  "password": "Temp@12345",
  "phone": "+923001234567",
  "permissions": ["admin.brands", "admin.orders"],
  "readOnly": false
}
```

The role is never client-supplied: the endpoint only ever creates
`ADMIN_PARTNER` accounts with `accountType: PLATFORM_ADMIN` and
`mustChangePassword: true`. Answers:

* `201` with the new partner (never the password hash);
* `409` `PARTNER_LIMIT_REACHED` when 5 active partners already exist;
* `409` when the email is already registered in the platform portal.

`DELETE` deactivates both the `AdminPartner` record and the `User`, so the
partner is signed out at once (the token stops working because every request
reloads the user). Reactivation is `PATCH { "isActive": true }`.

The password reset bumps `passwordVersion`, which invalidates every existing
partner session, and sets `mustChangePassword` again.

List response:

```json
{
  "success": true,
  "items": [
    {
      "_id": "partner_id",
      "permissions": ["admin.brands"],
      "readOnly": false,
      "isActive": true,
      "createdBy": "super_admin_id",
      "createdAt": "2026-10-27T10:00:00.000Z",
      "user": { "_id": "user_id", "name": "Pat Partner", "email": "pat@example.com",
                "phone": "+923001234567", "isActive": true, "mustChangePassword": true }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

## Admin audit log

```text
GET /api/v1/admin/activity            (Super Admin only; page, limit, action, actor)
```

Response: `{ success, items: [{ _id, action, actorRole, actor: { _id, name, email }, target, details, createdAt }], pagination }`.
Every admin write by anyone calls this log (best-effort; a log failure never
fails the action itself).

## Admin area permissions in this document

Every endpoint below that says "Super Admin only" (or "Super Admin") is now
"Super Admin, or a partner holding the matching area":

| Area                | Guards |
| ------------------- | ------ |
| `admin.brands`      | brand list/detail, approve, status, terminate, create |
| `admin.users`       | `/admin/users` |
| `admin.orders`      | `/admin/orders` and admin order detail |
| `admin.reviews`     | `/admin/reviews` and review moderation |
| `admin.locations`   | city and block writes |
| `admin.settings`    | `/admin/settings` |
| `admin.analytics`   | `/admin/analytics` |
| `admin.payments`    | `/payments/events` and receipt readers for platform admins |

A partner with `readOnly: true` is refused on every non-GET admin request with
`403 READ_ONLY`; a missing area answers `403 PERMISSION_DENIED` plus the
`permission` that would be needed.

---

# 19. Employee Endpoints

Base:

```text
/api/v1/employees
```

## List Employees

```text
GET /api/v1/employees
```

Required:

```text
employees.view
```

Brand users only receive employees belonging to their brand.

---

## Create Employee

```text
POST /api/v1/employees
```

Required:

```text
employees.create
```

The new employee must automatically be associated with the authenticated Brand Admin's brand.

---

## Update Employee

```text
PATCH /api/v1/employees/:id
```

Required:

```text
employees.update
```

---

## Delete/Deactivate Employee

```text
DELETE /api/v1/employees/:id
```

Required:

```text
employees.delete
```

---

## Update Employee Permissions

```text
PATCH /api/v1/employees/:id/permissions
```

Required:

```text
employees.manage_permissions
```

Example:

```json
{
  "permissions": [
    "products.view",
    "products.update",
    "inventory.view"
  ]
}
```

The server must ensure the employee remains within the same brand.

---

# 20. Review Endpoints

Base:

```text
/api/v1/reviews
```

## Create Review

```text
POST /api/v1/reviews
```

Customer only.

The backend should verify that the customer is eligible to review the product.

---

## Product Reviews

```text
GET /api/v1/products/:productId/reviews
```

Public for active products.

---

## Update Review

```text
PATCH /api/v1/reviews/:id
```

The customer may modify only their own review, subject to business rules.

---

## Delete Review

```text
DELETE /api/v1/reviews/:id
```

Customers may delete their own review where permitted.

Authorized brand/admin users may moderate reviews according to their permissions.

---

# 21. Notification Endpoints

Base:

```text
/api/v1/notifications
```

## My Notifications

```text
GET /api/v1/notifications
```

Returns only the authenticated user's notifications.

---

## Mark Notification Read

```text
PATCH /api/v1/notifications/:id/read
```

The notification must belong to the authenticated user.

---

## Mark All Read

```text
PATCH /api/v1/notifications/read-all
```

## Delete Notification

```text
DELETE /api/v1/notifications/:id
```

The notification must belong to the authenticated user. Deleting a
notification never affects the underlying order, product or payment
(docs/12-notification-system.md §24).

---

# 22. Payment Endpoints

Base:

```text
/api/v1/payments
```

## Get Order Payment

```text
GET /api/v1/payments/order/:orderId
```

Access must be restricted according to order ownership.

Required (brand users):

```text
payments.view
```

The payment view never includes `collection.proof` (the private photo path and its
fingerprint). A customer sees only `collection.method` and `collection.wallet`; brand
users and admins also see the reference and verification state. See §22 "Door Payment
Proofs" for the photo itself.

---

## Update Payment Status

```text
PATCH /api/v1/payments/:id/status
```

Required (brand users):

```text
payments.manage
```

This endpoint must be heavily protected.

For future online gateways, payment status should preferably be updated through verified provider callbacks/webhooks rather than trusting arbitrary client requests.

---

## Cash on Delivery Hand-over

```text
GET  /api/v1/payments/cash/outstanding            payments.view
GET  /api/v1/payments/cash/outstanding?collectorId=<id>
POST /api/v1/payments/cash/settle                 payments.manage
```

Brand users only, always pinned to their own brand (never a brandId from the
request). Without `collectorId` the first returns `{ collectors: [{ collectorId,
name, role, count, total, oldest }] }`; with it, that person's unsettled
`payments: [{ paymentId, orderNumber, amount, collectedAt }]` and their `total`.

`settle` takes `{ "collectorId": "<id>", "paymentIds": ["<id>", ...] }` (1 to 200) and
marks exactly those payments settled, recording who did it. All or nothing: if any
listed payment is not an unsettled payment of this brand collected by that person,
nothing changes and the answer is `409 CASH_CHANGED`. A rider sees only their own
total, at `GET /rider/deliveries/cash` (`{ cash: { count, total } }`). See
`10-payment-system.md` §11a.

---

## Door Payment Proofs

How the customer actually paid at the door (`10-payment-system.md` §31). A non-cash
collection is `PAID` but unverified until the brand checks its statement.

```text
POST  /api/v1/rider/deliveries/:id/proof-upload      rider, own delivery out for delivery
GET   /api/v1/payments/proofs?status=&page=&limit=   brand payments.view / platform admin.payments
GET   /api/v1/payments/:id/proof                     brand payments.view: details + signed link
PATCH /api/v1/payments/:id/proof                     brand payments.manage: { verification, note? }
```

`proof-upload` answers `{ success: true, upload: { ... } }` with the signed Cloudinary
parameters (`uploadUrl`, `apiKey`, `timestamp`, `folder`, `allowedFormats`,
`type: "authenticated"`, `signature`). The app uploads the photo directly to Cloudinary
and sends `publicId` and `fingerprint` (Cloudinary's `etag`) in the complete call
(§22b); the server checks that the path belongs to this brand's and this delivery's
folder.

The queue (`status` defaults to `SUBMITTED`, oldest first) answers
`{ proofs: [{ paymentId, orderNumber, amount, currency, method, wallet, reference,
verification, submittedAt, verifiedAt, note, duplicateReference, duplicateProof,
proofAvailable }], pagination }`. The photo's `publicId` and fingerprint are **never**
returned. `GET /payments/:id/proof` returns the same item plus `{ url, expiresAt }`,
a signed link valid for about 5 minutes.

The decision body is `{ "verification": "VERIFIED" | "REJECTED", "note": "..." }`.
`note` is required with `REJECTED` (1 to 300 characters), optional with `VERIFIED`.
It answers `{ proof: { paymentId, verification, verifiedAt, note } }`. Every query is
pinned to the caller's brand; another brand's payment is `404`. See
`10-payment-system.md` §31.3 for the owner notification and the no-automatic-money rule.

Errors: `503 PROOF_NOT_CONFIGURED`, `404 PROOF_NOT_FOUND` (no photo, or deleted),
`409 PROOF_NOT_ALLOWED` (not out for delivery), `422 PROOF_NOT_YOURS`,
`409 PAYMENT_PREPAID`, `409 PAYMENT_ALREADY_COLLECTED`, `409 PROOF_ALREADY_DECIDED`.

---

# 22e. Device and Rider Location Endpoints

```text
PUT    /api/v1/devices/push-token                      riders, team members: { token, platform? }   (docs/12 §31)
DELETE /api/v1/devices/push-token                      the same people: { token }
PUT    /api/v1/rider/deliveries/location               rider: { latitude, longitude, accuracy? }    (docs/11 §30)
DELETE /api/v1/rider/deliveries/location               rider
GET    /api/v1/deliveries/:id/rider-location           customer (own order), brand with delivery.view: { location }
```

Errors: `409 NO_ACTIVE_DELIVERY` (the rider has nothing out for delivery), `429` (more than 12 location updates a minute).

---

# 22d. Online Payment Endpoints

Details and rules: `10-payment-system.md` §29.

```text
GET  /api/v1/payments/methods                          customer: [{ method, label, holdMinutes? }]
POST /api/v1/payments/order/:orderId/checkout          customer, own order: { checkoutUrl, expiresAt, provider }
POST /api/v1/payments/webhooks/:provider               the gateway (signature over the raw body, no login)
GET  /api/v1/payments/mock-checkout/:reference         TEST gateway page (404 unless the test gateway is on)
POST /api/v1/payments/mock-checkout/:reference/:choice TEST gateway: choice is pay or fail
GET  /api/v1/payments/events?outcome=&page=&limit=     super admin: what the gateway told us
```

Checkout (`POST /orders`) now accepts `paymentMethod` `COD` or `ONLINE_GATEWAY` (the latter
only while a provider is on, else `400 ONLINE_PAYMENTS_UNAVAILABLE`). Related errors:
`409 PAYMENT_PENDING` (confirming an unpaid online order), `409 PAID_ORDER_NOT_CANCELLABLE`,
`409 PAYMENT_EXPIRED`, `409 ALREADY_PAID`, `409 NOT_PAYABLE`, `409 NOT_ONLINE`,
`503 ONLINE_PAYMENTS_UNAVAILABLE`, and for the webhook `401` (bad signature) and `400` (malformed).

---

# 22c. Receipt Endpoints

Base `/api/v1/receipts`. Read only: receipts are issued by the system when a payment
becomes `PAID` (`10-payment-system.md` §28).

```text
GET /api/v1/receipts                    list (?from, ?to, page, limit), newest first
GET /api/v1/receipts/:id
GET /api/v1/receipts/order/:orderId     the receipt of an order (issued on the spot if it was never written)
```

Who: customers see their own (without internal details), brand users their brand's
with `payments.view` (also the payment reference and who collected the cash), the
super admin all, riders none. Another person's receipt is `404`. An unpaid order:
`404` with `code: "NO_RECEIPT"`.

A COD order paid at the door also carries `collectionMethod`, `collectionWallet`
(wallet payments) and, for brand users and admins, `collectionReference`. When the
payment was non-cash, the brand's single-receipt view adds `proofVerification`
(`SUBMITTED`, `VERIFIED` or `REJECTED`), read live from the payment; customers never
receive it. The photo itself is never part of a receipt.

---

# 22a. Delivery Endpoints

Base:

```text
/api/v1/deliveries
```

Delivery is part of the MVP. See `11-delivery-system.md` for the full business rules.

## List Deliveries

```text
GET /api/v1/deliveries
```

Brand users only see their own brand's deliveries. Customers use the order endpoints (§16) for their own delivery/tracking view instead of this list.

Required (brand users):

```text
delivery.view
```

---

## Get Delivery

```text
GET /api/v1/deliveries/:deliveryId
```

Access must be restricted to:

* The brand that owns the delivery, or
* The customer who owns the related order, or
* Super Admin.

---

## Update Delivery Status

```text
PATCH /api/v1/deliveries/:deliveryId/status
```

Example:

```json
{
  "status": "OUT_FOR_DELIVERY"
}
```

Required (brand users):

```text
delivery.manage
```

The backend must validate the status transition (see `11-delivery-system.md`, §9–10) and must not allow the order/payment status fields to be set directly through this endpoint.

---

## Update Delivery

```text
PATCH /api/v1/deliveries/:deliveryId
```

Used for fields such as `trackingReference`, `assignedAgent`, or `failureReason`.

Required (brand users):

```text
delivery.manage
```

---

## Assign Rider

```text
PATCH /api/v1/deliveries/:deliveryId/rider
```

Body `{ "riderId": "<id>" }` assigns an active rider of the same brand (also
sets `assignedAgent` to the rider's name and notifies the rider with
`DELIVERY_ASSIGNED`); `{ "riderId": null }` removes the rider. Required: `delivery.manage`.
Errors: `404` rider not in this brand or inactive; `409 DELIVERY_FINAL`;
`409 NO_RIDER_ASSIGNED` (removing when none). `PATCH /deliveries/:id` with a typed
`assignedAgent` answers `409 USE_RIDER_ASSIGNMENT` while a rider is assigned.
`GET /deliveries` also accepts `riderId` as a filter.

## Delivery Code (customer)

```text
GET /api/v1/deliveries/:deliveryId/code
```

Customer only, own delivery only, and only while it is on its way
(`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `FAILED`); otherwise
`409 CODE_NOT_AVAILABLE`. Returns `{ "success": true, "code": "482913" }`.

---

# 22b. Rider Endpoints

Base `/api/v1/riders` (brand users; `riders.view` / `riders.create` / `riders.update`):

```text
GET    /riders                 list the brand's riders (?isActive, page, limit)
POST   /riders                 { name, email, password, phone }  -> role RIDER, brand from the signed-in user
PATCH  /riders/:id             { name?, phone?, isActive? }
PATCH  /riders/:id/password    { password }  resets it and signs the rider out everywhere
```

Base `/api/v1/rider/deliveries` (role `RIDER` only; brand and rider come from the
account, every query is pinned to both, anything else is `404`):

```text
GET   /rider/deliveries?scope=active|history
GET   /rider/deliveries/:id
PATCH /rider/deliveries/:id/status      { status: PICKED_UP|IN_TRANSIT|OUT_FOR_DELIVERY|FAILED, failureReason? }
POST  /rider/deliveries/:id/proof-upload   signed upload for a door payment photo (docs/10 §31)
POST  /rider/deliveries/:id/complete    { code, collection? }  six digits
```

`collection` records how the customer paid at the door:

```json
{
  "method": "CASH | BANK_TRANSFER | WALLET | CARD_MACHINE",
  "wallet": "JAZZCASH | EASYPAISA | OTHER",
  "reference": "transaction id or card-machine approval code",
  "proof": { "publicId": "<cloudinary path>", "fingerprint": "<etag>" }
}
```

It is optional; omitting it (or `method: "CASH"`) is cash. Cash must not carry
`wallet`, `reference` or `proof` (`400`). Every non-cash method requires `wallet`
for `WALLET`, a `reference` and a `proof`. A prepaid order refuses any collection
(`409 PAYMENT_PREPAID`); a non-cash collection that arrives after the payment was
already collected aborts the completion (`409 PAYMENT_ALREADY_COLLECTED`).

A rider's delivery view contains: order number, status, address (only while the
delivery is open), item names and quantities, `paymentMethod`, `amountToCollect`,
`cashCollected`, and (for a non-cash door payment) `proofStatus`
(`SUBMITTED`/`VERIFIED`/`REJECTED`) — never the reference or the photo. Never the
customer account, brand, prices or the code. `complete`
errors: `422 INVALID_CODE` (with `attemptsRemaining`), `429 CODE_LOCKED`,
`409 INVALID_TRANSITION`, `409 NO_DELIVERY_CODE`, plus the proof errors above.
Deactivating a rider (`PATCH /riders/:id` with `isActive: false`) answers `409 RIDER_HAS_OPEN_DELIVERIES` while the rider still has open deliveries. Customers receive their delivery without `riderId`, `codeAttempts` or `deliveryCode`. See `20-partner-app.md`.

---

# 23. Analytics Endpoints

Base:

```text
/api/v1/analytics
```

## Brand Analytics

```text
GET /api/v1/analytics/brand
```

Required:

```text
analytics.view
```

Results must only include the authenticated brand's data.

---

## Platform Analytics

```text
GET /api/v1/analytics/admin
```

Super Admin only.

---

# 24. Query Parameters

Collection endpoints should use predictable query parameters.

### Pagination

```text
?page=1&limit=20
```

### Search

```text
?search=phone
```

### Filtering

```text
?brandId=...
&categoryId=...
&status=ACTIVE
```

### Sorting

```text
?sort=createdAt
&order=desc
```

The backend should validate allowed fields to prevent arbitrary or expensive queries.

---

# 25. Pagination Response

Paginated responses should follow a consistent format.

Example:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

The exact response property may be standardized during implementation, but it must remain consistent across the API.

---

# 26. Standard Success Response

Example:

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "product_id"
  }
}
```

For list endpoints:

```json
{
  "success": true,
  "data": [],
  "pagination": {}
}
```

---

# 27. Standard Error Response

Example:

```json
{
  "success": false,
  "message": "You do not have permission to perform this action"
}
```

Validation errors may include field-specific information:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": "Invalid email address"
  }
}
```

Sensitive implementation details and stack traces must never be exposed in production.

---

# 28. HTTP Status Codes

| Status | Usage                                    |
| ------ | ---------------------------------------- |
| `200`  | Successful request                       |
| `201`  | Resource created                         |
| `204`  | Successful request with no response body |
| `400`  | Invalid request                          |
| `401`  | Not authenticated                        |
| `403`  | Authenticated but not authorized         |
| `404`  | Resource not found                       |
| `409`  | Conflict                                 |
| `422`  | Validation/business rule failure         |
| `429`  | Rate limit exceeded                      |
| `500`  | Unexpected server error                  |

---

# 29. Tenant Isolation

Every brand-scoped endpoint must enforce tenant isolation.

Example:

```text
GET /api/v1/brand/orders
```

must internally behave conceptually like:

```text
order.brandId = req.user.brandId
```

A client must not be able to override this using:

```text
?brandId=another-brand
```

or:

```json
{
  "brandId": "another-brand"
}
```

---

# 30. Resource Ownership

For individual resources, the backend must verify ownership.

Example:

```text
PATCH /api/v1/products/:id
```

Authorization requires:

```text
products.update
+
product.brandId === req.user.brandId
```

The same principle applies to:

* Orders
* Inventory
* Categories
* Employees
* Stores
* Reviews
* Notifications

---

# 31. API Security Middleware

Protected APIs should follow a structure similar to:

```text
authenticateUser
        ↓
requirePermission
        ↓
validateRequest
        ↓
tenant/resource authorization
        ↓
controller
```

Not every endpoint requires all middleware.

For example, public product browsing does not require authentication.

---

# 32. Rate Limiting

Rate limiting should be applied especially to:

```text
POST /auth/login
POST /auth/register
POST /auth/forgot-password
```

and other sensitive endpoints.

Different limits may be used for public and authenticated APIs.

---

# 33. File Upload APIs

Image uploads should use controlled endpoints.

Example:

```text
POST /api/v1/uploads
```

The backend must validate:

* File type
* File size
* User authorization
* Upload purpose

Uploaded media should be stored using the configured media provider.

---

# 34. API Naming Rules

Use plural resource names:

```text
/products
/orders
/brands
/categories
```

Avoid inconsistent patterns such as:

```text
/getProducts
/createProduct
/deleteProduct
```

HTTP methods should represent the operation.

---

# 35. API Versioning Rules

Current version:

```text
/v1
```

Breaking API changes require a new version.

For example:

```text
/v2
```

Non-breaking changes may remain within the existing version.

---

# 36. API Documentation

The API should eventually be documented using OpenAPI/Swagger.

The documentation should contain:

* Endpoints
* Parameters
* Request schemas
* Response schemas
* Authentication requirements
* Permissions
* Error responses
* Examples

The OpenAPI specification should remain synchronized with the actual implementation.

---

# 37. API Testing Requirements

Every protected endpoint should have tests covering at least:

```text
Authenticated allowed request
Unauthenticated request
Wrong role
Missing permission
Wrong brand
Invalid resource ID
Invalid request body
Resource not found
```

Critical business APIs should also test concurrency and state transitions where applicable.

---

# 38. Critical API Flows

## Customer Checkout

```text
GET /cart
    ↓
POST /orders
    ↓
Orders created per brand
    ↓
GET /orders/my
```

## Brand Order Processing (including a change proposal)

```text
GET /brand/orders
    ↓
GET /brand/orders/:id
    ↓
PATCH /brand/orders/:id/status
    ↓
POST /brand/orders/:id/adjustments       (brand cannot fully supply)
    ↓
customer: POST /orders/:id/adjustments/:adjustmentId/respond
    ↓
GET /brand/orders/:id   (answer, EXPIRED, or WITHDRAWN)
    ↓
PATCH /brand/orders/:id/status           (READY_FOR_SHIPMENT once no proposal waits)
```

## Product Management

```text
POST /products
    ↓
PATCH /products/:id
    ↓
PATCH /inventory/:productId
```

## Employee Management

```text
POST /employees
    ↓
PATCH /employees/:id/permissions
    ↓
PATCH /employees/:id
```

---

# 39. API Acceptance Criteria

The API specification is ready for implementation when:

* [ ] All MVP resources have defined endpoints.
* [ ] Authentication endpoints are defined.
* [ ] Authorization requirements are documented.
* [ ] Brand isolation rules are defined.
* [ ] Customer ownership rules are defined.
* [ ] CRUD operations are defined where required.
* [ ] Multi-brand checkout is defined.
* [ ] Order lifecycle endpoints are defined.
* [ ] Employee permission endpoints are defined.
* [ ] Pagination is standardized.
* [ ] Error responses are standardized.
* [ ] HTTP status codes are defined.
* [ ] API versioning is defined.
* [ ] Security middleware requirements are defined.
* [ ] Critical endpoints have testing requirements.

---

# 40. AI Implementation Rules

AI coding agents implementing APIs must:

1. Read the relevant module documentation before creating endpoints.
2. Follow the endpoint conventions in this document.
3. Never trust client-provided `brandId` for tenant authorization.
4. Never expose password hashes or secrets.
5. Validate all request bodies.
6. Enforce permissions on protected endpoints.
7. Enforce resource ownership.
8. Keep controllers thin.
9. Put business logic inside services.
10. Add tests for authorization failures.
11. Update API documentation when endpoint behavior changes.
12. Never silently introduce breaking API changes.

---

# 41. Source-of-Truth Rule

This document defines the intended CityCart API contract.

The following documents must remain consistent with it:

```text
01-product-requirements.md
02-user-roles-and-permissions.md
03-system-architecture.md
04-database-design.md
06-authentication-and-security.md
```

If implementation requires a significant API change, the change must be documented before implementation.

---

## Document Status

**Current status:** Approved for implementation

**Next document:**

```text
06-authentication-and-security.md
```
