# 06 — Authentication and Security

## 1. Purpose

This document defines CityCart's authentication, authorization security, tenant isolation, API protection, data protection, and security testing requirements.

It is the source of truth for implementing and reviewing all security-related functionality.

---

## 2. Security Objectives

CityCart must:

* Protect customer and business accounts.
* Prevent unauthorized API access.
* Prevent cross-brand data access.
* Prevent privilege escalation.
* Protect passwords and authentication tokens.
* Validate all user-controlled input.
* Protect APIs against common web attacks.
* Prevent customers or employees from modifying protected data.
* Ensure sensitive configuration is never committed to GitHub.
* Provide useful security logging without exposing sensitive information.

Security must be enforced primarily on the **backend**.

Frontend restrictions are only for user experience and must never be considered security controls.

---

# 3. Authentication Model

CityCart uses:

* JWT-based authentication
* HTTP-only cookies
* bcrypt password hashing
* Backend authentication middleware
* Role-based access control
* Permission-based authorization for employees

Primary roles:

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

`BRAND_ADMIN`, `BRAND_EMPLOYEE` and `PICKER` are brand-side roles: the first
two sign in on the web dashboard, `PICKER` on the Staff app (docs/20). `RIDER`
signs in on the Delivery app (docs/23). `SERVICE_PROVIDER` (v3, docs/24 §4)
signs in on the seller web portal and owns exactly one provider profile; it is
a separate tenant type, never a brand.

From v3, a `BRAND_EMPLOYEE` is defined by an **active membership** in a brand,
not by `User.brandId`, and may hold active memberships in several brands
(docs/24 §3.2). Authorisation always uses the membership named by the current
session; `User.brandId` is only that account's home brand.

`ADMIN_PARTNER` is a delegated platform admin introduced in October 2026
(`21-next-features-plan.md` §G): it signs in on the web admin portal, holds only
the platform areas the Super Admin ticked, and can be limited to read-only. It
is not a second Super Admin and can never manage partners or the audit log.

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

Tenant authorization additionally answers:

> Does this resource belong to the user's brand?

---

# 4. Registration

Customers can register through:

```http
POST /api/v1/auth/register
```

Required information should include:

```text
name
email
password
```

Registration requirements:

* Validate all fields.
* Normalize email addresses.
* Reject invalid email formats.
* Enforce password requirements.
* Hash passwords before storing them.
* Never store plaintext passwords.
* Prevent duplicate accounts using the unique email constraint.
* Create new users with the `CUSTOMER` role by default.

A public registration request must never be able to select:

```text
SUPER_ADMIN
ADMIN_PARTNER
BRAND_ADMIN
BRAND_EMPLOYEE
```

Privileged roles must only be assigned through authorized administrative workflows.

### Email verification

Self-service registration creates the account **unverified** and sends a
single-use link to the address:

* The token is 32 random bytes; only its SHA-256 hash is stored (`AuthToken`).
  The raw value exists only in the email link.
* The link expires after 24 hours by default (`EMAIL_VERIFY_TTL_HOURS`) and
  works once. Requesting a new link invalidates the previous one.
* Registration issues no session cookie and no app token. Sign-in is refused
  with `403` and `code: "EMAIL_NOT_VERIFIED"` **after** the password is proven,
  so the check cannot be used to discover which emails have accounts.
* Platform-created accounts (staff, riders, admins, demo seed data) are created
  verified and skip this flow.
* A self-registered brand is `PENDING` and invisible in discovery until the
  link is opened. Verification activates it only from `PENDING`, so it can
  never override a suspension or termination an admin set in the meantime.

The web and shopper app sign-in screens offer "resend verification email" when
they receive that error code.

---

# 5. Password Security

Passwords must be hashed using:

```text
bcrypt
```

The database must store only the password hash.

Example:

```text
passwordHash
```

The original password must never be stored or logged.

Password requirements should enforce a reasonable minimum length and reject obviously invalid credentials.

