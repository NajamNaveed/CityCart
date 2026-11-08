# 24 — Marketplace v3: Services, Seller Billing, Redesign, Flutter and Security

Status: **approved 2026-11-06; Phases 0, 1, 2a, 2b, 2c and 3 implemented. Phase 4 is in progress: design system, discovery, purchase funnel, services funnel, the account/communication screens, the seller site and all three dashboards are rebuilt.** This document is the
authoritative plan for the v3 programme. Where it conflicts with an earlier
document, this document wins until the earlier document is updated.

It supersedes two decisions in `22-marketplace-v2-plan.md`:

* "No Flutter" (v2 decision 1) — v3 moves the apps to Flutter.
* "Security hardening is deferred" (v2 decision 7) — v3 hardens the platform
  in Phase 1 and audits it again in Phase 9.

It also replaces the conceptual commission model in
`15-commission-and-payouts.md` with a concrete seller billing model, and removes
the customer online-payment gateway described in `10-payment-system.md` §29.

---

## 1. Business decisions (locked)

### 1.1 Cash flow

* CityCart does **not** take online payments from customers.
* A customer pays the brand or service provider **directly** when the work is
  done: cash to the rider, or one of the door methods already supported
  (`BANK_TRANSFER`, `WALLET`, `CARD_MACHINE`) using the seller's own account or
  machine.
* The platform charges **sellers only**: **1% of each completed order or
  service booking**, billed **monthly**.
* Unpaid seller bills lead to a warning, then a restricted account, then a
  frozen account, in that order.
* The existing mock/test online gateway and every part of it is removed. Door
  collection, proof verification, receipts and cash settlement stay.

### 1.2 Accounts

* One email may hold **one** customer account, **one** brand account and **one**
  service-provider account at the same time. They are separate logins and never
  share a session.
* There is at most one account of each type per email.
* The same email may be an **employee of several brands** (one membership per
  brand, never twice in the same brand).
* Service providers have **no employees** in v3. The provider manages their own
  profile. The super admin is above them.
* A single seller landing (`/sell`) serves both sellers with separate sign-up
  and sign-in flows: brand and service provider.

### 1.3 Services

* A service provider works in **one block at a time**, chosen at signup and
  changeable **once per calendar month**.
* Their public page works like a product page: profile, offerings, "starting
  at" price, rating, reviews, availability and a booking action.
* The price is **full-service, not hourly**. The listed price is "starting at";
  the final price is agreed with the customer in chat and sent as a proposal
  the customer accepts.
* The customer books a slot. The provider accepts, declines, or sends a
  proposal (price, scope, time). Acceptance creates a confirmed booking.
* The platform takes the **same 1%** of the confirmed final amount.
* Ratings and ranking decide visibility. Provider cancellations and repeated
  late customer cancellations lower the ranking. The cancellation counter
  resets monthly.
* There is no internal or escrow payment. The customer and provider settle
  directly; the platform bills the provider its 1%.

### 1.4 Redesign

* Full visual and interaction redesign of everything a **customer** sees: the
  customer website, the seller landing, sign-in/sign-up, product and service
  pages, cart, checkout, orders, chat, account and help.
* Brand, service-provider and super-admin **dashboards are not redesigned from
  scratch**. They get a usability pass: clearer navigation, consistent tables
  and forms, better empty/loading/error states, and targeted redesign of
  sections that need it.
* Web first. Flutter after the web design system is frozen.
* Production quality: SEO, accessibility, performance, legal pages and
  observability are part of the redesign, not a later polish step.

### 1.5 Flutter

* Target order: shopper app, Staff app, Delivery app, Service Provider app.
* **Android first.** iOS is built per app after that app's Android release is
  stable.
* The Service Provider app is last. Brand admin may be attached to it later,
  but only after the four primary apps are done.
* The React Native apps stay in the repository and keep working until the
  matching Flutter app reaches parity.

### 1.6 Security

* Security is not deferred. Phase 1 establishes the baseline, every phase adds
  its own authorization and validation tests, and Phase 9 is an independent
  audit and release gate.

---

## 2. Programme sequence

Each phase ends with working, tested code and updated documentation. No phase
starts before the previous phase's exit gate passes.

| Phase | Scope | Depends on | Exit gate |
|---|---|---|---|
| **0** | This plan, decisions, doc reconciliation, SEO/SSR spike | — | Owner approves the spec; no open business questions |
| **1** | Identity and tenant foundation: multi-brand employee memberships, workspace login, deletion/anonymization, email reuse, mock gateway removal | 0 | Cross-brand, email-reuse and revocation tests pass; gateway code is gone |
| **2a** | Service-provider account, onboarding, block + pin, profile, admin approval | 1 | A provider can be approved and appear in one block |
| **2b** | Service categories, offerings, discovery, map, public provider pages | 2a | A customer can find and open a provider in their block |
| **2c** | Availability, booking, chat, proposal, completion, reviews, ranking | 2b | Full booking lifecycle works end to end |
| **3** | Commission ledger, monthly invoices, freeze ladder, bank details, receipt claims, verification, help; seller-facing billing UI | 2c | Invoice generated from real orders and bookings; freeze/unfreeze verified |
| **4** | Web redesign: design system, customer site, seller landing, auth, product/service pages, dashboard usability pass, SEO/SSR, accessibility | 2c, 3 | Public pages indexable, AA-audited, production build green |
| **5** | Flutter shopper app (Android) | 4 | P0 parity on real devices |
| **6** | Flutter Staff app | 5 | P0 parity |
| **7** | Flutter Delivery app | 5 | P0 parity |
| **8** | Flutter Service Provider app (brand admin may follow) | 5, 2c | P0 parity |
| **9** | Independent security audit, penetration test, performance and release hardening | all | No critical/high findings; release checklist signed off |

