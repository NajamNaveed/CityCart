# 08 — Order Management

## 1. Purpose

This document defines CityCart's complete order-management system.

It covers:

* Checkout
* Order creation
* Multi-brand order splitting
* Pricing
* Inventory validation
* Order statuses
* Customer orders
* Brand orders
* Order cancellation
* Delivery handoff
* Payment status
* Order security
* Order testing

This document is the source of truth for all order-related functionality.

---

# 2. Order Architecture

CityCart allows a customer to purchase products from multiple brands in one shopping session.

The customer's cart may contain:

```text
Cart
├── Brand A
│   ├── Product A1
│   └── Product A2
│
└── Brand B
    └── Product B1
```

At checkout, the cart is split into separate brand orders:

```text
Customer Checkout
        ↓
Order #1001 → Brand A
Order #1002 → Brand B
```

The customer sees both orders as part of the same checkout experience.

Each brand only receives and manages its own order.

---

# 3. Order Ownership

Every order belongs to:

```text
Customer
+
Brand
```

Conceptually:

```text
Order
├── customerId
└── brandId
```

This relationship is mandatory.

The order must never exist without a valid customer and brand.

---

# 4. Order Number

Each order should have a unique customer-facing order number.

Example:

```text
CC-2026-000001
```

The internal MongoDB `_id` should remain separate from the human-readable order number.

The exact order-number format may be finalized during implementation.

Order numbers must be unique.

---

# 5. Checkout Requirements

Before checkout, the customer must be authenticated.

Checkout must validate:

* Customer identity
* Cart existence
* Cart contents
* Product existence
* Product availability
* Brand status
* Product prices
* Inventory
* Product status
* Delivery information
* Payment method

The backend must perform all critical validation.

The frontend must never be considered authoritative.

---

# 6. Checkout Flow

The initial checkout flow is:

```text
Customer Cart
      ↓
Authenticate Customer
      ↓
Validate Cart
      ↓
Load Current Products
      ↓
Validate Inventory
      ↓
Validate Brands
      ↓
Calculate Prices
      ↓
Group Items By Brand
      ↓
Create Brand Orders
      ↓
Reduce Inventory
      ↓
Create Payment Record
      ↓
Clear Cart
      ↓
Return Order Information
```

The operation must be designed to prevent partial or inconsistent order creation.

---

# 7. Multi-Brand Order Splitting

Suppose the cart contains:

```text
Brand A
 ├── Product A × 2
 └── Product B × 1

Brand B
 └── Product C × 3
```

Checkout creates:

```text
Order 1
Brand A
Items:
- Product A × 2
- Product B × 1

Order 2
Brand B
Items:
- Product C × 3
```

Each order has its own:

* Order number
* Brand
* Items
* Subtotal
* Delivery information where applicable
* Payment reference/status
* Order status
* Timestamps

---

# 8. Checkout Grouping

The backend should group cart items by `brandId`.

Conceptually:

```javascript
{
  brandA: [item1, item2],
  brandB: [item3]
}
```

The server then creates one order for each brand group.

The client must not control which brand an order belongs to.

---

# 9. Order Item Snapshot

Order items should store a snapshot of important product information at purchase time.

Example:

```text
productId
productName
productImage
quantity
unitPrice
subtotal
```

This is important because product information may change after an order is created.

For example:

```text
Today:
Product price = 2,000 PKR

Order created:
unitPrice = 2,000 PKR

Tomorrow:
Product price = 2,500 PKR
```

The historical order must continue showing the original purchase price.

---

# 10. Customer Address Snapshot

The order should store the delivery information used at checkout.

Example:

```text
name
phone
address
city
postalCode
additionalInstructions
```

This should be a snapshot rather than relying entirely on the customer's current profile.

If the customer changes their address later, historical orders must remain unchanged.

`additionalInstructions` (delivery notes) is **required** at checkout — the
courier relies on it to reach the customer. The backend validates it as
1–200 words (word-counted, matching the counter shown in the checkout form);
an order without delivery notes is rejected at validation.

---

# 11. Pricing

The backend calculates the authoritative order amount.

Conceptually:

```text
Item subtotal
        +
Delivery charges
        +
Applicable fees
        -
Discounts
        =
Order total
```

For the MVP, pricing can remain simple.

The system should be designed so that future features such as:

* Coupons
* Brand-specific discounts
* Platform promotions
* Delivery fees
* Taxes

can be added without redesigning the entire order system.

---

# 12. Money Handling