Authenticated Brand Admins can change their password by proving the current password. Password changes update the bcrypt hash and increment a server-side password version carried in signed sessions; older sessions fail authentication. This current-password flow is separate from the emailed reset flow and does not reuse the authenticated change-password endpoint.

### Password reset

`POST /auth/forgot-password` emails a single-use link that expires after 60
minutes (`PASSWORD_RESET_TTL_MINUTES`); `POST /auth/reset-password` sets the new
password. Reset tokens are stored hashed, only the newest token of each type is
valid, and the response to a reset request is identical whether or not the
account exists. A successful reset bumps `passwordVersion`, ending every
existing session. Opening the link also proves control of the inbox, so an
unverified account becomes verified (and a `PENDING` brand is published) by the
same step.

Future improvements may include:

* Password strength scoring
* Password history
* Breached-password checking
* Multi-factor authentication

These are not required for the initial MVP.

---

# 6. Login

Endpoint:

```http
POST /api/v1/auth/login
```

Login process:

```text
User credentials
      ↓
Validate input
      ↓
Find user
      ↓
Check account status
      ↓
Compare password with bcrypt
      ↓
Create JWT
      ↓
Set HTTP-only cookie
      ↓
Return safe user information
```

The response must never contain:

* Password
* Password hash
* JWT secret
* Internal security credentials

Invalid login attempts should return a generic authentication error rather than revealing whether an email exists.

Sign-in is portal-specific: `/auth/login` (customer), `/auth/brand/login`
(brand dashboard), `/auth/admin/login` (platform dashboard),
`/auth/staff/login` and `/auth/delivery/login` (native apps), and — from v3 —
`/auth/service/login` (seller portal, Phase 2). A brand employee with several
active memberships receives the workspace step described in §9; no session
cookie is issued until one workspace is chosen.

---

# 7. JWT Authentication

CityCart will initially use JWT authentication.

The JWT should contain only the information required for authentication and authorization, such as:

```text
userId
role
```

Brand staff sessions additionally carry:

```text
brandId        the active membership's brand (v3 workspace selection)
membershipId   the Employee row backing it
```

Native app tokens carry the `client` mark described in §9. Brand-related
identity may be included, but the backend must still verify the user's current
database state, the membership's active state and ownership on every request.
A forged or stale `brandId` is refused, never trusted.

JWTs must not contain sensitive information such as:

* Passwords
* Payment information
* Personal secrets
* Password hashes

The JWT secret must be stored in an environment variable.

Example:

```env
JWT_SECRET=...
```

It must never be committed to GitHub.

---

# 8. HTTP-Only Cookies

Authentication tokens should be stored in HTTP-only cookies.

Recommended production configuration:

```text
httpOnly: true
secure: true
sameSite: appropriate production setting
```

During local development, `secure` may need to be disabled when using plain HTTP.

The exact cookie configuration must be centralized rather than duplicated throughout the codebase.

Example conceptual cookie:

```text
admin_token / auth_token
```

The final cookie name should be standardized during implementation.

Two cookie lifetimes exist on the same standardized name:

* Shoppers (customers): the full session length.
* Dashboard staff (brand admin, employees, platform admin): a short-lived cookie — see §9.

The lifetime is selected per role at the moment the cookie is set; the configuration itself stays centralized.

---

# 9. Token Lifecycle

For the MVP, CityCart may use a short-lived JWT stored in an HTTP-only cookie.

Example:

```text
Login
  ↓
JWT issued
  ↓
HTTP-only cookie
  ↓
Authenticated requests
  ↓
JWT expires
  ↓
User logs in again
```

A refresh-token system can be introduced later if the application requires long-lived sessions.

If refresh tokens are introduced, they must be:

* Rotated
* Revocable
* Stored securely
* Protected against replay attacks

### Staff Session Security (added October 2026)

Dashboard staff — brand admins, brand employees, the super admin and admin
partners — have stricter session rules than shoppers. A shopper's session
persists for the standard configured lifetime; a staff member's session is
short-lived, renewed on activity, and bound to their browser tab.

