# CityCart — System Architecture

**Document:** `03-system-architecture.md`
**Status:** Approved for implementation
**Version:** 1.0

---

## 1. Purpose

This document defines the technical architecture of CityCart.

It establishes:

* Application architecture
* Frontend/backend separation
* Database architecture
* API structure
* Authentication flow
* Multi-tenant architecture
* Module boundaries
* Data flow
* External services
* Security boundaries
* Deployment architecture
* Development principles

This document should be treated as the technical blueprint for implementation.

---

# 2. Architecture Overview

CityCart will use a modular full-stack architecture:

```text
                    ┌──────────────────────┐
                    │      Customer        │
                    │    Web Application   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      React/Vite      │
                    │      Frontend        │
                    └──────────┬───────────┘
                               │ HTTPS / REST API
                    ┌──────────▼───────────┐
                    │    Node.js + Express │
                    │       Backend        │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼─────┐
       │  MongoDB    │  │  Cloudinary │  │ Socket.IO │
       │  Database   │  │   Storage   │  │ Realtime  │
       └─────────────┘  └─────────────┘  └───────────┘
```

The application will initially be a modular monolith rather than a microservices architecture.

---

# 3. Architecture Style

CityCart will use a:

> **Modular Monolith with REST APIs**

This means the application runs as a single backend application while its functionality is separated into well-defined modules.

Example:

```text
Backend
├── Auth
├── Users
├── Cities
├── Brands
├── Stores
├── Products
├── Categories
├── Inventory
├── Cart
├── Orders
├── Payments
├── Delivery
├── Employees
├── Reviews
├── Notifications
└── Analytics
```

This approach keeps initial development simpler while maintaining clear boundaries for future scaling.

---

# 4. Why Modular Monolith

CityCart does not initially require independent microservices.

A modular monolith provides:

* Simpler development
* Easier local setup
* Lower deployment complexity
* Lower infrastructure cost
* Easier database transactions
* Easier debugging
* Faster MVP development

If individual modules eventually require independent scaling, they can be extracted into services later.

The architecture must therefore avoid tightly coupling unrelated modules.

---

# 5. Main Applications

CityCart consists of three primary application layers:

```text
Frontend
Backend
Database
```

Additional infrastructure services support these layers.

---

# 6. Frontend Architecture

## Technology

The frontend will use:

* React
* Vite
* Tailwind CSS
* React Router
* Axios
* React Hook Form
* Zod
* Recharts
* Lucide React

The frontend will contain interfaces for:

```text
Customer
Brand Admin
Brand Employee
Super Admin
```

---

# 7. Frontend Structure

The frontend should be organized by responsibility.

Recommended structure:

```text
client/
├── src/
│   ├── assets/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── features/
│   ├── hooks/
│   ├── services/
│   ├── context/
│   ├── utils/
│   ├── routes/
│   ├── schemas/
│   └── App.jsx
```

Feature-specific code should remain close to the feature where practical.

Example:

```text
features/
├── auth/
├── products/
├── cart/
├── orders/
├── inventory/
├── employees/
└── reviews/
```

---

# 8. Frontend Responsibilities

The frontend is responsible for:

* Rendering interfaces
* Navigation
* Form handling
* Client-side validation
* API communication
* Displaying API responses
* Managing UI state
* Permission-aware UI
* Loading/error states
* Customer shopping experience
* Dashboard interfaces

The frontend must **not** be responsible for enforcing security.

---

# 9. Backend Architecture

The backend will use:

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT
* bcrypt
* Zod
* Helmet
* CORS
* Rate limiting
* Socket.IO

The backend is responsible for:

* Authentication
* Authorization
* Business logic
* Data validation
* Tenant isolation
* Database operations
* Order processing
* Inventory validation
* Payment processing
* Notifications
* Security enforcement

---

# 10. Backend Layering

Backend modules should generally follow:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository / Model
  ↓
Database
```

Example:

```text
POST /api/v1/products
        ↓
Product Route
        ↓
Product Controller
        ↓
Product Service
        ↓
Product Model
        ↓
MongoDB
```

Controllers should remain thin.

Business rules should primarily live in services rather than being duplicated across controllers.

---

# 11. Backend Directory Structure

Recommended structure:

```text
server/
├── src/
│   ├── config/
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── cities/
│   │   ├── brands/
│   │   ├── stores/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── inventory/
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── delivery/
│   │   ├── employees/
│   │   ├── reviews/
│   │   ├── notifications/
│   │   └── analytics/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── tests/
└── package.json
```

Each module should contain only the code required for that domain.

Example:

```text
products/
├── product.model.js
├── product.routes.js
├── product.controller.js
├── product.service.js
├── product.validation.js
└── product.test.js
```

---

# 12. API Architecture

CityCart will expose versioned REST APIs.

Base URL:

```text
/api/v1
```

Examples:

```text
/api/v1/auth
/api/v1/users
/api/v1/cities
/api/v1/brands
/api/v1/products
/api/v1/categories
/api/v1/cart
/api/v1/orders
/api/v1/inventory
```

API versioning allows future changes without immediately breaking existing clients.

---

# 13. Request Lifecycle

A typical protected request follows:

```text
Client
  ↓