Phase 3 is complete: the ledger, invoices, freeze ladder, claims, help and both
billing UIs are implemented and tested. Phase 4 (web redesign) is next.

Flutter phase 5 starts only after Phase 4 freezes design tokens and components,
so the Flutter widgets are translations of a settled system rather than a
second design.

---

## 3. Identity and accounts

### 3.1 Account types and roles

`User.accountType` gains `SERVICE`:

```text
CUSTOMER        role CUSTOMER
BRAND           roles BRAND_ADMIN, BRAND_EMPLOYEE, PICKER, RIDER
SERVICE         role SERVICE_PROVIDER
PLATFORM_ADMIN  roles SUPER_ADMIN, ADMIN_PARTNER
```

Uniqueness stays `(accountType, email)`. A customer, a brand and a service
provider may therefore share one email; two accounts of the same type may not.

`SERVICE_PROVIDER` is brand-like but not a brand: it has its own tenant record
(`ServiceProvider`), its own dashboard and its own billing account. It never
holds a `brandId`.

### 3.2 Employee becomes a membership

The `Employee` record stops being "the one employee row for a user" and becomes
**one membership of one brand**:

```text
Employee
├── userId        -> User
├── brandId       -> Brand
├── role          BRAND_ADMIN | BRAND_EMPLOYEE | PICKER   (future: more)
├── permissions   [String]
├── isActive      Boolean
├── removedAt     Date | null
├── removedBy     User | null
├── removalReason String | null
├── jobTitle
└── permissionHistory
```

Indexes:

```text
unique (userId, brandId) where isActive = true     one active membership per brand
index  (brandId, isActive)
index  (userId, isActive)
```

`User.brandId` remains for `BRAND_ADMIN`, `PICKER` and `RIDER` in v3. It is the
account's **home brand** and is no longer the authority for an employee's
active tenant. For `BRAND_EMPLOYEE`, the active brand comes from the validated
session (section 3.3). Migrating the other brand roles to memberships is a
later, optional step; it is not required for multi-brand employees.

### 3.3 Workspace login

An employee who belongs to one brand signs in exactly as today. An employee who
belongs to several brands gets a workspace step:

1. `POST /auth/brand/login` (or `/auth/staff/login`) validates the password.
2. If there is one active membership, a normal session is issued.
3. If there are several, the server answers `409 WORKSPACE_REQUIRED` with a
   short-lived signed `workspaceToken` (5 minutes) and a list of
   `{ brandId, brandName, role }`. The list is only produced after a correct
   password, so it cannot be used to discover accounts.
4. `POST /auth/workspace` exchanges the `workspaceToken` and a chosen `brandId`
   for a normal session. The membership must still be active.

The session token gains:

```text
brandId       the active brand (the tenant for every request)
membershipId  the Employee record used for permissions
role          the role inside that brand
```

`POST /auth/workspace/switch` issues a fresh token for another membership
without asking for the password again, provided the current session is valid
and the target membership is active. Switching ends the old token's authority
for the old brand only through normal expiry; every request re-checks the
membership, so removing the membership takes effect immediately.

### 3.4 Middleware changes

| Middleware | Change |
|---|---|
| `authenticate` | For `BRAND_EMPLOYEE`, load the active `Employee` for `(userId, token.brandId)`, reject if missing/inactive, attach `req.membership`, and set `req.user.brandId` to the active brand for the rest of the chain. For `BRAND_ADMIN`, `PICKER` and `RIDER`, keep the current single-brand check. |
| `requirePermission` | Load `Employee` by `(userId, brandId)` instead of `(userId)`. |
| `requireTenant` | Continue to read `req.user.brandId`; that value is now the validated active brand. Add `req.tenantType = 'BRAND'`. |
| `requireServiceTenant` (new) | Resolve `req.tenantProviderId` from the `SERVICE_PROVIDER` session; never from the body. |
| `requireBrandOwnership` | Unchanged in shape; it compares the resource to `req.tenantBrandId`, which is now the active brand. |

Any token whose `brandId` is not an active membership is `401`/`403`, never
silently downgraded to the home brand.

### 3.5 Adding an employee by email

`POST /employees` (and the picker path) resolves the email in this order:

| Existing account | Action |
|---|---|
| No `BRAND` account with this email | Create the `User` and the membership as today |
| `BRAND` user, role `BRAND_EMPLOYEE`, not a member of this brand | Create a new membership; do not create a second `User`; notify the person |
| `BRAND` user, inactive membership in this brand | Reactivate the membership and reset permissions |
| `BRAND` user, role `BRAND_ADMIN`, `PICKER` or `RIDER` | `409 ACCOUNT_ROLE_CONFLICT` for now (a person cannot be an admin of one brand and an employee of another until that policy is approved) |
| `CUSTOMER`, `SERVICE` or `PLATFORM_ADMIN` account | Different account type, so a new `BRAND` user is created with the same email |

The role and the brand are always server-derived. The client never submits
`brandId` for a brand-scoped request.

### 3.6 Removal, anonymization and email reuse

Two distinct actions, both audited:

**Remove from brand** (`DELETE /employees/:id`)

* Sets the membership `isActive = false`, `removedAt`, `removedBy`,
  `removalReason`.
* Revokes that brand's staff sessions on the next request (membership check).
* Deletes device tokens only when this was the person's last active membership.
* Keeps orders, receipts, payments, reviews, bookings and audit records. None
  of them reference the `Employee` row.
* If other active memberships remain, the `User` and email stay in use.

**Delete account** (`DELETE /employees/:id?purge=account`, or automatic when the
last membership is removed and the owner confirms)

* Anonymizes the `User`:
  `email = deleted+<userId>@deleted.invalid`, `name = "Deleted user"`,
  phone/avatar cleared, password hash replaced with a random value,
  `passwordVersion++`, `isActive = false`, `deletedAt` set.
