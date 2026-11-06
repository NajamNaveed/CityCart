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

CityCart has eight roles (`RIDER` and `PICKER` were added in October 2026, see `20-partner-app.md`; `ADMIN_PARTNER` is the delegated platform admin described in `21-next-features-plan.md` §G; `SERVICE_PROVIDER` is added in v3, see `24-marketplace-v3-plan.md`):

| Role               | Scope            | Description                                |
| ------------------ | ---------------- | ------------------------------------------ |
| `SUPER_ADMIN`      | Platform-wide    | Owns the entire CityCart platform          |
| `ADMIN_PARTNER`    | Platform-wide    | A delegated admin holding only ticked areas; web dashboard only |
| `BRAND_ADMIN`      | One brand        | Owns and manages one brand/store           |
| `BRAND_EMPLOYEE`   | One or more brands | Performs assigned tasks within a brand    |
| `RIDER`            | One brand        | Delivers that brand's orders; Delivery app only |
| `PICKER`           | One brand        | Picks and packs that brand's orders; Staff app only |
| `SERVICE_PROVIDER` | One provider     | Owns one service-provider account; web dashboard |
| `CUSTOMER`         | Personal account | Shops and manages their own account/orders |

Every login has one `accountType`:

```text
CUSTOMER        the shopper account
BRAND           brand owners, employees, pickers and riders
SERVICE         service providers
PLATFORM_ADMIN  super admin and admin partners
```

One email may hold one account of each type. The same email may also be an
employee of several brands, with one membership per brand.

---

# 3. Role Hierarchy

```text
SUPER_ADMIN
    │
    ├── Platform Management
    │
    ├── Brand Management
    │       │
    │       ├── BRAND_ADMIN
    │       │       │
    │       │       └── BRAND_EMPLOYEE
    │       │               (may belong to several brands)
    │       │
    │       └── Brand Resources
    │
    └── Service Provider Management
            │
            └── SERVICE_PROVIDER
                    (one provider, no employees in v3)

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

### Session behaviour per role

`CUSTOMER` sessions are persistent in the usual way. Dashboard staff —
`BRAND_ADMIN`, `BRAND_EMPLOYEE`, `SUPER_ADMIN` and `ADMIN_PARTNER` — have
short-lived, per-tab sessions: closing the dashboard tab ends the session and
signing in again is required. See `06-authentication-and-security.md` §9 (Staff
Session Security). An `ADMIN_PARTNER` signs in on `/admin/login` only; the apps
and the other portals refuse the account. App accounts receive a bearer token
instead of a cookie, lasting one staff session length: a `RIDER` signs in only
on the Delivery app (`POST /auth/delivery/login`, `X-Client: delivery`), and a
`BRAND_EMPLOYEE` or `PICKER` only on the Staff app (`POST /auth/staff/login`,
`X-Client: staff`). Each token is marked for its app and refused by the other
(`403 WRONG_APP`); owners and the super admin remain web-only.

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

### Active membership

An employee may belong to several brands. Every request runs in exactly one
active membership, chosen at login (`24-marketplace-v3-plan.md` §3.3). The
active `brandId` comes from the validated session and the active `Employee`
record; `User.brandId` is only the home brand and is never used to authorize an
employee request.

```text
Authenticated employee
        ↓
session.brandId + Employee(userId, brandId, isActive)
        ↓
req.tenantBrandId
        ↓