* Short-lived staff cookie: the brand and platform admin logins (and brand
  employee sign-ins) set the auth cookie with a short lifetime
  (`STAFF_SESSION_HOURS`, default 8 hours). The JWT expiry matches the
  cookie. Shoppers keep the full-length cookie.
* Sliding renewal: every authenticated staff request re-issues the staff
  cookie and token with a fresh lifetime, so an active staff member is never
  logged out mid-work. An idle or stolen staff cookie still expires within
  hours. Customer responses never re-issue their cookie.
* Per-tab binding: the dashboards keep a marker in the browser's
  `sessionStorage` (which lives and dies with the tab) from the moment a
  staff member signs in. When a staff session is restored into a tab that
  never signed in — the tab was closed and reopened, or the cookie was used
  from another tab — the client signs the session out server-side and asks
  for credentials again. Closing the dashboard tab therefore always ends the
  session.
* Shoppers are unaffected: their cookie is never re-issued mid-session and
  no per-tab marker applies to them.

The server-side short cookie is the security backstop (a stolen staff cookie
expires in hours); the client-side tab marker is what enforces "close the
tab, sign in again". Both were added together and must stay in sync.

### Workspace and membership sessions (added November 2026)

Multi-brand employees (docs/24 §3.3) choose a workspace after the password is
accepted. The session itself stays cookie-based and keeps every staff rule
above; the workspace step only decides which membership the session names.

* **One active membership** — the normal staff cookie is issued, exactly as
  before.
* **Several active memberships** — the login answers `409 WORKSPACE_REQUIRED`
  with a five-minute signed `workspaceToken` and
  `{ brandId, brandName, role }[]`. The list is produced only after a correct
  password, so it cannot be used to discover accounts. `POST /auth/workspace`
  exchanges the token and a chosen `brandId` for the normal staff cookie.
* **Switching** — `POST /auth/workspace/switch` issues a fresh staff cookie for
  another active membership without re-entering the password. The target
  membership is re-checked at that moment.
* **Token claims** — a brand session carries `brandId`, `membershipId` and
  `role`. The tenant for every request is the membership named by these
  claims, never `User.brandId` and never a body/query value.
* **Revocation** — removing a membership (or deactivating it) makes the next
  request with that brand's session fail before any controller runs. A
  workspace token is short-lived and is refused once its membership is no
  longer active.
* **Service providers** — the seller portal session for `SERVICE_PROVIDER` uses
  the same staff cookie rules and carries the provider id as its tenant; it
  never carries a `brandId`. A provider session cannot call brand endpoints,
  and a brand session cannot call provider endpoints.

### Native App Sessions (added October 2026)

The shopper mobile app (docs/19) cannot use the browser's HTTP-only cookie, so
it carries its session as a bearer token. The rules keep the web's protection
intact and keep the native door as narrow as possible:

* The token is returned in the login/registration response **only** when the
  request carries `X-Client: mobile`. The web app never sends that header, so
  it never receives a token in a response body; no cookie is set for the app.
* The app sends the token as `Authorization: Bearer <token>`. It is the same
  JWT with the same expiry, and it goes through exactly the same checks as the
  cookie on every request: signature and expiry, the user loaded fresh from the
  database, `isActive`, and the `passwordVersion` revocation check.
* **Shoppers only, on the shopper door.** `/auth/brand/login` and
  `/auth/admin/login` refuse `X-Client: mobile` outright (before any credential
  lookup), and a markless Bearer token belonging to a brand admin, brand
  employee or platform admin is refused (`403 WEB_ONLY` / `403 WRONG_APP`).
  Staff sessions stay on the web, where they are short-lived, renewed and
  bound to the tab, unless the account holds one of the app roles below.
