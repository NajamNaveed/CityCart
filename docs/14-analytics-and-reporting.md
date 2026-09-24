# 14. Analytics & Reporting

## 1. Purpose

The Analytics & Reporting System provides operational and business insights for CityCart.

Analytics must be separated by access scope:

```text
SUPER_ADMIN
    ↓
Platform-wide analytics

BRAND_ADMIN / authorized BRAND_EMPLOYEE
    ↓
Own-brand analytics

CUSTOMER
    ↓
No business analytics
```

The system must never expose another brand's private business information.

---

## 2. Analytics Principles

Analytics should be:

* Accurate.
* Tenant-isolated.
* Permission-controlled.
* Time-filterable.
* Efficient.
* Consistent with orders, payments, inventory, and delivery data.

The backend is responsible for calculating authoritative business metrics.

Frontend dashboards only display API results.

---

## 3. Platform Analytics

Super Admin may view platform-level metrics such as:

* Total brands.
* Active brands.
* Total customers.
* Total products.
* Total orders.
* Completed orders.
* Cancelled orders.
* Total sales.
* Payment totals.
* Delivery statistics.
* Product performance.
* Inventory statistics.

Platform analytics may aggregate information across all brands.

---

## 4. Brand Analytics

Brand Admin and authorized employees may view analytics for their own brand.

Typical metrics:

```text
Orders
Revenue
Average Order Value
Products Sold
Customers
Top Products
Low Stock Products
Cancelled Orders
Delivered Orders
Pending Orders
```

Brand analytics must automatically filter data by the authenticated user's `brandId`.

---

## 5. Sales Metrics

Important sales metrics include:

### Total Orders

Number of orders during the selected period.

### Completed Orders

Orders reaching the relevant completed state.

### Gross Sales

Total product/order value before applicable deductions.

### Net Sales

Defined according to CityCart's finalized financial rules.

### Average Order Value

```text
AOV = Total Sales / Number of Relevant Orders
```

The exact inclusion/exclusion rules must remain consistent throughout the application.

---

## 6. Revenue and Payment Metrics

Analytics may include:

```text
Total order value
Paid amount
Pending payment amount
Failed payments
Refunded amount
COD orders
Online payment orders
```

MVP uses COD, but the analytics architecture should not prevent future payment gateways.

Payment analytics must use authoritative Payment and Order records rather than client-submitted values.

---

## 7. Order Analytics

Orders may be grouped by:

* Date.
* Status.
* Brand.
* City.
* Payment method.
* Delivery status.

Example:

```text
Pending
Confirmed
Processing
Shipped
Delivered
Cancelled
Returned
```

Dashboards may display trends such as:

```text
Orders per day
Orders per week
Orders per month
```

---

## 8. Customer Metrics

Platform analytics may include:

* Total registered customers.
* New customers.
* Active customers.
* Customers with orders.
* Repeat customers.
* Orders per customer.

Brand analytics may show customer metrics only for customers who have interacted with that brand.

A brand must not receive unrelated customer information belonging exclusively to another brand.

---

## 9. Product Performance

Analytics may identify:

* Best-selling products.
* Units sold.
* Revenue by product.
* Order frequency.
* Product review count.
* Average rating.
* Low-performing products.
* Out-of-stock frequency.

Product analytics must respect brand ownership.

Example:

```text
Product
   ↓
Order Items
   ↓
Quantity + Price
   ↓
Aggregated Performance
```

Order item snapshots should be used where historical accuracy requires the original purchased values.

---

## 10. Inventory Analytics

Inventory reporting may include:

* Current stock.
* Available stock.
* Reserved stock.
* Low-stock products.
* Out-of-stock products.
* Stock adjustments.
* Stock movement.
* Products frequently becoming unavailable.

Analytics must distinguish:

```text
quantity
reservedQuantity
availableQuantity
```

according to the inventory specification.

---

## 11. Delivery Analytics

Delivery analytics may include:

* Pending deliveries.
* In-transit deliveries.
* Delivered orders.
* Failed deliveries.
* Cancelled deliveries.
* Average delivery duration.

Future courier integrations may provide additional metrics.

The MVP should not require advanced GPS analytics.

---

## 12. Date Filtering

Analytics APIs should support date ranges.

Example:

```text
from=2026-09-01
to=2026-09-30
```

Supported presets may include:

```text
Today
Yesterday
Last 7 Days
Last 30 Days
This Month
Previous Month
Custom Range
```

The backend must validate date ranges and use a consistent timezone strategy.

---

## 13. Dashboard Design

Brand dashboard may contain:

```text
┌─────────────────────────────────────┐
│ Orders | Revenue | Customers | AOV │
├─────────────────────────────────────┤
│ Sales Trend                         │
├───────────────────┬─────────────────┤
│ Top Products      │ Order Status    │
├───────────────────┴─────────────────┤
│ Inventory Alerts                    │
└─────────────────────────────────────┘
```

Super Admin dashboard can contain additional platform-wide sections.

Charts should be generated from backend-provided datasets.

Recommended frontend library:

```text
Recharts
```