Prices must use a consistent representation.

The implementation should avoid unreliable floating-point calculations for monetary values.

A recommended approach is storing monetary values as integer minor units where practical.

For example:

```text
1500 PKR
```

may be represented as:

```text
150000 minor units
```

if the selected currency uses two decimal places.

The exact implementation should remain consistent across products, orders, payments, and reports.

---

# 13. Currency

The MVP should initially use:

```text
PKR
```

The currency should be explicitly stored or consistently defined rather than inferred from formatting.

Future multi-currency support can be introduced later.

---

# 14. Order Status

The primary order lifecycle is:

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

Alternative terminal or exceptional states:

```text
CANCELLED
REJECTED
RETURN_REQUESTED
RETURNED
REFUNDED
```

Not every order must pass through every state.

---

# 15. Status Meaning

### PENDING

Order has been created but is awaiting confirmation.

### CONFIRMED

Brand has accepted the order.

### PROCESSING

Brand is preparing the order.

### READY_FOR_SHIPMENT

Order is prepared for delivery handoff.

### SHIPPED

Order has been handed to the delivery process.

### OUT_FOR_DELIVERY

Order is currently being delivered.

### DELIVERED

Customer has received the order.

### CANCELLED

Order has been cancelled.

### REJECTED

Brand or platform rejected the order.

### RETURN_REQUESTED

Customer has requested a return.

### RETURNED

Returned item/order has been received.

### REFUNDED

Applicable payment has been refunded.

---

# 16. Valid Status Transitions

The backend must control allowed status transitions.

Example:

```text
PENDING → CONFIRMED
CONFIRMED → PROCESSING
PROCESSING → READY_FOR_SHIPMENT
READY_FOR_SHIPMENT → SHIPPED
SHIPPED → OUT_FOR_DELIVERY
OUT_FOR_DELIVERY → DELIVERED
```

Invalid transitions must be rejected.

For example:

```text
PENDING → DELIVERED
```

should not be allowed directly unless an explicitly documented business rule permits it.

---

# 17. Status Permissions

Different users have different abilities.

### Customer

May:

* View own orders
* Request cancellation where permitted
* Request return where permitted
* View order status

### Brand Admin

May:

* View own brand orders
* Confirm orders
* Reject orders
* Process orders
* Mark orders ready
* Propose a change when items cannot be supplied (with `orders.adjust`)
* Manage permitted order actions

### Brand Employee

May perform order actions only when the relevant permission is assigned. Proposing or withdrawing a change needs `orders.adjust`, which is separate from `orders.manage`.

### Super Admin

May manage platform-wide orders according to administrative permissions.

---

# 18. Customer Order Access

Customers may only access their own orders.

Example authorization:

```text
order.customerId === authenticatedUser.id
```

A customer must not be able to access another customer's order by changing the order ID.

---

# 19. Brand Order Access

Brand users must only access orders belonging to their brand.

Example:

```text
order.brandId === authenticatedUser.brandId
```

The backend must enforce this restriction on:

* Listing orders
* Viewing orders
* Updating orders
* Cancelling orders
* Exporting orders
* Analytics

---

# 20. Super Admin Order Access

Super Admin can access platform-wide orders according to administrative permissions.

Super Admin operations must still use controlled APIs and should be auditable.

---

# 21. Order Cancellation

Cancellation rules depend on the current order state.

For example:

```text
PENDING       → Can cancel
CONFIRMED     → May cancel depending on policy
PROCESSING    → Restricted
SHIPPED       → Usually cannot directly cancel
DELIVERED     → Return process
```

The exact customer cancellation policy should be finalized before implementation.

Cancellation must be performed by the backend.

Cancelling an order that has a waiting change proposal closes the proposal (`ORDER_CANCELLED`), releases its substitute reservation and returns the order's stock (see §41).

---

# 22. Inventory During Checkout

Inventory must be checked before creating the order.

Example:

```text
Available stock = 5
Customer requests = 3
```

The order can proceed if all other conditions pass.

After successful order creation:

```text
5 → 2
```

Inventory updates must be protected against concurrent checkout requests.

The system must prevent two customers from successfully purchasing inventory that only exists once.

---

# 23. Inventory Failure

If required inventory becomes unavailable during checkout:

```text
Checkout
   ↓
Stock validation
   ↓
Insufficient stock
   ↓
Checkout rejected
```

No incomplete order should be created.

The customer should receive a clear error indicating that the requested quantity is no longer available.

