# 15. Commission and Seller Billing

## 1. Purpose

This document defines how CityCart charges **sellers** — brands and service
providers — the platform fee on completed sales.

It replaces the earlier conceptual "commission and payouts" model. In v3:

* the customer pays the seller directly (cash or a door method);
* the seller pays CityCart **1% of each completed order or booking**;
* billing is **monthly**;
* unpaid bills move the seller through warning, restriction and freeze;
* CityCart does **not** pay sellers, hold customer money, or run an escrow.

The backend is authoritative for every amount and state in this document.

Related documents:

```text
24-marketplace-v3-plan.md   programme and locked defaults
10-payment-system.md        customer payment at the door
08-order-management.md      order lifecycle
```

---

## 2. Money model

```text
Customer
   │ pays directly (cash / bank / wallet / card machine at the door)
   ▼
Seller (brand or service provider)
   │ 1% of completed value, monthly
   ▼
CityCart
```

A completed sale produces:

```text
Order net merchandise value       (or confirmed booking amount)
        ↓
CommissionEntry                   1%, accrued
        ↓
Monthly SellerInvoice             issued on the 1st, due in 7 days
        ↓
SellerPaymentClaim                bank transfer + receipt
        ↓
Verified payment                  invoice PAID, seller ACTIVE
```

If a seller does not pay, the account is warned, restricted, then frozen.

---

## 3. Commission rules

| Rule | Value |
|---|---|
| Rate | **1%** (`rateBps = 100`) |
| Order base | `order.netTotal - deliveryFee - tax` |
| Service base | Confirmed final amount of the booking |
| Trigger | Order `DELIVERED`; booking `CONFIRMED` |
| Excluded | Cancelled/rejected orders, door-returned lines, unconfirmed bookings |
| Delivery fee | Not commissionable |
| Tax | Not commissionable |
| Currency | PKR |
| Rounding | Half-up to the nearest paisa |

The rate is stored on every entry. Changing the platform rate later affects
only new entries; historical entries keep the rate they were created with.

```text
PKR 10,000 merchandise = 1,000,000 paisa
1%                     =    10,000 paisa = PKR 100
```

The backend computes the base from trusted records. A client may not submit
`eligibleAmount`, `commissionAmount`, `rateBps`, `sellerId` or `sellerType`.

---

## 4. CommissionEntry

Collection: `commissionentries`

```text
_id
sellerType      BRAND | SERVICE_PROVIDER
sellerId        Brand._id or ServiceProvider._id
sourceType      ORDER | SERVICE_BOOKING
sourceId        Order._id or ServiceBooking._id
eligibleAmountPaisa
rateBps         100 at the time of the sale
commissionPaisa
kind            SALE | REVERSAL
status          ACCRUED | INVOICED | PAID | REVERSED
occurredAt
invoiceId       null until invoiced
reversalOf      null | CommissionEntry._id
createdAt
updatedAt
```

Rules:

* One `SALE` entry per source: unique `(sourceType, sourceId)`.
* Entries are immutable. A correction is a `REVERSAL` entry pointing at the
  original; the original is marked `REVERSED` only after the reversal is
  invoiced.
* A reversal can never make an invoice negative. The excess becomes a credit
  carried to the next invoice.
* The entry is written in the same transaction as the order/booking status
  change that triggers it. If a retry finds the entry, it does nothing.

---

## 5. Multi-seller separation

A multi-brand cart becomes one order per brand. Each order produces its own
commission entry, invoice and billing account. A service booking produces an
entry for the provider.

Brand A must never see Brand B's or a provider's entries, invoices, claims or
balance. Service providers are isolated the same way. The super admin sees the
platform total.

---

## 6. Triggers and adjustments

### 6.1 Order delivered

When the delivery is completed and the order becomes `DELIVERED`:

```text
eligible = order.netTotal - order.deliveryFee - order.tax
```

`netTotal` already excludes door-returned lines. A fully returned order
(`RETURNED`) does not create a commission entry. A cancelled order never does.

### 6.2 Booking confirmed

When the customer confirms the provider's completion (or the 3-day
auto-confirmation runs):

```text
eligible = booking.finalAmount
```

### 6.3 Refund or return after invoicing

A refund or return that reduces a sale already invoiced creates a `REVERSAL`
entry in the next open period. The current invoice is never edited.

### 6.4 Delivery fee and tax

The delivery fee and tax are excluded from the base. If the order schema does
not yet separate tax, the base is `netTotal - deliveryFee`, and the calculation
is documented in the service before billing is enabled.

---

## 7. SellerInvoice

Collection: `sellerinvoices`

