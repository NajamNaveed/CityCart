# 10 — Payment System

## 1. Purpose

This document defines CityCart's payment architecture.

The MVP will initially support **Cash on Delivery (COD)** while keeping the architecture ready for future online payment gateways.

It covers:

* Payment records
* COD
* Payment statuses
* Order/payment relationship
* Payment confirmation
* Refunds
* Security
* Future gateway integration
* Testing

---

# 2. Payment Architecture

Payments are separate from orders.

Conceptually:

```text
Customer
   ↓
Order
   ↓
Payment
```

An order should reference its payment information without mixing payment logic directly into the order lifecycle.

---

# 3. Payment Model

A payment record may contain:

```text
paymentId
orderId
customerId
brandId
paymentMethod
paymentStatus
amount
currency
transactionReference
createdAt
updatedAt
```

The exact schema is defined during implementation.

---

# 4. Supported Payment Method

The initial MVP supports:

```text
COD
```

Meaning:

> The customer pays when the order is delivered.

Example:

```text
paymentMethod = COD
paymentStatus = PENDING
```

Online payments are intentionally excluded from the initial MVP.

---

# 5. Payment Status

Payment status is separate from order status.

Supported statuses:

```text
PENDING
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

Example:

```text
Order:
CONFIRMED

Payment:
PENDING
```

The order's fulfillment status must not be used as a replacement for payment status.

---

# 6. COD Lifecycle

Typical COD flow:

```text
Customer places order
        ↓
Payment = PENDING
        ↓
Brand processes order
        ↓
Order delivered
        ↓
Cash collected
        ↓
Payment = PAID
```

The exact point at which payment is marked `PAID` should be controlled by the delivery/payment workflow.

---

# 7. Payment Amount

The backend calculates the payment amount.

Example:

```text
Product subtotal = 3,000 PKR
Delivery         =   200 PKR
Discount         =   300 PKR
--------------------------------
Total            = 2,900 PKR
```

The payment amount must come from the authoritative order total.

The client must not be allowed to submit:

```json
{
  "amount": 1
}
```

and have the backend accept it as the payment amount for a 2,900 PKR order.

---

# 8. Currency

The MVP uses:

```text
PKR
```

Currency must be explicitly represented in payment records.

Example:

```text
currency = "PKR"
```

Future multi-currency support may be added later.

---

# 9. Payment and Multi-Brand Orders

A multi-brand cart produces separate orders.

Example:

```text
Cart
├── Brand A → Order A
└── Brand B → Order B
```

Each order may have its own payment record.

This is important because brands are separate tenants.

The payment architecture must not accidentally expose Brand A's financial information to Brand B.

---

# 10. Payment Ownership

Payment records must be associated with the relevant:

```text
orderId
customerId
brandId
```

Access must follow the same authorization rules as orders.

Customers can see payment information related to their own orders.

Brand users can see only payment information required for their own brand's orders.

Super Admin has platform-level access according to permissions.

---

# 11. COD Confirmation

When COD payment is collected, the system should record:

```text
paymentStatus = PAID
```

The system should also record when the payment status changed.

Future implementations may record:

```text
confirmedBy
confirmedAt
```

where appropriate.

---

# 12. Payment Failures

For COD, payment failure generally occurs during delivery or collection.

A failed collection should not be represented simply by changing the order to `FAILED`.

Order status and payment status remain separate.

For example:

```text
Order:
OUT_FOR_DELIVERY

Payment:
PENDING
```

If delivery fails, the order may follow the applicable delivery/cancellation process.

---

# 13. Refunds

Refunds are not required for the basic COD MVP but the architecture should support them.

Possible refund states:

```text
REFUNDED
PARTIALLY_REFUNDED
```

Refund information may include:

```text
refundAmount
refundReason
refundReference
refundedAt
```

Refunds must be authorized by the appropriate role.

---

# 14. Payment Security

Payment-related APIs must:

* Require authentication where applicable.
* Verify order ownership.
* Verify brand ownership.
* Never trust client payment amounts.
* Never expose secrets.
* Never store unnecessary sensitive financial information.
* Validate payment state transitions.

---

# 15. No Sensitive Card Data

CityCart must not store raw card information.

If online payment gateways are added later, sensitive card data should be handled by the payment provider whenever possible.

The CityCart backend should store only the payment-provider information necessary to reference and reconcile the transaction.

---

# 16. Future Online Payments

The architecture should allow future providers such as:

```text
Online Payment Gateway
Bank/Card Provider
Wallet Provider
```

without rewriting the order system.

Conceptually:

```text
Payment Service
      ↓
