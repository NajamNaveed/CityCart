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

## 11a. Cash handling (added October 2026)

Cash on delivery is money in someone's pocket until it is handed over, so the
payment records who holds it:

```text
brandId        the brand the cash belongs to (set when collected)
collectedBy    who received the cash: the rider, or the team member who completed the delivery
collectedAt    when
settledAt      when the brand confirmed that person handed the cash over
settledBy      who at the brand confirmed it
```

* `collectedBy`, `collectedAt` and `brandId` are written in the same transaction
  that marks the COD payment `PAID` (delivery completion, or the manual safety net
  in §19). They are never client-supplied.
* Settlement is the brand's act: `POST /payments/cash/settle` (`payments.manage`)
  lists exactly the payments counted. It is all or nothing, pinned to the brand and
  the collector, and a payment that is not (or no longer) unsettled makes the whole
  request fail with `409 CASH_CHANGED`.
* `GET /payments/cash/outstanding` (`payments.view`) shows who holds how much; with
  `collectorId` it lists that person's unsettled payments, oldest first.
* A rider sees only their own total (`GET /rider/deliveries/cash`).
* Refunds do not change who collected the cash: a refunded payment is still cash
  that was collected, and it stays on the books until settled.
* **Non-cash at the door** (bank transfer, wallet, card machine; §31) never sets
  `collectedBy`. Nobody holds cash, so it never appears in a rider's balance, in
  the outstanding list, or in a hand-over.

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
Payment proof rejected (brand owner; §31.3)
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

---

# 28. Receipts (added October 2026)

A receipt is issued automatically for every payment that becomes `PAID`, and is
never created, edited or deleted through the API.

* **Snapshot.** A receipt copies the order's items, totals, the brand name, the
  payment method and reference, who collected the cash, and the payment time. It
  never copies the customer's address or phone. Later changes to a product, a
  brand or an address cannot alter it, and a refund does not change it. The one
  exception is an accepted order adjustment, which rewrites an already-issued
  online receipt to the final lines and total (§30).
* **One per payment** (unique on `paymentId`), numbered `RC-<year>-<6 digits>` from
  an atomic yearly counter (`receipt-<year>`); a failed attempt may leave a gap,
  never a duplicate.
* **When.** After the payment change has committed, so a receipt problem can never
  undo a payment. If it fails, reading the receipt (`GET /receipts/order/:orderId`)
  issues it, so none is permanently lost.
* **Who sees what.** The customer: their own, without internal details (who collected
  the cash, the payment id, the reference). The brand: its own, with `payments.view`,
  including who collected the cash and the payment reference. Super admin: all.
  Riders: none. See `20-partner-app.md` §4.
* **Paid at the door.** When a COD order was paid by bank transfer, wallet or card
  machine, the receipt snapshots `collectionMethod`, `collectionWallet` and
  `collectionReference` instead of a cash collector (§31). The customer sees how it
  was paid (for example "wallet (JazzCash)"); the brand's view also sees the reference
  and the proof's **live** check state. A cash collection still records the collector
  as before, and its `collectionMethod` is `CASH`.