---

# 24. Checkout Atomicity

Multi-brand checkout creates multiple orders.

The system must avoid situations such as:

```text
Brand A order created
Brand B order failed
Cart cleared
```

without a defined recovery strategy.

Where supported by the database architecture, MongoDB transactions should be used to keep critical checkout operations consistent.

If a transaction cannot be used for a specific operation, the implementation must provide an explicit rollback/recovery strategy.

---

# 25. Payment Architecture

The MVP initially supports:

```text
Cash on Delivery
```

(Online payment was added in October 2026: `paymentMethod: ONLINE_GATEWAY`, see `10-payment-system.md` §29. An online order is created `PENDING` like any other, but the brand cannot confirm it until the payment is `PAID`, an unpaid one is cancelled automatically when its stock hold ends, and a customer cannot cancel one that is already paid.)

The order should still have a payment reference/status.

Example:

```text
paymentMethod: COD
paymentStatus: PENDING
```

The payment system is defined in:

```text
10-payment-system.md
```

The architecture must allow future online payment gateways without redesigning the order model.

---

# 26. Payment and Order Status

Payment status and order status are separate concepts.

Example:

```text
Order Status:
CONFIRMED

Payment Status:
PENDING
```

Do not use order status to represent payment status.

Possible payment statuses:

```text
PENDING
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

---

# 27. Delivery Information

An order should contain the information required for fulfillment.

Example:

```text
deliveryAddress
customerName
customerPhone
deliveryInstructions
city
```

Delivery-specific workflows are defined in:

```text
11-delivery-system.md
```

---

# 28. Customer Order History

Customers should have an order history page.

It should provide:

```text
Order number
Order date
Brand
Items
Total
Payment status
Order status
```

Customers can open an order to view its details.

---

# 29. Brand Order Dashboard

Brand users should have an order-management interface.

Useful information includes:

```text
Order number
Customer
Items
Total
Order date
Payment method
Payment status
Order status
Delivery information
```

Customer information shown to brands must be limited to information required for order fulfillment and permitted by the application's privacy rules.

---

# 30. Order Detail Page

The order detail page should show:

```text
Order number
Brand
Customer information
Items
Quantities
Prices
Subtotal
Delivery charges
Discounts
Total
Payment information
Delivery information
Order status
Created date
Updated date
```

Internal security information must never be displayed.

---

# 31. Order API

The primary order APIs include:

```http
POST   /api/v1/orders/checkout
GET    /api/v1/orders
GET    /api/v1/orders/:orderId
PATCH  /api/v1/orders/:orderId/status
POST   /api/v1/orders/:orderId/cancel
```

Additional endpoints may be introduced for returns, refunds, delivery, and administrative actions.

Every endpoint must enforce authentication and appropriate authorization.

---

# 32. Order Filtering

Brand and Super Admin dashboards should support filters such as:

```text
Status
Date range
Brand
Payment status
Customer
Order number
```

Brand users must never be able to use filters to bypass tenant isolation.

---

# 33. Order Pagination

Order lists must use pagination.

Example:

```http
GET /api/v1/orders?page=1&limit=20
```

The backend must enforce maximum limits.

Large datasets must not be returned in a single request.

---

# 34. Notifications

Important order events should generate notifications.

Examples:

```text
Order created
Order confirmed
Order rejected
Order shipped
Order out for delivery
Order delivered
Order cancelled
Order change proposed / answered / expired (see §41)
```

Notifications are defined in:

```text
12-notification-system.md
```

Real-time notifications may use Socket.IO.

---

# 35. Order Security

The order system must prevent:

* Accessing another customer's order
* Accessing another brand's order
* Changing order prices
* Changing order ownership
* Changing brand ownership
* Unauthorized status changes
* Unauthorized cancellation
* Inventory manipulation
* Fake payment status changes

The server must always determine:

```text
customerId
brandId
price
subtotal
total
payment state
allowed status transition
```

from trusted data and business rules.

---

# 36. Order Auditability

Important order actions should be traceable.

Examples:

```text
Order created
Order confirmed
Order rejected
Order cancelled
Status changed
Return requested
Refund issued
```

Future audit logging can record:

```text
userId
role
brandId
action
orderId
timestamp
```

Sensitive information must not be unnecessarily stored in logs.

---

# 37. AI Implementation Rules

AI coding agents must:

1. Read this document before modifying order functionality.
2. Never trust client-side prices or totals.
3. Never trust client-supplied `brandId`.
4. Never allow cross-brand order access.
5. Validate inventory during checkout.
6. Preserve historical order pricing.
7. Enforce valid status transitions.
8. Add tests for multi-brand checkout.
9. Add concurrency/inventory tests.
10. Add customer and brand authorization tests.
11. Never silently modify order business rules.
12. Report conflicts before changing the architecture.

---

# 38. Required Tests

At minimum, automated tests must cover:

### Checkout

* Empty cart
* Invalid product
* Inactive product
* Inactive brand
* Insufficient inventory
* Valid checkout
* Multi-brand checkout
* Price modification attempt

### Authorization

* Customer accessing own order
* Customer accessing another customer's order
* Brand accessing own order
* Brand accessing another brand's order
* Employee without permission
* Super Admin access

### Order Lifecycle

* Valid status transition
* Invalid status transition
* Unauthorized status update
* Valid cancellation
* Invalid cancellation

### Inventory

* Successful stock deduction
* Insufficient stock
* Concurrent checkout attempts
* Stock restoration after valid cancellation where applicable

---

# 39. Acceptance Criteria

Order management is considered implemented when:

* Customers can checkout.
* Cart items are grouped by brand.
* Separate brand orders are created.
* Customers can see their orders.
* Brands can see only their orders.
* Order items preserve purchase-time information.
* Delivery information is stored with the order.
* Backend calculates authoritative totals.
* Inventory is validated and updated.
* Overselling is prevented.
* Order status transitions are controlled.
* COD is supported.
* Payment status is separate from order status.
* Customers can track order status.
* Authorized brand users can manage orders.
* Unauthorized cross-brand access is blocked.
* Critical order workflows have automated tests.

---

# 40. Source-of-Truth Rule

This document is the authoritative specification for CityCart's order-management system.

If AI-generated code or another document conflicts with this document, the conflict must be identified and resolved before implementation.

Order integrity, inventory correctness, authorization, and historical pricing must not be compromised for convenience.

---

# 41. Order Adjustments (added October 2026)

Feature H of `21-next-features-plan.md`: the brand cannot supply exactly what was ordered. Instead of silently shipping less or rejecting the whole order, the brand offers the customer a change.

## 41.1 When a proposal is allowed

```text
PENDING       allowed
CONFIRMED     allowed
PROCESSING    allowed
READY_FOR_SHIPMENT and later   refused (409 NOT_ADJUSTABLE)
```

* One proposal may wait per order at a time. `Order.activeAdjustmentId` is the gate and a partial unique index on `OrderAdjustment { orderId, status: 'PROPOSED' }` is the database backstop.
* Resolved proposals stay as history; the brand may propose again later while the order is still in an adjustable status.
* An online order must already be `PAID`; an unpaid online order is still on its payment hold and cannot be adjusted.
* Only the brand can propose or withdraw. Only the customer who owns the order can answer. Brand employees need `orders.adjust` (separate from `orders.manage`).

## 41.2 The proposal

For every order line the brand is short on, the proposal states:

```text
how many units of the ordered product it can supply
the missing units are either removed, or replaced by a same-brand substitute
```

A substitute is a different, active product of the same brand, with a quantity no larger than the missing units, priced at **today's** price. Original lines keep their purchase-time snapshot price (docs/08 §9).

The proposal stores in `OrderAdjustment`:

```text
status                 PROPOSED | ACCEPTED | REMOVED | ORDER_CANCELLED | WITHDRAWN | EXPIRED
note                   the message shown to the customer (required, max 500)
lines                  per-line snapshot: ordered/supplied quantities, substitute, prices
totalsBefore           the order's totals when proposed
totalsAfter            totals if the customer accepts (supplies + substitutes)
totalsAfterRemoval     totals if the customer keeps only supplies
restockRemoved         whether missing units return to stock (default false)
proposedBy, expiresAt  who proposed it and the 24-hour deadline
response               action, user and time once resolved
```

Totals are computed by the backend. Delivery fee, discount and tax never change. Substitute stock is **reserved when the proposal is sent**; if it cannot be reserved the proposal is not created (`409 SUBSTITUTE_UNAVAILABLE`), so a substitute is never oversold.

## 41.3 The customer's choices

The customer sees the note, the affected lines, both possible totals and the deadline, and may:

| Choice | What happens |
| ------ | ------------ |
| **Accept the change** | The order keeps the supplied units and adds the substitutes. Reserved substitute stock becomes sold stock. |
| **Keep the rest / remove those items** | The order keeps only the supplied units; missing units are removed. Substitute stock is released. |
| **Cancel the whole order** | The order becomes `CANCELLED`; all of its stock returns and any online payment is refunded. |

The brand may withdraw the proposal while it waits. After **24 hours** the proposal expires: **nothing about the order changes**, reserved substitute stock is released, and the brand decides what to do next (usually reject or try another proposal).

Only one of these outcomes can ever be applied: the `PROPOSED → resolved` transition is one conditional update inside the transaction that changes the order, its stock and its payment.

## 41.4 Effects on the order

On acceptance or removal the backend, in one transaction:

1. Rewrites `order.items` from the proposal snapshots.
2. Recomputes `subtotal` and `total`; delivery fee, discount and tax stay as they were.
3. Applies the money rules (see §41.5).
4. Releases or converts the reserved substitute stock and, only when `restockRemoved` was ticked, returns the missing units to stock.
5. Clears `activeAdjustmentId` and updates an already-issued online receipt to the final lines (docs/10 §30).
6. Resolves the proposal and notifies both sides.

The proposal keeps the before/after totals, so the original order value is never lost; the order's `statusHistory` is untouched by an adjustment.

If every line ends up removed, there is nothing left to fulfil and the order is cancelled; restocking then follows the proposal's `restockRemoved` tick.

Delivery, rider assignment and the COD receipt are created **after** the final lines exist. Because a proposal is only possible before `READY_FOR_SHIPMENT`, no delivery or rider can be working from superseded lines.

## 41.5 Payment effects

```text
COD                 Payment.amount becomes the new order total; the rider collects it.
Online, paid        allowed only when the new total is NOT higher.
                    An equal total changes nothing; a lower total records the
                    difference in Payment.refundedAmount/refunds[] and sets
                    PARTIALLY_REFUNDED (or REFUNDED). Order.paymentStatus stays PAID.
