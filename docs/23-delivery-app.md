# 23 — CityCart Delivery App: Plan, Status and Handoff

Added November 2026 with marketplace v2 Phase 5. This file explains the
**Delivery app** (`delivery/`): why it exists, who may use it, what is built,
how it differs from the other two apps, what is tested, and what is still
missing. It replaces the rider half of `20-partner-app.md`; read this file and
the server sections it points to.

## 0. Status at a glance

| Area | State |
|---|---|
| App package, icon, name | **Done** — `citycart-delivery`, *CityCart Delivery*, `com.citycart.delivery` |
| Sign-in (`RIDER` only) | **Done** — `/auth/delivery/login` with `X-Client: delivery`; wrong roles refused |
| Deliveries list and one delivery | **Done** — assigned deliveries, picked up / out for delivery, six-digit code, failed attempt |
| Door payment | **Done** — cash, bank transfer, wallet, card machine; camera photo + reference for non-cash |
| Cash held | **Done** — collected and not yet handed to the brand |
| Alerts | **Done** — the rider's notifications |
| Location sharing | **Done, opt-in, foreground only** — last seen while an order is out for delivery |
| Push notifications | **Built**; needs a real EAS build to try on a phone (Expo Go on Android cannot receive them) |
| Returns at the door | Not built; marketplace v2 Phase 6 |
| Tests | 140 tests in 9 suites, all mocked; lint clean |

The app has **not** been run on a physical device in this environment: the
camera upload and push need a real phone, and a real Cloudinary account.

## 1. Why this exists

Marketplace v2 split the old single Partner app into three apps, one per kind of
user (plan: `22-marketplace-v2-plan.md` §2D):

| App | Folder | Package | Roles |
|---|---|---|---|
| Shopper | `mobile/` | `com.citycart.app` | `CUSTOMER` |
| **Delivery** | `delivery/` | `com.citycart.delivery` | `RIDER` |
| Staff | `partner/` | `com.citycart.staff` | `BRAND_EMPLOYEE`, `PICKER` |

The rider's job is different from the records person's or the picker's: the
rider carries a phone in the street, needs the camera, the dialler, maps and
location, and should never see prices, totals or the brand's paperwork. A
separate app keeps that surface small and lets the server refuse a rider token
everywhere else.

Brand owners (`BRAND_ADMIN`), admin partners and the super admin remain
**web-only**. That is a deliberate security rule, not an omission.

## 2. Sign-in and sessions

```text
POST /api/v1/auth/delivery/login
X-Client: delivery
{ "email": "...", "password": "..." }
```

* Only `RIDER` accounts succeed. A wrong password, an unknown email and an
  account of another role all answer the same `401`.
* Without `X-Client: delivery`: `403 DELIVERY_APP_ONLY`.
* The response carries `user` and a `token` marked `client: "delivery"`, valid
  for one staff session (`STAFF_SESSION_HOURS`, default 8 hours). No cookie is
  set. There is no sliding renewal: after the shift the rider signs in again.
* The app keeps the token in the device's secure storage under
  `citycart.delivery.session`, and sends it as `Authorization: Bearer <token>`.
* On every request the server checks the token's mark against the account's
  current role. A delivery token is refused for a shopper, a staff account, a
  brand owner or the super admin. A staff token or an unmarked shopper token is
  refused here with `403 WRONG_APP`.
* A deactivated rider or a changed password ends the session at the next
  request.

The full rules are in `06-authentication-and-security.md` (Native App Sessions)
and the endpoint reference in `05-api-specification.md`.

## 3. Screens

Expo Router route groups under `delivery/src/app/`:

| Route | What it shows |
|---|---|
| `index.jsx` | Sends a signed-out user to `/login`, a rider to `/deliveries` |
| `(auth)/login.jsx` | Email and password; explains which app this is |
| `(rider)/deliveries.jsx` | The rider's deliveries, with filters and pull-to-refresh |
| `(rider)/cash.jsx` | Cash collected and not yet settled |
| `(rider)/alerts.jsx` | The rider's notifications |
| `(rider)/account.jsx` | Share-location switch, sign out |
| `delivery/[id].jsx` | One delivery: call, Maps, status steps, code entry, door payment, failed attempt |

`RequireRole` wraps the rider group, so a non-rider session never reaches a
rider screen even if the server were to misbehave. As always, the server is the
real control.

## 4. Rules that must not be broken

These are the rider-facing subset of `20-partner-app.md` §4; the server tests
enforce them.

1. **Never return `deliveryCode`** outside `GET /deliveries/:id/code`
   (customer only). It is `select: false` on the model.
2. **Never take `brandId` or `riderId` from the app.** Both come from the
   signed-in account; every rider query is pinned to both. Another rider's or
   brand's delivery is `404`, never `403`.
3. A rider can **never** set `DELIVERED` directly. Only
   `POST /rider/deliveries/:id/complete` with the customer's six-digit code
   does; wrong tries are counted atomically (five, then `429 CODE_LOCKED`).