* Frees the original email immediately; a new person can register it.
* Deletes device tokens and pending notifications.
* Keeps the `_id` so historical records that reference the user still resolve.
* Never deletes orders, payments, receipts, returns, reviews, bookings,
  invoices, commission entries or audit logs.

**Re-adding** the same email after a purge creates a new user. Re-adding after a
mere membership removal reactivates the same user for that brand.

### 3.7 The same lifecycle bugs elsewhere

| Area | Current problem | v3 fix |
|---|---|---|
| Riders | Global `BRAND` email check; deactivation leaves tokens and location | Allow a rider to be re-added after removal; revoke device tokens; clear `RiderLocation`; anonymize when the last membership is removed |
| Pickers | Can be deactivated while holding claimed orders | Refuse removal while `order.pickerId` is set; require reassign or unassign first |
| Admin partners | Deactivation keeps the email blocked | Add remove/purge; revoke sessions; keep `AdminAction` history; free the email on purge |
| Brand termination | Brand email, name and slug stay occupied | Archive the brand, keep its financial history, release staff emails after access ends, and allow the name/slug to be reused by renaming the archived slug (`slug~terminated~<id>`). A multi-brand employee keeps normal access to their other brand: the read-only window is not written to their account, and the cleanup only deactivates this brand's membership at `accessEndsAt`. |
| Tokens and devices | Removal does not purge sessions, push tokens, socket rooms or queued notifications | Central revocation helper called by every removal path |
| Media | Cloudinary assets outlive removed records | Reference-counted cleanup job for avatars, logos, product images, service images and payment proofs |
| Cities/blocks/categories | Deactivate-only, but PATCH can reactivate | Explicit restore action; refuse permanent deletion while active records reference the row |

---

## 4. Services domain

### 4.1 Tenant and onboarding

`ServiceProvider` is a tenant with a single owner:

```text
ServiceProvider
├── userId              -> User (unique; the owner)
├── displayName
├── legalName
├── slug                unique
├── categoryId          -> ServiceCategory
├── cityId              -> City
├── blockId             -> Block (exactly one active block)
├── location            GeoJSON Point (the provider's pin)
├── addressLine
├── phone
├── bio
├── avatar / coverImage
├── startingAtPrice     PKR minor units
├── status              PENDING | ACTIVE | SUSPENDED | TERMINATED
├── verification        UNVERIFIED | VERIFIED | REJECTED
├── ratingAvg / ratingCount
├── completedBookings
├── rankScore
├── billingStatus       ACTIVE | WARNING | RESTRICTED | FROZEN
├── blockChangedAt
├── blockHistory[]      { blockId, changedAt, changedBy }
├── approvedBy / approvedAt
└── timestamps
```

Onboarding reuses the brand flow's shape: account, profile, category, city,
one block, a pin inside that block, availability and a starting price. The pin
must pass the same `assertPinInBlock` rule as a shop. A new provider is
`PENDING` until the super admin approves it.

Phase 2a implements the tenant, onboarding, block/pin and admin approval only
(docs/04 §12c, docs/05 §22g): `POST /services/apply`, the provider's own
`GET/PATCH /services/provider/me` and `PATCH /services/provider/block`, and the
super-admin list/detail/status endpoints. Offerings land in 2b and availability in
2c, so signup does not ask for them. The owner is a `SERVICE_PROVIDER` user whose
session carries `providerId`; `requireServiceTenant` refuses every other role.
The city is fixed at signup, a pin move inside the current block is unlimited,
and a block change is allowed once per UTC calendar month
(`409 BLOCK_CHANGE_LIMIT`, audited in `blockHistory`).

### 4.2 Service catalogue

```text
ServiceCategory     name, slug, parentId, order, image, isActive
ServiceOffering     providerId, categoryId, title, slug, description, images,
                    startingAtPrice, durationMinutes, attributes, isActive
ServiceAvailability providerId, weekday, startMinute, endMinute, slotMinutes,
                    blackoutDates[]
```

Offerings are full-service. `startingAtPrice` is a display floor; the binding
price is the accepted proposal.

Phase 2a ships `ServiceCategory` (seeded, public read-only listing via
`GET /services/categories`) plus the provider's own `startingAtPrice` on the
tenant. Phase 2b adds `ServiceOffering` (docs/04 §12d): the provider manages
its own list at `GET/POST/PATCH/DELETE /services/provider/offerings`, the tenant
and category are copied from the session, the slug is derived once, and delete
is a soft delete. Admins holding `admin.catalog` manage the catalogue at
`/admin/service-categories`; a category in use cannot be deactivated, and the
tree stays two levels deep. Phase 2c adds `ServiceAvailability` (docs/04 §12e):
weekly Karachi wall-clock windows with a slot step and whole-day blackouts, read
and replaced at `GET/PUT /services/provider/availability`. No published windows
means "ask for any future time"; published windows must contain the whole job.

### 4.3 Discovery and the public page

* `GET /services/discover?blockIds=&categoryId=&q=&sort=rank|rating|price`
  returns providers whose **one** block is in the customer's area.
* `GET /services/providers/:slug` returns the provider page: profile,
  offerings, rating, reviews, availability and starting price.
* The map shows the provider's **block** and an approximate location. The exact
  pin is disclosed only after a booking is accepted, because it may be a home
  address. The booking address is the customer's own block/pin.
* The provider serves only customers whose delivery/service pin is inside the
  provider's block. A pin outside the block is refused by the server
  (`OUTSIDE_SERVICE_BLOCK`), not only by the UI.
* A provider may change block once per calendar month. The server checks
  `blockChangedAt`; existing bookings are unaffected. Admin override is audited.

