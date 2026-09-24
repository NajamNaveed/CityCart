# 11 — Delivery System

## 1. Purpose

This document defines CityCart's delivery and fulfillment system.

It covers:

* Delivery information
* Order handoff
* Delivery statuses
* Brand fulfillment
* Customer tracking
* Delivery charges
* Delivery areas
* Failed deliveries
* Returns
* Future courier integration

This document is the source of truth for delivery-related functionality.

---

# 2. Delivery Architecture

CityCart separates order management from delivery management.

```text id="dly001"
Order
  ↓
Fulfillment
  ↓
Delivery
  ↓
Customer
```

An order represents the customer's purchase.

Delivery represents the process of getting that order to the customer.

---

# 3. MVP Delivery Model

The initial MVP uses a simple delivery workflow.

```text id="dly002"
Customer places order
        ↓
Brand confirms order
        ↓
Brand prepares order
        ↓
Order ready for shipment
        ↓
Delivery handoff
        ↓
Out for delivery
        ↓
Delivered
```

Advanced courier integrations are not required for the initial MVP.

---

# 4. Delivery Information

An order should contain the delivery information required for fulfillment.

Example:

```text id="dly003"
customerName
customerPhone
address
city
postalCode
deliveryInstructions
```

The delivery address should be stored as an order snapshot.

Changing the customer's profile later must not change an existing order's delivery address.

---

# 5. Delivery Address Validation

At checkout, the backend should validate:

* Customer name
* Phone number
* Address
* City
* Postal code where applicable
* Required delivery fields

The customer must not be able to submit an invalid or incomplete delivery address.

---

# 6. Delivery Area

Each brand may eventually define the areas where it delivers.

For the MVP, delivery availability may be determined using:

```text id="dly004"
City
Postal code
Configured delivery area
```

A brand should not receive orders for unsupported delivery areas.

The exact delivery-area rules should be configurable rather than hard-coded.

---

# 7. Delivery Charges

Delivery charges may be:

* Free
* Fixed
* Brand-specific
* Area-specific

For the MVP, a simple fixed delivery charge is sufficient.

Example:

```text id="dly005"
Order subtotal: 2,000 PKR
Delivery:        200 PKR
Total:          2,200 PKR
```

The backend calculates the final delivery charge.

---

# 8. Multi-Brand Delivery

A multi-brand checkout creates separate brand orders.

Therefore delivery may also be handled separately.

Example:

```text id="dly006"
Checkout

Brand A → Order A → Delivery A
Brand B → Order B → Delivery B
```

Each brand can independently process and fulfill its order.

The customer should still have a unified order experience.

---

# 9. Delivery Status

Delivery status should be separate from payment status.

Initial delivery states may include:

```text id="dly007"
PENDING
PREPARING
READY_FOR_PICKUP
PICKED_UP
IN_TRANSIT
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
RETURNED
```

The exact mapping between order status and delivery status must remain consistent.

---

# 10. Order vs Delivery Status

Order status describes the overall business lifecycle.

Delivery status describes the physical delivery process.

Example:

```text id="dly008"
Order:
SHIPPED

Delivery:
IN_TRANSIT

Payment:
PAID
```

These statuses must not be merged into one field.

---

# 11. Delivery Creation

A delivery record may be created when an order reaches the appropriate fulfillment stage.

Conceptually:

```text id="dly009"
Order
 ↓
READY_FOR_SHIPMENT
 ↓
Delivery created
```

The delivery record can contain:

```text id="dly010"
deliveryId
orderId
brandId
customerId
status
address
deliveryFee
trackingReference
assignedAgent
createdAt
updatedAt
```

---

# 12. Delivery Assignment

For the MVP, delivery assignment may remain simple.

A brand may handle delivery itself or manually assign a delivery person.

Future versions may introduce:

```text id="dly011"
Delivery Agent
Courier Company
Third-Party Logistics Provider
```

---

# 13. Delivery Tracking

The MVP may provide status-based tracking.

Example:

```text id="dly012"
Order Confirmed
      ↓
Processing
      ↓
Ready for Shipment
      ↓
Shipped
      ↓
Out for Delivery
      ↓
Delivered
```

Real-time GPS tracking is not part of the initial MVP.

---

# 14. Tracking Reference

Future courier integrations may provide a tracking number.

Example:

```text id="dly013"
trackingReference = "CC-DEL-102938"
```

The reference must be unique where required.

---

# 15. Delivery Handoff

Before delivery begins, the brand should confirm that the order is ready.

Conceptually:

```text id="dly014"
PROCESSING
    ↓
READY_FOR_SHIPMENT
    ↓
HANDOFF
    ↓
IN_TRANSIT
```

The exact transition depends on whether the brand uses its own delivery operation or a courier.

---

# 16. Failed Delivery

A delivery may fail because of:

* Customer unavailable
* Incorrect address
* Phone unreachable
* Delivery area issue
* Courier problem
* Other operational reason

The system should record an appropriate failure reason.

Example:

```text id="dly015"
deliveryStatus = FAILED
failureReason = "Customer unavailable"
```

A failed delivery should not automatically mean the order is refunded.

The appropriate business process must determine the next action.

---

# 17. Delivery Cancellation

Delivery may be cancelled when:

* The order is cancelled before shipment.
* Brand rejects the order.
* Delivery becomes impossible.
* Administrative action requires cancellation.

The system must prevent invalid delivery-state transitions.

---

# 18. Delivery Completion

When the customer receives the order:

```text id="dly016"
deliveryStatus = DELIVERED
```

The related order should transition to:

```text id="dly017"
DELIVERED
```

The payment workflow may also update the payment status for COD orders when payment is collected.

---

# 19. Proof of Delivery

Proof of delivery is not required for the initial MVP.

Future implementations may support:

* Delivery confirmation code
* Customer signature
* Photo proof
* Courier confirmation

Any proof-of-delivery data must be protected appropriately.

---

# 20. Returns

If a customer needs to return an eligible order:

```text id="dly018"
DELIVERED
   ↓
RETURN_REQUESTED
   ↓
RETURNED
```

Return rules must define:

* Eligibility
* Return window
* Return reason
* Approval
* Pickup
* Inspection
* Refund
* Inventory restoration

Complex return workflows may be introduced after the MVP.

---

# 21. Customer Delivery Experience

Customers should be able to see:

```text id="dly019"
Order number
Brand
Delivery address
Delivery status
Tracking reference where available
Estimated delivery information where available
```

Customers must only see delivery information belonging to their own orders.

---

# 22. Brand Delivery Experience

Brand users should be able to manage deliveries associated with their own orders.

Depending on permissions, they may:

* View delivery information
* Mark order ready
* Assign delivery
* Update delivery status
* Add tracking reference
* Record delivery failure

Brand users must never access another brand's delivery records.

---

# 23. Delivery Permissions

Relevant permissions may include:

```text id="dly020"
orders.view
orders.manage
delivery.view
delivery.manage
```

If delivery-specific permissions are introduced, they must follow the same RBAC and tenant-isolation rules.

---

# 24. Delivery API

Potential endpoints:

```http id="dly021"
GET   /api/v1/deliveries
GET   /api/v1/deliveries/:deliveryId
PATCH /api/v1/deliveries/:deliveryId/status
PATCH /api/v1/deliveries/:deliveryId
```

Customer tracking may also be exposed through the relevant order endpoint.

All protected endpoints require authorization.

---

# 25. Future Courier Integration

CityCart should be designed to support external courier services later.

Conceptually:

```text id="dly022"
CityCart
   ↓
Delivery Service
   ↓
Courier Adapter
   ├── Courier A
   ├── Courier B
   └── Courier C
```

The core order system should not contain provider-specific courier logic.

---

# 26. Courier Webhooks

Future courier providers may send webhook events such as:

```text id="dly023"
Shipment picked up
Shipment in transit
Out for delivery
Delivered
Delivery failed
Returned
```

Webhook processing must:

* Authenticate the provider
* Validate events
* Prevent duplicate processing
* Map provider statuses to CityCart statuses
* Preserve order ownership

---

# 27. Delivery Security

The delivery system must prevent:

* Cross-brand delivery access
* Unauthorized status changes
* Customer access to another customer's address
* Modification of delivery ownership
* Fake delivery completion
* Unauthorized tracking updates

Delivery addresses are sensitive customer information and must be handled accordingly.

---

# 28. AI Implementation Rules

AI agents must:

1. Read this document before modifying delivery logic.
2. Keep delivery status separate from order/payment status.
3. Preserve customer address snapshots.
4. Enforce brand ownership.
5. Validate delivery-state transitions.
6. Never trust client-supplied delivery ownership.
7. Add tests for delivery authorization.
8. Keep courier-specific code isolated.
9. Avoid implementing GPS tracking in the MVP.
10. Report conflicts before changing documented delivery rules.

---

# 29. Required Tests

Tests must cover:

* Valid delivery creation
* Invalid delivery creation
* Address validation
* Delivery status transitions
* Invalid status transitions
* Customer delivery access
* Cross-customer access prevention
* Brand delivery isolation
* Unauthorized status changes
* Failed delivery
* Delivery cancellation
* Delivery completion

---

# 30. Acceptance Criteria

Delivery functionality is considered implemented when:

* Delivery information is captured during checkout.
* Address snapshots are preserved.
* Delivery status is tracked separately.
* Brands can manage their own deliveries.
* Customers can track their own delivery status.
* Delivery charges are calculated by the backend.
* Failed deliveries are supported.
* Cross-brand delivery access is prevented.
* Invalid delivery transitions are rejected.
* The architecture supports future courier integration.

---

# 31. Source-of-Truth Rule

This document is the authoritative specification for CityCart delivery functionality.

The MVP should prioritize reliable status-based fulfillment rather than complex GPS or courier integrations.

---

## Next Document

**12-notification-system.md — In-App Notifications, Real-Time Events, Order Notifications, and Notification Preferences**
