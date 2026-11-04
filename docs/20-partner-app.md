# 20 — CityCart Staff App: Plan, Status and Handoff

Added October 2026 as the *Partner App* plan; split into a Staff app and a
Delivery app in November 2026 (marketplace v2 Phase 5). This file explains the
programme and the **Staff app** (`partner/`): why it exists, what was decided,
what is already built, what is left, and how to continue. The rider screens and
rider-only behaviour now live in the **Delivery app**: see `23-delivery-app.md`.

It is written so a new developer or AI model can pick the work up cold. Read it
first, then the documents it points to.

## 0. Status at a glance

| Phase | Work | Status |
|---|---|---|
| A | Rider foundation: `RIDER` role, rider management, assignment, partner sign-in, rider endpoints, delivery code | **Done** (backend + web dashboard + docs) |
| B | Receipts and cash-on-delivery records: receipts, who collected cash, settlement | **Done** (API + docs; no screens yet) |
| D0 | **Returns** (found missing, see §6.1); built as **door returns** in marketplace v2 Phase 6, not the customer-request chain of decision 8 | **Done** (see §5.11) |
| C | `partner/` Expo app: sign-in and rider screens; the shopper app and website show the delivery code and receipt | **Done** (not yet run on a real phone, see §5.4) |
| D | Records screens in the same app: orders, deliveries and rider assignment, receipts, cash hand-over | **Done** (not yet run on a real phone, see §5.5) |
| E | Online payments: hosted gateway, signed webhook, stock hold and release, Pay now in the shopper app and website | **Built and tested with a built-in TEST gateway.** A real gateway adapter is still to do (needs the owner's sandbox account), see §5.6 |
| F | Push notifications to the Staff and Delivery apps, and the rider sharing their location while delivering | **Built and tested with mocks**; push needs a real EAS build to try on a phone (see §5.7) |
| I | Payment proof photo at the door: cash/bank/wallet/card, camera photo + reference, brand verification queue, private storage, receipts | **Built and tested with mocks**; the camera needs a real phone (see §5.8) |
| P | Picker screens (marketplace v2 Phase 4): `PICKER` role, pick queue, claim, line marking, change proposal with substitutes, pack confirmation | **Done**; needs a phone run (see §5.9) |
| S | Split the apps (marketplace v2 Phase 5): the new `delivery/` app takes the rider screens, push routing and location sharing; `partner/` becomes the Staff app; three app-type sign-ins | **Done** (see §5.10 and `23-delivery-app.md`) |
| R | Returned-goods inbox (marketplace v2 Phase 6): list, detail with refused lines and photos, **Mark received** with per-line restock or write-off | **Done** (see §5.11) |

Server test suite: 940 tests before the programme, 1,047 after Phase A, 1,090
after Phase B, 1,097 after Phase C (unchanged by Phase D), 1,158 after Phase E,
1,200 after Phase F, 1,286 after Phases G–I, 1,442 after the picker phase,
1,455 after the Phase 5 split, 1,503 after Phase 6 — plus 159 real-MongoDB
integration tests. The Staff app (`partner/`) has 173 tests, the Delivery app
(`delivery/`) 154, and the shopper app (`mobile/`) 335. All pass; lint is clean
everywhere, and the integration suite runs in this environment
(`npm run test:integration`). `test:apps` in the root package runs the staff and
delivery suites.

## 1. Why this exists

The owner's software house guild requires, on top of the CityCart marketplace,
extra **mobile apps** (web versions are not required):

1. an app for the **delivery rider**;
2. an app for the person who **keeps the records** of orders: to be delivered,
   delivered, returned, and so on;
3. **receipt tracking** when a customer pays by card or online, with rules about
   who may see which record.

The owner did not have these requirements clear, so the design below was
proposed and then **approved by the owner**.

## 2. Decisions (all approved by the owner)

| # | Decision | Reason |
|---|---|---|
| 1 | **One** app for staff work in `partner/` next to `mobile/`; the account's role decides the screens. The rider screens were later split into a second installable app, *CityCart Delivery*, in `delivery/` (marketplace v2 Phase 5) | One backend, one login per app, one dependency set each. The shopper app stays separate (other audience, own store listing). The staff app keeps the records and picker screens; the delivery app is rider-only |
| 2 | Riders belong to **one brand each** (brand-scoped `RIDER` role, created by the brand) | Reuses the existing multi-tenant model; no shared rider pool |
| 3 | The Staff and Delivery apps use **short-lived bearer tokens** (one staff session, default 8 h, no sliding renewal), each marked with its own `client` claim | The apps cannot use the web cookie. This deliberately relaxes the old "staff stay on the web" rule, **only** for `BRAND_EMPLOYEE`, `PICKER` and `RIDER` |
| 4 | Brand owners and the super admin stay on the **web** | Highest-privilege accounts should not hold a long-lived bearer token on a phone |
| 5 | Proof of delivery is a **six-digit code** the customer reads out | Strong enough, needs no camera/signature library. Chosen over four digits for safety |
| 6 | Dependencies are kept **minimal and justified**; installs consolidated | Owner preference (see §8) |
| 7 | Card data is **never stored**; online payments are confirmed only by the gateway's signed webhook | Security and PCI scope |
| 8 | **Returns:** the approved version one was a customer request within 7 days of delivery (fixed reasons, whole order) → brand approves or rejects → the records person marks it returned, with a "put back in stock" checkbox → refund. **Superseded in November 2026:** marketplace v2 Phase 6 built **returns at the door** instead (the rider records refused lines when completing the delivery; the store takes them in and chooses restock or write-off, default write-off). The customer-request chain is still not built | Door returns need no approval step and fix the quantity at the moment the customer decides; the older chain remains a future feature |
| 9 | **Payment gateway behind a small adapter** (create payment, verify webhook), so the provider can be swapped. The first provider is whichever sandbox account the owner gets approved first (JazzCash sandbox, Safepay, PayFast) | Live use needs a registered business (NTN, bank account, KYC), which is a business step, not code |
| 10 | **Prepaid orders:** stay pending with stock held for about 30 minutes; only the signed webhook marks them paid; otherwise the order cancels and stock is released. Check the existing inventory reservation first (docs/09) | Never ship goods on an unconfirmed payment |
| 11 | **Build order:** C, then D (without the returns tab), then D0 and the returns tab, then E, then F | C needs no decisions; E needs a sandbox account |
| 12 | **Small defaults:** a rider with open deliveries cannot be deactivated; customers never receive the internal `riderId`; brand owners stay web-only | Done in Phase C (the first two) |

## 3. Design

### 3.1 How the apps connect to the system

```text
 Shopper app   Staff app (Records | Picker)   Delivery app (Rider)   Web: brand dashboard / super admin
        \               |                         |                  /
         +--------  /api/v1  (Express)  ---------+-----------------+
                           |            \
                        MongoDB      Socket.io (live updates)
                           |
                 Payment gateway --webhook--> server   (Phase E)
```

Every client calls the same API. **The server checks role and brand on every
request; nothing is trusted from the app.** A rider completing a delivery runs
the same transaction as the web dashboard (delivery, order and COD payment
together).

### 3.2 Roles

| Role | Scope | Uses |
|---|---|---|
| `SUPER_ADMIN` | Platform | Web |
| `BRAND_ADMIN` | One brand | Web |
| `BRAND_EMPLOYEE` (with permissions) | One brand | Web, and the Staff app (records screens) |
| `RIDER` | One brand | Delivery app only; cannot use the web brand login |
| `PICKER` | One brand | Staff app only; no brand-team permissions |
| `CUSTOMER` | Own data | Shopper app and web |

### 3.3 Who sees what

| Person | Sees | Never sees |
|---|---|---|
| Customer | Own orders, own receipts, own delivery code | Anyone else's data |
| Rider (Delivery app) | Only deliveries assigned to them: customer name, phone, address and instructions (only while the delivery is open), item names and quantities, cash to collect, their own cash total | Other riders' deliveries, prices, other payments, brand revenue, the customer account, the delivery code, receipts |
| Picker | Their brand's orders waiting to be picked, and the ones they claimed: customer **first name**, item names, SKUs, images and quantities, pick state, the waiting proposal's note | Customer phone and address, prices, totals, payment details, another brand's or another picker's order |
| Records person (employee with permissions) | Their brand's orders, deliveries, payments, receipts, who holds cash | Other brands. Refunds and settling cash need `payments.manage` |
| Brand admin | Everything in their brand; assigns riders; refunds | Other brands |
| Super admin | Everything on the platform | Card numbers (nobody does; they are never stored) |

## 4. Rules that must not be broken

1. **Never return `deliveryCode`** outside `GET /deliveries/:id/code` (customer
   only). It is `select: false` on the model; keep it that way.
2. **Never take `brandId` or `riderId` from a rider's request.** Both come from
   the signed-in account and every rider query is pinned to both. Another
   rider's or brand's delivery is `404`, never `403`.
3. A rider can **never** set `DELIVERED` directly. Only `POST
   /rider/deliveries/:id/complete` with the right code does, and wrong tries are
   counted by one atomic update (five, then `429 CODE_LOCKED`).
4. A `BRAND_EMPLOYEE` or `PICKER` bearer token must carry `client: "staff"`,
   and a `RIDER` token must carry `client: "delivery"`. A token marked for one
   app is refused in the other two, and every app token is refused for brand
   owners, the super admin and shoppers. Enforced in
   `middleware/authenticate.js` (`403 WRONG_APP`).
5. **Receipts are written only by the system** when a payment becomes `PAID`,
   after the payment commits, and never edited. No receipt write endpoint exists.
   Receipts never copy the customer's address or phone.
6. `collectedBy`, `collectedAt` and `brandId` on a COD payment are written inside
   the same transaction that marks it `PAID`. Never client-supplied.
7. Cash settlement is all-or-nothing and pinned to brand and collector.
8. **Never store card data. Never mark an online payment paid from the app.**
9. A customer receives their delivery **without** `riderId`, `codeAttempts` and `deliveryCode` (`utils/deliveryView.js`); keep using it on every customer path.
10. Do not add a new brand-scoped role without updating `02-user-roles-and-permissions.md`.
11. Everything in `AGENTS.md` still applies (multi-tenancy §7, authorization §8,
    never trust client ownership data §9, payments §16, tests §26, dependencies §29).
12. **Proof photos stay private** (Feature I). The upload folder is built by the
    server from the brand and delivery; the rider cannot choose a path, and the
    server accepts a photo only from this delivery's folder. Proofs are served only
    as short-lived signed links to staff with `payments.view` (or a platform admin
    with `admin.payments`); the customer, other riders and other brands never get
    one. The rider sees only the proof's status.
13. **A non-cash door payment is unverified money.** It is `PAID` with
    `collection.verification: SUBMITTED`, never sets `collectedBy`, and is absent
    from the rider's cash balance. Only `payments.manage` decides it; a rejection
    needs a reason and flags the brand owner. No automatic reversal.

## 5. What is built

### 5.1 Phase A: rider foundation

Behaviour:

* **Rider accounts.** A rider is a plain `User` with `role: RIDER`,
  `accountType: BRAND`, required `brandId`; no separate collection. Created by
  the brand owner or a team member with `riders.create`. Role and brand are never
  client-supplied. Riders have no permissions; they can only reach `/rider/*`,
  their own notifications and `/auth/me`. They cannot reset their own password:
  the brand does (`PATCH /riders/:id/password`), which bumps `passwordVersion`
  and signs them out everywhere. A deactivated rider cannot sign in; their open
  deliveries stay assigned until the brand moves them.
* **Assignment.** A new delivery is assigned automatically to the brand's active
  rider with the fewest open deliveries (ties: longest without a job), and the
  rider is notified — see `11-delivery-system.md` §11a. `PATCH /deliveries/:id/rider`
  (`delivery.manage`) is the manual override: it assigns an
  active rider of the same brand, sets `assignedAgent` to the rider's name,
  notifies the rider (`DELIVERY_ASSIGNED`) and makes sure a delivery code exists.
  `riderId: null` removes the rider. Final deliveries cannot be reassigned. A
  typed `assignedAgent` is refused (`409 USE_RIDER_ASSIGNMENT`) while a rider is
  assigned. `GET /deliveries?riderId=` filters by rider.
* **App sign-in (split in Phase 5).** The Staff app uses `POST /auth/staff/login`
  with header `X-Client: staff` (only `BRAND_EMPLOYEE` and `PICKER`); the
  Delivery app uses `POST /auth/delivery/login` with `X-Client: delivery` (only
  `RIDER`). Wrong role, wrong password and unknown email all give the same
  `401`. The token comes in the body (no cookie), carries `client: "staff"` or
  `client: "delivery"`, and lasts `STAFF_SESSION_HOURS`. Without the app's own
  header: `403 STAFF_APP_ONLY` or `403 DELIVERY_APP_ONLY`.
* **Rider endpoints** (`/api/v1/rider/deliveries`, role `RIDER` only): list
  (`?scope=active|history`), detail, status (`PICKED_UP`, `IN_TRANSIT`,
  `OUT_FOR_DELIVERY`, `FAILED` + reason), complete-with-code. The rider's view
  has: order number, status, address (only while open), item names and
  quantities, `paymentMethod`, `amountToCollect`, `cashCollected`. Never the
  customer account, brand, prices or code.
* **Delivery code.** Six digits, created with the delivery (when the brand marks
  the order ready for shipment) and for older deliveries when a rider is
  assigned. The customer reads it at `GET /deliveries/:id/code` while the order
  is on its way (`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `FAILED`). The
  brand can still complete a delivery from the dashboard without the code
  (the fallback when the code is locked).
* **Terminated brands.** Riders are included in the read-only grace-period
  restrictions, but may still finish deliveries already on the road.
* **Web dashboard.** New *Riders* page (add, deactivate/reactivate, reset
  password) and a rider dropdown on the delivery panel; new permissions group
  *Riders* (`riders.view`, `riders.create`, `riders.update`); the "Order handler"
  preset now includes `riders.view`.
* **Demo data.** `npm run seed:demo` creates riders (Loom & Co.: Shoaib Raza,
  Imran Bashir; Sukoon Home: Kamran Ali), assigned deliveries with codes, and
  `DELIVERY_ASSIGNED` notifications.

Main files (server unless noted): `config/roles.js`, `config/permissions.js`,
`config/deliveryTransitions.js`, `config/restrictedAccess.js`,
`middleware/authenticate.js`, `models/delivery.model.js`,
`models/notification.model.js`, `utils/deliveryCode.js`, `utils/jwt.js`,
`utils/clientType.js`, `services/{auth,delivery,rider,riderDelivery,brandOrder,brandAdmin,notification}.service.js`,
`controllers/{auth,delivery,rider,riderDelivery}.controller.js`,
`routes/{auth,delivery,rider,riderDelivery}.routes.js`,
`validators/{rider,delivery}.validator.js`, `app.js`, `scripts/demo/*`.
Client: `pages/brand/Riders.jsx`, `components/brand/DeliveryPanel.jsx`,
`components/brand/BrandLayout.jsx`, `App.jsx`, `utils/permissions.js`.

### 5.2 Phase B: receipts and cash records

* **Receipt model** (`models/receipt.model.js`): one per paid payment (unique on
  `paymentId`), number `RC-<year>-<6 digits>` from an atomic yearly counter
  `receipt-<year>`, a snapshot of items, totals, brand name, method, payment
  reference and who collected the cash; no `updatedAt`.
* **Issuing** (`services/receipt.service.js`): `issueReceiptForPayment` is
  idempotent; `issueReceiptBestEffort` runs **after** the payment transaction
  commits (delivery completion and the manual PAID path) and only logs on
  failure. `GET /receipts/order/:orderId` issues a missing receipt on the spot,
  so none is permanently lost.
* **Visibility:** customer: own, without internal details; brand users: their
  brand's with `payments.view`, plus payment reference and who collected the
  cash; super admin: all; riders: none. Someone else's receipt is `404`.
* **Cash** (`services/cashSettlement.service.js`): `Payment` gained `brandId`,
  `collectedBy`, `collectedAt`, `settledAt`, `settledBy`. Who holds how much:
  `GET /payments/cash/outstanding` (`payments.view`; with `?collectorId=` it
  lists that person's unsettled payments, oldest first). Hand-over: `POST
  /payments/cash/settle` (`payments.manage`, body `{ collectorId, paymentIds }`,
  1 to 200 ids), all or nothing, else `409 CASH_CHANGED`. A rider sees only
  their own total at `GET /rider/deliveries/cash`. Refunds do not change who
  collected the cash. Terminated-brand staff may still settle.
* **Demo data:** receipts for every paid payment; older cash already settled,
  recent cash still with its collector.

Main files: `models/receipt.model.js`, `models/payment.model.js`,
`services/{receipt,cashSettlement,delivery,payment,riderDelivery}.service.js`,
`controllers/{receipt,cash,riderDelivery}.controller.js`,
`routes/{receipt,cash,riderDelivery}.routes.js`,
`validators/{receipt,cash}.validator.js`, `config/restrictedAccess.js`, `app.js`,
`scripts/demo/build.js`, `scripts/seedDemo.js`.

### 5.3 Endpoint reference (partner programme)

| Endpoint | Who | Notes |
|---|---|---|
| `POST /auth/staff/login` | Team member, picker | Header `X-Client: staff`; token in body |
| `POST /auth/delivery/login` | Rider | Header `X-Client: delivery`; token in body |
| `GET /auth/me` | Any signed-in | Returns user and, for team members, `permissions` (use it to choose screens) |
| `GET/POST /riders`, `PATCH /riders/:id`, `PATCH /riders/:id/password` | Brand: `riders.view/create/update` | Web dashboard today |
| `PATCH /deliveries/:id/rider` | Brand: `delivery.manage` | Assign or remove (`riderId: null`) |
| `GET /deliveries?status=&riderId=` | Brand: `delivery.view` | Existing endpoint, new filter |
| `GET /deliveries/:id/code` | Customer | Only while on the road |
| `GET /rider/deliveries?scope=` | Rider | Own deliveries |
| `GET /rider/deliveries/:id` | Rider | Own delivery |
| `PATCH /rider/deliveries/:id/status` | Rider | `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `FAILED` (+`failureReason`) |
| `POST /rider/deliveries/:id/complete` | Rider | `{ code }`; `422 INVALID_CODE`, `429 CODE_LOCKED` |
| `GET /rider/deliveries/cash` | Rider | `{ cash: { count, total } }` |
| `GET /receipts`, `/receipts/:id`, `/receipts/order/:orderId` | Customer, brand `payments.view`, super admin | Read only |
| `GET /payments/cash/outstanding` | Brand: `payments.view` | Summary, or one collector's payments |
| `POST /payments/cash/settle` | Brand: `payments.manage` | All or nothing |
| `GET /brand/orders`, `GET /brand/orders/:id` | Brand: `orders.view` | Existing; for the records screens |
| `GET /notifications` ... | Any signed-in | Existing inbox; riders get `DELIVERY_ASSIGNED` |

Delivery lifecycle (`config/deliveryTransitions.js`): `READY_FOR_PICKUP →
PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED | FAILED`, and `FAILED →
OUT_FOR_DELIVERY` (re-attempt). `PICKED_UP` may also go straight to
`OUT_FOR_DELIVERY`. Final statuses: `DELIVERED`, `CANCELLED`, `RETURNED`.

### 5.4 Phase C: the Partner app and the customer's code

* **Phase C created one Partner app** (Expo SDK 57, plain JavaScript, Expo Router)
  with the rider screens. **Phase 5 split it:** the rider screens now live in
  `delivery/` (see `23-delivery-app.md`), and `partner/` is the Staff app. The Staff
  app sends `X-Client: staff`, signs in at `/auth/staff/login`, keeps its token in
  secure storage under its **own** key (`citycart.staff.session`, so it never shares a
  session with the shopper or delivery app on the same phone), and signs out when the
  server ends the session. After sign-in `/` sends a `PICKER` to `/queue` and a
  `BRAND_EMPLOYEE` to `/overview`; `RequireRole` guards every screen group (the server
  is still the real guard).
* **Rider screens (now in the Delivery app):** *Deliveries* (To do / Finished),
  *Delivery* detail (customer, address, Call and Maps, status moves, the customer's
  code, failed attempt, payment at the door), *Cash*, *Alerts* and *Account*
  (including location sharing). `23-delivery-app.md` is the reference.
* **Dependencies:** the Staff app keeps only what its screens use: the shopper app's
  list minus maps, socket.io, async storage, fonts, `expo-location`,
  `expo-image-picker` and `expo-file-system`. The Delivery app carries the location,
  camera and file packages. `npm install` in each app folder is the only install step.
* **Customer side:** the shopper app's order page (`mobile/src/app/orders/[id].jsx`)
  and the website's order page (`client/src/pages/MyOrderDetail.jsx`) show **Your
  delivery code** while the order is on the road (`GET /deliveries/:id/code`) and the
  **receipt number** once the order is paid (`GET /receipts/order/:orderId`). Both show
  nothing when the server has nothing to give.
* **Backend, small defaults:** `RIDER_HAS_OPEN_DELIVERIES` (409) blocks deactivating
  a rider who still has open deliveries; customers receive their delivery without
  `riderId`, `codeAttempts` or `deliveryCode` (`server/src/utils/deliveryView.js`,
  used by `GET /deliveries/:id` and the order detail).
* **Root scripts:** `npm run dev:staff`, `npm run dev:delivery`, `npm run test:staff`,
  `npm run test:delivery`, `npm run test:apps`, and `npm run lint` includes both apps.
* **Verified:** lint, unit and screen tests, and full Android bundle builds for both
  apps. **Not verified:** running on a physical phone or emulator (no device in the
  build sandbox). The owner should sign a demo rider into the Delivery app on a phone
  and walk one delivery through to the code.

Main files: `partner/src/app/**` (routes), `partner/src/services/{api,session,storage}.js`,
`partner/src/utils/{delivery,validation,format,permissions}.js`, `partner/src/components/**`,
`partner/__tests__/**`; the Delivery app's own files are listed in `23-delivery-app.md`.

### 5.5 Phase D: the records screens

For a `BRAND_EMPLOYEE` the Staff app opens `(records)/` (tabs in `_layout.jsx`). **Each
tab exists only if the person holds the permission that opens it** (`utils/permissions.js`
mirrors the server's permission names; the server still checks every request):

| Tab | Needs | Shows | Endpoints used |
|---|---|---|---|
| Overview | any of the three below | To pick up, On the road, Failed, Delivered counts (tap one to open Deliveries filtered), and cash still with riders | `GET /deliveries?status=&limit=1` (one small request per status), `GET /payments/cash/outstanding` |
| Orders | `orders.view` | Orders with status filters; order detail with progress, items, totals, payment, customer (Call), a link to its delivery, and a **read-only** history of any change proposal the brand sent | `GET /brand/orders`, `GET /brand/orders/:id` |
| Deliveries | `delivery.view` | Deliveries with status filters; delivery detail with rider, tracking, address (Call). **Assign or remove a rider** with `delivery.manage` + `riders.view` | `GET /deliveries`, `GET /deliveries/:id`, `GET /riders`, `PATCH /deliveries/:id/rider` |
| Money | `payments.view` | **Receipts** list and detail; **To verify** (Feature I): door payments waiting for a check, with the photo and reference; **Cash**: who holds how much, then a hand-over screen (`/handover/:collectorId`): tick exactly the payments you received, confirm, settle (needs `payments.manage`; without it the person can look but not tick) | `GET /receipts`, `GET /receipts/:id`, `GET /payments/proofs`, `GET /payments/:id/proof`, `PATCH /payments/:id/proof`, `GET /payments/cash/outstanding`, `POST /payments/cash/settle` |
| Account | everyone | Who is signed in, what they can see, sign out | none |

Behaviour worth knowing:

* A team member's **permissions come from `GET /auth/me`** (the partner sign-in answer
  does not carry them), so `signIn` makes that second call for `BRAND_EMPLOYEE`; if it
  fails the new session is discarded. Permissions are read at sign-in and app start, so a
  change made by the brand owner takes effect the next time the person signs in or opens
  the app (the server enforces the new permissions at once).
* **The records tabs only read, except three actions** that belong to this person's job:
  assigning a rider, settling cash, and verifying or rejecting a door payment proof.
  Changing an order's status stays on the website.
  **Change proposals are read-only in the Staff app** (status, note, before → after,
  the customer's answer); proposing, withdrawing and answering stay on the websites
  (docs/08 §41).
* The overview never shows an error for something the person may not see: a part they
  have no permission for (or that fails) is simply left out.
* The hand-over is two steps (tick, then "Yes, received") and all or nothing; a
  `CASH_CHANGED` answer clears the ticks, reloads the list and tells the person to count again.
* **To verify** (Feature I) opens one payment's photo through a signed link that
  expires in about five minutes; an expired image offers "Show photo again". A
  person with `payments.view` but not `payments.manage` can read it and is told they
  cannot decide. Verify asks for confirmation; Reject requires a reason. A duplicate
  reference or photo shows "Used before". A second person deciding first answers
  `409 PROOF_ALREADY_DECIDED`, and the screen reloads.
* Route names are distinct from the rider's (`/overview`, `/orders`, `/shipments`,
  `/returns`, `/money`, `/order/:id`, `/shipment/:id`, `/return/:id`, `/receipt/:id`,
  `/handover/:collectorId`, `/proof/:paymentId`); the two apps no longer share a
  route tree, but the names stay distinct so a screen is never ambiguous in a report.
* `StatusPill` covers order, delivery and payment statuses.
* **Returns:** the returned-goods inbox is built (§5.11). The `Returned` chips on the
  order and delivery filters now have data, because a fully refused delivery becomes
  `RETURNED`. The older customer-request chain in decision 8 is still not built.
* **Demo:** `npm run seed:demo` adds a Loom & Co. team member, `hira.anwar@citycart.demo` ("Records Keeper"), with exactly the permissions the records tabs use (`orders.view`, `delivery.view`, `delivery.manage`, `riders.view`, `payments.view`, `payments.manage`).
* Not verified: running on a physical phone (same as Phase C), and the server's
  real-MongoDB integration tests.

Main files: `partner/src/app/(records)/*`, `partner/src/app/{order,shipment,receipt,handover}/*`,
`partner/src/services/records.js`, `partner/src/utils/permissions.js`,
`partner/src/components/{FilterChips,ListRow,ListScreen,StatusPill}.jsx`.

### 5.6 Phase E: online payments

Full rules, flow, outcome table and limits are in `10-payment-system.md` §29; this is the summary for whoever continues.

* **Built:** a provider layer (`server/src/payments/`) with a **TEST gateway** (`mock`) that works exactly like a hosted-checkout gateway: a checkout page, and a **signed** webhook processed by the same code a real gateway will use. `ONLINE_GATEWAY` is accepted at checkout only while `PAYMENT_PROVIDER` names a provider and `PAYMENT_WEBHOOK_SECRET` is strong; the test gateway is refused in production.
* **Safety rules built and tested:** signature checked on the raw bytes before any database access; each notification applied at most once (unique `provider + eventId`, applied in the same transaction as the payment change); wrong amount or currency, unknown reference, late payment (after the order expired or was cancelled) and duplicate payment are recorded in `PaymentEvent` and never applied (`GET /payments/events`, super admin); the brand cannot confirm an unpaid online order; the customer cannot cancel a paid one; the receipt and customer notification happen after the commit.
* **Stock:** stock is deducted at checkout as before and **held for `ONLINE_PAYMENT_HOLD_MINUTES`** (default 30). A timer in the server (`jobs/paymentExpiry.js`, no new package) cancels unpaid online orders, restocks and notifies, with one atomic conditional update per order so it can never restock twice.
* **Customer screens:** the website's checkout and the shopper app's checkout offer "Online payment" when `GET /payments/methods` lists it; after placing, each order has **Pay now** (opens the gateway page); the order page shows "Waiting for your payment" with the deadline, and the shopper app looks again when the app comes back to the foreground, so a payment that went through shows at once.
* **Delivery app:** no change needed. Online orders have no cash to collect (the rider screen says "Already paid online"), no collector, and nothing to settle; receipts show the method.
* **Demo:** `npm run seed:demo` makes about a quarter of the delivered orders paid online (provider `mock`). To try the whole flow live, set in `server/.env`: `PAYMENT_PROVIDER=mock`, `PAYMENT_WEBHOOK_SECRET=<16+ random characters>`, `PUBLIC_API_URL=http://<your computer's Wi-Fi address>:5000`, restart, choose "Online payment" at checkout, tap Pay now, and press **Pay now** on the test page.
* **Not built (to do, in this order):** (1) a **real gateway adapter** (owner must open a sandbox account and verify the gateway's current official documentation: signature scheme, hosted-checkout request, refund API; add one `payments/<name>.provider.js`, register it, and add provider-specific tests; live card payments also need a registered business); (2) **real refunds through the gateway** (today a refund is only recorded; the brand returns the money in the gateway's dashboard); (3) one payment for a multi-brand cart (today one payment per order); (4) a screen in the website's admin area and in the app for the super admin's `LATE_PAYMENT` / `DUPLICATE_PAYMENT` review list (API exists).
* **Not verified:** a real gateway (none was available), a physical phone, and the server's real-MongoDB integration tests (the webhook transaction's rollback of a duplicate event is proven only with mocks here; run `npm run test:integration` and consider adding an integration test for it).

### 5.7 Phase F: push notifications and rider location (now split across the two apps)

Rules and API are in `12-notification-system.md` §31 (push) and `11-delivery-system.md` §30 (location); summary for whoever continues.

* **Packages:** `expo-notifications` is in both apps (each app registers its own phone token). `expo-location` is in the **Delivery app only**. The shopper app, website and server gained **no** package (push uses Node's built-in `fetch`; maps open through a plain link).
* **Push:** the server stores each phone's token (`DeviceToken`) and, for every in-app notification, sends a push through Expo's push service when `PUSH_ENABLED=true`. Both apps register after sign-in and remove the token on sign-out. The **Delivery app** opens a delivery when a notification is tapped; the **Staff app** opens an order. Both do nothing in Expo Go (Android Expo Go cannot receive push; the app detects it) and until the app has an Expo project id. To try it on a phone: `cd delivery` (or `cd partner`) and `npx eas-cli init`, add Firebase (FCM) credentials in EAS for Android, `eas build --profile development --platform android`, set `PUSH_ENABLED=true` on the server. **Not tried on a real phone.**
* **Rider location (Delivery app):** opt-in switch on the rider's Account screen (off by default, per phone, turned off on sign-out), foreground only (about every 30 s), accepted by the server only while a delivery is out, **only the last point is kept** (deleted after two hours, or at once when sharing stops), readable only by that order's customer and the brand's staff with `delivery.view`, only while out for delivery and fresh (under 10 minutes). The Staff app's delivery page, the shopper app's order page and the website's order page show "last seen" with an **Open in Maps** link (no map library).
* **Verified:** server tests (push sending, token handling for both app roles, location rules and who may read it), Staff app push tests, Delivery app tests (push registration incl. Expo Go and missing project id, the sharing decision logic, the hook, the Account switch, sign-out cleanup), shopper and website cards; lint; Android bundle builds for both apps.
* **Known gaps and ideas:** no background tracking (needs special store permissions: ask the owner first); location is shown as "last seen" plus a map link, not a live moving map (a map package would be needed: ask the owner first); the shopper app does not register for push yet; push needs the EAS build described above; FCM/APNs credentials are the owner's to create.

### 5.8 Phase I: payment proof photo at the door

Rules, data, API and tests are in `10-payment-system.md` §31; this is the summary for whoever continues.

* **Built, server:** `Payment.collection` (method, wallet, reference, private proof, verification, decision, duplicate flags, `proofDeletedAt`). A new `config/paymentCollection.js` defines the enums. `POST /rider/deliveries/:id/proof-upload` signs a Cloudinary **authenticated** upload into `citycart/brands/<brandId>/deliveries/<deliveryId>/payment-proofs` (folder built by the server). The complete call accepts `collection`; a non-cash one requires reference + proof, sets the payment `PAID` with `verification: SUBMITTED`, and never sets `collectedBy`. The server checks the photo path belongs to this brand and delivery (`422 PROOF_NOT_YOURS`). Prepaid orders refuse a collection (`409 PAYMENT_PREPAID`).
* **Built, verification:** `GET /payments/proofs` (queue), `GET /payments/:id/proof` (details + signed link, `PAYMENT_PROOF_LINK_MINUTES`, default 5) and `PATCH /payments/:id/proof` (`VERIFIED`/`REJECTED`; reason required for rejection). One atomic decision, so a second person gets `409 PROOF_ALREADY_DECIDED`. A rejection notifies the brand's owners (`PAYMENT_PROOF_REJECTED`); no money moves automatically. Duplicate reference/photo are flags, not blocks. A six-hourly job deletes photos `PAYMENT_PROOF_RETENTION_DAYS` (default 90) after the decision.
* **Built, rider screens (now in the Delivery app):** after the code, "How did the customer pay?" — Cash, Bank transfer, Wallet (JazzCash/Easypaisa/Other) or Card machine. Non-cash opens the camera (`expo-image-picker`, camera only, reduced quality, no location), requires the reference, and warns "photograph the confirmation or the slip, never the card". The photo is sent as an `expo-file-system` `File`: Expo SDK 57's global fetch is `expo/fetch`, which reads a FormData file as bytes and rejects React Native's older `{ uri, name, type }` part. If the upload fails the photo stays on the screen, the rider is told what failed, and **Upload photo** retries it without reopening the camera. The completed screen shows the proof's status; a prepaid order shows no choice. With Cloudinary unconfigured the app offers cash only. **New packages, Delivery app only:** `expo-image-picker` and `expo-file-system`.
* **Built, records screens:** Money has a **To verify** segment (oldest first, "Used before" chips). The detail shows the signed photo, order, amount, method, reference and time; Verify needs a confirmation, Reject needs a reason. Read-only staff are told they cannot decide. Receipts show the method and, for brand staff, the reference and the live check state ("Waiting to be checked", "Checked", "Rejected").
* **Built, customer side:** the receipt says how it was paid ("wallet (JazzCash)"), never the photo, reference or check state. Cash flow is unchanged and non-cash never appears in the rider's cash balance.
* **Demo:** `npm run seed:demo` adds verified, submitted and rejected door payments, a duplicate pair, a photo already past retention, receipts with the method, and a `PAYMENT_PROOF_REJECTED` notification.
* **Fixed after a phone report:** the first phone build uploaded the RN `{ uri, name, type }` part, which Expo SDK 57's `expo/fetch` rejects before sending; the error surfaced as "Cannot reach the server" and the photo was never stored, so **Complete delivery** stayed disabled. The upload now uses `expo-file-system`'s `File` (compatible with `expo/fetch` and React Native's fetch), shows the real reason, and keeps the photo for retry.
* **Not verified:** the camera and a real Cloudinary account/upload end to end (no phone and no Cloudinary credentials in this environment), and the server's real-MongoDB integration tests. Signing, folder checks, queue scoping, decisions, duplicates, retention, the FormData/`File` upload shape and all screens are covered by mocked unit tests.

Main files (server): `config/paymentCollection.js`, `models/payment.model.js`,
`models/receipt.model.js`, `services/paymentProof.service.js`, `services/upload.service.js`,
`services/delivery.service.js`, `services/receipt.service.js`, `services/notification.service.js`,
`controllers/payment.controller.js`, `controllers/riderDelivery.controller.js`,
`validators/payment.validator.js`, `validators/delivery.validator.js`,
`jobs/paymentProofRetention.js`, `scripts/demo/build.js`.
Delivery app: `services/deliveries.js`, `app/delivery/[id].jsx`,
`utils/delivery.js`, `utils/format.js`.
Staff app: `services/records.js`, `app/(records)/money.jsx`,
`app/proof/[paymentId].jsx`, `app/receipt/[id].jsx`.

### 5.9 Picker screens (marketplace v2 Phase 4)

Rules, data and API are in `08-order-management.md` §41.9 and
`22-marketplace-v2-plan.md` §E; this is the summary for whoever continues.

* **Built, server:** role `PICKER` (brand-scoped, staff app only, no
  permissions). `GET /picker` (queue), `GET /picker/:id`,
  `POST /picker/:id/claim`, `PATCH /picker/:id/items/:itemId`,
  `POST /picker/:id/propose`, `POST /picker/:id/pack`,
  `GET /picker/products?q=` (substitute search). The picker's serializers are
  allow-lists: customer first name only, no phone, address, price, total or
  payment. Claiming is an atomic `CONFIRMED → PROCESSING`; packing is an atomic
  `PROCESSING → READY_FOR_SHIPMENT` that creates the same delivery as the
  dashboard. Order statuses are reused — no new statuses.
* **Built, screen flow:** the Staff app sends a `PICKER` to `/queue`. The
  queue lists waiting orders (order number, first name, item and unit counts,
  "Yours" / waiting-for-customer) and opens `/pick/:id`. There the picker claims
  the order, marks each line **Picked**, **Short** (enter the units found) or
  **Unavailable**, and either packs ("Pack order" → confirm "Yes, packed") or,
  if anything is short, sends a change proposal: a message to the customer plus
  an optional same-brand substitute per short line (search, "Use …", quantity).
  Each line is numbered and shows its pick state in colour, the three answers
  are full-width rows with plain-words descriptions ("Found all 2", "None on
  the shelf"), and the header card carries a progress bar ("2 of 3 lines
  checked · 1 short"). While the proposal waits the lines lock and the screen
  says so; when the customer answers, "Check again" reloads. A packed order
  shows "Packed and ready for a rider" and returns to the queue.
* **Brand admin:** the web Team page has a **Picker** account type; pickers are
  created with no permission checklist and are listed as "Picker · Staff app
  only". The server refuses an employee creating one (`PICKER_CREATE_FORBIDDEN`)
  or any permission on one (`PICKER_NO_PERMISSIONS`).
* **Customer side:** the existing proposal card adds "Suggested by the store's
  picker." when `proposedByRole` is `PICKER` (website and shopper app).
* **Demo:** each active brand has a picker (`areeba.saleem@citycart.demo` for
  Loom & Co.), one order is mid-pick, and one order is waiting on the customer
  with a picker-suggested substitution. Password `Demo@12345`.
* **Limitation:** the plan says "queue of his branch", but orders have no
  fulfilment branch and stock is held per brand, so the queue is brand-wide. A
  branch queue needs a branch on the order first (report before inventing one).
* **Not verified:** the screens on a real phone (no device here). Server,
  screen, seed and web/mobile label behaviour are covered by tests.

Main files (server): `services/picker.service.js`,
`controllers/picker.controller.js`, `routes/picker.routes.js`,
`validators/picker.validator.js`, `config/pickStatuses.js`,
`models/order.model.js`, `models/orderAdjustment.model.js`.
Staff app: `services/picker.js`, `app/(picker)/queue.jsx`,
`app/(picker)/settings.jsx`, `app/pick/[id].jsx`, `app/index.jsx`,
`components/StatusPill.jsx`.

### 5.10 Phase 5: split the apps (marketplace v2)

* **Server:** `config/roles.js` replaces `PARTNER_ROLES` with `STAFF_APP_ROLES`
  (`BRAND_EMPLOYEE`, `PICKER`) and `DELIVERY_APP_ROLES` (`RIDER`).
  `utils/clientType.js` recognises `mobile`, `staff` and `delivery`.
  `services/auth.service.js` issues `client: "staff"` or `client: "delivery"` for
  the two app portals. New `POST /auth/staff/login` and `POST /auth/delivery/login`
  refuse a request without their own header (`403 STAFF_APP_ONLY` /
  `403 DELIVERY_APP_ONLY`). `middleware/authenticate.js` checks the token's mark
  against the account's role on every Bearer request and answers `403 WRONG_APP`
  for a wrong-app token (web-only accounts keep `403 WEB_ONLY`). Device push-token
  registration accepts both staff and delivery roles. `/auth/partner/login` is
  removed (404).
* **Delivery app (`delivery/`):** a new Expo package, `citycart-delivery`, display
  name *CityCart Delivery*, scheme `citycart-delivery`, bundle/package
  `com.citycart.delivery`, its own icon and splash. It carries the rider screens,
  services and tests, signs in at `/auth/delivery/login` with `X-Client: delivery`,
  stores its token under `citycart.delivery.session`, keeps the rider role guard,
  registers for push, routes a tap to the delivery, and owns location sharing
  (`citycart.delivery.shareLocation`). See `23-delivery-app.md`.
* **Staff app (`partner/`):** rider screens, `DeliveryCard`, the delivery/location
  services, rider hooks and the rider tests are removed. It is now
  `citycart-staff`, display name *CityCart Staff*, scheme `citycart-staff`,
  bundle/package `com.citycart.staff`. It signs in at `/auth/staff/login` with
  `X-Client: staff`, stores its token under `citycart.staff.session`, allows
  exactly `BRAND_EMPLOYEE` and `PICKER` (the old role list wrongly left out
  `PICKER`), keeps push registration for order notifications, and no longer has
  the location or camera packages.
* **Tests:** `server/tests/partnerAuth.test.js` became `appAuth.test.js` with the
  three-app rules (staff login, delivery login, cross-app Bearer refusals, old
  endpoint 404). The Staff suite carries the records, picker, session, push and
  sign-in tests without the rider files; the Delivery suite carries the rider
  screen, service and location tests. Counts and commands are in §9.
* **Docs:** `05` (endpoints and claim), `06` (three app doors), `19` (related
  apps), this file and the new `23-delivery-app.md`.

### 5.11 Phase 6: returned-goods inbox (marketplace v2)

The Staff app side of door returns (docs/22 §F, docs/08 §41.10). The rider records refused lines in the Delivery app when completing the delivery; the goods then travel back to the store, and the store takes them in here.

* **Tab and list** — `partner/src/app/(records)/returns.jsx`, shown to anyone with `delivery.view` (the same permission as the deliveries tab, since it is the same goods in transit; the server checks it again on `/returns`). Filter chips for `IN_TRANSIT` and `RECEIVED` (plus "All"), each row showing the order number, a one-line summary, the returned value, when it was created and a status pill. A pull down reloads; pages load ten at a time.
* **Overview** — the records home gets a "Returns to receive" tile from `GET /returns/summary`: how many are `IN_TRANSIT` and the value coming back; tapping it opens the inbox filtered to `IN_TRANSIT`. The tile is left out for someone without `delivery.view`.
* **Detail** — `partner/src/app/return/[id].jsx`, open to `BRAND_EMPLOYEE` (like the other records screens). It shows the order and return status, the value of the goods, whether the delivery fee was refunded, how much was refunded to a prepaid customer, and each refused line: product, quantity × unit price, the rider's reason, and a **View photo** button when the rider attached one. The photo is fetched through `GET /returns/:id/photo` as a short-lived signed link and opened in the system viewer; the private Cloudinary path never reaches the phone.
* **Receiving** — the person with `delivery.manage` sees a restock choice per line: **Write off** (the default) or **Sellable: back on the shelf**. "Mark received" sends `POST /returns/:id/receive` with `{ decisions: [{ index, restock }] }` and can only succeed once; a second attempt answers `409 RETURN_ALREADY_RECEIVED` and the screen reloads. Stock changes only at this moment and only for ticked lines; a write-off records no stock movement. Someone with `delivery.view` but not `delivery.manage` can read everything and is told they cannot take the goods in.
* **Notifications** — the brand team with `orders.view` or `delivery.view` gets `RETURN_IN_TRANSIT` when a return is created, so the inbox is known before the goods arrive (docs/12 §33). A tap on the push opens the order.
* **Demo:** the seed's partial COD and prepaid returns give the inbox one `IN_TRANSIT` return with a photo and one `RECEIVED` return, plus the fully rejected order.
* **Tests:** `partner/__tests__/returns-screens.test.js` covers the list and filters, the detail (lines, reasons, money, photo link and its failure), receiving (only ticked lines restocked, default write-off), a second receive answering `409`, and the permission split between seeing and receiving. `records-screens.test.js` covers the overview tile and its tap-through.

Main files: `partner/src/app/(records)/returns.jsx`, `partner/src/app/return/[id].jsx`, `partner/src/services/records.js`, `partner/src/utils/{permissions,delivery}.js`.

## 6. What is left

### 6.1 Phase D0: returns — done as door returns (marketplace v2 Phase 6)

The guild wants the records person to track **returned** orders, and the empty
`RETURNED` statuses were a real gap. Rather than the customer-request chain of
decision 8, marketplace v2 Phase 6 built **door returns**: the rider records
accepted and refused quantities (with a reason and optional photo) when
completing the delivery; the store then takes the goods in and chooses restock or
write-off; COD is charged only for accepted goods and prepaid orders are
refunded. The server rules are in docs/08 §41.10, the API in docs/05 §22f, the
model in docs/04 §25b, and the Staff screen in §5.11 above.

Still not built: a **customer-initiated** return after delivery (decision 8), and
rider pickups of goods that were already accepted. Those remain future work and
would need their own design.

### 6.2 Phase C: done (see §5.4)

The app created in Phase C is now two: the **Staff app** (`partner/`) keeps the
records and picker screens, and the **Delivery app** (`delivery/`) owns the rider
screens. The delivery code and receipt in the shopper app and on the website are
built; details and the one thing still to verify are in §5.4 and §5.10.

### 6.3 Phase D: done (see §5.5)

The Staff app's records screens are built, and the returns tab that was waiting on
Phase D0 now exists (§5.11).

### 6.4 Phase E: built with the test gateway (see §5.6)

What remains is the real gateway adapter and real refunds (§5.6 "Not built").

### 6.5 Phase F: built (see §5.7)

What remains: try push on a real build, and the ideas in §5.7 "Known gaps".

## 6.6 Next features (planned, not built)

All three requests from the owner after testing have been built: **G** a partner for the super admin,
**H** substitution of unavailable items, and **I** a payment proof photo at the door (see §5.8). The plan
and its decisions remain in `21-next-features-plan.md`; the remaining ideas there are for future work.

## 7. Open decisions and known gaps

* **Customer-initiated returns** are not built (§6.1): only returns recorded at the door exist.
* **Payment gateway** not chosen (§6.4); prepaid order-confirmation flow undecided.
* A rider with open deliveries **cannot** be deactivated (Phase C); the brand
  reassigns first.
* Riders do not get live socket updates yet (Phase F).
* Neither the Staff app nor the Delivery app has been run on a physical device
  (§5.4, §5.10).
* The Staff app polls every minute for its lists; the Delivery app polls its
  deliveries the same way. Live sockets are not built.
* Brand owners (`BRAND_ADMIN`) and the super admin cannot use either app
  (decision 4): they sign in on the website only. Widening this is a one-line
  change in `config/roles.js` (`STAFF_APP_ROLES` / `DELIVERY_APP_ROLES`) but it
  widens the security rule; ask first. **Conflict to decide:** the table in
  `22-marketplace-v2-plan.md` §2D lists `BRAND_ADMIN` for the Staff app; the
  server deliberately refuses it, and this file follows the server. Do not
  change the server until the owner decides.
* Receipts are JSON only; the apps show the receipt number. A printable/shareable receipt is not built (ask before adding a dependency).
* Receipt numbers may have gaps after a failed attempt (never duplicates).

## 8. How to work with the owner (working agreement)

* The owner is a CS student building CityCart for a software house guild; keep
  explanations clear and practical, and say plainly what could not be verified.
* **Dependencies:** suggest as few external modules as possible, justify each,
  and consolidate installs into one command. Say **what to install and where
  each file goes**.
* **Delivery format:** work in a clone of `github.com/NajamNaveed/CityCart`
  (`git clone` works in the sandbox even though the GitHub web page cannot be
  fetched), then hand over **one zip of only the changed and new files at their
  repo-relative paths**, to be unzipped over the project root. Do not commit to
  the owner's repository, and do not send patch files. If you build a phase
  while the owner is still applying the previous one, diff against a local
  baseline commit so the zip contains only the new phase.
* Update the docs in the same change as the code (`AGENTS.md` §35/§34 spirit),
  and keep `20-partner-app.md` current: change §0 and the relevant sections.
* Lint the apps with `npx expo lint` (the project's own command; plain `eslint` also scans test files and complains about Jest globals).
* The sandbox can install npm packages and run the **mocked unit tests**
  (`server`: `npx jest`), ESLint, the client build (`npx vite build`) and, when a
  MongoDB binary is available, `npm run test:integration`. It cannot run a phone
  or emulator. Always state these limits in the hand-over.

## 9. Tests

Run from `server/`: `npx eslint .` and `npx jest` (unit, mocked models, fast).
Integration tests (`npm run test:integration`) need a real MongoDB binary.
Client: `npm run lint` (oxlint) and `npx vite build` in `client/`.

Staff app (`partner/`): `npm test` runs **173 tests** in 15 suites: `api`,
`storage`, `session`, `delivery` (shared order helpers and sign-in validation),
`permissions`, `records-services` (request shapes, including proofs and
returns), `paging`, `config`, `format`, `push` (registration, tap routing for
team members, sign-out cleanup), `filter-chips`, `screens` (sign-in, who goes
where, role guards), `records-screens` (overview, orders, deliveries and rider
assignment, receipts, cash hand-over, the proof queue/detail and verify/reject,
account), `picker-screens` (queue, claim, line marking, substitute proposal,
pack confirmation, locked waiting proposal, take-over race, picker account) and
`returns-screens` (returned-goods inbox, detail, photos, receive decisions).

Delivery app (`delivery/`): `npm test` runs **154 tests** in 9 suites: `api`,
`storage`, `session` (rider-only), `delivery` (status, links, address, six-digit
code, return counts and reasons), `push-location` (push registration and
location sharing), `paging`, `format`, `config`, `screens` (sign-in,
deliveries, one delivery including the line review and return photo, cash,
alerts, account). The rider screen tests moved here from `partner/` unchanged in
intent.

Shopper app: `mobile/` runs 335 tests; the order-screen tests cover the delivery
code, the receipt, how a door payment was made, the "suggested by the store's
picker" label, and the delivered/returned quantities with the final total. Root
`npm run test:apps` runs the staff and delivery suites; `npm run test:staff` and
`npm run test:delivery` run one each.

Programme test files (`server/tests/`): `appAuth.test.js` (three-app sign-in and
token rules; it was `partnerAuth.test.js`), `riders.test.js` (rider management
and tenant isolation), `riderDeliveries.test.js` (rider endpoints, code logic,
assignment, customer code, door collections), `paymentProofs.test.js` (queue
scoping, signed link, decisions, duplicates, retention), `riderModel.test.js`
(schemas, role sets, restricted access), `receipts.test.js` (issuing, visibility,
door-payment snapshots), `cash.test.js` (outstanding, settle, rider cash),
`pushAndLocation.test.js` (device tokens and rider location). Existing tests
edited along the way: `brandOrders`, `brandOnboarding`, `deliveries`, `orders`,
`payments`, `seedDemo`.

Test patterns: models are auto-mocked with `jest.mock('../src/models/...')`;
cookie users via `tests/helpers/testAuth.js` (`getAuthCookie`); app users by
signing a token with `signToken({ ..., client: 'staff' })` or
`client: 'delivery'` and sending `Authorization: Bearer`; transactions are
replaced by `runInTransaction: (work) => work('SESSION')`. Every security rule
in §4 has tests; add the same for new rules, in the same style.

## 10. Error codes added by the programme

| Code | Status | Meaning |
|---|---|---|
| `STAFF_APP_ONLY` | 403 | Staff sign-in without `X-Client: staff` |
| `DELIVERY_APP_ONLY` | 403 | Delivery sign-in without `X-Client: delivery` |
| `WRONG_APP` | 403 | A bearer token marked for the other app, or a bearer token of a shopper / web-only account |
| `WEB_ONLY` | 403 | Bearer token not allowed for that account (existing code, widened rules) |
| `USE_RIDER_ASSIGNMENT` | 409 | Typed agent name while a rider is assigned |
| `DELIVERY_FINAL` | 409 | Delivery already finished |
| `NO_RIDER_ASSIGNED` | 409 | Nothing to remove |
| `INVALID_CODE` | 422 | Wrong delivery code (`attemptsRemaining` in the body) |
| `CODE_LOCKED` | 429 | Too many wrong codes; the brand completes the delivery |
| `NO_DELIVERY_CODE` | 409 | Delivery has no code (brand completes it) |
| `CODE_NOT_AVAILABLE` | 409 | Customer asked for the code before the order is on its way |
| `NO_RECEIPT` | 404 | Order not paid yet |
| `CASH_CHANGED` | 409 | A listed payment is no longer unsettled for that collector |
| `BRAND_TERMINATED` | 409 | A terminated brand cannot add riders |
| `RIDER_HAS_OPEN_DELIVERIES` | 409 | Cannot deactivate a rider with open deliveries (`openDeliveries` in the body) |
| `ONLINE_PAYMENTS_UNAVAILABLE` | 400 / 503 | No payment provider is switched on |
| `NO_ACTIVE_DELIVERY` | 409 | The rider tried to share a position with no delivery out |
| `PAYMENT_PENDING` | 409 | The brand tried to confirm an online order that is not paid yet |
| `PAID_ORDER_NOT_CANCELLABLE` | 409 | The customer tried to cancel an order already paid online |
| `PAYMENT_EXPIRED` / `ALREADY_PAID` / `NOT_PAYABLE` / `NOT_ONLINE` | 409 | Starting a payment that cannot be started |
| `PROOF_NOT_CONFIGURED` | 503 | Cloudinary is not set up, so no photo can be taken |
| `PROOF_NOT_FOUND` | 404 | The payment has no photo (or it was deleted) |
| `PROOF_NOT_ALLOWED` | 409 | A proof upload while the delivery is not out for delivery |
| `PROOF_NOT_YOURS` | 422 | The photo path is not this brand's/delivery's |
| `PAYMENT_PREPAID` | 409 | A collection was sent for an order paid up front |
| `PAYMENT_ALREADY_COLLECTED` | 409 | A non-cash collection arrived after the payment was collected |
| `PROOF_ALREADY_DECIDED` | 409 | Someone already verified/rejected this proof (`verification` in the body) |
| `PICK_TAKEN` | 409 | Another picker claimed the order first |
| `NOT_PICKABLE` / `NOT_PICKING` | 409 | The order is not in the queue / not being picked by this picker |
| `CLAIM_REQUIRED` | 409 | A line was marked without claiming the order |
| `NOT_YOUR_ORDER` | 409 | The order belongs to another picker |
| `PICKING_INCOMPLETE` | 409 | Packing before every line is marked |
| `INVALID_PICKED_QUANTITY` | 400 | SHORT count outside 1 … quantity − 1 |
| `NOTHING_TO_PROPOSE` / `SUBSTITUTE_NOT_SHORT` / `DUPLICATE_SUBSTITUTE` | 409 | The proposal covers nothing short, a line that is not short, or the same substitute twice |
| `PICKER_NO_PERMISSIONS` | 400 | A picker was given brand-team permissions |
| `PICKER_CREATE_FORBIDDEN` | 403 | An employee tried to create a picker |

## 11. Change log

* **2026-10 Phase A** delivered: rider role and management, assignment, partner sign-in and rider endpoints, delivery code, web Riders page, demo data, docs.
* **2026-10 Phase B** delivered: receipts, cash-on-delivery collection and settlement, rider cash view, demo data, docs.
* **2026-10 Handoff** written; missing returns backend identified and added as Phase D0.
* **2026-10 More fixes after testing:** the website's search box no longer grows over the message and notification icons, the two location controls are one (the picker already changes city and area), and the shopper app no longer prints the server address on the home screen. Plan for three new features written (`21`).
* **2026-10 Fixes after the owner's testing:** one step after Picked up (Out for delivery; `IN_TRANSIT` stays a server status), filter chips no longer stretch to the screen's height (horizontal `ScrollView` needs `flexGrow: 0`), and the leftover `(records)/records.jsx` placeholder must be deleted by hand (Expo Router shows any file in the tab folder as a tab).
* **2026-10 Phase F** delivered: push notifications to the Partner app (device tokens, Expo push sender, tap to open) and opt-in, foreground rider location with last-seen display for records staff and customers. Two packages added to `partner/` only.
* **2026-10 Phase E** delivered: online payments with a built-in test gateway (provider layer, signed webhook, idempotent events, stock hold and release, confirm/cancel rules, Pay now in the shopper app and website, demo data). Real gateway adapter pending.
* **2026-10 Phase D** delivered: the records screens for brand team members (overview, orders, deliveries with rider assignment, receipts, cash hand-over), permission-based tabs, permissions loaded at sign-in, `StatusPill` for all statuses. No server changes.
* **2026-10 Phase C** delivered: `partner/` app (sign-in, rider screens), delivery code and receipt in the shopper app and website, rider-deactivation guard, customer-safe delivery view, root scripts.
* **2026-10 Phase H** delivered: order change proposals (substitution / removal) on the brand website and both customer clients; the Partner app shows each order's proposal history read-only. Server rules, stock, payments, notifications and docs updated.
* **2026-10 Phase I** delivered: payment at the door — the rider records cash, bank transfer, wallet or card machine (camera photo + reference for non-cash), the brand verifies or rejects the proof in a "To verify" queue, photos stay private and are deleted after 90 days, receipts say how it was paid. Demo data, docs and tests updated. Camera and a real Cloudinary upload not tried on a phone.
* **2026-10 Phase I fix (phone):** the proof upload used React Native's `{ uri, name, type }` FormData part, which Expo SDK 57's global `expo/fetch` rejects; the report was "Cannot reach the server" and Complete never enabled. The photo is now an `expo-file-system` `File`, upload failures say what failed and keep the photo for **Upload photo** to retry.
* **2026-11 Picker (marketplace v2 Phase 4):** `PICKER` role and `/picker/*` API, the Partner app picker queue and pick screen (claim, line marking, substitute proposal, pack), picker accounts on the web Team page, "Suggested by the store's picker" on both customer clients, demo pickers and picking orders, tests and docs.
* **2026-11 Phase 5 (marketplace v2):** the Partner app split into the **Staff app** (`partner/`, `citycart-staff`, `com.citycart.staff`) and the new **Delivery app** (`delivery/`, `citycart-delivery`, `com.citycart.delivery`). Rider screens, rider location sharing, door-payment capture and rider push routing moved to Delivery; the Staff app keeps records and picker screens. Sign-in is now three separate doors: `/auth/mobile` (shopper), `/auth/staff/login` (`BRAND_EMPLOYEE`, `PICKER`) and `/auth/delivery/login` (`RIDER`); `/auth/partner/login` was removed. Bearer tokens carry `client: 'staff'` or `client: 'delivery'` and a token of one app is refused by the other (`403 WRONG_APP`). Root scripts are `dev:staff`, `dev:delivery`, `test:staff`, `test:delivery`, `test:apps`. Tests, both app suites, lint and docs updated; see §5.10 and `23-delivery-app.md`.
* **2026-11 Phase 6 (marketplace v2):** the **returned-goods inbox**. The rider now records refusal at the door in the Delivery app; the Staff app gets a Returns tab (list, filters, detail with reasons and private photos, **Mark received** with per-line restock or write-off, default write-off), a "Returns to receive" tile on the home screen, and `RETURN_IN_TRANSIT` notifications. See §5.11.
