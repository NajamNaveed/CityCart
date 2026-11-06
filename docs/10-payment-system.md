# 10 — Payment System

## 1. Purpose

This document defines CityCart's payment architecture.

**v3 rule (2026-11-06): CityCart takes no online payment from customers.**
A customer pays the brand or service provider directly when the work is done:
cash to the rider, or a door method using the seller's own bank account, wallet
or card machine. The platform charges sellers a separate 1% monthly fee
(`15-commission-and-payouts.md`).

The customer payment record covers:

* Payment records
* COD and door collection methods
* Payment statuses
* Order/payment relationship
* Payment confirmation
* Refunds
* Security
* Testing

The mock/test online gateway described in §29 is removed in Phase 1 of
`24-marketplace-v3-plan.md`. There is no customer-facing online checkout.

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

# 4. Supported Payment Methods

The order is always cash on delivery at the platform level. When the rider
arrives, the customer pays one of:

```text
CASH             cash to the rider
BANK_TRANSFER    the seller's own bank account
WALLET           the seller's own JazzCash / Easypaisa / other wallet
CARD_MACHINE     the seller's card machine
```

`Payment.collection` records which one was used, with a reference and a private
proof photo for non-cash methods (§31). The payment's own `method` stays `COD`
for cash and becomes `BANK_TRANSFER`, `WALLET` or `CARD` for the matching door
method.

Customer online payment (`ONLINE_GATEWAY`) is **not supported in v3**. It is
removed together with the mock gateway (§29). No customer money passes through
CityCart.

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

## Door returns (docs/22 §F)

Refused goods are settled by the delivery completion, inside its transaction:

* **Cash on delivery** collects the accepted total only: `Payment.amount` becomes
  the order's `netTotal`. When nothing was accepted, the payment was never
  collected, so it becomes `CANCELLED` (no `paidAt`, no receipt, no collector).
* **Prepaid** keeps its original `Payment.amount` and pushes a refund of the
  refused goods into `refunds[]`; the payment becomes `PARTIALLY_REFUNDED`, or
  `REFUNDED` when everything came back. The delivery fee joins that refund only
  when the whole order was refused for a store-fault reason.
* A refund never changes who collected the cash or edits an issued receipt.

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

A card machine at the door is handled by the seller's machine; CityCart keeps
only the approval reference the rider enters and a private photo of the slip
(§31). The platform never sees or stores a card number.

---

# 16. No Customer Online Payments

Customer online payment is out of scope for v3. There is no hosted checkout, no
payment-provider adapter and no gateway webhook for customers. The seller is
paid directly at the door.

A future product decision may add online payment again, but it would be a new
approved feature, not a dormant code path.

---

# 17. Seller Billing Is a Separate Ledger

The platform's only charge is the seller's 1% monthly fee. It is computed from
completed orders and bookings and is billed separately from the customer's
payment. See `15-commission-and-payouts.md`.

A seller's unpaid platform bill never changes what the customer owes the seller,
and a customer's unpaid order never changes the seller's platform bill until the
order is completed.

---

# 18. Idempotency

Payment operations must be idempotent where applicable:

```text
completing the same delivery twice          one PAID payment, one receipt
verifying the same door proof twice         409 PROOF_ALREADY_DECIDED
refunding the same amount twice             409 REFUND_EXCEEDS_PAID
creating the same commission entry twice     one entry per order/booking
issuing the same monthly invoice twice       one invoice per seller and period
```

Every write uses a conditional update or a unique index, not a read-then-write
check that a concurrent request can race.

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
Payment proof submitted (records keepers; §31.3)
Payment proof rejected (rider: collect again; brand owner; §31.3)
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
7. Keep any future gateway webhook processing idempotent. v3 has no customer
   gateway; seller billing claims are idempotent instead (docs/15).
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

Not applicable in v3: there is no customer online gateway (see §29). If one is
ever reintroduced, it starts from a new product decision and needs these tests:

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
* Customer payments stay at the door; seller billing is separate (docs/15).
* Payment functionality has automated tests.

---

# 27. Source-of-Truth Rule

This document is the authoritative specification for CityCart's payment system.

The MVP should remain simple with COD while keeping payment records separable
from order records. v3 adds no customer online payment; the platform bills
sellers separately (docs/15).

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
* **Door returns (docs/22 §F).** A partially refused cash order is paid at the
  door for the accepted units only, so its receipt shows `Payment.amount` (the net
  total). A fully refused cash order has no payment and therefore no receipt; the
  line snapshot on a partial receipt is still the ordered one, like the order
  itself, and the `netTotal` is what was collected.
* **Paid at the door.** When a COD order was paid by bank transfer, wallet or card
  machine, the receipt snapshots `collectionMethod`, `collectionWallet` and
  `collectionReference` instead of a cash collector (§31). The customer sees how it
  was paid (for example "wallet (JazzCash)"); the brand's view also sees the reference
  and the proof's **live** check state. A cash collection still records the collector
  as before, and its `collectionMethod` is `CASH`.