```text
_id
sellerType / sellerId
periodStart / periodEnd        calendar month, Asia/Karachi
salesPaisa                     sum of eligible sales
commissionPaisa                sum of SALE entries
creditsPaisa                   reversals and overpayments
amountDuePaisa                 commission - credits - verifiedPaid
status                         DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | VOID
issuedAt
dueAt                          issuedAt + 7 days
paidAt
createdBy                      SYSTEM or a super admin id
createdAt / updatedAt
```

Lifecycle:

1. The monthly job closes the previous calendar month at 00:05 on the 1st.
2. It groups `ACCRUED` entries per seller into one invoice.
3. Invoices below **PKR 100** are not issued; their entries roll forward.
4. An issued invoice is due 7 days later.
5. Verification of a payment claim updates `amountDuePaisa` atomically and
   marks the invoice `PARTIALLY_PAID` or `PAID`.
6. An invoice is never edited after issue. Corrections are new entries.

Unique: `(sellerType, sellerId, periodStart)`.

---

## 8. SellerPaymentClaim

Collection: `sellerpaymentclaims`

A seller reports that they paid an invoice.

```text
_id
invoiceId / sellerType / sellerId
amountPaisa
method          BANK_TRANSFER | JAZZCASH | EASYPAISA | OTHER
reference       bank transaction id or wallet reference
receipt         { publicId, fingerprint }   private Cloudinary asset
comment
status          SUBMITTED | VERIFIED | REJECTED
verifiedBy / verifiedAt
rejectionReason required when REJECTED
createdAt / updatedAt
```

Rules:

* The seller can submit a claim only for their own invoice.
* The amount must be greater than zero and cannot exceed the outstanding
  balance plus any credit the seller wants to leave. Overpayment becomes a
  credit on the next invoice.
* A receipt is uploaded through a signed Cloudinary path, like a payment proof.
  Only the seller and the super admin can see it.
* A claim is `SUBMITTED` until a super admin verifies or rejects it.
* Verification is one conditional update, so two admins cannot pay the same
  balance twice.
* Rejection requires a reason and notifies the seller.
* Idempotency: unique `(invoiceId, reference, amountPaisa)`; a duplicate
  submission is refused.

---

## 9. Freeze ladder

Freeze state is stored per seller tenant and derived from the oldest unpaid
invoice:

```text
ACTIVE       no overdue invoice
WARNING      due date reached; login popup, banner; new orders allowed
RESTRICTED   due + 7 days; no new orders/bookings; existing jobs fulfillable;
             listings visible with "not accepting new orders";
             dashboard read-only except Billing and Help
FROZEN       due + 14 days; listings hidden from discovery;
             dashboard read-only except Billing and Help;
             existing orders/bookings still fulfillable
```

Rules:

* The seller can always complete work already accepted.
* Commission keeps accruing on those completions.
* Verifying a payment returns the seller to `ACTIVE` immediately and restores
  listings.
* The check is evaluated on every seller request, not only by the daily job, so
  a stale job cannot let a restricted seller create orders.
* A super admin may grant a grace period with a reason and an expiry. The
  action is audited and shown to the seller.
* A seller sees a login popup at `WARNING`, `RESTRICTED` and `FROZEN` with the
  amount due, bank details and a link to Billing.
* A frozen seller can still sign in, read, download invoices and submit proof.

---

## 10. Seller billing dashboard

Brand and provider dashboards expose a Billing section:

```text
Balance and next due date
Freeze state and what it blocks
Platform bank details (bank, account title, IBAN/account number)
Invoices, period, amount, status
Orders/bookings behind each invoice line
Submit payment: amount, method, reference, receipt, comment
Claim history and rejection reasons
Help and dispute form
```

The bank details are maintained by the super admin and are read-only to the
seller. They are returned only to an authenticated seller and are never public.

---

## 11. Super admin billing

```text
All invoices, filters by seller/status/period
All claims, with the receipt and the invoice
Verify or reject a claim
Freeze, unfreeze or grant grace with a reason and expiry
Edit platform bank details
Edit billing settings: rate, due days, grace days, minimum invoice
Revenue, outstanding and ageing reports
Export for accounting
```

Every decision writes an audit record with actor, time, amount and reason.

---

## 12. Relationship to customer payment

Customer payment and seller billing are separate ledgers:

```text
Customer payment     proves the seller was paid by the customer
CommissionEntry      proves the seller owes CityCart 1%
SellerInvoice        groups the debt for a period
SellerPaymentClaim   proves the seller paid CityCart
```

The platform never marks a customer payment as received on the seller's behalf,
and a seller's failure to pay CityCart never changes what the customer owes the
seller.

