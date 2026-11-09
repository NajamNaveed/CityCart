# 25 — One Real-Device Pass for the Three Apps

Written 2026-11-09, after the Staff, Delivery and Shopper audits. This is the
single physical-device session the owner runs once before the Phase 9 security
audit. Jest, lint and `expo export` prove logic and that the bundle builds; they
cannot prove push delivery, the camera against a real Cloudinary account,
foreground location sharing, OpenStreetMap tiles in a release build, OS
permission dialogs, the keyboard, or TalkBack.

Per-app detail lives in each app's file: shopper `19-mobile-app.md` §14, Staff
`20-partner-app.md` §5, Delivery `23-delivery-app.md` §3–5. This file is the
combined order to run them in, plus the one scenario that spans all three apps.

**Status: not run yet.** The table in §8 records the result; nothing here has
been signed off on a phone in this environment.

---

## 1. What you need

### 1.1 Builds

Push needs a real build (Expo Go on Android cannot receive it), and a release
APK is also the only honest way to check tiles, the splash and the launcher
icon. Build each app once:

```bash
cd mobile  && npx eas-cli init && npm run build:android:preview
cd partner && npx eas-cli init && npm run build:android:preview
cd delivery && npx eas-cli init && npm run build:android:preview
```

* `npx eas-cli init` writes `extra.eas.projectId`; without it the app skips push
  (`not_configured`) and says nothing went wrong.
* Add Firebase (FCM) credentials in EAS for Android before the build, or push
  cannot reach the phone. This is an owner task; no code change is needed.
* The `preview` profile pins `EXPO_PUBLIC_API_URL` to the Render API. Point it
  at the seeded environment you intend to test; a local server needs the
  `development` profile or Expo Go. Android release builds refuse plain `http`,
  so a home Wi-Fi address will not work in an APK.
* `eas.json` keeps `development` (dev client, installable APK) if you need
  Metro logs on the phone.

### 1.2 Server

* A **freshly seeded** database: `npm run seed:demo` (never reseed production).
* `PUSH_ENABLED=true` in the server environment (`EXPO_ACCESS_TOKEN` optional).
  Off means no push is sent at all, silently by design.
* `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` set.
  Without them the Delivery app offers cash only, so the proof-photo path cannot
  be tested.
* The API, the customer website and the brand/provider dashboards must point at
  the same environment as the three apps.

### 1.3 Accounts

`seed:demo` prints these again at the end.

| Who | Sign-in | Password |
|---|---|---|
| Super admin | `admin@citycart.local` on `/admin/login` | `Admin@12345` |
| Brand owner (Loom & Co.) | `brand@citycart.local` on `/sell/login` | `Brand@12345` |
| Records keeper (Loom & Co.) | `hira.anwar@citycart.demo` in the **Staff** app | `Demo@12345` |
| Picker (Loom & Co.) | `areeba.saleem@citycart.demo` in the **Staff** app | `Demo@12345` |
| Rider (Loom & Co.) | `shoaib.raza@citycart.demo` in the **Delivery** app | `Demo@12345` |
| Customer | `sana.iqbal@citycart.demo` in the **Shopper** app | `Demo@12345` |
| Service provider (Sana Home Cleaning) | `service@citycart.local` on `/sell/service/login` | `Demo@12345` |

### 1.4 Devices

One Android phone is the minimum. A second, small (≈360 px wide) phone catches
the rows this audit fixed; if you only have one, set the display size to its
smallest value for the layout sections. iOS is deferred until an Apple account
exists.

---

## 2. Every app: six shared checks

Run these once per app. A failure here outranks any per-app item.

| # | Check | Expected |
|---|---|---|
| S1 | Install and first launch | Branded icon and splash; no red screen; the sign-in screen fits with the keyboard open. |
| S2 | Sign-in with the app's own role | Lands on that app's start screen. A customer, brand or rider account used in the wrong app is refused in the app's words, not a raw error. |
| S3 | Airplane mode | The offline row appears under the status bar on every screen without covering a header; requests say the server cannot be reached; turning the network back hides the row and pull-to-refresh recovers without a restart. |
| S4 | Largest system font | Enable the largest font size: no clipped labels, no text escaping a card, rows wrap rather than overlap. Repeat on the smallest display width. |
| S5 | TalkBack on | Tabs, buttons, cards and the list/map toggle announce a name and state; headings read as headings; maps are announced by their screen name. |
| S6 | Reduce Motion on | Sheets and galleries still open, without sliding or zooming. |