Payment Provider Interface
      ↓
COD
Online Gateway A
Online Gateway B
```

The exact provider will be selected later.

---

# 17. Payment Provider Webhooks

Future online gateways will likely use webhooks.

Webhook processing must:

* Verify the provider signature.
* Validate the event.
* Prevent duplicate processing.
* Identify the correct payment.
* Update payment status safely.
* Record the provider transaction reference.

A webhook must never blindly trust request data.

---

# 18. Idempotency

Payment operations should be idempotent where applicable.

For example, receiving the same payment webhook twice must not:

```text
PAID
→ PAID again
→ duplicate refund
→ duplicate order action
```

The system should detect previously processed payment events.

---

# 19. Payment Status Transitions

Valid transitions may include:

```text
PENDING → PAID
PENDING → FAILED
PAID → REFUNDED
PAID → PARTIALLY_REFUNDED
```

Invalid transitions must be rejected.

For example:

```text
REFUNDED → PAID
```

must not happen through a normal payment-status endpoint.

---

# 20. Payment APIs

Initial APIs may include:

```http
GET /api/v1/payments/:paymentId
```

Administrative/payment-management endpoints may be added as the payment workflow expands.

Customers should not be allowed to arbitrarily modify payment status.

---

# 21. Payment Reconciliation

As the platform grows, payment records should support reconciliation.

Useful fields include:

```text
transactionReference
paymentMethod
paymentStatus
amount
currency
createdAt
updatedAt
```

This allows administrators to compare CityCart records with payment-provider or operational records.

---

# 22. Notifications

Important payment events may generate notifications:

```text
Payment received
Payment failed
Refund issued
Refund partially issued
```

Notifications are handled by the notification system.

---

# 23. Payment Reporting

Super Admin analytics may eventually include:

```text
Total payments
COD orders
Paid orders
Pending payments
Refunds
Revenue
```

Brand reporting must only include the brand's own financial/order data.

---

# 24. AI Implementation Rules

AI coding agents must:

1. Read this document before modifying payment functionality.
2. Keep payment and order status separate.
3. Never trust client-provided payment amounts.
4. Never allow clients to directly modify payment status.
5. Never store raw card information.
6. Preserve brand/payment data isolation.
7. Make webhook processing idempotent when online payments are introduced.
8. Validate payment-state transitions.
9. Add tests for payment authorization.
10. Report architectural conflicts before changing payment behavior.

---

# 25. Required Tests

At minimum:

### COD

* COD order creation
* Correct payment amount
* Correct currency
* Initial pending status
* Payment confirmation
* Duplicate confirmation protection

### Authorization

* Customer accessing own payment
* Customer accessing another customer's payment
* Brand accessing own payment
* Brand accessing another brand's payment
* Unauthorized payment-status modification

### Status

* Valid payment transitions
* Invalid transitions
* Refund transition
* Duplicate refund prevention

### Future Gateway

When implemented:

* Webhook signature validation
* Duplicate webhook handling
* Invalid webhook rejection
* Transaction-reference handling
* Failed payment handling

---

# 26. Acceptance Criteria

Payment functionality is considered implemented when:

* Every order has a payment relationship.
* COD is supported.
* Payment status is separate from order status.
* Payment amount is calculated from the authoritative order.
* Currency is stored consistently.
* Customers cannot manipulate payment status or amount.
* Brands can only access payment information for their own orders.
* Sensitive financial information is protected.
* Payment status transitions are controlled.
* The architecture supports future online payment providers.
* Payment functionality has automated tests.

---

# 27. Source-of-Truth Rule

This document is the authoritative specification for CityCart's payment system.

The MVP should remain simple with COD while keeping the payment architecture extensible enough for future online payment integration.

---

## Next Document

**11-delivery-system.md — Delivery, Shipping, Order Handoff, Delivery Status, and Future Courier Integration**