* **Card machine and door methods** use the same receipt; only the method and
  reference differ. Online gateway receipts are removed with the gateway
  (§29).

Endpoints are in `05-api-specification.md` §22c.

---

# 29. Online Payments — Removed in v3

The October 2026 online-payment chapter (test gateway, provider registry,
`PaymentEvent`, signed webhooks, payment-expiry job, `ONLINE_GATEWAY` checkout
and the `PayNow` UI) is **removed** in Phase 1 of
`24-marketplace-v3-plan.md`.

Why: CityCart does not take customer online payments. The customer pays the
seller directly at the door, and the platform bills the seller separately
(`15-commission-and-payouts.md`).

What is removed:

```text
server/src/payments/                      provider registry and mock provider
server/src/services/onlinePayment.service.js
server/src/controllers/onlinePayment.controller.js
server/src/models/paymentEvent.model.js
server/src/jobs/paymentExpiry.js
online routes in server/src/routes/payment.routes.js
ONLINE_GATEWAY payment method
PAYMENT_PROVIDER / PAYMENT_WEBHOOK_SECRET / ONLINE_PAYMENT_HOLD_MINUTES
client/src/components/PayNow.jsx and its uses
online-payment branches in order validators, services, seed and tests
```

What stays:

```text
COD
door collection: CASH | BANK_TRANSFER | WALLET | CARD_MACHINE
Payment.collection, proof upload and brand verification
receipts
cash settlement
existing Payment records (never deleted)
```

`Payment`, `Payment.collection` and the door method enum keep their existing
shapes except for removing `ONLINE_GATEWAY`. No migration deletes money
records. Any existing `ONLINE_GATEWAY` row, if one exists, is reported and left
read-only; it is not part of normal flows.

Related code after removal: `controllers/payment.controller.js`,
`services/payment.service.js`, `services/paymentProof.service.js`,
`services/cashSettlement.service.js`, `models/payment.model.js`,
`models/receipt.model.js`.

---

# 30. Money When an Order Changes (added October 2026)

Feature H of `21-next-features-plan.md`: the brand cannot supply part of an order and proposes a change (rules in `08-order-management.md` §41). The money side is applied in the same transaction that rewrites the order lines.

**v3 note:** customer online payment is removed (§29), so only §30.1 applies.
§30.2 and §30.3 describe the former online-paid paths; they are not reachable
after Phase 1 and are kept here only as history. Door non-cash payments are
verified at completion, after any adjustment, so they need no paid-online
adjustment path.

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

`Payment.collection` records the door answer. For cash it is written inside the
transaction that marks the COD payment `PAID` and completes the delivery. For a
non-cash payment it is written **when the rider submits it**, while the payment is
still `PENDING` and the delivery is still `OUT_FOR_DELIVERY`; it is never supplied
from a browser.

```text
method          CASH | BANK_TRANSFER | WALLET | CARD_MACHINE
wallet          WALLET only: JAZZCASH | EASYPAISA | OTHER
reference       the transaction id or the card machine's approval code (never a card number)
proof           { publicId, fingerprint }  private Cloudinary asset (non-cash only)
submittedAt     when the rider sent this attempt
verification    SUBMITTED | VERIFIED | REJECTED
verifiedBy      the team member who decided
verifiedAt      when
note            the decision's reason (required for REJECTED)
duplicateReference / duplicateProof   flags for the verifier
proofDeletedAt  set when the retention job removed the photo
```

A non-cash collection also sets the payment's own `method` (`BANK_TRANSFER`,
`WALLET` or `CARD_MACHINE`) so reports and receipts say how it was paid. Cash keeps
`COD`. **A non-cash payment is not `PAID` yet** (§31.3). It never sets `collectedBy`,
so it is absent from the rider's cash balance and from every hand-over list (§11a).

The delivery holds the rider's door answer in `Delivery.pendingCompletion`
(never selected on ordinary reads):

```text
paymentId       the attempt waiting for a decision
lines           the accepted/rejected lines the rider sent
netTotal        the amount the customer actually paid
submittedBy / submittedAt   the rider and when
rejectedAt      set when the brand refused; cleared by a new attempt
```

A refused attempt is moved into the payment's private `collectionHistory` (same
shape as `collection`) before the rider's next attempt overwrites `collection`, so
the brand keeps the audit trail. Nothing about the customer's money moves on a
refusal.

## 31.2 What the rider does

The rider enters the customer's delivery code, answers the per-line accept/reject
step, then chooses **Cash**, **Bank transfer**, **Wallet** (JazzCash, Easypaisa,
Other) or **Card machine**:

```text
CASH           no reference, no photo; the delivery completes immediately
non-cash       a camera photo and a reference are both required (3 to 100 characters);
               the delivery stays OUT_FOR_DELIVERY until the brand verifies it
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

After a non-cash submission the rider's screen says **"Payment waiting for
verification"**: the delivery is not theirs to finish any more, and the code is not
asked again. If the brand refuses it, the rider is notified and collects again from
the same delivery screen (`POST /rider/deliveries/:id/payment`, §31.3): cash
completes immediately; another non-cash method is held for a fresh check.

A brand user completing a delivery from the dashboard has no collection step and is
recorded as cash, exactly as before. While a non-cash payment is waiting, the brand
dashboard cannot move the delivery either (`409 PAYMENT_VERIFICATION_PENDING`).

## 31.3 Verification (the brand's control)

A photo can be faked, so the money is not trusted until the brand matches it against
its own bank, wallet or card-machine statement:

```text
SUBMITTED  -> VERIFIED   (payments.manage)  records verifiedBy/verifiedAt and, in the
                                            same transaction, marks the payment PAID
                                            and the delivery DELIVERED (Return + receipt
                                            behave exactly like a cash completion)
SUBMITTED  -> REJECTED   (payments.manage)  a reason is required; the delivery stays
                                            OUT_FOR_DELIVERY, the payment stays PENDING,
                                            the rider and the brand owner are notified
VERIFIED / REJECTED -> anything else        409 PROOF_ALREADY_DECIDED, nothing changes
```

Verification is therefore the **only** thing that completes a non-cash delivery; the
customer stays "out for delivery" (with a "payment is being checked" note) until then.
The decision is one conditional update, so two people cannot decide the same proof.

A rejection notifies the rider (`PAYMENT_PROOF_REJECTED`, "collect again") and the
brand's owners (`12-notification-system.md`). The rider then collects from the
delivery screen, with no new code attempt (`POST /rider/deliveries/:id/payment`):

```text
cash        the shared completion archives the refused attempt into collectionHistory,
            collects the same amount for the same accepted lines and completes
non-cash    a fresh attempt (photo + reference) replaces `collection`, clears the
            refusal and waits for a new decision
```

**No money moves on the refusal itself**, and the customer is never told whether the
brand verified the photo. Cancelling a delivery at `OUT_FOR_DELIVERY` from the brand
dashboard is still not offered (existing limitation); the refusal path is the rider's.

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

A non-cash receipt is created when the brand verifies the payment (cash still gets
its receipt on completion). The receipt snapshots `collectionMethod`,
`collectionWallet` and `collectionReference` (§28). The customer only ever sees how
it was paid; the brand's view also sees the reference and the live verification
state. No photo is ever shown to the customer, and a refused attempt never produces
a receipt.

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
409 PAYMENT_VERIFICATION_PENDING  a new answer (or a dashboard move) while a proof is waiting
409 NO_REFUSED_PAYMENT         collecting again on a delivery whose payment was not refused
409 PAYMENT_CHANGED / DELIVERY_CHANGED   another request changed the row; reload and retry
```

The rider's collect-again endpoint is `POST /rider/deliveries/:id/payment`
(no delivery code; body: the same `collection` object as the complete call); it is
in `05-api-specification.md` §22.

## 31.7 Configuration

```text
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET   required for the camera flow
PAYMENT_PROOF_LINK_MINUTES=5        signed link lifetime (1 to 60)
PAYMENT_PROOF_RETENTION_DAYS=90     days after the decision before the photo is deleted (1 to 3650)
```

## 31.8 Tests

```text
server/tests/paymentProofs.test.js   queue scoping, signed link, decisions, duplicates, retention,
                                     verification completing the delivery and a refusal leaving it open
server/tests/riderDeliveries.test.js upload only for an own out-for-delivery, non-cash held for checking,
                                     prepaid/refusal, collect-again (cash completes, non-cash re-stages),
                                     another delivery's photo refused, cash balance excludes non-cash
server/tests/deliveries.test.js      the customer sees "payment being checked" but not after a refusal;
                                     the dashboard cannot move a delivery whose payment is waiting
server/tests/receipts.test.js        method/wallet/reference snapshot; brand sees live state, customer does not
server/tests/seedDemo.test.js        demo door payments waiting/refused/verified, history, deleted photo, owner flag
partner/__tests__/                   rider method/camera/reference screens, the "To verify" queue and detail,
                                     verify/reject flows; service request shapes; receipt check row
mobile/__tests__/shopping-screens.test.js   the customer's order page shows the verification wait
```

Demo data (`npm run seed:demo`) includes verified, submitted and refused proofs, a
payment refused and waiting for the rider to collect again, an older attempt in
`collectionHistory`, a duplicate pair and `PAYMENT_PROOF_SUBMITTED` /
`PAYMENT_PROOF_REJECTED` notifications.