**Sign-out:** after S2, sign out and confirm the Account screen returns to
sign-in, badges clear, and — once `PUSH_ENABLED=true` — the phone stops
receiving that account's notifications.

---

## 3. Shopper P0 (`mobile/`)

Full wording is in `19-mobile-app.md` §14 (15 numbered checks). The P0 run:

1. **Home and location** — asks for a city the first time, then shows skeleton
   cards and the block-first store grid. Allow and deny the location prompt:
   both paths end somewhere usable, and refusing does not loop the dialog.
2. **Store and product** — a store page opens (banner, hours, contact) and "Chat
   with seller" sends a visitor through sign-in and back to the same product.
3. **Nearby map** — OpenStreetMap tiles render in the APK (not grey), pins and
   blocks draw, **All → Mine → Off** works on both layer rows, the city chip
   frames the city, **Recenter** re-fits, and a pin opens its store.
4. **Cart and checkout** — a multi-brand cart splits into one order per brand;
   an out-of-area line offers Remove/Change area; the delivery pin is checked
   against the block outlines; cash is the only payment.
5. **Orders** — progress steps, the delivery code while out for delivery, the
   receipt once paid, and the rider "last seen" card while the rider shares.
6. **Bookings** — request, proposal accept/decline, completion, dispute and
   review; chat inside the booking; a provider with no services explains that
   instead of showing a form.
7. **Chat** — the Stores / Service providers / All filters switch collections;
   a message from the dashboard arrives live in an open thread; unread badges
   settle after backgrounding.
8. **Notifications** — an order push and a booking push arrive with the app
   **closed**; tapping each opens the matching screen, not the home tab.
9. **Help and release** — the brand wordmark and support details match the admin
   settings; the mail and dial buttons open the right app; the launcher icon and
   splash are the branded set.

---

## 4. Staff P0 (`partner/`)

**Records keeper** (`hira.anwar@citycart.demo`):

1. **Overview** — To pick up, On the road, Failed and Delivered counts load, and
   cash still with riders matches the seeded demo.
2. **Orders and deliveries** — filters work, an order's proposal history is
   read-only, and a delivery can be reassigned to the seeded rider (needs
   `delivery.manage` + `riders.view`).
3. **Money** — a receipt opens; **To verify** loads a door-payment photo through
   the signed link (open it twice: the second after ~5 minutes should offer
   "Show photo again"); Verify asks for confirmation; Reject demands a reason;
   a read-only person sees no decision buttons.
4. **Cash hand-over** — tick the rider's payments, confirm, and see them leave
   the outstanding list. Try a stale list to see the `CASH_CHANGED` message.
5. **Returns** — the returned-goods inbox lists the seeded return; **Mark
   received** with per-line restock or write-off.
6. **Push** — a new order push, a proof-to-verify push and a return push each
   open their own screen with the keeper's permissions, and the order fallback
   otherwise.

**Picker** (`areeba.saleem@citycart.demo`):

7. **Pick flow** — the queue opens, claim is one action, each line marks Picked
   / Short (with units) / Unavailable, product photos render, and a proposal
   with a substitute can be sent and later shows the customer's answer after
   "Check again". Packing asks "Yes, packed" and returns to the queue.

**Multi-brand employee:** if you have an employee who belongs to two brands,
sign-in offers the workspace chooser and the app reopens in the chosen brand
after a restart.

---

## 5. Delivery P0 (`delivery/`)

1. **Deliveries** — the assigned delivery appears (least-busy rider
   assignment), filters work, pull-to-refresh keeps the previous rows while
   re-reading.
2. **One delivery** — **Open in map** draws the customer's checkout pin in the
   in-screen map and the page still scrolls; **Navigate** hands the same point
   to the phone's maps app.
