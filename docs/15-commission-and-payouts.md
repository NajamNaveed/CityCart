# 15. Commission & Payouts

## 1. Purpose

The Commission & Payout System defines how CityCart can calculate platform commissions on brand sales and track money owed to brands.

This system is **not required for the initial MVP checkout flow**. The architecture should remain ready for it without introducing unnecessary financial complexity early.

The system must support:

* Platform commission calculation.
* Brand earnings calculation.
* Commission records.
* Payout tracking.
* Refund/cancellation adjustments.
* Brand-level financial reporting.
* Super Admin financial management.
* Strict tenant and financial data isolation.

---

## 2. Financial Model

A completed order may conceptually produce:

```text
Customer Payment
       ↓
Gross Order Amount
       ↓
Platform Commission
       ↓
Brand Earnings
```

Example:

```text
Order Total:        PKR 10,000
Commission:         PKR 1,000
Brand Earnings:     PKR 9,000
```

The exact commission percentage or fixed-fee rules must be configurable.

---

## 3. Commission Rules

Commission may eventually be configured at different levels:

```text
Platform Default
      ↓
Brand Override
      ↓
Category Override
      ↓
Product Override
```

MVP should preferably use a simple platform-level or brand-level percentage.

Example:

```text
commissionRate = 10%
```

The backend calculates the commission.

The frontend must never determine the authoritative commission amount.

---

## 4. Commission Record

A commission record should retain enough historical information to reproduce the financial calculation.

Recommended fields:

```text
Commission
├── order
├── brand
├── orderAmount
├── commissionRate
├── commissionAmount
├── brandAmount
├── status
├── currency
├── createdAt
└── updatedAt
```

Recommended status values:

```text
PENDING
CONFIRMED
ADJUSTED
REFUNDED
CANCELLED
```

Historical commission records should not silently change when the current commission configuration changes.

---

## 5. Multi-Brand Orders

CityCart supports multi-brand carts.

A checkout such as:

```text
Customer Cart
├── Brand A products
├── Brand B products
└── Brand C products
```

becomes separate brand orders:

```text
Order A → Brand A
Order B → Brand B
Order C → Brand C
```

Commission must therefore be calculated separately for each brand order.

This ensures:

* Brand A's earnings remain isolated.
* Brand B's earnings remain isolated.
* Platform commission is correctly attributed.
* Payouts can be generated independently.

---

## 6. Commission Calculation

Conceptually:

```text
commissionAmount =
eligibleAmount × commissionRate
```

Then:

```text
brandEarnings =
eligibleAmount - commissionAmount
```

The definition of `eligibleAmount` must be documented and consistently applied.

For example, CityCart may eventually decide whether commission applies to:

* Product subtotal only.
* Product subtotal + delivery.
* Discounts before commission.
* Discounts after commission.
* Taxes.

The implementation must not invent financial rules.

---

## 7. Refunds and Cancellations

Commission must account for financial changes.

Possible scenarios:

### Before fulfillment

```text
Order cancelled
        ↓
Commission cancelled/reversed
```

### After payment

```text
Refund
   ↓
Financial adjustment
   ↓
Commission adjustment
```

### Partial refund

Only the affected amount should be adjusted.

Commission records should preserve an audit trail rather than simply overwriting historical values.

---

## 8. Payout Concept

A payout represents money that CityCart owes to a brand.

Conceptually:

```text
Completed Orders
      ↓
Eligible Brand Earnings
      ↓
Payout Calculation
      ↓
Payout
      ↓
Paid to Brand
```

Recommended payout statuses:

```text
PENDING
PROCESSING
PAID
FAILED
CANCELLED
```

---

## 9. Payout Record

Recommended fields:

```text
Payout
├── brand
├── periodStart
├── periodEnd
├── grossAmount
├── commissionAmount
├── adjustmentAmount
├── netAmount
├── status
├── paymentReference
├── processedAt
├── processedBy
├── notes
├── createdAt
└── updatedAt
```

Financial records should retain historical values.

---

## 10. Payout Periods

Future payout schedules may support:

```text
Weekly
Biweekly
Monthly
Manual
```

MVP does not need automatic payout processing.

A manual Super Admin workflow may initially be sufficient.

---

## 11. Brand Financial Dashboard

Authorized brand users may eventually see:

```text
Gross Sales
Commission
Refunds
Adjustments
Net Earnings
Pending Payout
Paid Payout
```

Brand users may only see financial information belonging to their own brand.

Employees should require an explicit financial/analytics permission if financial permissions are introduced separately.

---