Phase 2b implements discovery and the public page against this shape:
`GET /services/discover` takes the shopper's four scopes (`block`, `area`,
`radius`, `city`, docs/05 §22g) with `categoryId`, `q` and
`sort=rank|rating|price`; only `ACTIVE` / `VERIFIED` providers are returned and
each item carries its block centre, distance, starting price and up to three
offerings. `GET /services/providers/:slug` publishes the same summary plus all
active offerings, and answers `404` for any non-approved provider. Neither
endpoint ever returns the provider's pin, phone or address line. The web
screens are `/services` (list + Leaflet map) and `/services/:slug`.
Phase 2c adds the published availability and approved review list to the public
provider page, and the booking form refuses a customer pin outside the
provider's block with `OUTSIDE_SERVICE_BLOCK` (docs/04 §12e, docs/05 §22g).

### 4.4 Booking lifecycle

```text
REQUESTED ──provider accepts──> ACCEPTED ──provider starts──> IN_PROGRESS
    │                              │                              │
    │ provider proposes            │ customer cancels             │ provider completes
    ▼                              ▼                              ▼
PROPOSED ──customer accepts──> ACCEPTED                     COMPLETED
    │                              │                              │
    │ customer declines            │ provider cancels             │ customer confirms / auto-confirm
    ▼                              ▼                              ▼
DECLINED                       CANCELLED                    CONFIRMED
```

Rules:

* A request carries offering, requested slot, customer address pin, block and a
  note. The server resolves the block and checks it against the provider's
  block.
* A proposal carries price, scope, scheduled time and an expiry. Only one
  proposal is active; a counter-proposal supersedes it and invalidates the old
  one. The customer accepts or declines.
* Acceptance creates the confirmed booking and opens the booking chat.
* The provider marks `COMPLETED` with the final amount and a completion note.
  The customer confirms within 3 days; otherwise the booking auto-confirms.
  A customer can dispute instead of confirming; disputed bookings go to admin.
* Completion is what creates the 1% commission entry. No internal payment is
  created.
* Cancellations: free before the provider accepts. After acceptance, a customer
  cancellation is "late" and counts in the monthly counter. A provider
  cancellation always counts. Both require a reason.
* A provider cannot complete a booking without a final amount. A customer
  cannot review before `CONFIRMED`.

Phase 2c implements the lifecycle in `ServiceBooking` (docs/04 §12e) with the
statuses `REQUESTED`, `PROPOSED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`,
`CONFIRMED`, `DECLINED`, `CANCELLED` and `DISPUTED`. Money is integer paisa; the
agreed price cannot be below the offering's starting price. Proposals expire
after 1–72 hours (default 24) and a new one supersedes the active one. The
customer confirms within three days or the job auto-confirms; a dispute opens a
super-admin review (`PATCH /admin/service-bookings/:id/dispute`). Cancellations
require a reason, a customer cancellation after acceptance is counted as late,
and the provider cancellation counter is unaffected. Completion writes the
final amount but does **not** create commission; the 1% ledger is Phase 3.

### 4.5 Chat

Booking chat is a new, booking-scoped conversation:

```text
ServiceConversation
├── bookingId     unique
├── customerId
├── providerId
├── lastMessageAt / preview / sender
├── customerUnread / providerUnread
└── timestamps

ServiceMessage
├── conversationId
├── senderId
├── senderRole    CUSTOMER | PROVIDER | SYSTEM
├── body          text or attachment reference
└── createdAt
```

Access is by booking membership: the customer, the provider owner, and a super
admin with the relevant permission. No other provider can read it. Text and
images are stored as immutable messages; contact details may be shared after
the provider accepts, but the chat itself never becomes public.

Phase 2c creates the conversation when the provider accepts and keeps the two
unread counters on `ServiceConversation`. Chat is readable and writable while
the booking is `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CONFIRMED`, `DISPUTED`
or `CANCELLED`; a request or proposal has no chat yet. Messages are sent over
the authenticated booking routes and pushed to that booking's room only. The
admin view (`GET /admin/service-bookings/:id/messages`) is read-only.

### 4.6 Reviews

`ServiceReview` is separate from product reviews:

```text
ServiceReview
├── bookingId     unique
├── customerId
├── providerId
├── rating        1..5
├── comment
├── providerReply { body, at } | null
├── isApproved    moderation flag
└── timestamps
```

Only a customer with a `CONFIRMED` booking may review, once. A provider may
reply once. Reviews are moderated with the same policy as product reviews.

Phase 2c enforces eligibility on the server from the booking (`CONFIRMED`, the
signed-in customer, no existing review). The provider replies once, and hiding a
review through `PATCH /admin/service-reviews/:id` removes it from the public
page and the rating average. The public provider page shows the six newest
approved reviews without customer identities.

### 4.7 Ranking

Ranking is backend-computed and scoped to a category and block. Initial
formula (weights are configuration, versioned in billing/settings):

```text
rankScore =
    0.45 × normalisedRating
  + 0.20 × completionRate
  + 0.15 × responseRate
  + 0.10 × repeatCustomerRate
  + 0.10 × volumeScore
  − 0.20 × providerCancellationRate
  − 0.10 × customerLateCancellationRate
```

* `normalisedRating = (ratingAvg - 1) / 4`.
* Completion, response and cancellation rates use the last 90 days.
* A new provider receives a temporary visibility boost until 10 completed
  bookings.
* The customer-cancellation counter and its ranking penalty reset on the first
  day of each month. The provider-cancellation rate is not reset, because it is
  a trust signal.
* `rankScore` and its inputs are stored on the provider and recomputed on
  booking completion, review, cancellation, and nightly.
* No paid ranking.