4. The token must carry `client: "delivery"`. Any other mark, or a token for a
   shopper or web-only account, is refused on every endpoint.
5. **Proof photos stay private.** The upload folder is built by the server from
   the brand and delivery; the rider cannot choose a path. The rider sees only
   the proof's status, never a signed link.
6. **A non-cash door payment is unverified money.** It is `PAID` with
   `collection.verification: SUBMITTED`, never sets `collectedBy`, and is absent
   from the rider's cash balance until the brand decides it.
7. Location is shared **only** while the rider switches it on and only while an
   order is out for delivery. Only the latest position is stored. The rider can
   switch it off at any time in Account.
8. Everything in `../AGENTS.md` applies: tenant isolation, backend authority,
   no client-supplied ownership or payment values.

## 5. Notifications and location

* **Push.** The app registers its Expo push token with `PUT /devices/push-token`
  (the server accepts rider, picker and brand-team accounts). A tap opens the
  delivery when `data.deliveryId` / `data.orderId` is present. Expo Go on
  Android cannot receive push; the app skips registration there. A real build
  needs `npx eas-cli init`, Firebase credentials in EAS, and `PUSH_ENABLED=true`
  on the server (`12-notification-system.md` §31).
* **Location.** The Account switch is off by default. When on, the app sends the
  latest position while the app is open and an order is `OUT_FOR_DELIVERY`. The
  brand's records screen and that order's customer see "last seen" and an
  "Open in Maps" link. `409 NO_ACTIVE_DELIVERY` means there is nothing to share
  with. The server keeps one point per rider, not a track.

## 6. How the split was done (Phase 5)

* New package `delivery/` copied the rider screens, rider services, rider hooks,
  shared UI, theme and API client from `partner/`, then dropped everything the
  rider does not need (records tabs, picker screens, brand services).
* `partner/` removed the `(rider)` group, the single-delivery screen, the rider
  delivery/location/prefs services, the rider hooks and the rider tests. It kept
  push registration for order alerts and the records/picker screens.
* Server app-type checks became three doors: shopper (no `client` claim),
  staff (`client: "staff"`), delivery (`client: "delivery"`). The old
  `/auth/partner/login` is gone (404).
* Root scripts are `dev:delivery`, `test:delivery` (and `test:apps` for both
  staff and delivery).

## 7. Tests

Run in `delivery/`:

```bash
npx expo lint
npm test
```

`npm test` runs **140 tests in 9 suites**:

| Suite | Covers |
|---|---|
| `api.test.js` | base URL, `X-Client: delivery`, auth header, error messages |
| `session.test.js` | rider-only sign-in, token storage, restore and sign-out for wrong roles |
| `storage.test.js` | secure-storage key `citycart.delivery.session` |
| `delivery.test.js` | status helpers, call/Maps links, address line, six-digit code validation |
| `push-location.test.js` | push registration/skip/unregister, tap routing, location sharing rules |
| `paging.test.js` | the shared paged list |
| `format.test.js` | money and time formatting |
| `config.test.js` | API URL and environment handling |
| `screens.test.js` | sign-in, start routing, deliveries, one delivery, cash, alerts, account, role guard |

Server-side tests for the rider flow stay in `server/tests/`:
`appAuth.test.js` (three-app sign-in), `riderDeliveries.test.js`,
`riders.test.js`, `riderModel.test.js`, `paymentProofs.test.js`,
`receipts.test.js`, `cash.test.js` and `pushAndLocation.test.js`.

## 8. Known gaps

* Not run on a phone: camera/Cloudinary upload and push delivery are covered by
  mocks only.
* No live socket updates; the list refreshes on open, every minute, and on pull.
* No offline queue: a status change needs the server.
* Location sharing is foreground only and stores a single point.
* Door returns (accept/reject per line) are marketplace v2 Phase 6.
* The rider's cash view shows what is unsettled; settlement is done by the brand
  on the website.

## 9. Main files

```text
delivery/app.json                      name, slug, scheme, package, icon, plugins
delivery/src/services/api.js           API client, X-Client: delivery
delivery/src/services/session.js       rider-only sign-in and restore
delivery/src/services/storage.js       secure token key
delivery/src/services/deliveries.js    /rider/deliveries calls
delivery/src/services/push.js          push registration and tap routing
delivery/src/services/location.js      latest-position sharing
delivery/src/hooks/useLocationSharing.js
delivery/src/app/(rider)/_layout.jsx   RequireRole('RIDER') + tabs
delivery/src/app/delivery/[id].jsx     the delivery screen
```

Server: `routes/riderDelivery.routes.js`, `controllers/riderDelivery.controller.js`,
`services/riderDelivery.service.js`, `services/delivery.service.js`,
`services/paymentProof.service.js`, `services/riderLocation.service.js`,
`middleware/authenticate.js`, `config/roles.js`.

## 10. Change log

* **2026-11 Phase 5 (marketplace v2):** app created from the rider half of the
  old Partner app; three-way sign-in; rider location and push moved here; Staff
  app reduced to records and picker roles; server, tests and docs updated.