3. **Six-digit code** — a wrong code is refused in plain words; the right one
   continues.
4. **Cash** — completes the delivery at once and lands in the cash tab.
5. **Camera and proof** — choose Bank transfer / Wallet / Card machine:
   * the camera opens camera-only (no library), the reference is required, and
     the warning "photograph the confirmation or the slip, never the card"
     shows;
   * with the phone in airplane mode, submitting fails, the photo stays on
     screen, and **Upload photo** retries without reopening the camera;
   * with the network back, the upload reaches Cloudinary, the screen says
     **Payment waiting for verification**, the delivery stays out for delivery,
     and the code is not asked again.
6. **Rejection round trip** — the brand rejects the proof on the web; the rider
   gets a push that opens the same delivery with the payment step open again.
7. **Door returns** — count kept/refused with − / +, a refused line demands a
   reason, the optional photo uploads, and completion collects only for what
   was kept (or refunds when everything comes back). The delivery cannot
   complete while a photo is uploading.
8. **Location sharing** — off by default; turn it on in Account, go out for
   delivery, and see the last-seen point on the shopper's order and the Staff
   app's delivery page. Turn it off and the point disappears; sign-out turns
   it off.
9. **Push** — assignment and refused-payment pushes open their delivery.

---

## 6. The golden path (all three apps + two dashboards)

This is the run that exercises the seams the unit tests mock: real push, real
camera, real signed URLs, real tiles. Do it once, in this order, on a seeded
database.

1. **Shopper** orders from Loom & Co. inside the block (two brands in the cart
   if you want the split), pays cash at the door, and remembers the order
   number.
2. **Brand owner on the web** confirms the order. The **picker** claims it in
   the Staff app, marks the lines, packs it — the delivery is created and the
   seeded rider is assigned.
3. **Rider** opens the new delivery (push), turns on location sharing, and marks
   it out for delivery.
4. **Shopper** opens the order: progress shows out for delivery, the delivery
   code is visible, and the rider's "last seen" card updates as the rider moves
   (within a few minutes).
5. **Rider** completes with the code, chooses **Bank transfer**, photographs a
   receipt, adds a reference and submits. The screen says the payment is waiting
   for verification.
6. **Records keeper** gets the proof push, opens **To verify**, sees the photo,
   and **Verify** — the delivery completes and a receipt is issued.
7. **Shopper** reopens the order: paid, with the receipt showing how it was paid
   and no photo, reference or check state. **Brand owner** sees the same on the
   web.
8. **Return variant** — repeat once where the customer refuses a line: the rider
   records the refusal, the keeper takes the goods in, and the shopper's order
   shows the returned amount.
9. **Booking path** — the shopper requests a service, the provider proposals on
   the web, the shopper accepts, the provider completes, the shopper reviews;
   both chat directions arrive live.
10. **Offline at the door** — with the rider in airplane mode at step 5, confirm
    the failure is explained and recoverable, then finish the step.

---

## 7. Reading a failure

Record the app, the screen, the exact step, the phone model and Android
version, and a screenshot. Include whether the state came from the seeded demo
or from a fresh action. Server errors can be matched against the server log at
the same minute; the app's error text is written to be quotable.

A crash or a wrong-screen push jump is P0. A clipped label at the largest font
is P1. A cosmetic spacing difference is P2 and can wait.

---

## 8. Results

| Area | Checks | Result | Notes |
|---|---|---|---|
| Shopper | S1–S6, §3 | not run | |
| Staff | S1–S6, §4 | not run | |
| Delivery | S1–S6, §5 | not run | |
| Golden path | §6 | not run | |

---

## 9. What this pass still cannot cover

* **Background location and a live moving map** — not built; sharing is
  foreground-only and keeps one point (`23-delivery-app.md` §5).
* **iOS push** — needs an Apple developer account and APNs credentials.
* **Load, abuse and rate-limit behaviour** — Phase 9 (docs/24 §9).
* **Real money** — checkout is COD only by design; nothing here moves money
  through a gateway.