* **App roles (October 2026; business app added November 2026).** The four
  native apps have their own doors:
  * the shopper app signs in at `POST /auth/login` with `X-Client: mobile`, and
    its token has no `client` mark;
  * the Staff app (docs/20) signs in at `POST /auth/staff/login` with
    `X-Client: staff`; only `BRAND_EMPLOYEE` and `PICKER` accounts can, and the
    token carries `client: "staff"`;
  * the Delivery app (docs/23) signs in at `POST /auth/delivery/login` with
    `X-Client: delivery`; only `RIDER` accounts can, and the token carries
    `client: "delivery"`;
  * the Business app (docs/20 §3) signs in at
    `POST /auth/business/brand/login` or
    `POST /auth/business/service/login` with `X-Client: business`; only
    `BRAND_ADMIN` and `SERVICE_PROVIDER` accounts can, respectively, and the
    token carries `client: "business"`.

  Every app token lasts one staff session and is renewed by signing in again
  (no sliding renewal). On every Bearer request the mark is checked against the
  account's role: a staff token is refused for riders and owners, a delivery
  token is refused for staff and owners, a business token is refused for
  everyone except brand and provider owners, a markless token is refused for
  every non-shopper account, and every app token is refused for the super admin
  (`403 WEB_ONLY`) and shoppers (`403 WRONG_APP`). Calling an app's sign-in
  endpoint without its own `X-Client` header is refused before any credential
  lookup
  (`STAFF_APP_ONLY`, `DELIVERY_APP_ONLY`, `BUSINESS_APP_ONLY`). Platform admins
  remain web-only. All the checks above still apply on every request.
* A `Bearer` header with no usable token is a `401`, never silently ignored.
  Other schemes (for example `Basic`, which some hosting adds) are not ours
  and are ignored so the cookie session keeps working.
* The app stores the token in the device's secure storage (Keychain /
  Keystore), never in plain storage, and deletes it on sign-out. A token
  cannot be revoked individually: it ends at its expiry, when the account is
  deactivated, or when the password version changes.
* Bearer requests are not vulnerable to CSRF (§25): the token is attached
  explicitly by the app, never sent automatically by a browser.

---

# 10. Logout

Endpoint:

```http
POST /api/v1/auth/logout
```

Logout should clear the authentication cookie.

The server must use the same cookie configuration required to correctly remove the authentication cookie.

---

# 11. Authentication Middleware

Protected routes must use authentication middleware.

Conceptual flow:

```text
Request
   ↓
Read authentication cookie or Bearer token
   ↓
Verify JWT
   ↓
Extract user identity
   ↓
Load/check user (isActive, passwordVersion, app role)
   ↓
Resolve the active membership / tenant (v3)
   ↓
Attach authenticated user to request
   ↓
Continue
```

Example conceptual request state:

```javascript
req.user = {
  id,
  role,
  brandId,        // active brand for a brand session
  providerId,     // active provider for a SERVICE_PROVIDER session
  membershipId    // Employee row backing a brand session
}
req.membership = { id, brandId, role, permissions }
req.tenantType = 'BRAND' | 'SERVICE'
```

The exact implementation may differ, but controllers must never trust arbitrary client-supplied identity information.

### Membership resolution (v3)

For a `BRAND_EMPLOYEE`, `authenticate` loads the `Employee` named by
`(userId, token.brandId)` and requires it to be active. A missing, inactive or
wrong-brand membership is refused (`401`/`403`); the request is never silently
downgraded to the user's home brand. `req.user.brandId` and
`req.tenantBrandId` are set from that validated membership, and
`requirePermission` loads the same membership by `(userId, brandId)`.
`BRAND_ADMIN`, `PICKER` and `RIDER` keep the existing single-brand check.

`requireTenant` sets `req.tenantType = 'BRAND'`. The v3 `requireServiceTenant`
middleware resolves `req.tenantProviderId` from a `SERVICE_PROVIDER` session
and never from the request body. The two tenant middlewares are mutually
exclusive: one request has one tenant type.

### Forced password change

A newly created or password-reset admin partner carries
`mustChangePassword: true`. After the user is loaded, the middleware refuses
every request except `GET /auth/me`, `PATCH /auth/password` and
`POST /auth/logout` with:

```json
{ "success": false, "message": "Choose a new password before using the dashboard.", "code": "PASSWORD_CHANGE_REQUIRED" }
```

Changing the password clears the flag and rotates `passwordVersion` (which also
invalidates every existing session). This is how the temporary password the
Super Admin handed over stops being usable.

---

# 12. Account Status

Users should have an account status such as:

```text
isActive
```

Inactive users must not be allowed to authenticate successfully.

Super Admins may deactivate accounts where appropriate.

Deactivation must not delete historical business records.

### Account status vs membership status (v3)

Two independent switches exist for brand staff:

```text
User.isActive        the person's account
Employee.isActive    one membership in one brand
```

Both must be true for a brand request to proceed. Removing a person from one
brand deactivates only that membership; the account and any other active
memberships keep working. Deactivating the account stops every brand at once.
An account is never hard-deleted: removal of the last membership offers
**anonymization** (docs/24 §3.6 and docs/04 §36) — the email is freed for
re-registration while the `_id` and all financial/audit history stay intact.
Removal and purge revoke that brand's sessions, push tokens and queued
notifications before they answer.

---

# 13. Authorization

Authentication alone is insufficient.

Protected operations must verify:

```text
Authentication
+
Role / Permission
+
Resource Ownership
+
Tenant Ownership
```

Example:

A Brand Employee requesting:

```http
GET /api/v1/orders/ORDER_ID
```

must not receive an order simply because they are authenticated.

The backend must verify:

```text
Employee belongs to Brand A
AND
Employee has orders.view permission
AND
Order belongs to Brand A
```

---

# 14. Role-Based Access Control

CityCart uses RBAC for the primary roles.

Example:

```text
SUPER_ADMIN
    ↓
Platform-wide access

BRAND_ADMIN
    ↓
Own brand access

BRAND_EMPLOYEE
    ↓
Own brand + assigned permissions

CUSTOMER
    ↓
Own customer resources
```

Role checks must happen on the backend.

### Admin partner areas

An `ADMIN_PARTNER` passes the role check for the admin portal, then a second
check (`requireAdminPermission`) decides each request:

```text
Is the user the SUPER_ADMIN?          → allowed everywhere
Is the AdminPartner record active?    → otherwise 403 ADMIN_PARTNER_INACTIVE
Does it hold the endpoint's area?     → otherwise 403 PERMISSION_DENIED + permission
Is this a write while readOnly?       → otherwise 403 READ_ONLY
```

The record is reloaded on every request, so deactivating or editing a partner
takes effect immediately, without waiting for a token to expire. Partner
management and the audit log accept the `SUPER_ADMIN` role only — no area can
open them.

---

# 15. Employee Permissions

Brand Employees use granular permissions.

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

customers.view