---

## 13. Currency and rounding

* Currency is PKR only.
* Amounts are stored in paisa (integer).
* Display uses two decimals.
* Rounding is half-up.
* No floating-point arithmetic in money calculations.
* Every entry stores the currency and the rate used.

---

## 14. Authority and trust

The backend derives:

```text
sellerType
sellerId
sourceType
sourceId
eligibleAmountPaisa
rateBps
commissionPaisa
invoice totals
amount due
freeze state
```

The client never supplies any of these. A seller cannot mark an invoice paid,
change a rate, reverse an entry or unfreeze itself.

---

## 15. Idempotency and concurrency

* Commission entry: unique `(sourceType, sourceId)`.
* Invoice: unique `(sellerType, sellerId, periodStart)`.
* Claim: unique `(invoiceId, reference, amountPaisa)`.
* Payment verification: conditional on the invoice's previous paid amount and
  status; a concurrent change returns `409 INVOICE_CHANGED`.
* The monthly job is safe to re-run: it only picks entries that are still
  `ACCRUED` and invoices that do not exist.
* Order/booking completion and commission creation share one transaction where
  the database supports it.

---

## 16. Auditability

Preserve for every commission, invoice, claim and freeze change:

```text
original amount
adjustment or reversal amount
rate
reason
actor
timestamp
related order / booking
related payment
related invoice
```

Entries and invoices are never overwritten. Audit records are retained even
when the seller account is anonymized or archived.

---

## 17. Security

Billing endpoints require:

* authentication;
* role and permission checks;
* tenant ownership (`sellerId` derived from the session, never the body);
* Zod validation and ObjectId validation;
* rate limiting on claim submission and verification;
* signed, private receipt uploads;
* secure error handling that never exposes another seller's balance.

Sellers must never access another seller's invoices, claims, receipts, bank
details or freeze state. The super admin's billing views are platform-wide.

---

## 18. APIs (planned)

### Seller

```http
GET  /api/v1/billing/account
GET  /api/v1/billing/invoices
GET  /api/v1/billing/invoices/:id
POST /api/v1/billing/invoices/:id/claims
GET  /api/v1/billing/claims
GET  /api/v1/billing/bank-details
POST /api/v1/billing/help
```

### Super admin

```http
GET   /api/v1/admin/billing/invoices
GET   /api/v1/admin/billing/claims
PATCH /api/v1/admin/billing/claims/:id
POST  /api/v1/admin/billing/sellers/:type/:id/freeze
DELETE/api/v1/admin/billing/sellers/:type/:id/freeze
GET   /api/v1/admin/billing/settings
PATCH /api/v1/admin/billing/settings
GET   /api/v1/admin/billing/reports
```

Exact shapes are defined in `05-api-specification.md` during Phase 3.

---

## 19. Required tests

```text
1% and rounding on orders and bookings
delivery fee and tax excluded
door returns reduce the base
cancelled/rejected orders create no entry
one entry per source (idempotent retry)
monthly invoice groups only the right seller and period
invoice below PKR 100 rolls forward
refund after invoicing creates a reversal in the next period
partial payment and overpayment credit
duplicate claim refused
claim verification is atomic
freeze ladder at due, +7 and +14
a frozen seller cannot create a new order/booking but can finish existing work
verification unfreezes immediately
seller A cannot read seller B's invoice, claim or receipt
client-supplied amounts are ignored
super admin actions are audited
```

---

## 20. AI implementation rules

1. Read this document before touching billing code.
2. Never trust client financial values.
3. Never edit an issued invoice or a commission entry; use a reversal.
4. Keep brand, provider and platform data isolated.
5. Use paisa and integer arithmetic.
6. Make every financial operation idempotent.
7. Keep customer payment and seller billing separate.
8. Report any ambiguity about money before implementing it.
9. Add tests for calculations, authorization and freeze behavior.
10. Never delete financial history.

---

## 21. Acceptance criteria

Seller billing is complete when:

* every completed order and booking creates exactly one 1% entry;
* monthly invoices are generated from entries, not from client data;
* sellers can see and pay their bill with a receipt;
* the super admin can verify payments and manage freezes;
* the freeze ladder blocks new sales at the documented thresholds;
* verification restores selling immediately;
* refunds and returns are reflected through reversals and credits;
* tenants are isolated and every action is audited;
* the test list in section 19 passes.

---

## 22. Source of truth

This document is the authoritative specification for CityCart seller billing.
`24-marketplace-v3-plan.md` controls the programme and the locked defaults. Any
financial rule conflict must be reported before implementation.