Online, paid, higher total   refused (409 ADJUSTMENT_INCREASES_TOTAL)
Online, not paid    proposal refused (409 ONLINE_PAYMENT_NOT_COMPLETED)
```

A customer who cancels the whole order gets the remaining paid amount refunded and the payment becomes `REFUNDED`. Payment rules are detailed in `10-payment-system.md` §30.

## 41.6 Gates and edge cases

* While a proposal waits, the brand **cannot** move the order to `READY_FOR_SHIPMENT` (`409 ADJUSTMENT_PENDING`); the final lines are not settled.
* The customer can still cancel the whole order while a proposal waits; that closes the proposal as `ORDER_CANCELLED`.
* A brand rejection also closes the waiting proposal and releases its reservation.
* Two answers, an answer racing a withdrawal, or an answer racing the expiry sweep: exactly one wins, the others receive `409 ADJUSTMENT_NOT_PENDING` / `ADJUSTMENT_EXPIRED`.
* A second proposal racing the first is refused (`409 ADJUSTMENT_PENDING`) by the atomic claim and the unique index.
* An order that was already paid online cannot be adjusted to a higher total, even after the customer accepted; the whole acceptance is refused atomically.

## 41.7 Visibility and notifications

```text
Customer       own proposals (website and shopper app)
Brand          own brand's proposals (website; Partner app read-only)
Super admin    read-only on the order detail (with admin.orders)
Partner        read-only history (area admin.orders)
Rider          nothing
```

Notifications (docs/12):

```text
ADJUSTMENT_PROPOSED   to the customer, when the brand sends it
ADJUSTMENT_ANSWERED   to the brand's staff with orders.view, when the customer answers
ADJUSTMENT_EXPIRED    to the brand's staff with orders.view, when 24 hours pass unanswered
```

A refund also sends the standard refund notification. Notifications carry `orderId` and `adjustmentId`, so the apps open the order.

## 41.8 Tests

Covered in `server/tests/brandOrders.test.js` and `server/tests/integration/orderAdjustments.integration.test.js`:

```text
propose / accept / remove / cancel / withdraw / expiry
atomic stock reservation and conversion (no overselling)
one proposal at a time (including races)
READY_FOR_SHIPMENT gate
COD and paid-online totals, lower-total refund, higher-total refusal
unpaid online refusal
tenant isolation (brand A cannot touch brand B's order)
orders.adjust permission
no double processing of an answer
```

---

## Next Document

**09-inventory-management.md — Inventory, Stock Control, Reservations, Adjustments, and Low-Stock Management**
