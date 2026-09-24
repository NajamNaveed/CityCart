# 18. Development Roadmap

## 1. Purpose

This document defines the recommended implementation order for CityCart.

The roadmap exists to prevent AI agents or developers from attempting to build the entire system simultaneously.

Development should proceed in small, testable phases.

---

## 2. Development Principles

CityCart should be developed using:

```text
Plan
 ↓
Implement
 ↓
Test
 ↓
Review
 ↓
Integrate
```

Each phase should produce a working increment.

Do not begin advanced features before their dependencies are stable.

---

# Phase 0 — Repository Foundation

## Goals

Create the initial repository structure.

Tasks:

* Create GitHub repository.
* Initialize frontend.
* Initialize backend.
* Create `docs/`.
* Add `AGENTS.md`.
* Configure `.gitignore`.
* Configure environment files.
* Establish Git branching strategy.
* Add README.
* Configure basic linting/formatting.

Deliverable:

```text
Working repository
Frontend starts
Backend starts
Documentation accessible
```

---

# Phase 1 — Backend Foundation

## Goals

Create the Express/MongoDB foundation.

Tasks:

* Express application.
* MongoDB connection.
* Mongoose configuration.
* Environment configuration.
* Error middleware.
* Request logging.
* Security middleware.
* CORS.
* Helmet.
* Rate limiting.
* API versioning.
* Basic health endpoint.

Example:

```text
/api/v1
/health
```

Deliverable:

```text
Backend starts successfully
MongoDB connects
Health endpoint works
```

---

# Phase 2 — Authentication & Users

Implement:

* User model.
* Registration.
* Login.
* Logout.
* JWT.
* HTTP-only cookies.
* Password hashing.
* Authentication middleware.
* User profile.
* Basic RBAC.

Roles:

```text
SUPER_ADMIN
BRAND_ADMIN
BRAND_EMPLOYEE
CUSTOMER
```

Tests must be created immediately.

---

# Phase 3 — Cities, Brands & Stores

Implement:

* City model.
* Brand model.
* Store model.
* Brand-city relationship.
* Store-brand relationship.
* Brand management.
* Store management.
* Public brand discovery.

Tenant boundaries must be established before building brand-specific features.

---

# Phase 4 — Categories & Products

Implement:

* Category model.
* Product model.
* Product CRUD.
* Category CRUD.
* Brand ownership.
* Product images.
* Cloudinary integration.
* Product visibility.
* Product listing.
* Product detail.

Tests:

* Product ownership.
* Brand isolation.
* Validation.
* Image security.

---

# Phase 5 — Inventory

Implement:

* Inventory model.
* Stock quantities.
* Available stock.
* Reserved stock.
* Stock adjustments.
* Low-stock threshold.
* Out-of-stock behavior.

Critical tests:

```text
Concurrent checkout
Overselling prevention
Cancellation restocking
Brand isolation
```

---

# Phase 6 — Customer Marketplace

Build the public customer experience:

```text
Home
 ↓
City
 ↓
Brands
 ↓
Categories
 ↓
Products
 ↓
Product Details
```

Implement:

* Search.
* Filtering.
* Sorting.
* Pagination.
* Product availability.
* Brand storefronts.

---

# Phase 7 — Cart

Implement:

* Customer cart.
* Add product.
* Update quantity.
* Remove item.
* Clear cart.
* Stock validation.
* Multi-brand cart.

Example:

```text
Cart
├── Brand A
│   ├── Product 1
│   └── Product 2
└── Brand B
    └── Product 3
```

---

# Phase 8 — Checkout & Orders

Implement:

* Checkout validation.
* Address handling.
* Price verification.
* Inventory validation.
* Multi-brand cart splitting.
* Order creation.
* Order item snapshots.
* Order statuses.
* Customer order history.
* Brand order management.

Critical requirement:

```text
One multi-brand cart
        ↓
Multiple brand orders
```

This phase requires extensive automated testing.

---

# Phase 9 — COD Payments

Implement:

* Payment model.
* COD payment method.
* Payment status.
* Payment/order relationship.
* Payment records.
* Basic refund representation.

Do not introduce complex online payment integrations yet.