HTTPS
  ↓
Express
  ↓
Security Middleware
  ↓
Authentication
  ↓
Authorization
  ↓
Validation
  ↓
Controller
  ↓
Service
  ↓
Database
  ↓
Response
```

For brand-owned resources:

```text
Authentication
       ↓
Permission Check
       ↓
Brand/Tenant Check
       ↓
Resource Ownership Check
       ↓
Business Logic
```

---

# 14. Authentication Architecture

CityCart will use JWT-based authentication.

Recommended model:

```text
Access Token
+
HTTP-only Cookie
```

Authentication flow:

```text
Login
  ↓
Validate credentials
  ↓
Verify password
  ↓
Generate JWT
  ↓
Set secure HTTP-only cookie
  ↓
Client requests protected API
  ↓
Server verifies JWT
```

Passwords must never be stored in plaintext.

They must be hashed using a secure password hashing algorithm such as bcrypt.

---

# 15. Authorization Architecture

Authentication and authorization are separate responsibilities.

```text
Authentication
→ Who is the user?

Authorization
→ What can the user do?
```

Authorization checks:

```text
User
 ↓
Role
 ↓
Permission
 ↓
Brand Scope
 ↓
Resource Ownership
```

The complete RBAC rules are defined in:

```text
docs/02-user-roles-and-permissions.md
```

---

# 16. Multi-Tenant Architecture

CityCart uses a shared database with logical tenant isolation.

Each brand represents a tenant.

Example:

```text
Brand A
 ├── Products
 ├── Categories
 ├── Inventory
 ├── Orders
 └── Employees

Brand B
 ├── Products
 ├── Categories
 ├── Inventory
 ├── Orders
 └── Employees
```

The same MongoDB deployment may contain all brands.

Isolation is enforced through application-level authorization and query filtering.

---

# 17. Tenant Identification

For authenticated brand users, the server obtains the tenant from the authenticated user's trusted identity information.

Example:

```text
req.user.brandId
```

The server should not trust:

```text
req.body.brandId
```

for authorization.

When creating brand-owned resources, the backend should derive the `brandId` from the authenticated context whenever appropriate.

---

# 18. Database Architecture

MongoDB will be the primary database.

Mongoose will provide:

* Schema definitions
* Validation
* Relationships/references
* Query helpers
* Indexes
* Middleware where appropriate

Primary collections include:

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

Detailed schemas will be defined in:

```text
docs/04-database-design.md
```

---

# 19. Data Ownership

Resources should have clear ownership.

Example:

```text
Product
 └── brandId

Category
 └── brandId

Employee
 └── brandId

Order
 └── brandId
```

Platform-level resources such as cities may not belong to a brand.

---

# 20. Shopping Architecture

The customer shopping flow is:

```text
Browse City
    ↓
Browse Brands
    ↓
Browse Products
    ↓
Add to Cart
    ↓
Review Cart
    ↓
Checkout
    ↓
Create Brand Orders
    ↓
Order Processing
    ↓
Delivery
    ↓
Completed Order
```

The cart may contain products from multiple brands.

---

# 21. Multi-Brand Checkout

A customer's cart can contain:

```text
Brand A
 ├── Product 1
 └── Product 2

Brand B
 ├── Product 3
 └── Product 4
```

At checkout, the backend splits the cart into separate brand orders:

```text
Order #1001
Brand A
Products 1, 2

Order #1002
Brand B
Products 3, 4
```

Each order maintains its own:

* Brand
* Items
* Pricing
* Inventory impact
* Order status
* Delivery information

The customer can view these orders together as part of their checkout experience.

---

# 22. Pricing Responsibility

The client must never be trusted for final pricing.

The backend calculates:

```text
Product price
× Quantity
+ Applicable delivery fees
+ Applicable taxes/fees
− Valid discounts
= Final total
```

The server validates product availability and pricing during checkout.

---

# 23. Inventory Architecture

Inventory belongs to a product/brand context.

Typical flow:

```text
Product
   ↓
Inventory
   ↓
Customer Checkout
   ↓
Stock Validation
   ↓
Stock Reservation/Reduction
   ↓