resource.brandId must match
```

### Service-provider tenant

A service provider is a separate tenant (`ServiceProvider`) with its own
resources, dashboard and billing account. Its `providerId` is derived from the
authenticated session, never from the request body or query. A provider cannot
read or change another provider's profile, offerings, bookings, chat, reviews
or invoices.

A service provider is not a brand and never receives a `brandId`. A customer,
brand or provider account may share an email but never shares a session.

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
orders.adjust

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

Categories are global (Marketplace v2, docs/22). Brand staff no longer have
category permissions: only the super admin, or an admin partner with
`admin.catalog`, manages the category tree. Brands choose from it when they list
a product.

## 6.3 Inventory Permissions

```text
inventory.view
inventory.manage
```

## 6.4 Order Permissions

```text
orders.view
orders.manage
orders.adjust
orders.cancel
```

`orders.adjust` lets a team member propose a substitution or removal when the brand cannot supply an order (docs/21 §H); `orders.manage` alone does not.

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

## 6.12a Rider Permissions

```text
riders.view
riders.create
riders.update
```

These guard the brand's management of its rider accounts (`GET/POST /riders`,
`PATCH /riders/:id`, `PATCH /riders/:id/password`). `riders.view` is also what
the delivery screen needs to offer a rider list when assigning; the assignment
itself needs `delivery.manage`. A rider holds no permissions: a `RIDER` can only
use the `/rider/*` endpoints for deliveries assigned to them. See `20-partner-app.md`.

## 6.13 Payment Permissions

```text
payments.view
payments.manage
```

`payments.manage` guards the payment-status update endpoint (`05-api-specification.md`, §22) and should be treated as at least as sensitive as `orders.manage`.

## 6.14 Admin Partner Permissions

These are platform-level areas, not brand permissions. They are ticked per
partner by the Super Admin (`docs/21-next-features-plan.md` §G) and checked by
`requireAdminPermission` on every platform route:

```text
admin.brands      admin.users       admin.orders      admin.reviews
admin.locations   admin.catalog     admin.settings     admin.analytics    admin.payments
```

* The Super Admin is implicitly allowed in every area.
* An `ADMIN_PARTNER` is allowed only in the areas their `AdminPartner` record
  holds, and only while that record is active.
* A partner whose record has `readOnly: true` may use read areas but every
  non-GET admin request is refused with `403 READ_ONLY`.
* Presets in the dashboard: **Full partner** (all areas) and **Read only**
  (all areas, `readOnly: true`).
* Partner management (`/admin/partners`) and the audit log (`/admin/activity`)
  are **not** delegatable: they stay with the Super Admin regardless of the
  areas ticked.

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
* Manage seller billing: invoices, payment claims and freeze overrides (v3; replaces commissions/payouts)

The Super Admin is not restricted to a single brand.

### Super Admin Scope

```text
scope = PLATFORM
```

The single-super-admin rule is unchanged: an `ADMIN_PARTNER` is a different
role with limited areas, never a second Super Admin.

---

# 7a. Admin Partner

Role:

```text
ADMIN_PARTNER
```

A delegated platform administrator, created and managed only by the Super
Admin (web: **Admin team**). It has no `brandId`; its account type is
`PLATFORM_ADMIN`, like the Super Admin.

* It holds the areas ticked on its `AdminPartner` record (§6.14) and may also
  carry `readOnly`.
* It is created with a temporary password and `mustChangePassword`; until it
  chooses a new password, only `GET /auth/me`, `PATCH /auth/password` and
  `POST /auth/logout` work (all other requests get `403 PASSWORD_CHANGE_REQUIRED`).
* Deactivating, reactivating or resetting a partner is the Super Admin's alone.
* Up to **5** active partners exist at once; deactivating one frees a seat.
* It cannot touch the Super Admin's account in any way.
* Every admin write by a partner (and by the Super Admin) is written to the
  platform audit log, visible to the Super Admin only.

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
  brandId: req.tenantBrandId
});
```

`req.tenantBrandId` is the active, server-validated brand from the session. It
is never copied from `req.body`, `req.query` or `req.params`.

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

Permissions belong to the **membership**, not to the person. An employee who
belongs to two brands has two independent permission sets. A permission granted
in Brand A has no effect in Brand B, and removing the Brand A membership does
not change the Brand B membership.

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

An employee may hold memberships in several brands. Adding an existing
employee's email to another brand attaches a membership; it does not create a
second `User` and does not copy the first brand's permissions. A person who is
a `BRAND_ADMIN`, `PICKER` or `RIDER` somewhere else is refused for now with
`409 ACCOUNT_ROLE_CONFLICT` (docs/24 §3.5).

Removing an employee means removing their membership. The last membership's
removal or an explicit account purge anonymizes the user and frees the email;
financial and audit history is never deleted (docs/24 §3.6).

### Rider

A `RIDER` account is created only by a Brand Admin, or an employee holding
`riders.create`, inside that brand. The role and brand are never client-supplied,
and a rider can never be created, edited or promoted by another rider.

### Picker

A `PICKER` account is created only by the Brand Admin (or the Super Admin) through
`POST /employees` with `role: "PICKER"`. The role and brand are never
client-supplied. A picker never holds brand-team permissions
(`PICKER_NO_PERMISSIONS`) and their permission set cannot be changed; an employee
cannot create a picker (`PICKER_CREATE_FORBIDDEN`). A picker signs in only on the
Staff app and only reaches the `/picker/*` endpoints for their own brand.

### Admin Partner

An `ADMIN_PARTNER` account is created only through the Super Admin's partner
endpoints (`POST /admin/partners`), never through public registration or any
brand endpoint. The role, permissions, read-only flag and activation are
server-controlled; a partner cannot create, edit, deactivate or reset another
partner, and cannot promote anyone to `SUPER_ADMIN` or `ADMIN_PARTNER`.

### Customer

Customers cannot change their own role.

### Service Provider

A `SERVICE_PROVIDER` account is created only through the service-provider
signup on the seller landing. It is a `SERVICE` account type with its own
`ServiceProvider` tenant, one active block and no employees in v3. The role,
`providerId` and status are server-controlled; the provider cannot promote
itself, create another provider, or act on another provider's resources. A
super admin approves, suspends, terminates or restores a provider.

Phase 2a rules:

* The owner must verify the inbox before signing in. Verification notifies the
  super admins but leaves the provider `PENDING`; only the super admin's
  approval makes it `ACTIVE` and `VERIFIED`.
* A `PENDING` provider may still sign in and edit its profile and area; it is
  simply not visible to customers. Every provider role check is
  `requireServiceTenant`, so a brand, customer or super-admin session can never
  read or edit a provider tenant through `/services/provider/*`.
* Approving is allowed from `PENDING` or `SUSPENDED`; suspending is allowed from
  `PENDING` or `ACTIVE`; terminating is allowed from `ACTIVE` or `SUSPENDED`
  and is final. Refusing a `PENDING` application sets `SUSPENDED` and marks the
  verification `REJECTED`.
* The city is fixed at signup. The provider may move the pin inside its block
  at any time, but a different block only once per UTC calendar month.
* Every status change is a super-admin action recorded in the `AdminAction`
  audit log; an `ADMIN_PARTNER` cannot change provider status.

The endpoint list is in `05-api-specification.md` §22g.

---

# 20. Protected Actions

The following actions require strict authorization:

* Changing user roles
* Creating or deactivating an `ADMIN_PARTNER`
* Changing a partner's areas or read-only flag
* Resetting an admin partner's password
* Changing employee permissions
* Creating or deleting brands
* Approving brands
* Accessing another brand's data
* Modifying order totals
* Modifying inventory quantities
* Cancelling orders administratively
* Managing platform settings
* Managing seller billing, invoices and payment claims
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

Proposing a change to an order (a substitute or a removal) additionally requires:

```text
orders.adjust
```

### Picker

A picker sees only their brand's orders waiting to be picked or already claimed
by them (`CONFIRMED` / `PROCESSING`). The picker views deliberately omit the
customer's phone number, delivery address, prices, totals and payment details;
the customer is identified by first name only. A picker can claim an order, mark
its lines, propose a change on a short line, and pack the order. They cannot see
or act on another brand's order, another picker's claimed order, or an order with
a waiting change proposal.

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
orders.adjust
orders.cancel
```

### Product Manager

```text
products.view
products.create
products.update
products.delete
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

billing.view
billing.manage
```

`billing.*` are the v3 seller-billing permissions (docs/15). They replace the
old `payouts.*` idea: the platform is paid by sellers, it does not pay them.

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

* [ ] All roles are implemented, including `PICKER`, `RIDER` and `SERVICE_PROVIDER` (v3).
* [ ] Users have appropriate role and scope information.
* [ ] A brand user acts inside one active membership (multi-brand employees choose a workspace).
* [ ] Employee permissions are stored per membership and evaluated against it.
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