---

## 14. MongoDB Aggregation

Analytics should use MongoDB aggregation pipelines where appropriate.

Typical operations include:

```text
$match
$group
$sum
$count
$avg
$sort
$project
$lookup
```

Example conceptual flow:

```text
Orders
  ↓
Filter by date
  ↓
Filter by brand
  ↓
Group by date/status/product
  ↓
Calculate metrics
  ↓
Return dashboard data
```

The application should avoid loading thousands of documents into Node.js merely to calculate simple metrics.

---

## 15. Performance

Analytics queries can become expensive as CityCart grows.

MVP should use appropriate indexes on frequently queried fields such as:

```text
brand
customer
createdAt
status
paymentStatus
deliveryStatus
```

Future optimization may include:

* Cached analytics.
* Pre-aggregated daily statistics.
* Background aggregation jobs.
* Redis.
* Dedicated analytics storage.

These are not required for the initial MVP.

---

## 16. Real-Time vs Historical Analytics

Not every metric needs real-time calculation.

### Real-time/near-real-time

Useful for:

* Today's orders.
* Current inventory alerts.
* Current pending orders.
* Recent payments.

### Historical

Useful for:

* Monthly sales.
* Product performance.
* Customer trends.
* Long-term order statistics.

The implementation should prioritize correctness over unnecessary real-time complexity.

---

## 17. Analytics APIs

Example endpoints:

### Brand

```http
GET /api/v1/brand/analytics/overview
GET /api/v1/brand/analytics/sales
GET /api/v1/brand/analytics/orders
GET /api/v1/brand/analytics/products
GET /api/v1/brand/analytics/inventory
GET /api/v1/brand/analytics/customers
```

### Super Admin

```http
GET /api/v1/admin/analytics/overview
GET /api/v1/admin/analytics/sales
GET /api/v1/admin/analytics/orders
GET /api/v1/admin/analytics/brands
GET /api/v1/admin/analytics/products
GET /api/v1/admin/analytics/customers
```

Exact endpoints may evolve with the final API implementation.

---

## 18. Authorization

Analytics access must require authentication and appropriate permissions.

Examples:

```text
analytics.view
```

Brand users must be restricted to their own brand.

Super Admin can access platform-wide analytics.

Customers must not access:

```text
brand revenue
platform revenue
business customer analytics
inventory analytics
```

unless a future feature explicitly provides a customer-facing metric.

---

## 19. Data Privacy

Analytics must not expose unnecessary sensitive information.

Avoid returning:

* Passwords.
* Authentication tokens.
* Private credentials.
* Unnecessary personal information.
* Payment secrets.

Customer information should be aggregated where possible.

For example, a dashboard may report:

```text
1,240 customers
```

instead of exposing a complete customer list.

---

## 20. Reporting and Export

MVP should prioritize dashboard analytics.

Future features may include:

```text
CSV export
Excel export
PDF reports
Scheduled reports
Email reports
Advanced financial reports
```

Exports must follow exactly the same authorization and tenant-isolation rules as dashboards.

---

## 21. Notifications

Analytics itself does not need to generate notifications for every metric.

Existing notification functionality may be used for important operational events such as:

* Low stock.
* Out of stock.
* Significant system alerts.

These remain part of the Notification System rather than being duplicated inside analytics.

---

## 22. Testing Requirements

Tests must verify:

* Correct sales calculations.
* Correct order counts.
* Correct date filtering.
* Correct product aggregation.
* Correct inventory metrics.
* Correct payment metrics.
* Brand analytics only contain that brand's data.
* Brand A cannot query Brand B analytics.
* Unauthorized employees cannot access analytics.
* Super Admin can access platform analytics.
* Sensitive customer information is not unnecessarily exposed.
* Large datasets do not require inefficient application-side aggregation.

---

## 23. AI Implementation Rules

AI agents must:

1. Read this document before modifying analytics.
2. Never calculate authoritative business metrics solely on the frontend.
3. Never bypass tenant isolation.
4. Apply permission checks to analytics endpoints.
5. Reuse existing order/payment/inventory definitions.
6. Use MongoDB aggregation where appropriate.
7. Avoid unnecessary analytics infrastructure during MVP.
8. Add tests for calculations and authorization.
9. Keep metric definitions consistent across dashboards.

---

## 24. Acceptance Criteria

Analytics is complete when:

* Super Admin can view platform-level metrics.
* Authorized brand users can view their brand metrics.
* Tenant isolation is enforced.
* Core sales/order/customer/product/inventory metrics work.
* Date filtering works correctly.
* Backend calculates authoritative metrics.
* Dashboards display API data correctly.
* Sensitive information is protected.
* Critical analytics calculations have automated tests.
* Performance is acceptable for MVP-scale data.

---

## 25. Source of Truth

This document defines the authoritative business and technical requirements for CityCart Analytics & Reporting.

Analytics implementation must remain consistent with the Product, Order, Inventory, Payment, Delivery, Authentication, and Permission specifications.

If an implementation conflicts with these documents, the conflict must be identified before changing the underlying business rules.
