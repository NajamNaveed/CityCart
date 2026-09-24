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
* Manage permitted order actions

### Brand Employee

May perform order actions only when the relevant permission is assigned.

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

## Next Document

**09-inventory-management.md — Inventory, Stock Control, Reservations, Adjustments, and Low-Stock Management**
