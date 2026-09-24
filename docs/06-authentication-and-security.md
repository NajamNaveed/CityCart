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
BRAND_ADMIN
BRAND_EMPLOYEE
CUSTOMER
```

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
BRAND_ADMIN
BRAND_EMPLOYEE
```

Privileged roles must only be assigned through authorized administrative workflows.

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

---

# 7. JWT Authentication

CityCart will initially use JWT authentication.

The JWT should contain only the information required for authentication and authorization, such as:

```text
userId
role
```

Brand-related identity may be included where appropriate, but the backend must still verify the user's current database state and ownership.

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
Read authentication cookie
   ↓
Verify JWT
   ↓
Extract user identity
   ↓
Load/check user if required
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
  brandId
}
```

The exact implementation may differ, but controllers must never trust arbitrary client-supplied identity information.

---

# 12. Account Status

Users should have an account status such as:

```text
isActive
```

Inactive users must not be allowed to authenticate successfully.

Super Admins may deactivate accounts where appropriate.

Deactivation must not delete historical business records.

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
  brandId: req.user.brandId
});
```

The following is unsafe for brand users:

```javascript
Order.findById(orderId);
```

if the result is returned without checking ownership.

---

# 17. Never Trust Client-Supplied Brand IDs

A user must not be able to change:

```json
{
  "brandId": "another-brand-id"
}
```

to access another tenant.

For brand users, the server should derive the brand from the authenticated user's identity.

Example:

```text
Authenticated user
       ↓
user.brandId
       ↓
Server-controlled tenant scope
```

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

Because authentication uses cookies, CSRF must be considered.

CityCart should use appropriate:

* `SameSite` cookie settings
* Trusted CORS configuration
* CSRF protection where required by the deployment architecture

State-changing requests must not rely solely on the browser automatically sending authentication cookies.

The final implementation should be tested specifically for CSRF behavior.

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
