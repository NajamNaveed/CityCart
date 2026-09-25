# CityCart — User Roles and Permissions

**Document:** `02-user-roles-and-permissions.md`
**Status:** Approved for implementation
**Version:** 1.0

---

## 1. Purpose

This document defines CityCart's user roles, permission system, access boundaries, and authorization rules.

It is the source of truth for:

* Role-based access control (RBAC)
* Permission assignment
* Brand/tenant isolation
* API authorization
* Employee access
* Resource ownership
* Administrative actions
* Frontend permission visibility

The backend must enforce all security rules defined in this document. Frontend restrictions are only for user experience and must never be treated as security controls.

---

# 2. User Roles

CityCart has four primary roles:

| Role             | Scope            | Description                                |
| ---------------- | ---------------- | ------------------------------------------ |
| `SUPER_ADMIN`    | Platform-wide    | Manages the entire CityCart platform       |
| `BRAND_ADMIN`    | One brand        | Owns and manages one brand/store           |
| `BRAND_EMPLOYEE` | One brand        | Performs assigned tasks within a brand     |
| `CUSTOMER`       | Personal account | Shops and manages their own account/orders |

---

# 3. Role Hierarchy

```text
SUPER_ADMIN
    │
    ├── Platform Management
    │
    └── Brand Management
            │
            ├── BRAND_ADMIN
            │       │
            │       └── BRAND_EMPLOYEE
            │
            └── Brand Resources

CUSTOMER
    │
    └── Personal Shopping Resources
```

The hierarchy does **not** mean that one role can automatically impersonate another role.

For example:

* A `BRAND_ADMIN` cannot access another brand.
* A `BRAND_EMPLOYEE` cannot access another brand.
* A `CUSTOMER` cannot access administrative resources.
* A `BRAND_EMPLOYEE` cannot automatically perform every action available to a `BRAND_ADMIN`.

---

# 4. Scope Model

CityCart uses a multi-tenant architecture.

A **Brand** is the primary tenant.

Brand-owned resources must contain a `brandId` reference where applicable.

Examples:

```text
Brand
 ├── Store
 ├── Employees
 ├── Categories
 ├── Products
 ├── Inventory
 ├── Orders
 └── Reviews
```

A request from a brand user must be restricted to that user's brand.

### Example

If:

```text
User.brandId = BRAND_A
```

the user must not be able to retrieve:

```text
Product.brandId = BRAND_B
```

even if they know the product's MongoDB `_id`.

---

# 5. Permission Naming Convention

Permissions use the following format:

```text
resource.action
```

Examples:

```text
products.view
products.create
products.update
products.delete

orders.view
orders.manage

inventory.view
inventory.manage
```

Permissions should use lowercase names with dot notation.

---

# 6. Permission Groups

## 6.1 Product Permissions

```text
products.view
products.create
products.update
products.delete
```

## 6.2 Category Permissions

```text
categories.view
categories.create
categories.update
categories.delete
```

## 6.3 Inventory Permissions

```text
inventory.view
inventory.manage
```

## 6.4 Order Permissions

```text
orders.view
orders.manage
orders.cancel
```

## 6.5 Customer Permissions

```text
customers.view
customers.manage
```

## 6.6 Employee Permissions

```text
employees.view
employees.create
employees.update
employees.delete
employees.manage_permissions
```

## 6.7 Store Permissions

```text
store.view
store.update
```

## 6.8 Brand Permissions

```text
brand.view
brand.update
```

## 6.9 Review Permissions

```text
reviews.view
reviews.manage
```

## 6.10 Analytics Permissions

```text
analytics.view
```

## 6.11 Notification Permissions

```text
notifications.view
notifications.manage
```

## 6.12 Delivery Permissions

```text
delivery.view
delivery.manage
```

See `11-delivery-system.md` and `05-api-specification.md` (§22a) — delivery is part of the MVP, not a future addition.

## 6.13 Payment Permissions

```text
payments.view
payments.manage
```

`payments.manage` guards the payment-status update endpoint (`05-api-specification.md`, §22) and should be treated as at least as sensitive as `orders.manage`.

---

# 7. Super Admin

Role:

```text
SUPER_ADMIN
```

The Super Admin operates at the platform level.

## Responsibilities

The Super Admin can:

* Manage cities
* Manage brands
* Approve or disable brands
* Manage platform users
* View platform-wide orders
* Manage platform categories where applicable
* View platform-wide analytics
* Manage platform settings
* Review brand activity
* Manage platform-level notifications
* Manage commissions and payouts when implemented

The Super Admin is not restricted to a single brand.

### Super Admin Scope

```text
scope = PLATFORM
```

---

# 8. Brand Admin

Role:

```text
BRAND_ADMIN
```

A Brand Admin belongs to exactly one brand.

```text
user.brandId = brand._id
```

The Brand Admin can manage the operational resources belonging to that brand.

### Default Brand Admin Access

| Resource      | Access                            |
| ------------- | --------------------------------- |
| Brand         | View / Update                     |
| Store         | View / Update                     |
| Products      | Full CRUD                         |
| Categories    | Full CRUD                         |
| Inventory     | View / Manage                     |
| Orders        | View / Manage                     |
| Customers     | View / Manage within brand orders |
| Employees     | Full management                   |
| Reviews       | View / Manage                     |
| Analytics     | View                              |
| Notifications | View / Manage                     |

A Brand Admin must not:

* Access another brand's resources
* Create another brand
* Change their role to `SUPER_ADMIN`
* Grant platform-level permissions
* Modify platform configuration
* Access unrelated brands' customers or orders

---

# 9. Brand Employee

Role:

```text
BRAND_EMPLOYEE
```

Every employee belongs to one brand.

```text
employee.brandId = brand._id
```

Unlike Brand Admins, employees receive explicit permissions.

Example:

```json
{
  "role": "BRAND_EMPLOYEE",
  "brandId": "brand123",
  "permissions": [
    "products.view",
    "inventory.view",
    "inventory.manage",
    "orders.view"
  ]
}
```

The employee can only perform actions included in their permission list.

### Important Rule

Employee permissions can **restrict** access but cannot expand the employee beyond their brand.

Therefore:

```text
Permission + Brand Scope
```

must both pass authorization.

---

# 10. Customer

Role:

```text
CUSTOMER
```

Customers do not have administrative permissions.

Customers can:

* Browse cities
* Browse brands
* Browse stores
* View products
* Search products
* Manage their cart
* Place orders
* View their own orders
* Cancel eligible orders
* Manage their profile
* Submit reviews for eligible purchases
* View notifications

Customers cannot:

* Manage products
* Manage inventory
* Manage employees
* Access brand dashboards
* Access admin dashboards
* View another customer's private information
* Modify order prices
* Modify order ownership

---

# 11. Permission Matrix

The following matrix defines the default access model.

| Resource          | Super Admin | Brand Admin                | Employee            | Customer          |
| ----------------- | ----------- | -------------------------- | ------------------- | ----------------- |
| Cities            | Full        | View                       | View                | View              |
| Brands            | Full        | Own brand                  | Own brand           | View              |
| Store             | Full        | Own store                  | Based on permission | View              |
| Products          | Full        | Full                       | Permission-based    | View              |
| Categories        | Full        | Full                       | Permission-based    | View              |
| Inventory         | Full        | Full                       | Permission-based    | —                 |
| Orders            | Full        | Own brand                  | Permission-based    | Own orders        |
| Customers         | Full        | Brand-related              | Permission-based    | Own profile       |
| Employees         | Full        | Own brand                  | Limited/none        | —                 |
| Reviews           | Full        | Own brand                  | Permission-based    | Own reviews       |
| Notifications     | Full        | Own brand                  | Permission-based    | Own notifications |
| Analytics         | Full        | Own brand                  | Permission-based    | —                 |
| Platform Settings | Full        | —                          | —                   | —                 |
| Commissions       | Full        | View own where implemented | —                   | —                 |

`Full` means access is not restricted to a single resource action unless another platform rule applies.

---

# 12. Authorization Rules

Every protected backend request must evaluate:

```text
Authentication
        ↓
Role
        ↓
Permission
        ↓
Resource Ownership / Tenant Scope
        ↓
Action Allowed
```

A user is authorized only when all required checks pass.

---

# 13. Authentication vs Authorization

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

For example:

```text
JWT valid
        ↓
User = Brand Employee
        ↓
Permission = products.update
        ↓
Product belongs to user's brand
        ↓
ALLOW
```

