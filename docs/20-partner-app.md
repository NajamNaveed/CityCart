# 20 — CityCart Partner App: Plan, Status and Handoff

Added October 2026. This file is the single place that explains the **Partner
App programme**: why it exists, what was decided, what is already built, what is
left, and how to continue. It is written so a new developer or AI model can pick
the work up cold. Read it first, then the documents it points to.

## 0. Status at a glance

| Phase | Work | Status |
|---|---|---|
| A | Rider foundation: `RIDER` role, rider management, assignment, partner sign-in, rider endpoints, delivery code | **Done** (backend + web dashboard + docs) |
| B | Receipts and cash-on-delivery records: receipts, who collected cash, settlement | **Done** (API + docs; no screens yet) |
| D0 | **Returns backend** (found missing, see §6.1) | Not started |
| C | `partner/` Expo app: sign-in and rider screens; shopper app shows delivery code | Not started |
| D | Records screens in the same app (orders, deliveries, returns, payments, receipts, cash) | Not started |
| E | Card / online payments with a hosted gateway and signed webhook | Not started (gateway not chosen) |
| F | Optional: push notification on assignment, rider live location | Not started |

Server test suite: 940 tests before the programme, 1,047 after Phase A, 1,090
after Phase B. All pass; ESLint is clean. The real-MongoDB integration suite
(`npm run test:integration`) could not be run by the author (no MongoDB binary
download in the build sandbox) and should be run by the owner after applying
each phase.

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
| 1 | **One** new app, *CityCart Partner*, in `partner/` next to `mobile/`; the account's role decides the screens | One backend, one login, one dependency set. The shopper app stays separate (other audience, own store listing). If two installable apps are ever required, Expo app variants can build both from the same code (`mobile/app.config.js` already has the pattern) |
| 2 | Riders belong to **one brand each** (brand-scoped `RIDER` role, created by the brand) | Reuses the existing multi-tenant model; no shared rider pool |
| 3 | Partner apps use **short-lived bearer tokens** (one staff session, default 8 h, no sliding renewal) | The app cannot use the web cookie. This deliberately relaxes the old "staff stay on the web" rule, **only** for `RIDER` and `BRAND_EMPLOYEE` |
| 4 | Brand owners and the super admin stay on the **web** | Highest-privilege accounts should not hold a long-lived bearer token on a phone |
| 5 | Proof of delivery is a **six-digit code** the customer reads out | Strong enough, needs no camera/signature library. Chosen over four digits for safety |
| 6 | Dependencies are kept **minimal and justified**; installs consolidated | Owner preference (see §8) |
| 7 | Card data is **never stored**; online payments are confirmed only by the gateway's signed webhook | Security and PCI scope |

## 3. Design

### 3.1 How the apps connect to the system

