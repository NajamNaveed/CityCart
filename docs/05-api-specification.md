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

Users must not be allowed to register themselves as:

```text
SUPER_ADMIN
BRAND_ADMIN
BRAND_EMPLOYEE
```

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

---

## Cancel My Order

```text
PATCH /api/v1/orders/:id/cancel
```

Cancellation is allowed only when the order is in an eligible state.

The backend determines whether cancellation is allowed.

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

The order must belong to the user's brand.

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

---

# 18. Super Admin Order Endpoints

Super Admin may access platform-wide order information:

```text
GET /api/v1/admin/orders
GET /api/v1/admin/orders/:id
```

These endpoints must remain separate from brand-scoped endpoints where doing so improves authorization clarity.

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

## Brand Order Processing

```text
GET /brand/orders
    ↓
GET /brand/orders/:id
    ↓
PATCH /brand/orders/:id/status
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