Phase 2c implements this formula with the weights above and a 90-day window
(`server/src/services/serviceRanking.service.js`). The customer late-cancel
counter uses the Karachi calendar month and resets on the first day of the
month; the provider cancellation rate is not reset. A provider keeps a small
visibility boost until 10 confirmed bookings. Discovery's `sort=rank` reads the
stored `rankScore`; no client input reaches the calculation.

---

## 5. Seller billing and commission

### 5.1 Principles

* Sellers pay the platform; the platform does not pay sellers.
* The backend is the only source of commission amounts.
* A commission entry is immutable. A correction is a new reversing entry.
* All money is stored in **paisa** (integer), displayed in PKR with two
  decimals. Rounding is half-up.
* A seller's billing account is per tenant: one brand is one account, one
  service provider is another.

### 5.2 Commission rules

| Rule | Value |
|---|---|
| Rate | **1%** (`rateBps = 100`), configurable for future entries only |
| Order base | `order.netTotal - deliveryFee - tax`, in rupees; converted to paisa before the percentage |
| Service base | The confirmed final amount of the booking |
| Trigger | Order `DELIVERED`; booking `CONFIRMED` |
| Excluded | Cancelled orders, rejected orders, door-returned lines, unconfirmed bookings |
| Refund after invoicing | A negative `REVERSAL` entry in the next period; credits carry forward |
| Delivery fee | Not commissionable |
| Tax | Not commissionable |
| Currency | PKR only |

Example:

```text
Order net merchandise: PKR 10,000 = 1,000,000 paisa
Commission:            1%        =    10,000 paisa = PKR 100
```

### 5.3 Collections

```text
CommissionEntry
├── sellerType      BRAND | SERVICE_PROVIDER
├── sellerId
├── sourceType      ORDER | SERVICE_BOOKING
├── sourceId
├── eligibleAmountPaisa
├── rateBps         100 at the time of the sale
├── commissionPaisa
├── kind            SALE | REVERSAL
├── status          ACCRUED | INVOICED | PAID | REVERSED
├── occurredAt
├── invoiceId       null until invoiced
└── reversalOf      null | CommissionEntry

SellerInvoice
├── sellerType / sellerId
├── periodStart / periodEnd        calendar month, Asia/Karachi
├── salesPaisa / commissionPaisa
├── creditsPaisa                   reversals and overpayments
├── amountDuePaisa
├── status          DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | VOID
├── issuedAt / dueAt
├── paidAt
└── createdBy       SYSTEM

SellerPaymentClaim
├── invoiceId / sellerType / sellerId
├── amountPaisa
├── method          BANK_TRANSFER | JAZZCASH | EASYPAISA | OTHER
├── reference
├── receipt         { publicId, fingerprint }   private Cloudinary asset
├── comment
├── status          SUBMITTED | VERIFIED | REJECTED
├── verifiedBy / verifiedAt / rejectionReason
└── timestamps
```

Idempotency:

```text
unique (sourceType, sourceId)                     one sale entry per order/booking
unique (sellerType, sellerId, periodStart)        one invoice per seller per month
unique (invoiceId, reference, amountPaisa)        one claim per bank reference
```

### 5.4 Invoice lifecycle

1. On delivery/completion, write one `CommissionEntry` in the same transaction
   as the status change. If the entry already exists, do nothing.
2. On the 1st of each month at 00:05 Asia/Karachi, close the previous calendar
   month: group `ACCRUED` entries into one `SellerInvoice` per seller.
3. Invoices below **PKR 100** are not issued; their entries roll into the next
   month.
4. The invoice is issued on the 1st and is due **7 days** later.
5. A verified payment claim moves the invoice to `PAID`/`PARTIALLY_PAID`.
   Overpayment becomes a credit on the next invoice. A separate "mark paid
   manually" endpoint is **not implemented**: the seller submits a claim and a
   super admin verifies it, even when the money changed hands in cash. This
   keeps one audit trail and one code path for every payment.
6. A reversal after invoicing creates a negative entry in the next period. An
   invoice is never edited after issue; corrections are separate entries.

### 5.5 Freeze ladder

Freeze state is per seller tenant, never per user. It is derived from the
oldest unpaid invoice and stored on the seller for fast checks:

```text
ACTIVE       nothing overdue
WARNING      due date reached; login popup and dashboard banner; orders allowed
RESTRICTED   due + 7 days; no new orders/bookings; existing jobs fulfillable;
             listings visible but "not accepting new orders"; dashboard read-only
             except Billing and Help
FROZEN       due + 14 days; listings hidden from discovery; dashboard read-only
             except Billing and Help; existing orders/bookings still fulfillable
```

* A seller at `RESTRICTED` or `FROZEN` can still complete existing orders and
  bookings, because customers are already waiting.
* Commission continues to accrue on those completions.
* Verification of a payment claim returns the seller to `ACTIVE` and restores
  listings immediately.
* A super admin may grant a manual grace period with a reason and an expiry;
  the action is audited.
* Login popups appear at `WARNING`, `RESTRICTED` and `FROZEN`, with the amount,
  the bank details and a link to Billing.
* The daily billing job computes transitions; the same rule is evaluated on
  every seller request so a stale job cannot let a frozen seller create orders.

### 5.6 Seller billing screens

The brand and provider dashboards get a **Billing** section:

* Current balance, unpaid invoices, due dates and freeze state.
* Platform bank details (bank name, account title, IBAN/account number),
  read-only to the seller.
* "Submit a payment" form: amount, method, reference, receipt photo, comment.
* Claim history and rejection reasons.
* Invoice detail with the orders/bookings behind each line.
* Help and dispute form.

The super admin gets:

* All invoices and claims, with filters by seller, status and period.
* Verify/reject a claim (rejection requires a reason).
* Freeze/unfreeze override with a reason and expiry.
* Platform bank details editor.
* Billing settings: rate, due days, restrict/freeze days, minimum invoice, bank
  details.