```text
 Shopper app   Partner app (Rider | Records)   Web: brand dashboard / super admin
        \                  |                     /
         +-----------  /api/v1  (Express)  ------+
                           |            \
                        MongoDB      Socket.io (live updates; partner use in Phase F)
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
| `BRAND_EMPLOYEE` (with permissions) | One brand | Web, and the Partner app (records screens) |
| `RIDER` (new) | One brand | Partner app only; cannot use the web brand login |
| `CUSTOMER` | Own data | Shopper app and web |

### 3.3 Who sees what

| Person | Sees | Never sees |
|---|---|---|
| Customer | Own orders, own receipts, own delivery code | Anyone else's data |
| Rider | Only deliveries assigned to them: customer name, phone, address and instructions (only while the delivery is open), item names and quantities, cash to collect, their own cash total | Other riders' deliveries, prices, other payments, brand revenue, the customer account, the delivery code, receipts |
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
4. A `RIDER` or `BRAND_EMPLOYEE` bearer token must carry `client: "partner"`;
   brand owners, the super admin and shoppers must be refused with such a token,
   and a partner token must never work for a shopper. Enforced in
   `middleware/authenticate.js`.
5. **Receipts are written only by the system** when a payment becomes `PAID`,
   after the payment commits, and never edited. No receipt write endpoint exists.
   Receipts never copy the customer's address or phone.
6. `collectedBy`, `collectedAt` and `brandId` on a COD payment are written inside
   the same transaction that marks it `PAID`. Never client-supplied.
7. Cash settlement is all-or-nothing and pinned to brand and collector.
8. **Never store card data. Never mark an online payment paid from the app.**
9. Do not add a new brand-scoped role without updating `02-user-roles-and-permissions.md`.
10. Everything in `AGENTS.md` still applies (multi-tenancy §7, authorization §8,
    never trust client ownership data §9, payments §16, tests §26, dependencies §29).

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
* **Assignment.** `PATCH /deliveries/:id/rider` (`delivery.manage`) assigns an
  active rider of the same brand, sets `assignedAgent` to the rider's name,
  notifies the rider (`DELIVERY_ASSIGNED`) and makes sure a delivery code exists.
  `riderId: null` removes the rider. Final deliveries cannot be reassigned. A
  typed `assignedAgent` is refused (`409 USE_RIDER_ASSIGNMENT`) while a rider is
  assigned. `GET /deliveries?riderId=` filters by rider.
* **Partner sign-in.** `POST /auth/partner/login` with header `X-Client: partner`.
  Only `RIDER` and `BRAND_EMPLOYEE`; wrong role, wrong password and unknown
  email all give the same `401`. Token comes in the body (no cookie), is marked
  `client: "partner"`, lasts `STAFF_SESSION_HOURS`. Without the header:
  `403 PARTNER_APP_ONLY`.
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
| `POST /auth/partner/login` | Rider, team member | Header `X-Client: partner`; token in body |
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

## 6. What is left

### 6.1 Phase D0: returns backend (found missing, must precede the returns screen)

The guild wants the records person to track **returned** orders. While preparing
this handoff it was found that **returns are not implemented in the server**:
`RETURN_REQUESTED`, `RETURNED` (order) and `RETURNED`/`CANCELLED` (delivery)
exist as statuses, but no code can reach them (`config/deliveryTransitions.js`
says so explicitly). Phase D can show orders by status, but a real returns
screen needs this feature first. It needs a design agreed with the owner before
coding; questions to settle:

* who starts a return (customer request after delivery, within what window)?
* who approves it (brand), and what does the rider do (collect the item)?
* stock: when does returned stock go back into inventory (`inventoryReasons` already has `RETURNED`)?
* money: how a return connects to the existing refund endpoint (a refund does not change who collected the cash, and never edits the receipt; a credit note is out of scope unless asked).

Update `02`, `08`, `09`, `10`, `11` and this file when it is designed.

### 6.2 Phase C: the Partner app, sign-in and rider screens

Create `partner/` as an Expo app modelled on `mobile/` (read `mobile/AGENTS.md`
and `docs/19-mobile-app.md` first). Facts about `mobile/` to reuse:

* Expo SDK 57 (`expo ~57.0.x`), React Native 0.86, React 19, Expo Router
  (`src/app/`), **plain JavaScript (no TypeScript)**, `axios`, tokens in
  `expo-secure-store`. **Expo changes between SDKs: read the versioned Expo docs
  before using any Expo API** (`mobile/AGENTS.md` says how), and install with
  `npx expo install <pkg>`, never `npm i`. Run `npx expo lint` and `npm test`
  (jest-expo) before finishing.
* `mobile/src/services/api.js` shows the client pattern (header `X-Client`,
  bearer token, a 401 handler that signs out, error mapping). The partner copy
  must send **`X-Client: partner`**, use **`/auth/partner/login`** (add it to the
  "a 401 at login is not a lost session" pattern), keep its token under its own
  secure-store key, and add a `WEB_ONLY`-style message for partner-only errors.
* Sign-in rules live in `services/session.js`, kept free of React for testing.

Dependency guidance (the owner wants few and justified): start from
`mobile/package.json` and **leave out** `react-native-maps`, `expo-location`,
`socket.io-client` and the fonts unless needed. The rider opens Maps and the
phone dialler with `Linking` (`geo:`/`https` map link, `tel:`), which needs no
extra package. Phase C should need **no packages beyond what `mobile/` already
uses**; state the single consolidated `npx expo install ...` line and where each
file goes.

Rider screens, all backed by endpoints in §5.3 (poll or pull-to-refresh; sockets
are Phase F):

1. **Sign in** (`/auth/partner/login`). After sign-in `GET /auth/me`; the app
   shows rider screens for `RIDER`, records screens (Phase D) for
   `BRAND_EMPLOYEE`, choosing tabs from the permissions returned.
2. **My deliveries** (active / history) with pull to refresh.
3. **Delivery detail**: address, call the customer, open in Maps, items, **amount
   to collect** for COD, and buttons that follow the lifecycle: picked up → in
   transit / out for delivery → *enter code to complete* or *failed* (reason
   required). Show the server's `INVALID_CODE` attempts left and `CODE_LOCKED`
   ("ask the brand to complete this delivery").
4. **Cash**: `GET /rider/deliveries/cash`.
5. **Notifications**: the existing inbox (`DELIVERY_ASSIGNED`).
6. **Account**: sign out.

Also in this phase, in the **shopper app** (`mobile/`): show the delivery code on
the order page while the order is on its way (`GET /deliveries/:id/code`), and
the receipt once paid (`GET /receipts/order/:orderId`). The web client may show
the receipt too.

Acceptance: a rider created on the web Riders page can sign in on the app, see
only their assigned deliveries, move one to delivered with the customer's code,
and the order, delivery and COD payment all update (and a receipt exists); a
brand owner or customer account cannot sign in on the Partner app.

### 6.3 Phase D: records screens (same app)

For `BRAND_EMPLOYEE` accounts, tabs shown by permission:

* **Orders / deliveries by status** (to deliver, out for delivery, delivered,
  failed, returned once D0 exists): `GET /brand/orders`, `GET /deliveries?status=`
  (`orders.view`, `delivery.view`); order timeline from `GET /brand/orders/:id`.
* **Assign rider** (`PATCH /deliveries/:id/rider`, needs `delivery.manage` +
  `riders.view` for the picker).
* **Returns**: after Phase D0.
* **Payments and receipts**: `GET /receipts` (filter by date), receipt detail
  (`payments.view`).
* **Cash**: `GET /payments/cash/outstanding`, then tick the payments counted and
  `POST /payments/cash/settle` (`payments.manage`). Handle `409 CASH_CHANGED` by
  reloading.
* **Daily summary**: composed from the above; add a backend endpoint only if the
  existing ones are not enough, and discuss it first.

Hide anything the account lacks permission for, but remember the **server is the
authority**: a hidden button is a convenience, never the security.

### 6.4 Phase E: card and online payments

* The `Payment` model already allows `CARD`, `ONLINE_GATEWAY` etc.; only COD is
  implemented. The owner must **choose a gateway available in Pakistan** (for
  example Safepay, PayFast, JazzCash or Easypaisa; verify current sandbox
  documentation and that the owner can get a merchant sandbox account before
  coding).
* Use the gateway's **hosted checkout**. CityCart stores only the transaction
  reference, provider and status, never card numbers.
* **Webhook**: a public endpoint, verified by the gateway's signature against the
  raw request body (use Node's built-in `crypto`; no SDK needed unless the
  gateway requires it), idempotent (docs/10 covers duplicate events), and the
  **only** thing that marks an online payment `PAID`. On success call
  `issueReceiptBestEffort(payment._id)`, so receipts come for free. Online
  payments have no `collectedBy`, so they never appear in cash outstanding.
* Open decision: when an order is confirmed for prepaid methods (after the
  webhook, with a pending window and stock reservation). Settle this with the
  owner and document it in `08` and `10` first.
* Opening the hosted checkout from the shopper app may need an in-app browser
  package; check `mobile/package.json` and prefer `Linking` before adding one.

### 6.5 Phase F: optional extras

* **Push notification** on rider assignment: needs `expo-notifications` (native
  module: development build required), storing device push tokens (new field or
  model, discuss), and the server sending through Expo's push service.
* **Rider live location**: `expo-location` (foreground) and Socket.io. **The
  socket handshake currently accepts bearer tokens for shoppers only**
  (`server/src/sockets/index.js`); it must be extended with the same partner-token
  rule as `middleware/authenticate.js` (§4 rule 4), with tests.

## 7. Open decisions and known gaps

* **Returns** are not built (§6.1): needs a design and the owner's decisions.
* **Payment gateway** not chosen (§6.4); prepaid order-confirmation flow undecided.
* Deactivating a rider does **not** move their open deliveries; the brand
  reassigns (the web message says so).
* Riders do not get live socket updates yet (Phase F).
* The customer receives the delivery object in the order response, which now
  contains `riderId` (an internal id, harmless, but could be stripped for
  customers if the owner prefers).
* Brand owners cannot use the Partner app (decision 4). Allowing it is a
  one-line change in `config/roles.js` (`PARTNER_ROLES`) but widens the security
  rule; ask first.
* Receipts are JSON only; a printable/shareable PDF is not built (ask before adding a dependency).
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
* The sandbox can install npm packages and run the **mocked unit tests**
  (`server`: `npx jest`), ESLint, and the client build (`npx vite build`), but it
  **cannot** download MongoDB (so `npm run test:integration` cannot run) and
  cannot run a phone or emulator. Always state these limits in the hand-over.

## 9. Tests

Run from `server/`: `npx eslint .` and `npx jest` (unit, mocked models, fast).
Integration tests (`npm run test:integration`) need a real MongoDB binary.
Client: `npm run lint` (oxlint) and `npx vite build` in `client/`.

Partner-programme test files (`server/tests/`): `partnerAuth.test.js` (sign-in,
token rules), `riders.test.js` (rider management and tenant isolation),
`riderDeliveries.test.js` (rider endpoints, code logic, assignment, customer
code), `riderModel.test.js` (schemas, role sets, restricted access),
`receipts.test.js` (issuing, visibility), `cash.test.js` (outstanding, settle,
rider cash). Existing tests edited along the way: `brandOrders`,
`brandOnboarding`, `deliveries`, `payments`, `seedDemo`.

Test patterns: models are auto-mocked with `jest.mock('../src/models/...')`;
cookie users via `tests/helpers/testAuth.js` (`getAuthCookie`); partner users by
signing a token with `signToken({ ..., client: 'partner' })` and sending
`Authorization: Bearer`; transactions are replaced by
`runInTransaction: (work) => work('SESSION')`. Every security rule in §4 has
tests; add the same for new rules, in the same style.

## 10. Error codes added by the programme

| Code | Status | Meaning |
|---|---|---|
| `PARTNER_APP_ONLY` | 403 | Partner sign-in without `X-Client: partner` |
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

## 11. Change log

* **2026-10 Phase A** delivered: rider role and management, assignment, partner sign-in and rider endpoints, delivery code, web Riders page, demo data, docs.
* **2026-10 Phase B** delivered: receipts, cash-on-delivery collection and settlement, rider cash view, demo data, docs.
* **2026-10 Handoff** written; missing returns backend identified and added as Phase D0.