Order
```

Inventory operations must be protected against unauthorized changes.

The system should prevent negative stock unless a deliberate future business rule allows it.

---

# 24. Order Architecture

Orders are created by the backend after successful checkout validation.

Initial lifecycle:

```text
PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
READY_FOR_SHIPMENT
   ↓
SHIPPED
   ↓
OUT_FOR_DELIVERY
   ↓
DELIVERED
```

Alternative states:

```text
CANCELLED
REJECTED
RETURN_REQUESTED
RETURNED
REFUNDED
```

The exact transition rules will be defined in:

```text
docs/08-order-management.md
```

---

# 25. Payment Architecture

The MVP will initially support:

```text
Cash on Delivery
```

The payment module should nevertheless be designed around a payment abstraction.

Conceptually:

```text
Order
  ↓
Payment Service
  ↓
Payment Provider
```

This allows future integration with online payment gateways without redesigning the order system.

---

# 26. File Storage

Product and brand images will use external object/media storage.

Initial recommendation:

```text
Cloudinary
```

The backend should store media references/URLs rather than large image files directly inside MongoDB.

Example:

```text
Product
 ├── name
 ├── price
 └── images[]
```

---

# 27. Real-Time Architecture

Socket.IO may be used for real-time events.

Potential uses:

* Order status updates
* New order notifications
* Brand dashboard alerts
* Inventory alerts
* Admin notifications

Example:

```text
Order status changed
        ↓
Backend
        ↓
Socket.IO
        ↓
Relevant customer/brand clients
```

Real-time functionality must still respect authorization and tenant boundaries.

---

# 28. Notification Architecture

Notifications should be represented as a separate module.

Initial implementation:

```text
In-app notifications
```

Future channels may include:

```text
Email
SMS
WhatsApp
Push Notifications
```

Notification delivery should not be tightly coupled to core business logic.

---

# 29. Search Architecture

Initial search will use MongoDB capabilities.

Search may support:

* Product name
* Category
* Brand
* City
* Price
* Availability

Indexes should be added for frequently queried fields.

A dedicated search engine may be introduced later if search requirements become more complex.

---

# 30. Security Architecture

The backend should implement:

* HTTPS in deployment
* Helmet
* CORS configuration
* Rate limiting
* Input validation
* Password hashing
* HTTP-only cookies
* JWT verification
* RBAC
* Tenant isolation
* Ownership checks
* Secure error handling
* Environment variables for secrets

Sensitive values must never be committed to Git.

Example:

```text
.env
```

must be excluded through `.gitignore`.

---

# 31. Validation

Validation occurs at multiple levels.

### Client-side

Used for:

* User experience
* Early feedback
* Form validation

### Server-side

Used for:

* Security
* Data integrity
* Business rules

Server-side validation is mandatory even when the frontend validates the same data.

Zod will be used where appropriate for request validation.

---

# 32. Error Handling

The backend should use a centralized error-handling strategy.

API responses should follow a consistent structure.

Example:

```json
{
  "success": false,
  "message": "Product not found"
}
```

Successful responses should follow the same general convention.

Detailed error formats will be finalized in the API specification document.

---

# 33. Logging

The backend should provide structured application logging.

Logs may include:

* Request information
* Authentication events
* Errors
* Important business events
* Database failures
* Security events

Logs must not expose:

* Passwords
* JWT secrets
* Sensitive tokens
* Payment secrets
* Unnecessary customer information

---

# 34. Configuration Management

Environment-specific configuration must be stored through environment variables.

Examples:

```text
NODE_ENV
PORT
MONGODB_URI
JWT_SECRET
CLIENT_URL
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Secrets must never be hardcoded in source code.

---

# 35. Deployment Architecture

Initial deployment:

```text
                 Internet
                    │
          ┌─────────▼─────────┐
          │      Vercel       │
          │ React Frontend    │
          └─────────┬─────────┘
                    │ HTTPS
          ┌─────────▼─────────┐
          │      Render       │
          │ Node/Express API  │
          └─────────┬─────────┘
                    │
          ┌─────────▼─────────┐
          │  MongoDB Atlas    │
          │    Database       │
          └───────────────────┘

          Cloudinary
          Media Storage
```

This setup is intended for the initial development/MVP environment and can later be upgraded as traffic grows.

---

# 36. Environment Separation

At minimum, CityCart should distinguish:

```text
Development
Testing
Production
```

Development and testing environments must not use production credentials or production data.

AI coding agents must never receive unrestricted access to production secrets or production databases.

---

# 37. Testing Architecture

Testing should occur at multiple levels.

```text
Unit Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
Authorization Tests
    ↓
End-to-End Tests
```

Critical flows should receive special coverage:

```text
Registration
Login
Product creation
Product update
Cart
Checkout
Multi-brand order splitting
Inventory updates
Order status changes
Employee permissions
Cross-brand access prevention
```

---

# 38. End-to-End Flow

The main customer flow should eventually be testable as:

```text
Register/Login
      ↓
Select City
      ↓
Browse Brand
      ↓
View Product
      ↓
Add Product to Cart
      ↓
Add Product from Another Brand
      ↓
Checkout
      ↓
Orders Split by Brand
      ↓
Brand Receives Order
      ↓
Brand Processes Order
      ↓
Customer Receives Status Updates
      ↓
Order Delivered
      ↓
Customer Reviews Product
```

---

# 39. Scalability Strategy

CityCart should scale in stages.

### Stage 1 — MVP

```text
Modular Monolith
MongoDB
REST API
React
```

### Stage 2 — Growth

Add:

* Caching
* Background jobs
* Better search
* CDN optimization
* Database optimization
* Queue-based notifications

### Stage 3 — Large Scale

Potentially extract high-load modules into independent services.

Possible candidates:

```text
Search Service
Notification Service
Payment Service
Analytics Service
Delivery Service
```

Microservices should only be introduced when operational requirements justify their complexity.

---

# 40. Architectural Principles

CityCart development must follow these principles:

### 1. Separation of Concerns

Each module should have a clear responsibility.

### 2. Security by Default

Protected resources should deny access unless explicitly authorized.

### 3. Tenant Isolation

Brand data must remain isolated.

### 4. Server Authority

The backend is the final authority for:

* Permissions
* Pricing
* Inventory
* Orders
* Ownership

### 5. Explicit Business Rules

Important business rules must be documented rather than hidden inside frontend code.

### 6. Maintainability

Prefer understandable code over unnecessary abstraction.

### 7. Testability

Business logic should be structured so it can be tested independently.

### 8. Upgradeability

The MVP architecture should allow future payment, delivery, search, and scaling improvements.

---

# 41. Architecture Decision Summary

| Decision            | Choice                  |
| ------------------- | ----------------------- |
| Architecture        | Modular Monolith        |
| Frontend            | React + Vite            |
| Styling             | Tailwind CSS            |
| Backend             | Node.js + Express       |
| API                 | REST                    |
| Database            | MongoDB                 |
| ODM                 | Mongoose                |
| Authentication      | JWT + HTTP-only cookies |
| Authorization       | RBAC + tenant checks    |
| Password Hashing    | bcrypt                  |
| Validation          | Zod                     |
| Media               | Cloudinary              |
| Real-time           | Socket.IO               |
| Initial Payment     | Cash on Delivery        |
| Frontend Deployment | Vercel                  |
| Backend Deployment  | Render                  |
| Database Hosting    | MongoDB Atlas           |
| API Version         | `/api/v1`               |

---

# 42. Architecture Acceptance Criteria

The architecture is considered ready for implementation when:

* [ ] Frontend and backend responsibilities are clearly separated.
* [ ] Backend modules have clear boundaries.
* [ ] REST API versioning is established.
* [ ] Authentication and authorization are separate concerns.
* [ ] Brand tenant isolation is defined.
* [ ] Controllers do not contain unnecessary business logic.
* [ ] Services contain core business rules.
* [ ] Database ownership relationships are clearly defined.
* [ ] Multi-brand checkout architecture is supported.
* [ ] Payment integration can be extended later.
* [ ] Media storage is externalized.
* [ ] Real-time functionality respects authorization.
* [ ] Development and production environments are separated.
* [ ] Security controls are defined before implementation.
* [ ] Testing strategy covers critical business flows.

---

# 43. AI Implementation Rules

AI coding agents must follow these rules when implementing the architecture:

1. Read the relevant documentation before modifying architecture.
2. Do not introduce microservices without an explicit architectural decision.
3. Do not move business logic into the frontend.
4. Do not bypass service-layer business rules.
5. Do not bypass RBAC or tenant checks.
6. Do not introduce a new dependency without documenting its purpose.
7. Do not change database ownership relationships without updating the database documentation.
8. Do not expose secrets in source code.
9. Add tests for important business logic.
10. Report architectural conflicts before making major structural changes.

---

# 44. Source-of-Truth Rule

This document defines the intended technical architecture of CityCart.

The following documents must remain consistent with it:

```text
01-product-requirements.md
02-user-roles-and-permissions.md
04-database-design.md
05-api-specification.md
06-authentication-and-security.md
```

Any major architectural change should be documented as an Architecture Decision Record (ADR).

---

## Document Status

**Current status:** Approved for implementation

**Next document:**

```text
04-database-design.md
```