* Revenue and outstanding reports.

### 5.7 Removal of the old gateway

Remove:

```text
server/src/payments/                    (mock provider and registry)
server/src/services/onlinePayment.service.js
server/src/controllers/onlinePayment.controller.js
server/src/models/paymentEvent.model.js
server/src/jobs/paymentExpiry.js
online routes in server/src/routes/payment.routes.js
ONLINE_GATEWAY in the payment method enum
PAYMENT_PROVIDER / PAYMENT_WEBHOOK_SECRET / ONLINE_PAYMENT_HOLD_MINUTES
client/src/components/PayNow.jsx and its uses
online-payment branches in order validators, services, seed and tests
```

Keep:

```text
COD
door collection: CASH | BANK_TRANSFER | WALLET | CARD_MACHINE
Payment.collection and proof verification
receipts and cash settlement
all Payment records already in the database
```

No existing payment record is deleted. If an `ONLINE_GATEWAY` record exists, it
is marked read-only and reported; the removal is a code change, not a data
purge.

**Done in Phase 1:** the code and variables above are removed, checkout accepts
`COD` only, and the legacy read-only guards (`409 LEGACY_ONLINE_ORDER`) stay in
the order-adjustment and brand-confirmation paths. Server, integration, client
and mobile tests were re-run after removal.

The seller-facing gateway is **not** part of v1 billing. The free method is the
manual bank transfer with receipt upload. A hosted gateway adapter
(Safepay/JazzCash/Easypaisa) is a separate, optional later phase; it is not
needed to launch the 1% billing loop.

---

## 6. Web redesign and SEO

### 6.1 Design system

A v3 design system is built once and used by the customer site, seller landing,
auth pages and dashboards:

```text
tokens        colour, type scale, spacing, radii, shadows, motion
components    button, input, select, textarea, checkbox, radio, card, badge,
              modal, drawer, toast, tabs, table, pagination, skeleton,
              empty state, error state, map controls
patterns      page header, filter bar, form section, confirm dialog, stepper
```

Tailwind stays. No new UI framework. Icons stay on `lucide-react`; motion stays
on Framer Motion. The Flutter design system mirrors the tokens, not the DOM.

### 6.2 Customer surfaces

Rebuilt: home and area selection, discovery, shop page, product page, search,
cart, checkout, order placed, orders, order detail, account, addresses, chat,
notifications, auth, help, legal pages, 404/500.

New: service discovery, service category, provider page, availability and
booking flow, booking detail, service chat, service reviews.

Phase 4 progress (customer web):

* The v3 tokens and primitives are frozen in `client/src/design`.
* The landing page, Stores directory (`/nearby`), public storefront
  (`/store/:id`) and product page are rebuilt on those primitives.
* The purchase funnel — cart, checkout, order placed, order history and order
  detail (including returns and item reviews) — is rebuilt on those primitives.
* The services funnel — discovery list and map, public provider page, booking
  request, booking history and booking detail (proposal, completion, dispute,
  chat, timeline and review states) — is rebuilt on those primitives.
* The account and communication screens — sign in, register, forgot/reset
  password, email verification and resend, saved addresses, messages (list and
  thread), notifications, 404 and the error boundary — are rebuilt on those
  primitives, sharing one inset auth frame for customer and seller portals.
* The seller site — the `/sell` landing and its two doors (sell products, offer
  services), both application forms and both portal logins — is rebuilt on those
  primitives, with one shared seller shell and one application frame. All fields,
  validation rules, payloads and portal routes are unchanged.
* The dashboards — brand, provider and super admin — share one shell and table
  kit: consistent navigation and labels, stat and attention queues, labelled
  scroll regions, mobile card fallbacks for list tables, inline confirmations
  instead of browser dialogs, catalogue bulk approve/reject, and read-only
  partners see no mutating controls. Tab rows scroll on narrow screens and empty
  states render outside the wide tables, so neither is clipped or centred off
  screen on phones. All permissions, endpoints and business rules are unchanged;
  the server still enforces read-only access.
* Customer navigation is **Home · Stores · Services**. The separate Brands tab
  is retired; a brand is reached through its storefront, and the public brand
  and storefront APIs are unchanged.
* v3 surfaces end on the footer directly — no strip of page background between
  the page and the footer.
* Help and legal pages stay on their current copy until approved policy text,
  the registered entity details and a real support contact are supplied; they
  are not redesigned ahead of that.

### 6.3 Seller landing and dashboards

* `/sell` becomes one landing with two clear doors: **Sell products** (brand)
  and **Offer services** (provider), each with its own signup structure and
  login.
* Brand, provider and super-admin dashboards get a usability pass:
  consistent navigation, clearer labels, better tables, bulk actions where
  needed, inline help, empty/loading/error states, keyboard support and a
  responsive layout.
* Billing and service sections are designed as part of their phases, not as an
  afterthought.

### 6.4 SEO architecture

The current Vite SPA cannot give reliable per-page metadata for product,
provider and service pages. The approved direction is **server rendering for
public pages** while authenticated dashboards remain client-rendered.

Preferred option (Phase 4 spike):

* Move the public site to **React Router 7 framework mode** with SSR, keeping
  the existing React/Tailwind stack and route structure where possible.
* Render the customer site and seller landing on the server; hydrate on the
  client.
* Serve the dashboards as client-rendered routes in the same application, or
  keep them in the existing SPA if the migration risk is too high.

Fallback if the spike shows excessive risk:

* Keep the SPA and add a small SSR/prerender layer for public routes only,
  sharing the same route manifest and data loaders.
* Rejected: a second framework (Next.js) or bot-only prerendering.

SEO deliverables:

```text
per-page title, description, canonical URL
Open Graph and Twitter cards
JSON-LD: Organization, WebSite, Product, Offer, LocalBusiness, Service,
         AggregateRating, BreadcrumbList
sitemap.xml split by type (products, shops, providers, services, categories)
robots.txt with sitemap reference
clean, stable URLs and 301 redirects for removed routes
404 for missing, 410 for permanently removed
server-rendered content for crawlers, no content hidden behind client JS
```

### 6.5 Accessibility

WCAG 2.1 AA is the target:

* semantic landmarks and heading order;
* keyboard access for every action, visible focus, skip links;
* labelled forms, error text tied to inputs, `aria-live` for async results;
* contrast ratios, reduced-motion support, no colour-only status;
* map pages provide a list equivalent and a keyboard path to select an area;
* automated axe checks in the component tests plus a manual audit.

English is the launch language. Layouts must be RTL-ready so Urdu can be added
without a rebuild.

### 6.6 Performance and operations

* Core Web Vitals budgets on the customer home, product and provider pages.
* Cloudinary responsive images, lazy loading, explicit dimensions.
* Route-level code splitting; no dashboard code in the public bundle.
* Cache headers for static assets; SSR HTML cached briefly where safe.
* Error tracking and structured server logs; no PII in logs.
* Uptime and health checks; database index review before launch.

### 6.7 Legal and trust

Privacy policy, terms of use, seller agreement (including the 1% fee and the
freeze policy), service-provider agreement, refund/return policy, contact and
complaint channels, and a cookie notice if analytics cookies are introduced.

---

## 7. Flutter programme

### 7.1 Repository and rollout

The React Native apps stay in place until the Flutter app for the same role is
at parity. New Flutter apps live in:

```text
apps/shopper_flutter/
apps/staff_flutter/
apps/delivery_flutter/
apps/provider_flutter/
packages/citycart_core/      API client, models, auth, errors, formatting
packages/citycart_ui/        design tokens, widgets, map components
```

Shared code is real Dart packages, not copied folders. The RN apps are retired
per role only after the Flutter app passes its P0 checklist on real devices.

### 7.2 Stack

```text
Flutter stable (pinned with FVM) + Dart 3
Riverpod              state and dependency injection
go_router             navigation and deep links
dio                   HTTP, interceptors, refresh handling
flutter_secure_storage tokens
flutter_map + OSM     maps (no Google key)
socket_io_client      chat and live order tracking
firebase_messaging    push notifications
image_picker          photos
cached_network_image  images
intl                  formatting
freezed/json_serializable  models (codegen)
```

No additional package is added without a stated need and approval.

### 7.3 Feature parity

Each app keeps one checklist, sourced from the web routes, tagged P0/P1/P2. An
app ships when every P0 passes on a real device.

| App | P0 | P1 | P2 |
|---|---|---|---|
| Shopper | auth, area, discovery, shop, product, cart, checkout, door payment choice, orders, addresses, notifications | reviews, reorder, favourites, service discovery, booking, chat, live rider map | referrals, advanced filters |
| Staff | sign-in, order queue, pick screen, line statuses, substitutions, pack, returns inbox | inventory view, product edits | reports |
| Delivery | sign-in, assigned jobs, navigation, delivery code, line accept/reject, payment method/proof, earnings/cash | history, notifications | reports |
| Provider | sign-in, profile, offerings, availability, booking queue, chat, proposal, completion, reviews/ranking | billing, analytics | promotions |

Brand admin and super admin stay web-first. They are not ported in phases 5-8.

### 7.4 Toolchain, signing and CI

* Pin Flutter and JDK 17; document the exact versions in the app README.
* Android flavors `dev`, `staging`, `prod`, each with its own Firebase app and
  API URL passed via `--dart-define`.
* **Google Play App Signing**: Google holds the app signing key; the upload
  keystore is stored offline and in CI secrets. `key.properties` and `.jks`
  files are never committed.
* GitHub Actions: analyze, test, build a signed AAB on tag, auto-increment the
  version code, upload the artifact.
* Crash reporting and analytics are configured per flavor.
* Obfuscation and symbol upload for release builds.

### 7.5 Devices and testing

Minimum matrix:

```text
low-end Android   Android 9-11, 2-3 GB RAM
mid-range Android Android 12-13
current Android   Android 14-15
tablet            one device if the layout supports it
iOS (later)       iPhone SE class + current iPhone
```

The agent owns emulator runs, unit/widget/integration tests and a written
device checklist. A human owns the physical-device pass. Every release
candidate gets a full P0 pass; map, checkout and chat get a smoke pass before
risky merges.

### 7.6 iOS

iOS is built per app after that app's Android release is stable. It adds an
Apple Developer account, signing/provisioning, TestFlight and App Store review.
Architecture stays iOS-ready from day one: no Android-only packages, platform
channels isolated, no hard-coded platform paths.

---

## 8. Security hardening

### 8.1 Phase 1 baseline

* Dependency audit and lockfile review; fix high/critical findings.
* Authorization matrix tests for every role and tenant boundary.
* Session revocation on removal, password change and role change.
* Rate limits for auth, email, password reset, uploads, chat and booking.
* Helmet/CSP, CORS allow-list, cookie flags, CSRF review.
* Input validation review (Zod, ObjectId, query params, file metadata).
* NoSQL injection and prototype-pollution review.
* Upload security: MIME, size, signed Cloudinary paths, no executable files.
* Secret scanning and environment review; no secrets in the client.
* Log redaction: passwords, tokens, bank details, proofs.
* Email enumeration and password-reset enumeration tests.
* Socket.IO authentication and room scoping.
* Audit logging for every privileged action.

### 8.2 Phase 9 independent audit

* OWASP ASVS Level 2 checklist.
* External penetration test if budget allows; otherwise an independent
  internal test with a written report.