* **Card and online** payments (Phase E) get the same receipt from the same code;
  only the confirmation of the payment differs (the gateway's signed webhook).

Endpoints are in `05-api-specification.md` §22c.

---

# 29. Online Payments (added October 2026)

Customers can pay for an order online, through a hosted payment page, besides cash on
delivery. This chapter makes sections 16 to 19 concrete. **Status: built and tested with a
built-in TEST gateway; a real gateway is added later as one more provider file.**

## 29.1 Rules (never break these)

1. Only a **verified gateway notification** marks an online payment `PAID`: never the app,
   never the customer, never a redirect back from the gateway.
2. Every notification is applied **at most once**, together with the change it causes.
3. Money that nothing can accept (a cancelled or expired order, a second payment, a wrong
   amount, an unknown reference) is **never applied silently**: it is recorded for review.
4. **Card data is never stored or seen.** CityCart keeps only the provider's reference, the
   provider's name and the status.
5. The test gateway **cannot be switched on in production**.

## 29.2 Providers

Code: `server/src/payments/`. A provider is one file with `name`, `label`,
`createCheckout({ payment, order })` (returns a reference and the hosted page's address) and
`verifyWebhook(rawBody, headers)` (checks the signature over the raw bytes and returns
`{ eventId, reference, status: PAID|FAILED, amount, currency }`). The registry in
`payments/index.js` lists them; `activeProvider()` is `null` unless a known provider is named
**and** `PAYMENT_WEBHOOK_SECRET` has at least 16 characters.

* `mock` (`payments/mock.provider.js`): the TEST gateway. It serves a checkout page
  (`GET /payments/mock-checkout/:reference`, with Pay and Fail buttons) and tells the server
  about the result with a **signed** notification (HMAC-SHA256 of the raw body, header
  `X-CityCart-Signature: sha256=<hex>`) that goes through exactly the same code as a real
  gateway's. No money moves. Use it for development, demos and automated tests.
* **A real gateway** (to do: needs the owner's sandbox account and the gateway's official
  documentation): add `payments/<name>.provider.js` with the same members and register it.
  Nothing else changes. Live card payments also need a registered business with the gateway.

## 29.3 Environment

| Variable | Meaning |
|---|---|
| `PAYMENT_PROVIDER` | `none` (default, cash only) or a provider name (`mock`) |
| `PAYMENT_WEBHOOK_SECRET` | Signs and verifies notifications; 16+ random characters; secret |
| `PUBLIC_API_URL` | The address phones and browsers can reach this server at (used to build the test gateway's page address) |
| `ONLINE_PAYMENT_HOLD_MINUTES` | How long an unpaid online order keeps its stock (5 to 240, default 30) |

## 29.4 The flow

1. `GET /payments/methods` (customer): `COD`, plus `ONLINE_GATEWAY` while a provider is on.
2. **Checkout** with `paymentMethod: ONLINE_GATEWAY` creates the usual orders (one per brand,
   stock deducted exactly as for cash) and one payment per order, `PENDING`, with `expiresAt`
   = now + the hold. Refused with `400 ONLINE_PAYMENTS_UNAVAILABLE` while no provider is on.
   (`CARD`, `BANK_TRANSFER` and `WALLET` are still not accepted.)
3. `POST /payments/order/:orderId/checkout` (customer, own order only) returns the hosted
   page's address. Idempotent: it reuses the payment's reference. Errors: `404` not yours,
   `409 NOT_ONLINE`, `ALREADY_PAID`, `NOT_PAYABLE`, `PAYMENT_EXPIRED`; `503
   ONLINE_PAYMENTS_UNAVAILABLE`.
4. The customer pays on the gateway's page. The gateway calls
   `POST /payments/webhooks/:provider` (no login; authenticated by the signature, checked
   before anything else, on the raw body). Answers: `401` bad signature, `400` malformed,
   `404` unknown provider or payments off, otherwise **`200` with the outcome** so the gateway
   stops retrying.
5. Outcomes (stored as `PaymentEvent`, unique on provider + eventId):

| Outcome | Meaning | What changed |
|---|---|---|
| `PAID` | Payment was pending and the amount matched | Payment `PAID`, order `paymentStatus` `PAID`, customer notified, receipt issued (after commit) |
| `FAILED_ATTEMPT` | The customer's attempt failed | Nothing. The payment stays pending so they can try again until the hold ends |
| `LATE_PAYMENT` | Money arrived for a cancelled, expired or failed payment | Nothing applied. **Needs a refund** |
| `DUPLICATE_PAYMENT` | Money arrived again for an already paid payment | Nothing applied. **Needs a refund** |
| `AMOUNT_MISMATCH` | Amount or currency differs | Nothing applied |
| `UNKNOWN_PAYMENT` | No payment has this reference | Nothing applied |
| `DUPLICATE_EVENT` (answer only) | The same notification again | Nothing (the unique index rejects it) |

   The super admin reviews them at `GET /payments/events?outcome=` (the cases that need a
   human are `LATE_PAYMENT`, `DUPLICATE_PAYMENT`, `AMOUNT_MISMATCH`).
6. **The brand cannot confirm an unpaid online order:** `PATCH /brand/orders/:id/status` to
   `CONFIRMED` needs cash on delivery or a paid payment (`409 PAYMENT_PENDING`). Rejecting is
   still allowed and restocks.
7. **Not paid in time:** a timer inside the server (`jobs/paymentExpiry.js`, every minute,
   only while a provider is on) cancels online orders whose hold ended, returns their stock,
   cancels the payment, and tells the customer and the brand. Each order is cancelled by one
   atomic conditional update (still `PENDING` and unpaid), so running twice, on two servers, or
   against the customer's own cancel can never restock twice.
8. **The customer cannot cancel an order that is already paid online** (`409
   PAID_ORDER_NOT_CANCELLABLE`): they ask the brand to reject it. A rejected paid order is
   refunded with the existing refund endpoint (section 13).

## 29.5 Limits of this version

* **Refunds are records.** Marking a payment refunded does not send money back through the
  gateway; the brand returns it in the gateway's dashboard. A real provider's refund call
  belongs in its adapter.
* One payment per order: a cart with several brands is paid in several steps (a Pay button per order).
* The test gateway's page is plain HTML; a real gateway shows its own page.
* Online receipts are issued like cash ones (section 28) but have no collector.

Related code: `services/onlinePayment.service.js`, `controllers/onlinePayment.controller.js`,
`models/paymentEvent.model.js`, `routes/payment.routes.js`, `jobs/paymentExpiry.js`.

---

# 30. Money When an Order Changes (added October 2026)

Feature H of `21-next-features-plan.md`: the brand cannot supply part of an order and proposes a change (rules in `08-order-management.md` §41). The money side is applied in the same transaction that rewrites the order lines.

## 30.1 Cash on delivery

```text
proposal accepted or items removed
        ↓
Payment.amount = new order total
```

The rider collects the new total. Nothing is refunded because nothing was collected yet. The payment stays `PENDING` until the normal delivery hand-over.

## 30.2 Online, already paid

The new total may be **equal or lower**, never higher:

```text
new total == paid total    nothing changes
new total <  paid total    difference = paid - new total
                           Payment.refundedAmount += difference
                           Payment.refunds[] += { amount, reason, by, at }
                           Payment.status = PARTIALLY_REFUNDED
                             (or REFUNDED when nothing remains)
                           Order.paymentStatus stays PAID
                           Order.total = new total
new total >  paid total    409 ADJUSTMENT_INCREASES_TOTAL, nothing changes
```

The refund is a **record**, not a gateway call (see §29.5). The customer is notified with the standard refund notification. If the customer cancels the whole order instead, the remaining paid amount is refunded and the payment becomes `REFUNDED`.

A refund can never exceed what was paid (`409 REFUND_EXCEEDS_PAID`). The payment update is conditional on the previous status and refunded amount, so a concurrent payment event cannot be overwritten (`409 PAYMENT_CHANGED`).

## 30.3 Online, not paid yet

An unpaid online order is on a stock hold and its amount is still what the customer is about to pay. It **cannot be adjusted** (`409 ONLINE_PAYMENT_NOT_COMPLETED`); the brand waits for payment, or rejects the order, or lets the hold expire.

## 30.4 Receipts

```text
COD                 the receipt is issued at delivery, after any adjustment; nothing to sync
paid online         the receipt already exists, so it is rewritten to the final
                    items, subtotal and total in the same transaction
```

An online order increased by an adjustment is impossible, so the receipt's amount never becomes higher than the money received. Refunds are shown on the payment, not by editing the receipt again.

## 30.5 Tests

`server/tests/integration/orderAdjustments.integration.test.js` covers:

```text
COD amount follows the new total
paid online lower total → PARTIALLY_REFUNDED / refund entry / order stays PAID
paid online higher total → refused, nothing changes
unpaid online order → proposal refused
refund cannot exceed the paid amount
```

---

# 31. Payment at the Door (added October 2026)

Feature I of `21-next-features-plan.md`. **Status: built and tested without a real phone**
(the camera is the only part that needs one). The order is still cash on delivery;
this records **how the customer actually paid when the rider arrived**, including a
private photo of the confirmation or the card machine's slip.

## 31.1 What is recorded

`Payment.collection` is written inside the same transaction that marks the COD payment
`PAID` (delivery completion). It is never supplied from a browser.

```text
method          CASH | BANK_TRANSFER | WALLET | CARD_MACHINE
wallet          WALLET only: JAZZCASH | EASYPAISA | OTHER
reference       the transaction id or the card machine's approval code (never a card number)
proof           { publicId, fingerprint }  private Cloudinary asset (non-cash only)
verification    SUBMITTED | VERIFIED | REJECTED
verifiedBy      the team member who decided
verifiedAt      when
note            the decision's reason (required for REJECTED)
duplicateReference / duplicateProof   flags for the verifier
proofDeletedAt  set when the retention job removed the photo
```

A non-cash collection also changes the payment's own `method` (`BANK_TRANSFER`,
`WALLET` or `CARD`) so reports and receipts say how it was paid. Cash keeps `COD`.
**A non-cash payment is `PAID` immediately but unverified.** It never sets
`collectedBy`, so it is absent from the rider's cash balance and from every hand-over
list (§11a).

## 31.2 What the rider does

The rider enters the customer's delivery code, then chooses **Cash**, **Bank transfer**,
**Wallet** (JazzCash, Easypaisa, Other) or **Card machine**:

```text
CASH           no reference, no photo
non-cash       a camera photo and a reference are both required (3 to 100 characters)
prepaid order  no choice at all; sending a collection is 409 PAYMENT_PREPAID
```

The photo never passes through the API. `POST /rider/deliveries/:id/proof-upload`
returns a **signed Cloudinary upload** into a server-built folder; the app uploads to
Cloudinary and sends only the resulting `publicId` and `etag` fingerprint. The server
accepts the photo only if the path is inside **this brand's and this delivery's**
folder, so a rider cannot attach someone else's proof (`422 PROOF_NOT_YOURS`). The
upload request requires the delivery to be `OUT_FOR_DELIVERY` (`409 PROOF_NOT_ALLOWED`).
Without Cloudinary configured the answer is `503 PROOF_NOT_CONFIGURED` and the apps
offer cash only.

A brand user completing a delivery from the dashboard has no collection step and is
recorded as cash, exactly as before.

## 31.3 Verification (the brand's control)

A photo can be faked, so the money is not trusted until the brand matches it against
its own bank, wallet or card-machine statement:

```text
SUBMITTED  -> VERIFIED   (payments.manage)  records verifiedBy/verifiedAt
SUBMITTED  -> REJECTED   (payments.manage)  a reason is required; the brand owner is flagged
VERIFIED / REJECTED -> anything else        409 PROOF_ALREADY_DECIDED, nothing changes
```

The decision is one conditional update, so two people cannot decide the same proof.
A rejection notifies the brand's owners (`PAYMENT_PROOF_REJECTED`, `12-notification-system.md`).
**No money moves automatically:** collecting again or writing it off is the brand's
decision. The customer is not told whether the brand verified the photo.

## 31.4 Privacy, links and retention

* The photo is an **authenticated** Cloudinary asset, never public. The database stores
  only its path and fingerprint, never image bytes.
* Staff see it through `GET /payments/:id/proof`, which checks the caller's brand first
  and returns a **signed link valid for 5 minutes** (`PAYMENT_PROOF_LINK_MINUTES`, 1–60).
* Who can see a proof: brand users with `payments.view` (queue and link) and
  `payments.manage` (decision), platform admins with `admin.payments`; the super admin.
  **Not the customer, not other riders, not other brands.** The rider who took it sees
  only `proofStatus` on their delivery.
* Photos are deleted by a server job every six hours once **90 days** have passed since
  the decision (`PAYMENT_PROOF_RETENTION_DAYS`, 1–3650). The payment keeps its method,
  reference and decision; only `collection.proof` is removed and `proofDeletedAt` set.
  A failed Cloudinary deletion is retried on the next run.
* **Duplicate use is a flag, never a block:** the same reference or the same Cloudinary
  fingerprint on another payment of the same brand sets `duplicateReference` /
  `duplicateProof`, shown to the verifier as "Used before".

## 31.5 Receipts

The receipt snapshots `collectionMethod`, `collectionWallet` and `collectionReference`
(§28). The customer only ever sees how it was paid; the brand's view also sees the
reference and the live verification state. No photo is ever shown to the customer.

## 31.6 API and errors

Endpoints and request bodies are in `05-api-specification.md` §22. New error codes:

```text
503 PROOF_NOT_CONFIGURED       Cloudinary is not set up on this server
404 PROOF_NOT_FOUND            the payment has no photo (or it was deleted)
409 PROOF_NOT_ALLOWED          proof upload while the delivery is not out for delivery
422 PROOF_NOT_YOURS            the photo path is not this brand's/delivery's
409 PAYMENT_PREPAID            a collection was sent for an order paid up front
409 PAYMENT_ALREADY_COLLECTED  a non-cash collection arrived after the payment was already collected
409 PROOF_ALREADY_DECIDED      someone already verified/rejected this proof (with `verification`)
```

## 31.7 Configuration

```text
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET   required for the camera flow
PAYMENT_PROOF_LINK_MINUTES=5        signed link lifetime (1 to 60)
PAYMENT_PROOF_RETENTION_DAYS=90     days after the decision before the photo is deleted (1 to 3650)
```

## 31.8 Tests

```text
server/tests/paymentProofs.test.js   queue scoping, signed link, decisions, duplicates, retention
server/tests/riderDeliveries.test.js upload only for an own out-for-delivery, complete with collection,
                                     prepaid/refusal, cash balance excludes non-cash
server/tests/receipts.test.js        method/wallet/reference snapshot; brand sees live state, customer does not
server/tests/seedDemo.test.js        demo door payments in all three states, deleted photo, owner flag
partner/__tests__/                   rider method/camera/reference screens, the "To verify" queue and detail,
                                     verify/reject flows; service request shapes; receipt check row
mobile/__tests__/shopping-screens.test.js   the customer's receipt says how it was paid
```

Demo data (`npm run seed:demo`) includes verified, submitted, rejected and
already-deleted proofs, a duplicate pair and a `PAYMENT_PROOF_REJECTED` notification.
