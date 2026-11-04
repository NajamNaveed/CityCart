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
 ↓
Rider assigned automatically (§11a)
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

# 11a. Automatic Rider Dispatch

Creating the delivery record and choosing its rider are one step for the brand:
right after the delivery is created (a picker packs the order, or the brand moves
it to `READY_FOR_SHIPMENT`), the backend assigns it to the brand's active rider
with the fewest deliveries still in progress.

Rules:

- Only `RIDER` accounts that are active and belong to the order's brand are
  considered; another brand's rider can never be chosen.
- "In progress" means any delivery not in a final status
  (`DELIVERED`, `CANCELLED`, `RETURNED`), so completed work does not count
  against a rider.
- Ties go to the rider who has gone longest without an assignment, then to the
  oldest rider account, so the load stays predictable.
- A brand with no active rider creates the delivery unassigned; a brand admin
  can assign one later.
- Dispatch never replaces a rider who is already on the delivery. A brand admin
  can still change or remove the rider from the order page (§12).
- The chosen rider receives the normal `DELIVERY_ASSIGNED` notification.

Dispatch runs after the order's status change commits, so a failure in dispatch
never undoes the packing. The delivery is then ready for the rider to pick up.

---

# 12. Delivery Assignment

For the MVP, delivery assignment is automatic (see §11a) and can be corrected
by hand.

A brand may handle delivery itself or manually assign a delivery person.

**Riders (added October 2026).** A brand may create rider accounts
(`RIDER`, one brand each, see `20-partner-app.md`) and assign a delivery to one
of them (`PATCH /deliveries/:id/rider`). This endpoint is the manual override of
automatic dispatch. Assignment is only possible on a
delivery that is not final, only to an active rider of the same brand, and
does not change delivery, order or payment status. A rider who still has open deliveries cannot be deactivated (`409 RIDER_HAS_OPEN_DELIVERIES`). A rider sees and moves only
their own deliveries (`/rider/deliveries`); a hand-typed `assignedAgent` remains
for brands that do not use riders.

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

**How the customer paid (implemented October 2026).** A rider completes a COD
delivery with the customer's code and then records the money: **Cash**, **Bank
transfer**, **Wallet** (JazzCash, Easypaisa, Other) or **Card machine**. Cash works
as before. Every other choice requires a camera photo of the confirmation or the
machine's slip and a reference (transaction id or approval code), and the payment is
`PAID` but **unverified** until the brand checks it. A prepaid order shows no choice.
Rules, privacy and retention are in `10-payment-system.md` §31; the endpoints are in
`05-api-specification.md` §22b.

---

# 19. Proof of Delivery

Proof of delivery is not required for the initial MVP.

**Delivery confirmation code (implemented October 2026).** A six-digit code is
created with the delivery (and for older deliveries when a rider is assigned).
Only the customer can read it. A rider can complete a delivery only by entering
it; five wrong tries lock it, after which the brand completes the delivery from
the dashboard. Brand users complete deliveries without it as before. See
`20-partner-app.md` §7.

**Payment proof at the door (implemented October 2026).** This is proof of *payment*,
not proof of delivery. For a non-cash door payment the rider takes a camera-only photo
and enters a reference. The photo is stored privately (never a public link), shown only
to that brand's staff with payment permission through a short-lived signed link, and
deleted 90 days after the brand decides. The customer never sees it; the rider sees only
whether it is still waiting, verified or rejected. See `10-payment-system.md` §31.

Future implementations may also support:

* Customer signature
* Photo proof
* Courier confirmation

Any proof-of-delivery data must be protected appropriately.

---

# 20. Returns

Marketplace v2 only supports refusing goods **at the door**, while the rider is
there (docs/22 §F). A return request after delivery is out of scope.

On completion the rider sends the accepted and rejected quantity for every line,
with a reason (`DAMAGED`, `WRONG_ITEM`, `NOT_WANTED`, `MISSING`) and an optional
private photo:

```text id="dly018"
OUT_FOR_DELIVERY
   ↓  completion, some refused
DELIVERED (order fulfilment PARTIAL)  + Return DOOR IN_TRANSIT
   ↓  brand marks received
Return RECEIVED (per line: restock or write off)

OUT_FOR_DELIVERY
   ↓  completion, everything refused
RETURNED (order fulfilment NONE)      + Return DOOR IN_TRANSIT
```

The refused goods travel back with the rider (`Return.riderId`) and the delivery
keeps `returnId`. The delivery becomes `DELIVERED` or `RETURNED` (never both
`DELIVERED` and a pending return at the door). The order and payment side is in
docs/08 §41.10 and docs/10 §13; the stock side is in docs/09 §15.

The old `RETURN_REQUESTED` order status stays in the schema for a future
customer-requested return flow, but nothing writes it in v2.

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

---

# 30. Rider Live Location (added October 2026)

A rider can let the customer and the brand see roughly where they are while an order is out for
delivery. It is **the rider's choice**, built to collect as little as possible.

## 30.1 Rules (never break these)

1. **Opt-in.** A switch on the rider's Account screen, **off by default**, per phone. Turning it on
   asks the phone's location permission. Signing out turns it off.
2. **Only while delivering, and only while the app is open.** The app reports about every 30 seconds
   (or 25 metres). There is no background tracking. The server accepts a position only if the rider
   has a delivery `OUT_FOR_DELIVERY` (`409 NO_ACTIVE_DELIVERY` otherwise, and the app stays quiet for a minute).
3. **Only the last point is kept**, one document per rider (`RiderLocation`), replaced on every
   update. There is no history. The database deletes it two hours after the last update (TTL index);
   stopping sharing, or signing out, deletes it at once.
4. **Only these people can read it, and only for this delivery:** the order's customer, and that
   brand's staff with `delivery.view`. The delivery is looked up with the caller's own scope first
   (their order, or their brand's delivery), so nobody can follow someone else's rider. Anyone else gets `404`/`403`.
5. **Only while the delivery is `OUT_FOR_DELIVERY`**, and only if the point is less than 10 minutes
   old; otherwise the answer is `{ location: null }` and the apps show nothing (they never claim
   a position they do not have). The rider's account id is never returned.

## 30.2 API

```text
PUT    /api/v1/rider/deliveries/location       rider: { latitude, longitude, accuracy? }
DELETE /api/v1/rider/deliveries/location       rider: forget my position now
GET    /api/v1/deliveries/:id/rider-location   customer (own order) or brand with delivery.view: { location }
```

`location` is `{ latitude, longitude, accuracy, recordedAt }` or `null`. Updates are limited to 12 a minute per rider.
A terminated brand's riders may still share (they are finishing deliveries on the road).

## 30.3 Screens

* Delivery app, rider: Account, "Share my location while I deliver".
* Delivery app, delivery detail: **Open in map** shows the customer's checkout pin on an OpenStreetMap
  preview inside the screen (no key, no Google Maps SDK); **Navigate** hands the coordinates to the
  phone's own maps app.
* Staff app, records: the delivery's detail shows "Rider location" (last seen, Open in Maps, Refresh).
* Shopper app and customer website: while the order is out for delivery, "Your rider" shows an
  **internal map** (OpenStreetMap) with the checkout pin and a rider dot that moves as positions
  arrive (polled about every 15 seconds while the screen/tab is visible). The wording notes that the
  rider may have other orders to deliver before this one. Nothing is drawn when the rider is not
  sharing.

The rider's delivery view includes the customer's checkout pin as `deliveryLocation`
(`{ latitude, longitude }`, only while the delivery is open); it never leaks the raw GeoJSON
coordinates or any customer account data.

Related code: `models/riderLocation.model.js`, `services/riderLocation.service.js`,
`controllers/riderDelivery.controller.js`, `controllers/delivery.controller.js`, `partner/src/services/location.js`,
`delivery/src/components/DestinationMap.jsx`, `mobile/src/components/NearbyMap.jsx`,
`mobile/src/hooks/useRiderLocation.js`, `client/src/components/DeliveryMap.jsx`.