* Authorization fuzzing across brand, provider, customer and admin boundaries.
* Load and abuse tests on auth, discovery, checkout, chat and billing.
* Backup and restore drill.
* Incident response runbook, secret rotation, dependency update policy.
* No critical or high finding may remain open at release.

Specific risks to test in later phases: booking IDOR, provider block bypass,
chat access, review eligibility, invoice/claim tampering, freeze bypass,
commission manipulation, service media access and ranking manipulation.

---

## 9. Data and migration rules

* v3 is **additive** on the existing database. Do not drop or rewrite
  production collections.
* New collections and fields are created with migration scripts that are
  idempotent and safe to re-run.
* Existing `Employee` rows already satisfy the new membership shape; the unique
  index becomes `(userId, brandId)` partial on active rows.
* `Payment` records are retained when the gateway code is removed.
* Product, order, review and inventory data are not reshaped by v3.
* Any backfill runs in a transaction or a resumable batch and reports counts.
* Destructive operations require explicit owner approval and a backup.

---

## 10. Testing requirements

Every phase adds tests for the happy path and the failure path:

| Phase | Minimum coverage |
|---|---|
| 1 | multi-brand membership, workspace selection, cross-brand denial, email reuse, removal/purge, token revocation, gateway removal |
| 2 | provider onboarding, block pin rules, block-change limit, provider isolation, booking state machine, booking IDOR, chat access, review eligibility, ranking inputs |
| 3 | commission math and rounding, idempotent entries/invoices, refund reversals, freeze ladder, claim authorization, overpayment credit, billing isolation |
| 4 | SEO metadata and JSON-LD, sitemap, redirects, axe accessibility, responsive layouts, performance budgets |
| 5-8 | unit, widget, integration and real-device P0 checklists |
| 9 | authorization matrix, injection, upload, rate limit, session and secret tests |

Existing suites must stay green after every phase.

---

## 11. Locked defaults

These are approved and do not need to be re-asked. Change one only with an
explicit instruction.

| # | Default |
|---|---|
| D1 | Billing period is the calendar month (Asia/Karachi); invoice on the 1st; due in 7 days. |
| D2 | Warning at due date, restricted at +7 days, frozen at +14 days. |
| D3 | Freeze is per seller tenant, not per user. Existing orders/bookings stay fulfillable. |
| D4 | 1% of merchandise/service value, excluding delivery fee and tax; delivered/confirmed only. |
| D5 | Money is stored in paisa; PKR display, two decimals, half-up rounding. |
| D6 | Invoices below PKR 100 roll into the next month. |
| D7 | Seller v1 payment method is manual bank transfer with receipt upload; a gateway is optional later. |
| D8 | Partial payments are accepted; overpayment becomes a credit; a dispute pauses the freeze for the disputed amount. |
| D9 | Service price is full-service; listing shows "starting at"; final price is in the accepted proposal. |
| D10 | Service provider works in one block; block change once per calendar month; existing bookings unaffected. |
| D11 | Service bookings use dedicated models, not `Order`. |
| D12 | Service chat is booking-scoped; contact sharing is allowed after acceptance. |
| D13 | Service reviews require a confirmed booking; one review per booking; provider may reply once. |
| D14 | Ranking weights are configuration; monthly reset applies to customer late-cancellation counters. |
| D15 | Provider onboarding needs super-admin approval. |
| D16 | One account of each type per email: customer, brand, service provider. |
| D17 | Multi-brand employees choose a workspace at login; permissions are per membership. |
| D18 | Removing the last membership anonymizes the account and frees the email; financial history is never deleted. |
| D19 | Web SEO uses server rendering for public pages; dashboards stay client-rendered. |
| D20 | Accessibility target is WCAG 2.1 AA; English at launch, RTL-ready layouts. |
| D21 | Flutter is Android-first; iOS follows per app; provider app is last. |
| D22 | 2FA is email OTP for privileged web accounts first; TOTP can follow. |
| D23 | Security baseline in Phase 1; independent audit and pen test in Phase 9. |

---

## 12. Out of scope for v3

* Customer-to-platform online payment.
* Escrow or internal payment between customer and provider.
* Service-provider employees.
* Multiple simultaneous blocks per provider.
* A brand-admin mobile app in phases 5-8 (revisit after).
* iOS-first delivery.
* A real seller payment gateway in the billing v1 loop.
* Automatic payouts from CityCart to sellers (the platform is the payee).
* Deleting financial, order, booking or audit history.

---

## 13. Documents affected

```text
01-product-requirements.md        seller billing instead of payouts; v3 scope notes
02-user-roles-and-permissions.md  SERVICE_PROVIDER, memberships, workspace, deletion
03-system-architecture.md         no customer online gateway
04-database-design.md             account types, memberships, service and billing collections
05-api-specification.md           new auth, service, billing endpoints (per phase)
06-authentication-and-security.md workspace sessions, membership checks, security plan
08-order-management.md            gateway note, commission wording
10-payment-system.md              gateway removal; seller billing pointer
14-analytics-and-reporting.md     no new online-payment orders; billing is separate
15-commission-and-payouts.md      replaced by the seller billing model
16-testing-strategy.md            v3 test programme
17-deployment.md                  gateway variables removed with the gateway
18-development-roadmap.md         v3 programme addendum
20-partner-app.md                 online-payment phase marked removed in v3
22-marketplace-v2-plan.md         superseded Flutter and security decisions
```

---

## 14. Phase 0 exit criteria

* This document is approved.
* The conflicting statements in docs 10, 15 and 22 are corrected.
* Roles, database and roadmap documents name the v3 target.
* The SSR spike decision is recorded (section 6.4).
* No production code, data or configuration is changed in Phase 0.