employees.view
employees.create
employees.update
employees.delete
employees.manage_permissions
```

A permission must not grant access outside the employee's brand.

For example:

```text
orders.view
```

means:

> View permitted orders belonging to this employee's brand.

It does **not** mean:

> View every order in CityCart.

---

# 16. Multi-Tenant Security

Every brand is a logical tenant.

Brand-owned resources must contain a reliable brand reference.

Examples:

```text
Product → brandId
Order → brandId
Category → brandId
Store → brandId
Employee → brandId
Inventory → brandId
```

Backend queries must enforce tenant boundaries.

Example concept:

```javascript
Order.findOne({
  _id: orderId,
  brandId: req.tenantBrandId
});
```

`req.tenantBrandId` is set by the tenant middleware from the validated active
membership, never from the request body. The following is unsafe for brand
users:

```javascript
Order.findById(orderId);
```

if the result is returned without checking ownership.

Service providers are a second, separate tenant type (docs/24 §4). Their
resources carry `providerId`, their queries scope to `req.tenantProviderId`,
and a provider can never read a brand resource or another provider's records.
The union of the two tenant types is not a valid scope: a request is either a
brand request or a provider request.

Phase 2a implements this with `requireServiceTenant`, which refuses every role
except `SERVICE_PROVIDER` before the controller runs. The signup endpoint is
public but rate-limited, and it never accepts role, status, verification,
`providerId` or `brandId` from the client; those are derived by the server.
The provider id used by every `/services/provider/*` request comes only from
the validated session.

Email verification and admin approval are deliberately separate for providers:
proving the inbox is required to sign in and triggers a super-admin
notification, but it does not change the provider's `PENDING` status. Only the
super admin's `PATCH /admin/providers/:id/status` approves it, and that endpoint
is unavailable to `ADMIN_PARTNER`. The one-block-per-month rule is enforced in
the service layer against `blockChangedAt` (`409 BLOCK_CHANGE_LIMIT`), not only
hidden in the dashboard.

---

# 17. Never Trust Client-Supplied Brand IDs

A user must not be able to change:

```json
{
  "brandId": "another-brand-id"
}
```

to access another tenant.

For brand users, the server should derive the brand from the authenticated
session.

Example:

```text
Authenticated user
       ↓
active membership (validated session brandId)
       ↓
req.tenantBrandId
       ↓
Server-controlled tenant scope
```

A multi-brand employee therefore acts in exactly one brand per session: the
one chosen at workspace login or switch. The client may not submit `brandId`
to select a tenant, and a workspace switch goes through its own endpoint
rather than a field on ordinary requests.

Client-provided `brandId` values must be ignored or strictly validated where appropriate.

---

# 18. Customer Data Isolation

Customers may access:

* Their profile
* Their addresses
* Their cart
* Their orders
* Their reviews
* Their notifications

A customer must not access another customer's:

* Orders
* Addresses
* Personal information
* Cart
* Account settings

Every customer-owned resource must be checked against the authenticated customer ID.

---

# 19. Input Validation

All API input must be validated.

Validation must cover:

* Request body
* URL parameters
* Query parameters
* File metadata
* Pagination values
* Sorting fields
* Filtering fields

CityCart will use:

```text
Zod
```

for request validation where appropriate.

Invalid input should be rejected before business logic executes.

---

# 20. MongoDB / NoSQL Injection Protection

User-controlled values must never be directly trusted inside MongoDB queries.

The application must prevent malicious query operators such as:

```text
$gt
$ne
$regex
$where
```

from being unintentionally injected through request data.

Use validation, sanitization, controlled query construction, and strict schemas.

---

# 21. ObjectId Validation

Routes accepting MongoDB IDs must validate them before querying.

Example:

```http
GET /api/v1/products/:productId
```

Invalid IDs should return an appropriate client error rather than causing an uncontrolled database exception.

---

# 22. Rate Limiting

Rate limiting must be applied to sensitive endpoints.

Priority endpoints include:

```text
POST /auth/login
POST /auth/register
POST /auth/forgot-password
```

and other abuse-sensitive endpoints.

Rate limits should help prevent:

* Brute-force attacks
* Credential stuffing
* Excessive registration
* API abuse

---

# 23. Security Headers

The backend should use:

```text
Helmet
```

to configure common HTTP security headers.

Security headers should be reviewed before production deployment.

---

# 24. CORS

CORS must allow only trusted frontend origins.

Development may use:

```text
http://localhost:5173
```

Production should use the deployed CityCart frontend domain.

The backend must not use unrestricted:

```text
Access-Control-Allow-Origin: *
```

when authenticated cookies are involved.

---

# 25. CSRF Protection

Because authentication uses cookies, CSRF must be considered. (Native app requests authenticate with an explicit `Authorization` header instead, which a browser never adds on its own, so they are not affected; see §9, Native App Sessions.)

Production cookies are `SameSite=None; Secure` because the website and API are on
different domains (docs/17 §15), so `SameSite` alone cannot block a cross-site
write. CORS blocks *reads* from foreign origins, not the request itself.

The implementation is an origin guard for unsafe methods:

```text
server/src/middleware/csrfGuard.js
mounted after cookieParser in server/src/app.js
```

For `POST`, `PUT`, `PATCH` and `DELETE`:

* if `Origin` is present it must be in the CORS allow-list (`config/cors.js`);
* otherwise, if `Referer` is present its origin must be in the allow-list;
* if neither header is present the request is allowed, because native apps and
  server-to-server callers do not send them and cannot be driven by a browser.

A refused request answers `403` with `code: "CSRF_ORIGIN"`.

Tests: `server/tests/hardening.test.js` covers a foreign Origin, an allowed
Origin, no Origin, the Referer fallback, a safe `GET`, and `Origin: null`.

A browser too old to send `Origin` on a form POST would bypass the guard; every
browser in the support matrix sends it. Phase 9 recorded this residual risk in
docs/26 §9.

---

# 26. XSS Protection

User-generated content may include:

* Product descriptions
* Reviews
* Brand information
* Store information

The application must safely render user-controlled content.

React's default escaping should be preserved.

Dangerous HTML rendering such as unrestricted:

```text
dangerouslySetInnerHTML
```

must not be used without sanitization and a documented reason.

---

# 27. File Upload Security

Product and brand images may be uploaded through Cloudinary.

Uploads must validate:

* File type
* File size
* File extension
* MIME type where possible

The application should reject executable or unexpected file types.

Uploaded files must not be treated as trusted executable content.

---

# 28. Sensitive Environment Variables

Secrets must be stored in environment variables.

Examples:

```env
MONGODB_URI=
JWT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
BREVO_API_KEY=
EMAIL_FROM=
```

Never commit:

```text
.env
.env.local
production secrets
API secrets
private keys
database credentials
```

`.gitignore` must protect environment files.

---

# 29. Error Handling

Production errors must not expose:

* Stack traces
* Database credentials
* JWT secrets
* Internal file paths
* Sensitive database information

API errors should use a consistent structure.

Example:

```json
{
  "success": false,
  "message": "You are not authorized to perform this action."
}
```

Detailed technical errors should be logged server-side rather than returned to clients.

---

# 30. Security Logging and Auditing

Security-relevant events should be logged where appropriate.

Examples:

```text
Login success/failure
Account deactivation
Role changes
Employee permission changes
Important order actions
Brand configuration changes
Administrative actions
```

Logs must never contain passwords or authentication secrets.

A dedicated `AuditLog` collection may be introduced as the system grows.

---

# 31. Privilege Escalation Prevention

Users must not be able to modify their own:

```text
role
brandId
permissions
isActive
```

through ordinary profile update endpoints.

For example, this must not be accepted from a customer:

```json
{
  "role": "SUPER_ADMIN"
}
```

Sensitive fields must be controlled by dedicated administrative operations.

---

# 32. API Security Rules

Every protected endpoint must define:

```text
Authentication requirement
Role requirement
Permission requirement
Tenant requirement
Ownership requirement
Validation requirement
```

Before implementation, these requirements should be documented in the API specification.

---

# 33. Security Testing

Security testing must include at minimum:

### Authentication

* Invalid login
* Wrong password
* Expired JWT
* Missing authentication cookie
* Logout
* Inactive account

### Membership and workspace (v3)

* Employee removed from a brand mid-session: the next request is refused
* Session token naming a brand the user no longer belongs to
* Workspace token reused after its membership is deactivated
* Workspace switch to a brand with no active membership
* A brand session cannot act as another brand by changing a body/query id
* A provider session cannot call brand endpoints, and the reverse
* Re-adding an employee email after removal vs after anonymization

### Authorization

* Customer accessing another customer's order
* Employee without permission
* Brand Admin accessing another brand
* Employee accessing another brand
* Customer accessing admin endpoints

### Tenant Isolation

Test:

```text
Brand A → Brand A resource = allowed
Brand A → Brand B resource = denied
```

This must be tested for:

* Products
* Orders
* Inventory
* Categories
* Employees
* Store settings
* Customer-related brand data
* Service providers, offerings, bookings and reviews (v3)

### Seller billing (v3)

* Invoice and payment-claim tampering (amount, period, seller)
* Freeze bypass through an endpoint other than Billing/Help
* Commission manipulation through order or booking edits
* Receipt upload access and retention

The v3 security baseline (Phase 1) and the independent audit (Phase 9) are
listed in docs/24 §8. This section remains the minimum for every feature.

### Input Security

Test:

* Invalid ObjectIds
* Malicious query operators
* Invalid pagination
* Invalid sorting
* Unexpected fields
* Oversized inputs

### API Security

Test:

* Rate limits
* CORS
* Authentication cookies
* CSRF behavior
* Security headers

The Phase 9 suite adds two structural tests that must stay green:

* `server/tests/authorizationMatrix.test.js` walks the real router and fails if
  any of the 236 guarded routes stops refusing a signed-out or malformed token,
  or if the 41 public routes change without a decision in that file.
* `server/tests/hardening.test.js` covers the CSRF origin guard, and
  `server/tests/brands.test.js` / `marketplace.test.js` cover public field
  allow-lists. The full report is `docs/26-security-audit.md`.

---

# 34. Production Security Checklist

Before production deployment:

```text
[ ] Strong JWT secret configured
[ ] Production MongoDB credentials secured
[ ] HTTPS enabled
[ ] Secure cookies enabled
[ ] HTTP-only cookies enabled
[ ] Correct SameSite configuration
[ ] CORS restricted
[ ] Helmet enabled
[ ] Rate limiting enabled
[ ] Input validation enabled
[ ] MongoDB query protection reviewed
[ ] File upload validation enabled
[ ] Environment secrets excluded from Git
[ ] Error responses sanitized
[ ] Security logging enabled
[ ] Tenant isolation tested
[ ] RBAC tested
[ ] Privilege escalation tested
[ ] Membership revocation tested (removed employee loses access immediately)
[ ] Workspace selection cannot cross tenants
[ ] Service-provider tenant isolated from brand tenant
[ ] Seller invoices and claims tamper-tested
[ ] Password, token and bank-detail log redaction verified
[ ] CSRF origin guard enabled (SameSite=None in production)
[ ] Public brand, storefront and provider fields allow-listed
[ ] Authorization matrix suite green (all guarded routes refuse signed out)
[ ] Production dependency audit reviewed (docs/26 §8)
[ ] Backup strategy configured
```

---

# 35. AI Implementation Rules

AI coding agents must:

1. Read this document before modifying authentication or security code.
2. Never weaken an existing security control without explicit approval.
3. Never introduce plaintext password storage.
4. Never expose JWT secrets.
5. Never bypass tenant checks.
6. Never trust client-supplied roles or brand IDs.
7. Add tests for new authorization rules.
8. Clearly report security-sensitive architectural changes.
9. Avoid unrelated security refactoring during feature implementation.
10. Treat backend authorization as the final security boundary.

If an implementation conflicts with this document, the agent must report the conflict before changing the documented architecture.

---

# 36. Acceptance Criteria

Authentication and security are considered implemented when:

* Users can securely register and log in.
* Passwords are bcrypt-hashed.
* JWT authentication works through HTTP-only cookies.
* Logout invalidates the authentication cookie.
* Protected routes require authentication.
* RBAC is enforced server-side.
* Employee permissions are enforced.
* Brand tenant isolation is enforced.
* Customers can access only their own resources.
* Privileged fields cannot be modified by ordinary users.
* API input is validated.
* Rate limiting protects sensitive endpoints.
* Helmet and CORS are configured.
* Sensitive environment variables are protected.
* Security errors do not expose internal information.
* Security tests cover authentication, authorization, and tenant isolation.

---

# 37. Source-of-Truth Rule

This document is the authoritative security specification for CityCart.

If implementation, AI-generated code, or another document conflicts with this specification, the conflict must be identified and resolved before implementation continues.

Security requirements must never be silently weakened.

---

## Next Document

**07-marketplace.md — Marketplace and Shopping Experience**
