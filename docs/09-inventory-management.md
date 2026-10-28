# 09 — Inventory Management

## 1. Purpose

This document defines CityCart's inventory and stock-management system.

It covers:

* Product stock
* Inventory ownership
* Stock adjustments
* Checkout deductions
* Cancellation/restocking
* Low-stock alerts
* Out-of-stock handling
* Inventory permissions
* Concurrency protection
* Inventory security
* Testing

This document is the source of truth for inventory functionality.

---

# 2. Inventory Ownership

Every inventory record belongs to a product and brand.

```text
Inventory
├── productId
├── brandId
├── quantity
├── reservedQuantity
└── thresholds
```

The `brandId` must match the product's brand.

Brand users can only manage inventory belonging to their own brand.

---

# 3. Available Stock

CityCart should distinguish between physical stock and stock available for purchase.

Conceptually:

```text
availableStock =
quantity - reservedQuantity
```

For the initial MVP reservations are used by substitute stock in an order-change proposal (§25).

Example:

```text
quantity = 20
reservedQuantity = 3

availableStock = 17
```

---

# 4. Inventory Creation

When a product requiring inventory is created, an inventory record should be created or initialized.

Example:

```text
Product
   ↓
Inventory
   ↓
quantity = 0
```

The brand can subsequently add stock through an authorized inventory operation.

---

# 5. Stock Updates

Brand users with the appropriate permission can update inventory.

Supported operations should include:

```text
Add stock
Remove stock
Set stock
Adjust stock
```

Every stock-changing operation must be validated server-side.

---

# 6. Inventory Adjustment

Inventory adjustments should preferably record:

```text
productId
brandId
previousQuantity
change
newQuantity
reason
userId
timestamp
```

Example:

```text
Previous: 50
Change: +20
New: 70
Reason: New shipment
```

This makes inventory changes traceable.

---

# 7. Adjustment Reasons

Common reasons include:

```text
STOCK_RECEIVED
MANUAL_ADJUSTMENT
DAMAGED
LOST
RETURNED
ORDER_DEDUCTION
ORDER_CANCELLATION
CORRECTION
SUBSTITUTION_RESERVED
SUBSTITUTION_RELEASED
SUBSTITUTION_FULFILLED
ADJUSTMENT_RESTOCKED
```

The last four are written only by the order-adjustment flow (§25); a client may never label a manual adjustment with them.

Additional reasons may be introduced later.

---

# 8. Checkout Inventory Deduction

Inventory must be checked immediately before order creation.

Example:

```text
Stock = 10
Customer orders = 3

After successful checkout:
Stock = 7
```

The backend must perform the deduction.

The frontend must never directly modify stock.

---

# 9. Preventing Overselling

CityCart must protect against concurrent purchases.

Example:

```text
Available stock = 1

Customer A → requests 1
Customer B → requests 1
```

Only one checkout should successfully consume the final unit.

The implementation should use appropriate MongoDB atomic operations or transactions.

---

# 10. Inventory and Multi-Brand Checkout

For a cart containing multiple brands:

```text
Brand A
Product A → quantity 2

Brand B
Product B → quantity 3
```

Each product's inventory must be independently validated and updated.

If checkout cannot safely complete all required inventory operations, the system must not leave partially completed orders without a documented recovery strategy.

---

# 11. Low Stock

Products may have a configurable low-stock threshold.

Example:

```text
quantity = 4
lowStockThreshold = 5
```

The product is considered low stock.

Brands should receive an appropriate notification.

---

# 12. Out of Stock

A product is out of stock when:

```text
availableStock <= 0
```

Customers must not be able to purchase an out-of-stock product.

The marketplace should display an appropriate state such as:

```text
Out of Stock
```

The Add to Cart action should be disabled or rejected.

The backend must enforce this even if the frontend is bypassed.

---

# 13. Quantity Limits

The system may enforce maximum purchase quantities.

Example:

```text
availableStock = 100
maximumPurchaseQuantity = 10
```

A customer cannot purchase more than the configured limit.

This protects against accidental or abusive bulk purchases.

---

# 14. Order Cancellation and Inventory

When an eligible order is cancelled, inventory may need to be restored.

Example:

```text
Before order:
Stock = 10

Order:
Quantity = 3

Stock = 7

Order cancelled:
Stock = 10
```

Restocking must only happen once.

The system must prevent duplicate cancellation requests from increasing stock multiple times.

Cancelling an order that has a waiting change proposal also releases the proposal's reserved substitute stock exactly once (§25).

---

# 15. Returns

Returned products may be added back to inventory depending on their condition.

For example:

```text
RETURNED
   ↓
Inspection
   ↓
Resalable → Add stock
Damaged   → Do not add stock
```

Detailed return workflows are handled by future order/delivery functionality.

---

# 16. Inventory Permissions

Relevant permissions include:

```text
inventory.view
inventory.manage
```

Brand Employees require the appropriate permission before performing inventory actions.

Brand Admins can manage their brand inventory according to their role.

Customers have no inventory-management permissions.

---

# 17. Tenant Isolation

Every inventory operation must verify:

```text
authenticated user
        +
permission
        +
brand ownership
        +
product ownership
```

A Brand A employee must never modify Brand B inventory.

---

# 18. Inventory API

Core APIs may include:

```http
GET   /api/v1/inventory
GET   /api/v1/inventory/:productId
PATCH /api/v1/inventory/:productId
POST  /api/v1/inventory/:productId/adjust
```

Exact routes must remain consistent with the API specification.

---

# 19. Inventory Dashboard

Brand dashboards should provide:

```text
Total products
In-stock products
Low-stock products
Out-of-stock products
Recent adjustments
```

Useful filters include:

```text
Category
Stock status
Product
Date
```

---

# 20. Inventory Security

The system must prevent:

* Customer stock modification
* Cross-brand stock modification
* Negative inventory
* Unauthorized adjustments
* Duplicate restocking
* Client-side quantity manipulation
* Direct inventory ownership changes

---

# 21. AI Implementation Rules

AI agents must:

1. Read this document before changing inventory logic.
2. Never trust client-side stock values.
3. Never allow negative stock unless explicitly designed for.
4. Preserve brand isolation.
5. Use atomic/transactional operations where necessary.
6. Test concurrent checkout scenarios.
7. Test cancellation/restocking behavior.
8. Record important inventory adjustments.
9. Never silently change stock rules.
10. Report conflicts before changing documented behavior.

---

# 22. Required Tests

Tests must cover:

* Inventory creation
* Stock increase
* Stock decrease
* Invalid quantity
* Negative stock prevention
* Low-stock detection
* Out-of-stock detection
* Successful checkout deduction
* Insufficient stock
* Concurrent purchases
* Cancellation restocking
* Duplicate cancellation protection
* Cross-brand inventory access
* Employee permission enforcement

---

# 23. Acceptance Criteria

Inventory management is considered implemented when:

* Every inventory record belongs to a product and brand.
* Brands can manage their own inventory.
* Customers cannot modify inventory.
* Stock is validated during checkout.
* Overselling is prevented.
* Low-stock states are supported.
* Out-of-stock products cannot be purchased.
* Inventory changes are traceable.
* Eligible cancellations restore inventory correctly.
* Change proposals reserve, release and convert substitute stock correctly (§25).
* Cross-brand inventory access is blocked.
* Inventory operations have automated tests.

---

# 24. Source-of-Truth Rule

This document is the authoritative specification for CityCart inventory management.

Inventory correctness takes priority over convenience.

---

# 25. Stock During an Order Change (added October 2026)

Feature H of `21-next-features-plan.md`: the brand proposes a substitute or a reduced quantity. Stock moves **inside the same transaction** as the proposal or the customer's answer, and every move is written to the `InventoryMovement` ledger with `orderId` and `adjustmentId`.

## 25.1 Substitute stock is reserved when the proposal is sent

```text
brand proposes a substitute
        ↓
reserveStock(substitute, quantity)
        ↓
Inventory.reservedQuantity += quantity
InventoryMovement { reason: SUBSTITUTION_RESERVED, reservedChange: +quantity }
```

`availableQuantity = quantity - reservedQuantity`, so the unit disappears from the storefront immediately. Reservation uses the same atomic conditional update as checkout; if the units are not available the whole proposal fails with `409 SUBSTITUTE_UNAVAILABLE` and nothing is written. Products without inventory tracking are not reserved. The quantities actually reserved are stored in `OrderAdjustment.stockReservations`.

## 25.2 Resolution

| Outcome | Stock movement | Ledger reason |
| ------- | -------------- | ------------- |
| Customer accepts | Reserved substitute units become sold: `quantity -= n`, `reservedQuantity -= n` | `SUBSTITUTION_FULFILLED` |
| Customer keeps the rest | Reserved substitute units return: `reservedQuantity -= n` | `SUBSTITUTION_RELEASED` |
| Brand withdraws | Same release | `SUBSTITUTION_RELEASED` |
| Proposal expires | Same release | `SUBSTITUTION_RELEASED` |
| Whole order cancelled / rejected | Same release; the order's own items are restocked by the cancellation path | `SUBSTITUTION_RELEASED` |

## 25.3 Units the brand cannot supply

The units that were ordered but cannot be supplied were deducted at checkout. They return to stock **only if the brand ticks “return these units to stock”** on the proposal (`restockRemoved`, default **off**), because missing or damaged units are usually not sellable.

```text
removed units (orderedQuantity - supplyQuantity)
    ↓ only when restockRemoved = true
quantity += removed
InventoryMovement { reason: ADJUSTMENT_RESTOCKED, quantityChange: +removed }
```

If every line is removed the order is cancelled; restocking then follows the same tick. An explicit customer “cancel the whole order” returns everything regardless of the tick.

Every release/restock is guarded by the atomic `PROPOSED → resolved` update, so two answers, an answer racing withdrawal, or an answer racing the expiry sweep can never move stock twice.

## 25.4 Tests

Integration coverage in `server/tests/integration/orderAdjustments.integration.test.js` asserts:

```text
reservation happens once at proposal time
insufficient substitute stock refuses the proposal and writes nothing
accept converts reserved → sold (no double deduction)
remove/withdraw/expiry release exactly once
removed units restock only when ticked
whole-order cancel restocks everything
concurrent answers never double-apply
```

---

## Next Document

**10-payment-system.md — Payments, Cash on Delivery, Payment Status, Refunds, and Future Online Payment Integration**
