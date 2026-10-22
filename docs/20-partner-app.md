# 20 — CityCart Partner App

Status: **Phase A implemented (backend + web dashboard); Phases B–F planned.**
Added October 2026. Read together with `02` (roles), `06` (native app sessions),
`10` (payments), `11` (delivery) and `19` (shopper app).

## 1. Purpose

The software house guild requires mobile apps on top of the marketplace for the
people who run deliveries and keep order records. This document defines them,
how they connect to the existing system, and who may see what.

## 2. One app, role-based screens

There is **one** new Expo app, `partner/` (next to `mobile/`), called
*CityCart Partner*. After sign-in the account's role decides the screens:

| Role | Sees |
|---|---|
| `RIDER` | The rider screens: own deliveries, status, proof-of-delivery code, cash collected |
| `BRAND_EMPLOYEE` (with permissions) | The records screens: orders by status, deliveries, returns, payments and receipts |

Reasons: one backend, one login, one dependency set to maintain; a team member
can also be a rider's supervisor. The shopper app stays separate (different
audience and store listing). If two separately installable apps are ever
required, Expo app variants (`mobile/app.config.js` already supports the
pattern) can build both from the same code.

Brand owners (`BRAND_ADMIN`) and the super admin stay on the web dashboards.

## 3. How the apps connect to the system

```text
 Shopper app   Partner app (Rider | Records)   Web: brand dashboard / super admin
        \                  |                     /
         +-----------  /api/v1  (Express)  ------+
                           |            \
                        MongoDB      Socket.io (live updates, Phase F)
                           |
                 Payment gateway --webhook--> server   (Phase E)
```

Every client calls the same API. The server checks role and brand on every
request; nothing is trusted from the app. A rider completing a delivery runs the
same transaction as the dashboard (delivery, order, COD payment together).

## 4. Who sees what

| Person | Sees | Never sees |
|---|---|---|
| Customer | Own orders, own receipts, own delivery code | Anyone else's data |
| Rider | Only deliveries assigned to them: customer name, phone, address and instructions (only while the delivery is open), item names and quantities, cash to collect | Other riders' deliveries, prices, other payments, brand revenue, the customer account, the delivery code |
| Records person (employee with permissions) | Their brand's orders, deliveries, payments, receipts | Other brands; refunds need `payments.manage` |
| Brand admin | Everything in their brand; assigns riders; refunds | Other brands |
| Super admin | Everything on the platform | Card numbers (nobody does) |

## 5. Rider accounts (Phase A)

* A rider is a `User` with role `RIDER`, **brand-scoped** (exactly one brand),
  created by the brand owner or a team member with `riders.create`. The role and
  brand are never taken from the request.
* Permissions: `riders.view`, `riders.create`, `riders.update` (edit, deactivate,
  reset password). Riders themselves hold no permissions; they can only reach
  `/rider/*` and their own notifications.
* A rider signs in **only** through the partner app. The web brand login refuses
  them. Riders cannot reset their own password; the brand does it, which also
  signs them out everywhere (`passwordVersion`).
* A deactivated rider cannot sign in; their open deliveries stay assigned until
  the brand moves them.

## 6. Partner sessions (Phase A)

Staff sessions normally live in the web cookie (docs/06 §9). The partner app
cannot use it, so it carries a bearer token with extra rules:

* `POST /auth/partner/login` requires `X-Client: partner`, accepts only `RIDER`
  and `BRAND_EMPLOYEE`, returns the token in the body (no cookie).
* The token carries `client: "partner"` and lasts one staff session
  (`STAFF_SESSION_HOURS`, default 8); the app signs in again afterwards. There is
  no sliding renewal for bearer sessions.
* A token without the partner mark is refused for any non-shopper account, a
  partner-marked token is refused for a shopper, brand owner or super admin, so
  one app's token never works as another's.
* Same checks as every request: user loaded fresh, `isActive`, `passwordVersion`.
* The app keeps the token in secure storage only.

This deliberately relaxes the "staff stay on the web" rule for these two roles.
Brand owners and the super admin remain web-only.

## 7. Delivery code (Phase A)

Proof of delivery (docs/11 §19) is a six-digit code created with the delivery.

* The customer reads it in their app once the order is on its way
  (`GET /deliveries/:id/code`, customer only). It is never part of any delivery
  returned to a brand, rider or admin (`select: false`).
* A rider can mark a delivery **delivered only with the code**
  (`POST /rider/deliveries/:id/complete`). The rider's other status endpoint
  cannot set `DELIVERED`.
* Wrong tries are counted by one atomic update; the code locks after five
  (`429 CODE_LOCKED`). The brand can still complete the delivery from the
  dashboard after speaking to the customer.
* On completion the order becomes `DELIVERED` and a COD payment becomes `PAID`
  with `confirmedBy` = the rider, in one transaction.

## 8. Receipts and payment records (planned, Phase B and E)

**Receipt** (new model, Phase B): receipt number (from the counter model), order,
payment, brand, customer, method, amount, item snapshot, issued time. Created
automatically when a payment becomes `PAID`; never edited. Visibility follows §4:
the customer sees their own, brand staff see their brand's (`payments.view`), the
rider sees none.

**COD cash** (Phase B): the payment records `collectedBy` (rider) and later
`settledAt` / `settledBy` when the records person confirms the rider handed the
cash over.

**Card / online** (Phase E): use the gateway's hosted checkout. CityCart never
sees or stores card numbers; it stores only the transaction reference, provider
and status. The gateway's signed **webhook** is the only thing that marks such a
payment `PAID`, never the app. A Pakistan-available gateway must be chosen and
its sandbox documentation checked before wiring.

## 9. Phases

| Phase | Work |
|---|---|
| A (done) | `RIDER` role and management (API + web Riders page), assignment, partner sign-in, rider endpoints, delivery code |
| B | `Receipt` model, auto-issue, visibility rules, COD collection and settlement |
| C | `partner/` app: sign-in and rider screens (also shows the code field) |
| D | Records screens in the same app |
| E | Card and online payments with webhook |
| F | Push notification on assignment, rider live location (optional packages) |

Phase C also adds the delivery-code display to the shopper app's order page.

## 10. Rules for AI agents

* Do not add a new brand-scoped role without a doc 02 update.
* Never return `deliveryCode` outside the customer endpoint.
* Never let a client choose `brandId` or `riderId` for a rider request.
* Do not store card data. Do not mark an online payment paid from the app.