## 12. Super Admin Financial Dashboard

Super Admin may access platform-level information such as:

* Total gross sales.
* Total commissions.
* Brand earnings.
* Pending payouts.
* Completed payouts.
* Failed payouts.
* Refund adjustments.
* Brand financial summaries.

Platform-wide financial information must never be exposed to ordinary brand users.

---

## 13. Payment Relationship

Commission and payouts are separate from payment processing.

```text
Order
 ↓
Payment
 ↓
Commission
 ↓
Brand Earnings
 ↓
Payout
```

The Payment System determines whether money was successfully received.

The Commission System determines how that money is allocated financially.

The Payout System tracks money owed/paid to brands.

---

## 14. Currency

The MVP currency is:

```text
PKR
```

Financial records should explicitly store currency where appropriate.

Future multi-currency support must not be assumed during MVP implementation.

---

## 15. Financial Accuracy

Financial calculations must use backend-authoritative values.

Never trust:

```text
commissionAmount
brandEarnings
payoutAmount
orderTotal
```

submitted by a client.

Amounts should be calculated from trusted database records.

Where practical, monetary values should use integer minor units or another consistent strategy to avoid floating-point errors.

For PKR, the implementation should define a consistent representation before financial features are implemented.

---

## 16. Idempotency

Financial operations must avoid duplicate processing.

Examples:

```text
Same payout processed twice
Same commission created twice
Same refund adjustment applied twice
```

The backend should use unique references, transaction logic, or idempotency mechanisms where appropriate.

---

## 17. Financial Auditability

Important financial changes should be traceable.

The system should preserve:

* Original amount.
* Adjustment amount.
* Reason.
* Actor.
* Timestamp.
* Related order.
* Related payment.
* Related payout.

Future `auditLogs` infrastructure can provide more detailed audit history.

---

## 18. Security

Financial endpoints require:

* Authentication.
* RBAC.
* Tenant ownership checks.
* Input validation.
* ObjectId validation.
* Rate limiting where appropriate.
* Secure error handling.

Brand users must never access:

```text
Other brand payouts
Other brand commissions
Platform-wide financial data
```

---

## 19. Example APIs

### Brand

```http
GET /api/v1/brand/financial/summary
GET /api/v1/brand/financial/commissions
GET /api/v1/brand/financial/payouts
GET /api/v1/brand/financial/payouts/:payoutId
```

### Super Admin

```http
GET /api/v1/admin/financial/summary
GET /api/v1/admin/financial/commissions
GET /api/v1/admin/financial/payouts
POST /api/v1/admin/financial/payouts
PUT /api/v1/admin/financial/payouts/:payoutId
```

Exact endpoints may evolve with the final API design.

---

## 20. MVP Scope

The initial CityCart MVP should prioritize:

* COD payments.
* Correct order totals.
* Payment records.
* Basic financial reporting.

The following can remain future functionality:

* Automated payouts.
* Bank integrations.
* Payment gateway settlement reconciliation.
* Complex commission rules.
* Tax accounting.
* Multi-currency settlement.
* Scheduled payouts.

---

## 21. Testing Requirements

Tests must verify:

* Commission calculation is correct.
* Brand earnings are correct.
* Multi-brand orders calculate commissions separately.
* Refunds adjust financial records correctly.
* Cancelled orders do not incorrectly create payable earnings.
* Brand A cannot access Brand B financial records.
* Employees without permission cannot access financial data.
* Duplicate payout processing is prevented.
* Financial amounts cannot be overridden by clients.

---

## 22. AI Implementation Rules

AI agents must:

1. Treat financial values as backend-authoritative.
2. Never invent commission rules.
3. Preserve historical financial values.
4. Maintain brand isolation.
5. Avoid implementing automated payouts unless explicitly requested.
6. Use the existing Order and Payment models.
7. Add tests for calculations and authorization.
8. Flag conflicts involving financial business rules before implementation.

---

## 23. Acceptance Criteria

The Commission & Payout architecture is complete when:

* Commission rules are clearly defined before implementation.
* Commission records preserve historical calculations.
* Multi-brand orders remain financially separated.
* Refunds/cancellations can be represented correctly.
* Brand financial data is isolated.
* Super Admin can manage platform financial information.
* Duplicate financial operations are prevented.
* Financial calculations are covered by tests.

---

## 24. Source of Truth

This document defines the authoritative requirements for CityCart Commission & Payout functionality.

Commission and payout functionality is considered a future expansion unless explicitly included in the MVP implementation plan.

Any financial-rule conflict must be identified before implementation.
