# 16. Testing Strategy

## 1. Purpose

Testing ensures CityCart remains secure, reliable, tenant-isolated, and functionally correct as development progresses.

Testing is especially important because CityCart contains:

* Authentication.
* RBAC.
* Multi-tenancy.
* Multi-brand carts.
* Inventory.
* Orders.
* Payments.
* Delivery.
* Financial data.

A feature is not considered complete simply because its UI works.

---

## 2. Testing Principles

CityCart follows these principles:

1. Test business rules, not only UI behavior.
2. Test authorization at the backend.
3. Test tenant isolation explicitly.
4. Test critical financial and inventory operations carefully.
5. Write tests close to feature implementation.
6. Run tests before merging.
7. Fix failing tests rather than disabling them.
8. Keep tests deterministic.
9. Test both successful and failure paths.
10. Use automated tests for regression prevention.

---

## 3. Testing Levels

CityCart should use multiple testing levels:

```text
Unit Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
Component Tests
    ↓
End-to-End Tests
    ↓
Security Testing
```

Not every feature requires identical coverage, but critical business logic requires strong coverage.

---

## 4. Unit Testing

Unit tests verify isolated functions or services.

Examples:

* Password validation.
* Price calculation.
* Order total calculation.
* Commission calculation.
* Inventory availability.
* Permission checks.
* Status transition validation.
* Date-range validation.
* Input validation.

Example:

```text
calculateOrderTotal()
```

should be tested with:

```text
Normal items
Discounts
Multiple quantities
Zero quantity
Invalid prices
```

---

## 5. Backend Unit Tests

Backend services should have tests for important business logic.

Examples:

```text
AuthService
ProductService
InventoryService
CartService
OrderService
PaymentService
ReviewService
AnalyticsService
```

Tests should focus on behavior rather than implementation details.

---

## 6. Integration Testing

Integration tests verify that multiple backend components work together.

Examples:

```text
Route
 ↓
Middleware
 ↓
Controller
 ↓
Service
 ↓
Model
 ↓
Database
```

Important integration flows include:

* Registration.
* Login.
* Product creation.
* Cart operations.
* Checkout.
* Order creation.
* Inventory deduction.
* Review creation.
* Permission checks.

---

## 7. API Testing

Every important API should have tests for:

### Success

```text
Correct authenticated request
```

### Validation failure

```text
Missing fields
Invalid types
Invalid ObjectId
Invalid values
```

### Authentication failure

```text
No token
Expired token
Invalid token
```

### Authorization failure

```text
Insufficient permission
```

### Tenant isolation

```text
Brand A attempting Brand B resource access
```

---

## 8. Authentication Testing

Tests must verify:

* Registration works.
* Duplicate accounts are rejected.
* Passwords are hashed.
* Login succeeds with valid credentials.
* Login fails with invalid credentials.
* Authentication cookies are handled securely.
* Logout invalidates the expected session/token behavior.
* Protected endpoints reject unauthenticated requests.

Raw passwords must never appear in logs or API responses.

---

## 9. RBAC Testing

Every protected operation should verify role and permission requirements.

Examples:

```text
SUPER_ADMIN
BRAND_ADMIN
BRAND_EMPLOYEE
CUSTOMER
```

Tests should verify that users cannot perform actions outside their permissions.

Example:

```text
Employee without products.delete
        ↓
DELETE product
        ↓
403 Forbidden
```

---

## 10. Tenant Isolation Testing

Tenant isolation is one of CityCart's highest-priority testing areas.

Example:

```text
Brand A employee
       ↓
Request Brand B product
       ↓
403 / 404
```

Test cases must include:

* Products.
* Orders.
* Inventory.
* Customers.
* Employees.
* Reviews.
* Analytics.
* Financial records.
* Stores.
* Brand settings.

A frontend restriction is not sufficient.

---

## 11. Customer Ownership Testing

Customers must only access their own private resources.

Examples:

```text
Customer A
   ↓
Order A → allowed

Customer A
   ↓
Order B → denied
```

This applies to:

* Orders.
* Reviews.
* Cart.
* Profile information.
* Notifications.
* Payment information.

---

## 12. Product Testing

Test:

* Product creation.
* Product update.
* Product deletion/archiving.
* Category assignment.
* Brand ownership.
* Price validation.
* Stock availability.
* Product visibility.
* Image validation.

Brand A must not modify Brand B products.

---

## 13. Cart Testing

Test:

* Add product.
* Update quantity.
* Remove product.
* Clear cart.
* Invalid product.
* Out-of-stock product.
* Maximum purchase quantity.
* Multiple products.
* Multiple brands.

Important:

The client must not control the authoritative product price.

---

## 14. Checkout Testing

Checkout is a critical flow.

Tests must verify:

```text
Cart
 ↓
Validate products
 ↓
Validate prices
 ↓
Validate inventory
 ↓
Split by brand
 ↓
Create orders
 ↓
Reserve/deduct inventory
 ↓
Create payment records
```

Failure at a critical step must not leave inconsistent data.

---

## 15. Multi-Brand Order Testing

Example:

```text
Cart:
Brand A → Product 1
Brand B → Product 2
Brand C → Product 3
```

Expected:

```text
Order A → Brand A
Order B → Brand B
Order C → Brand C
```

Tests must verify:

* Correct brand assignment.
* Correct item assignment.
* Correct totals.
* Correct inventory changes.
* Correct customer ownership.
* Correct notifications.

---

## 16. Inventory Testing

Test:

* Stock increase.
* Stock decrease.
* Stock adjustment.
* Reservation.
* Available stock.
* Out-of-stock behavior.
* Cancellation restocking.
* Concurrent checkout attempts.

Example:

```text
Stock = 1

Customer A → buys 1
Customer B → buys 1
```

The system must prevent both customers from successfully purchasing the same final unit.

---

## 17. Order Testing

Test valid and invalid status transitions.

Example:

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

Invalid transitions must be rejected.

Also test:

* Cancellation.
* Rejection.
* Returns.
* Refund states.
* Customer visibility.
* Brand visibility.

---

## 18. Payment Testing

MVP payment testing focuses on COD.

Test:

* Payment record creation.
* Correct amount.
* Correct order relationship.
* Payment status changes.
* Refund handling.
* Duplicate payment operations.
* Unauthorized payment access.

Future online gateways must include webhook and idempotency testing.

---

## 19. Review Testing

Test:

* Purchased product review.
* Non-purchased product rejection.
* Undelivered order rejection.
* Duplicate review rejection.
* Rating validation.
* Review ownership.
* Brand moderation.
* Public visibility.
* Rating aggregation.

---

## 20. Analytics Testing

Test:

* Correct date filtering.
* Correct sales totals.
* Correct order counts.
* Correct product metrics.
* Correct inventory metrics.
* Correct payment metrics.
* Brand isolation.
* Permission checks.

Analytics results should be compared against known test datasets.

---

## 21. Frontend Testing

Frontend tests should verify important UI behavior.

Examples:

* Login form.
* Registration form.
* Product listing.
* Product filtering.
* Product detail.
* Cart.
* Checkout.
* Order history.
* Brand dashboard.
* Permission-based navigation.
* Form validation.
* Loading states.
* Error states.

The frontend must not be treated as the security boundary.

---

## 22. End-to-End Testing

E2E testing should simulate complete user journeys.

Primary flow:

```text
Register
   ↓
Login
   ↓
Select City
   ↓
Browse Brand
   ↓
Browse Product
   ↓
Add to Cart
   ↓
Checkout
   ↓
Order Created
   ↓
Brand Dashboard
   ↓
Confirm Order
   ↓
Process Order
   ↓
Ship Order
   ↓
Deliver Order
```

Additional flows:

```text
Customer review
Brand inventory update
Employee permission management
Multi-brand checkout
Order cancellation
```

Recommended future tool:

```text
Playwright
```

---

## 23. Security Testing

Security testing must actively attempt to break authorization boundaries.

Examples:

```text
Brand A → Brand B API
Employee → Admin API
Customer → Brand API
Customer A → Customer B order
Modified ObjectId → unauthorized resource
Modified brandId → cross-tenant access
```

Also test:

* NoSQL injection.
* XSS.
* CSRF considerations.
* Rate limiting.
* Malicious file uploads.
* Invalid JWTs.
* Expired authentication.
* Privilege escalation.

---

## 24. Test Database

Automated tests should use a dedicated test database/environment.

Never run destructive automated tests against production.

Test data should be isolated and reproducible.

Example:

```text
Development DB
Test DB
Production DB
```

must remain separate.

---

## 25. Test Data

Fixtures/factories should create predictable test data.

Example entities:

```text
Super Admin
Brand A
Brand B
Brand A Employee
Brand B Employee
Customer A
Customer B
Products
Inventory
Orders
Payments
```

Cross-tenant test data is especially important.

---

## 26. Test Naming

Tests should clearly describe behavior.

Good:

```text
should reject Brand A employee when accessing Brand B order
```

Avoid vague names such as:

```text
test order
```

---

## 27. CI/CD Testing

Before merging into `main`:

```text
Install dependencies
       ↓
Lint
       ↓
Unit tests
       ↓
Integration/API tests
       ↓
Build
       ↓
Merge
```

Future CI may use GitHub Actions.

Pull requests should not be merged when required tests fail.

---

## 28. Test Coverage

Coverage is a useful indicator but is not the only quality metric.

High coverage should be prioritized for:

* Authentication.
* Authorization.
* Tenant isolation.
* Order calculations.
* Inventory.
* Payments.
* Financial calculations.
* Critical services.

A high percentage of meaningless tests does not equal good test quality.

---

## 29. Bug Regression Testing

Every important bug fix should include a regression test when practical.

Example:

```text
Bug:
Brand A could access Brand B order.

Fix:
Add tenant ownership check.

Regression:
Automated test verifies cross-brand access remains blocked.
```

---

## 30. AI Agent Testing Rules

AI-generated code must not be considered correct merely because it compiles.

Every AI implementation agent must:

1. Add or update relevant tests.
2. Run the relevant test suite.
3. Report failing tests.
4. Never disable tests to make a task pass.
5. Never remove security tests without explicit approval.
6. Test negative cases.
7. Test authorization boundaries.
8. Test tenant isolation where relevant.

---

## 31. QA Agent Responsibilities

The QA/Security Agent should:

* Review changed functionality.
* Identify missing tests.
* Test edge cases.
* Test unauthorized access.
* Test tenant isolation.
* Test validation.
* Test error handling.
* Test regression scenarios.
* Report severity and reproduction steps.

---

## 32. Definition of Done

A feature is considered complete only when:

```text
Implementation
      +
Validation
      +
Authorization
      +
Tests
      +
Security Review
      +
Build Verification
```

have been completed according to the feature's requirements.

---

## 33. Acceptance Criteria

The testing strategy is implemented successfully when:

* Unit tests cover critical business logic.
* Integration/API tests cover important backend flows.
* RBAC tests exist.
* Tenant-isolation tests exist.
* Customer ownership tests exist.
* Critical inventory/order/payment flows are tested.
* Frontend critical flows are tested.
* E2E coverage exists for major customer journeys.
* Security testing actively attempts unauthorized access.
* CI runs required checks before merging.
* Regression tests are added for important bugs.

---

## 34. Source of Truth

This document defines the authoritative testing strategy for CityCart.

Every future feature should identify its required unit, integration, API, frontend, security, and E2E tests before being considered complete.

Testing requirements must not be weakened merely to make an implementation pass.