If the product belongs to another brand:

```text
DENY
```

even when the employee has:

```text
products.update
```

---

# 14. Backend Enforcement

Authorization must be implemented on the backend.

Example:

```text
PATCH /api/v1/products/:id
```

The server must verify:

1. User is authenticated.
2. User has the required permission.
3. Product exists.
4. Product belongs to the user's brand.
5. Requested operation is allowed.

The API must never rely on a frontend-hidden button as authorization.

---

# 15. Frontend Permission Handling

The frontend should hide or disable UI elements when the user lacks permission.

Example:

```text
Employee has:
products.view
```

The frontend may display:

```text
View Products
```

but should not display:

```text
Create Product
Edit Product
Delete Product
```

However, hiding the buttons does **not** provide security.

A malicious user could still call the API directly.

Therefore:

```text
Frontend = UX control
Backend = Security control
```

---

# 16. Brand Isolation Rules

Brand isolation is mandatory.

A brand user must never access another brand's private resources.

For example:

```text
Brand A Employee
       ↓
GET /products/product-from-brand-B
       ↓
403 Forbidden
```

or, where appropriate for resource discovery:

```text
404 Not Found
```

The implementation should avoid exposing unnecessary information about resources belonging to another tenant.

Brand isolation applies to:

* Products
* Categories
* Inventory
* Orders
* Employees
* Customers associated with brand orders
* Reviews
* Analytics
* Store data
* Notifications
* Future brand-owned resources

---

# 17. Ownership Checks

Ownership must be verified server-side.

Example:

```js
const product = await Product.findOne({
  _id: productId,
  brandId: req.user.brandId
});
```

The server must not trust:

```text
brandId
```

sent by the frontend.

For brand-scoped operations, the backend should derive the brand from the authenticated user whenever possible.

---

# 18. Employee Permission Assignment

Only authorized users may manage employee permissions.

By default:

```text
SUPER_ADMIN
    → Can manage platform-level users

BRAND_ADMIN
    → Can manage employees belonging to their brand

BRAND_EMPLOYEE
    → Cannot grant themselves permissions
```

An employee must not be able to assign permissions to themselves.

An employee must not assign permissions that they are not authorized to manage.

---

# 19. Role Assignment Rules

### Super Admin

Only an existing authorized platform administrator may create or assign:

```text
SUPER_ADMIN
```

This action must be heavily protected and audited.

### Brand Admin

A Brand Admin may manage Brand Admin/Employee accounts according to the final platform policy, but all assigned users must remain within the Brand Admin's brand.

### Employee

Employees cannot promote themselves to:

```text
BRAND_ADMIN
SUPER_ADMIN
```

### Customer

Customers cannot change their own role.

---

# 20. Protected Actions

The following actions require strict authorization:

* Changing user roles
* Changing employee permissions
* Creating or deleting brands
* Approving brands
* Accessing another brand's data
* Modifying order totals
* Modifying inventory quantities
* Cancelling orders administratively
* Managing platform settings
* Managing commissions/payouts
* Deleting users
* Deleting products or categories

These actions should also be considered for audit logging.

---

# 21. Order Access Rules

Order access depends on the user's role.

### Customer

Can access:

```text
orders where order.customerId = currentUser._id
```

### Brand Admin

Can access:

```text
orders where order.brandId = currentUser.brandId
```

### Brand Employee

Can access brand orders only when they have:

```text
orders.view
```

or:

```text
orders.manage
```

### Super Admin

Can access platform-wide orders.

---

# 22. Customer Data Privacy

Brand users may access customer information required to fulfill their brand's orders.

They must not gain unrestricted access to the entire customer database.

Example:

```text
Brand A
   ↓
Customer information from Brand A orders
```

does not mean:

```text
Brand A
   ↓
All CityCart customers
```

Customer access must remain purpose- and scope-limited.

---

# 23. Permission Bundles

For easier employee management, CityCart may later support permission bundles.

Example:

### Inventory Manager

```text
inventory.view
inventory.manage
```

### Order Manager

```text
orders.view
orders.manage
orders.cancel
```

### Product Manager

```text
products.view
products.create
products.update
products.delete
categories.view
categories.create
categories.update
categories.delete
```

Bundles are shortcuts for assigning permissions.