---

# Phase 10 — Delivery

Implement:

* Delivery record.
* Delivery address.
* Delivery charges.
* Delivery status.
* Brand fulfillment workflow.
* Basic tracking information.

MVP does not require GPS tracking.

---

# Phase 11 — Employees & Permissions

Implement:

* Employee management.
* Permission assignment.
* Permission groups.
* Employee activation/deactivation.
* Backend permission middleware.
* Brand ownership checks.

Test:

```text
Brand A employee
        ↓
Brand B resource
        ↓
DENIED
```

This phase strengthens the multi-tenant architecture.

---

# Phase 12 — Notifications

Implement:

* Notification model.
* In-app notifications.
* Read/unread state.
* Socket.IO.
* Order notifications.
* Inventory notifications.
* Employee notifications.

Example:

```text
Order Created
     ↓
Notification Event
     ↓
Customer + Brand
```

---

# Phase 13 — Reviews & Ratings

Implement:

* Review model.
* Purchased-product eligibility.
* 1–5 ratings.
* Review creation.
* Review ownership.
* Moderation.
* Product rating aggregation.
* Brand responses if included.

Tests must verify review eligibility and tenant isolation.

---

# Phase 14 — Analytics

Implement:

### Brand

* Sales.
* Orders.
* Products.
* Customers.
* Inventory.

### Super Admin

* Platform sales.
* Brands.
* Orders.
* Customers.
* Products.

Start with MongoDB aggregation.

Avoid introducing Redis or dedicated analytics infrastructure prematurely.

---

# Phase 15 — Admin Dashboard

Build the Super Admin interface.

Capabilities:

* Manage cities.
* Manage brands.
* Manage users.
* Manage stores.
* Manage categories.
* Manage products.
* Monitor orders.
* View analytics.
* Manage moderation.
* View system information.

All actions must use backend authorization.

---

# Phase 16 — Brand Dashboard

Build the brand experience.

Dashboard sections:

```text
Overview
Orders
Products
Inventory
Customers
Reviews
Employees
Analytics
Store Settings
```

The navigation should respect employee permissions.

---

# Phase 17 — Customer Experience Polish

Improve:

* Responsive design.
* Loading states.
* Empty states.
* Error handling.
* Form validation.
* Search UX.
* Product browsing.
* Cart UX.
* Checkout UX.
* Order tracking.
* Notifications.

Accessibility and mobile responsiveness should be checked.

---

# Phase 18 — Testing & Security Hardening

Perform comprehensive testing:

```text
Unit
Integration
API
Frontend
E2E
Security
```

Security review should actively attempt:

* Cross-brand access.
* Privilege escalation.
* Customer data access.
* ObjectId manipulation.
* Invalid JWT usage.
* NoSQL injection.
* XSS.
* Rate-limit bypass.
* Malicious file upload.

---

# Phase 19 — Deployment

Deploy:

```text
Frontend → Vercel
Backend → Render
Database → MongoDB Atlas
Images → Cloudinary
```

Configure:

* Environment variables.
* HTTPS.
* CORS.
* Cookies.
* Production database.
* Health checks.
* Logging.
* Monitoring.

Run production smoke tests.

---

# Phase 20 — MVP Release

MVP should contain:

```text
Authentication
Users
Cities
Brands
Stores
Categories
Products
Inventory
Marketplace
Cart
Checkout
Orders
COD
Delivery
Employees
Permissions
Notifications
Reviews
Basic Analytics
Admin Dashboard
Brand Dashboard
```

Before release:

```text
[ ] Core tests passing
[ ] Security review complete
[ ] Tenant isolation verified
[ ] Production deployment verified
[ ] Error handling verified
[ ] Backup strategy documented
[ ] README updated
[ ] API documentation updated
```

---

# Phase 21 — Post-MVP

Potential future features:

* Online payment gateways.
* Automated payouts.
* Commission management.
* Coupons.
* Wishlist.
* Product variants.
* Advanced search.
* Recommendation engine.
* Courier integrations.
* GPS delivery tracking.
* Email notifications.
* SMS.
* WhatsApp notifications.
* Push notifications.
* Product image reviews.
* Advanced reporting.
* Mobile applications.