They must not bypass tenant isolation.

---

# 24. Future Permission Expansion

The permission system must be extensible.

`payments.*` and `delivery.*` are now defined in §6.12–6.13 (MVP), not here.

Future permissions may include:

```text
coupons.view
coupons.create
coupons.update
coupons.delete

analytics.export

commissions.view
payouts.view
payouts.manage
```

Adding a permission should not require redesigning the entire authorization system.

---

# 25. API Authorization Pattern

Protected API routes should follow a consistent middleware pattern.

Conceptually:

```text
authenticate
    ↓
authorize(permission)
    ↓
checkTenantAccess
    ↓
controller/service
```

Example:

```text
authenticateUser
requirePermission("products.update")
requireBrandOwnership
updateProduct
```

The exact middleware names may differ during implementation, but the authorization responsibilities must remain separate and clear.

---

# 26. Error Handling

Authorization failures should use appropriate HTTP responses.

Typical cases:

```text
401 Unauthorized
```

when the user is not authenticated.

```text
403 Forbidden
```

when the authenticated user does not have permission.

```text
404 Not Found
```

may be used when revealing the existence of a resource outside the user's scope would be undesirable.

The API must not expose sensitive authorization details.

---

# 27. Auditability

The system should be designed so sensitive administrative actions can be logged.

Potential audit events include:

```text
USER_ROLE_CHANGED
EMPLOYEE_PERMISSION_CHANGED
BRAND_CREATED
BRAND_SUSPENDED
PRODUCT_DELETED
ORDER_STATUS_CHANGED
INVENTORY_ADJUSTED
```

Audit logging can be expanded as the platform matures.

---

# 28. Security Principles

CityCart authorization must follow these principles:

1. **Deny by default.**
2. **Least privilege.**
3. **Backend enforcement.**
4. **Explicit tenant isolation.**
5. **Never trust client-provided ownership information.**
6. **Never allow users to elevate their own privileges.**
7. **Keep customer data scoped to legitimate business needs.**
8. **Protect sensitive administrative operations.**
9. **Validate authorization on every protected request.**
10. **Test authorization independently from frontend behavior.**

---

# 29. Acceptance Criteria

The RBAC implementation is considered complete when:

* [ ] Four primary roles are implemented.
* [ ] Users have appropriate role and scope information.
* [ ] Brand users are associated with exactly one brand where required.
* [ ] Employee permissions are stored and evaluated.
* [ ] Backend APIs enforce permissions.
* [ ] Brand ownership is verified server-side.
* [ ] Brand A cannot access Brand B's private resources.
* [ ] Customers can only access their own private resources.
* [ ] Employees cannot elevate their own permissions.
* [ ] Brand Admins cannot access platform-level administration.
* [ ] Frontend UI respects permissions.
* [ ] Frontend restrictions are not used as the only security mechanism.
* [ ] Unauthorized API requests return appropriate errors.
* [ ] Authorization tests cover cross-brand access.
* [ ] Authorization tests cover privilege escalation.
* [ ] Sensitive administrative actions are suitable for audit logging.

---

# 30. AI Implementation Rules

AI coding agents working on authorization must follow these rules:

### Rule 1 — Read this document first

Before modifying authentication or authorization code, the agent must read:

```text
docs/02-user-roles-and-permissions.md
docs/06-authentication-and-security.md
```

when the second document exists.

### Rule 2 — Never weaken authorization

An agent must not remove or bypass:

```text
permission checks
brand checks
ownership checks
authentication
```

to make a feature work.

### Rule 3 — Server-side ownership

Agents must never trust a client-provided `brandId` for authorization.

### Rule 4 — Test negative cases

Every protected feature should include tests for:

```text
unauthenticated user
wrong role
missing permission
wrong brand
wrong resource owner
```

### Rule 5 — Preserve tenant isolation

Any new brand-owned resource must define how its `brandId` is established and how access is restricted.

---

# 31. Source-of-Truth Rule

This document defines the intended CityCart authorization model.

If implementation requirements conflict with this document, the conflict must be identified before changing the architecture or permission model.

Changes to roles, permissions, or tenant boundaries should be documented and reviewed before implementation.

---

## Document Status

**Current status:** Approved for implementation

**Next document:**

```text
03-system-architecture.md
```