These should only be implemented after the MVP architecture is stable.

---

## 3. AI Agent Workflow

Every development task should follow:

```text
User Requirement
      ↓
Architect Agent
      ↓
Implementation Plan
      ↓
Backend Agent
      ↓
Frontend Agent
      ↓
QA Agent
      ↓
Security Review
      ↓
Code Review
      ↓
Merge
```

Agents must read relevant documentation before implementation.

---

## 4. Feature Development Rule

A feature should be implemented as a focused task.

Bad:

```text
Build the entire marketplace.
```

Better:

```text
Implement product creation API with
brand ownership, validation, authorization,
tests, and documentation.
```

Smaller tasks reduce architectural drift and make AI-generated code easier to review.

---

## 5. Dependency Rule

Features should not be implemented before their dependencies exist.

Example:

```text
User
 ↓
Brand
 ↓
Product
 ↓
Inventory
 ↓
Cart
 ↓
Order
 ↓
Payment
 ↓
Delivery
```

This dependency order should guide implementation.

---

## 6. Documentation Rule

Before changing architecture, AI agents must check:

```text
AGENTS.md
Relevant docs/*.md
Existing implementation
Existing tests
```

If implementation conflicts with documentation:

```text
STOP
 ↓
Report conflict
 ↓
Human decision
 ↓
Update source of truth
 ↓
Implement
```

Agents must not silently redefine business rules.

---

## 7. Git Rule

Each meaningful feature should use a dedicated branch.

Example:

```text
feature/product-crud
feature/inventory-management
feature/order-checkout
feature/review-system
```

After testing and review:

```text
Feature Branch
      ↓
Pull Request
      ↓
Review
      ↓
main
```

---

## 8. Definition of Done

A feature is complete when:

```text
Requirement implemented
        +
Validation implemented
        +
Authorization implemented
        +
Tenant isolation verified
        +
Tests written
        +
Tests passing
        +
Security reviewed
        +
Documentation updated
```

---

## 9. Development Priority

When time is limited, prioritize:

1. Security.
2. Data integrity.
3. Authentication/authorization.
4. Tenant isolation.
5. Core business functionality.
6. Automated testing.
7. User experience.
8. Performance optimization.
9. Advanced features.

Do not sacrifice security or data integrity to accelerate feature delivery.

---

## 10. Architecture Stability

The project should remain a modular monolith during the MVP.

Do not introduce microservices simply because the application contains many modules.

Consider architectural changes only when justified by:

* Scale.
* Team size.
* Deployment requirements.
* Performance.
* Operational needs.

---

## 11. Final MVP Success Criteria

CityCart MVP is ready for real-world demonstration when:

### Customer

```text
Register
 ↓
Login
 ↓
Select City
 ↓
Browse Brands
 ↓
Browse Products
 ↓
Add to Cart
 ↓
Checkout
 ↓
Place COD Order
 ↓
Track Order
 ↓
Review Product
```

### Brand

```text
Login
 ↓
Manage Store
 ↓
Manage Products
 ↓
Manage Inventory
 ↓
Receive Orders
 ↓
Process Orders
 ↓
Manage Delivery
 ↓
View Reviews
 ↓
View Analytics
```

### Employee

```text
Login
 ↓
Access permitted modules
 ↓
Perform permitted actions
 ↓
Cannot access unauthorized resources
```

### Super Admin

```text
Login
 ↓
Manage Platform
 ↓
Manage Cities
 ↓
Manage Brands
 ↓
Manage Users
 ↓
Monitor Orders
 ↓
Moderate Content
 ↓
View Platform Analytics
```

---

## 12. Source of Truth

This roadmap defines the recommended implementation sequence for CityCart.

The roadmap may evolve as development progresses, but changes should be documented.

New features should not automatically become MVP requirements.

The core priorities remain:

```text
Security
Data Integrity
Tenant Isolation
Reliable Orders
Inventory Accuracy
Testability
Maintainability
```

Once these foundations are stable, CityCart can safely expand into payments, commissions, advanced search, courier integrations, recommendations, and other future capabilities.
