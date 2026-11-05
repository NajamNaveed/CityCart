# 19 — Mobile Application (shopper app)

## 1. Purpose

A React Native (Expo) app for **shoppers** on the same `/api/v1` backend as the
web app. Sellers and platform admins stay on the web dashboards: branches,
blocks, CSV import, inventory and analytics are desktop-shaped work, and
their sessions are deliberately short-lived and tab-bound (docs/06 §9).
A seller inbox for chat on mobile is a possible later addition.

## 2. Repository layout

```text
CityCart/
├─ docs/       this folder
├─ server/     the API (unchanged apart from the native-session support below)
├─ client/     the web app (unchanged)
└─ mobile/     the Expo app (plain JavaScript, like the web app)
   ├─ app.json  eas.json  package.json  .env (the API address; see .env.example)
   ├─ src/
   │  ├─ app/          screens; each file is a route (Expo Router, SDK 57 puts routes in src/app)
   │  │  ├─ _layout.jsx        fonts, providers, splash screen
   │  │  ├─ (auth)/            login, register                     (Phase 2)
   │  │  ├─ (tabs)/            index (home), shop, nearby, cart, account
   │  │  ├─ product/[id].jsx                                        (Phase 3)
   │  │  ├─ checkout.jsx  order-placed.jsx                          (Phase 5)
   │  │  ├─ orders/            index, [id]                          (Phase 5)
   │  │  ├─ chat/              index, [id]                          (Phase 6)
   │  │  └─ notifications.jsx                                       (Phase 6)
   │  ├─ components/ui/  AppText, Screen, Button, Card, Spinner, EmptyState
   │  ├─ context/        AuthProvider (more providers arrive with their screens)
   │  ├─ hooks/
   │  ├─ services/       api.js (axios + bearer token), storage.js, session.js, config.js, socket.js (the live connection, Phase 6)
   │  ├─ utils/          formatting now; geo, range, chat later (ported from client/src/utils)
   │  └─ theme.js        the web app's colours, Poppins and Fraunces
   ├─ __tests__/         unit tests (jest-expo)
   └─ assets/            icon, splash
```

Every mobile screen mirrors a web customer page. Context providers, hooks and
utilities are ported from `client/src`; screens are rewritten with native
components. The map (web: Leaflet) is replaced by a native map component.

## 3. Authentication

Native sessions use a bearer token instead of the cookie. The complete rules
are in docs/06 ("Native App Sessions") and docs/05 ("Native app clients"):
token returned only for `X-Client: mobile`, sent as `Authorization: Bearer`,
shoppers only, identical server-side checks, socket handshake token in the
`auth` payload. The token lives in the device's secure storage (Expo
SecureStore) and lasts as long as the web session (`JWT_EXPIRES_IN`, 7 days).
There is no refresh token in the first version: the user signs in again when
it expires.

## 4. API address

The app calls the deployed API directly (an environment value,
`EXPO_PUBLIC_API_URL`, pointing at the Render URL). The Vercel `/api` proxy
used by the web app is not involved. Requests from a native app carry no
`Origin` header, which `config/cors.js` already accepts.

## 5. Dependencies

Installed once, inside `mobile/`, each with a stated reason:

| Package | Reason |
|---|---|
| react-native-gesture-handler, react-native-reanimated, react-native-worklets, react-dom | required by Expo Router; pinned to the versions SDK 57 expects (npm otherwise picks newer, incompatible ones) |
| axios | same HTTP client and interceptors as the web app |
| socket.io-client | live chat and notifications |
| expo-secure-store | the login token (Keychain / Keystore) |
| @react-native-async-storage/async-storage | non-secret choices: city, shopping area (blocks, pin, range) |
| expo-location | the shopper's position for Nearby |
| expo-font, @expo-google-fonts/poppins, @expo-google-fonts/fraunces | the brand fonts, importing only the five weights used |
| @expo/vector-icons | tab and button icons (Feather, the family Lucide came from) |
| react-native-webview | the Nearby map, which draws OpenStreetMap tiles inside the app (no Google Maps key, no native map SDK) |

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Server: bearer-token login for shoppers, tests, docs | done |
| 1 | App foundation: Expo project, theme, API client, token storage, session rules, tab shell | done |
| 2 | Login and register: forms with instant checks, safe return-to-where-you-were, account tab | done |
| 3 | Browse: home, shop (search, sort, brand filter, endless scroll), brands, product page with photos and reviews | done |
| 4 | Nearby: location permission, shopping area (overlaps, border, dropped pin), range, results and products, map with block outlines | done |
| 5 | Cart (with the area delivery warning), checkout with saved addresses and a delivery pin, order confirmation, orders and tracking; saved-address book | done |
| 6 | Chat and notifications, unread badges | done |
| 7 | Polish and release: states, offline handling, icon/splash, Android build, device tests | done |
| later | Push notifications when the app is closed (needs a server device-token model); seller inbox | |

Each phase ends with the server tests, lint and a successful app bundle.

## 7. Sign-in screens (Phase 2)

* `login` and `register` live in `src/app/(auth)/` and open over the tabs. Browsing
  needs no account; the Account tab (and later the cart, checkout and chat) send a
  shopper to sign in and bring them back with `?next=`.
* The checks in `src/utils/validation.js` mirror the server's rules (name required,
  valid email, password of at least 8 characters). They give instant feedback only;
  the server validates everything again and its messages are shown inline.
* `?next=` is accepted only when it is a path inside the app (`src/utils/nav.js`):
  never another site, a custom scheme, or the sign-in screens themselves.
* Signing in flips the auth state; the screen's single `<Redirect>` then moves the
  shopper on, so there is no separate "navigate after login" code to get out of sync.
* Fields set `autoComplete` / `textContentType` so the phone's password manager works,
  passwords are masked with a show/hide toggle, and nothing secret is logged or stored
  beyond the token in secure storage.

## 8. Browsing (Phase 3)

Everything here uses the public API, so no sign-in is needed.

* **Home** (`(tabs)/index`): brands strip and the newest products, both for the chosen city; pull down to refresh.
* **Shop** (`(tabs)/shop`): search (sent to the server after 400 ms of no typing), sort, brand filter, endless scroll in pages of 12. Star ratings are requested only for products not yet seen. A newer search always wins: an answer for an old search is discarded (`services/paging.js`).
* **Brands** (`brands`) and **Product** (`product/[id]`): the product page has swipeable photos with a full-screen view, price and discount, stock, details, and the reviews summary with the reviews five at a time. A catalogue product also shows **"Also sold by"** (the other stores in the shopper's area) above the reviews.
* **City**: remembered on the phone (`context/CityProvider.jsx`); a remembered city that no longer exists falls back to "all cities".
* **Opening the Shop from elsewhere** uses `shopHref()` (`utils/nav.js`), which stamps each request, because the Shop stays alive in the tab bar and would otherwise ignore asking for the same brand twice.
* Photos hosted on Cloudinary are requested at the phone's real pixel width (same rule as the web); any other address is used as given. A missing or broken photo shows a monogram tile.
* Add to cart arrived with Phase 5, and "Chat with seller" with Phase 6.

Tests: the paging rules, query building and helpers are unit tested, and `__tests__/screens.test.js` renders the real screens against a fake API (what is shown, loading and error states, and the Shop navigation rule).

## 9. Nearby and the shopping area (Phases 4 and v2 Phase 3)

The same area model as the web app, on the same public endpoints
(`GET /blocks`, `GET /blocks/at`, `GET /discover?scope=area`, `GET /catalog/browse`).

* **Finding the shopper.** The first time the Nearby tab opens, the app asks for the
  phone's position once (the system permission prompt appears then, not at launch). It
  uses a recent known position when there is one (instant), otherwise waits up to 12
  seconds for a fresh one. The server turns the position into the blocks that hold it
  (`/blocks/at`) and the app saves those `blockIds`. Refusal, location switched off, a
  timeout and "outside every city we serve" each get their own plain message, and a
  permission blocked for good offers **Open Settings**. Choosing an area by hand never
  asks for the position.
* **Overlaps and borders.** A spot inside two drawn blocks starts with **both** ticked and
  the shopper may untick one (`This spot is in 2 blocks`). A spot between blocks shows the
  nearest ones to choose from. A radius search measures from the shopper's position but
  only inside the selected blocks.
* **Dropped pin.** Tapping the map in the location sheet sends the point to `/blocks/at`
  and switches the area to the blocks holding it (`pinned` is remembered on the phone).
  This is how a shopper in Samanabad can shop in D Ground without moving his position.
* **Privacy.** The position is rounded to about 11 metres and saved only on the phone
  (`prefs`, not secure storage: it is not a credential). The server receives it only as
  query parameters of the one search it answers; request logs drop query strings
  (docs/06).
* **Range.** This block, 2, 5, 10, 20 km, the whole city, or any custom distance from 0.5
  to 50 km. A range that needs an area the shopper has not given falls back to the whole
  city and says so. An empty result offers the next wider range.
* **Results** are brands with their nearest distance, branches (Directions and Call),
  and a few products, with "Only at ..." where a product is sold at some branches only.
  They load ten brands at a time. The **Products** view groups the catalogue: one card per
  real product with the lowest price, the number of stores, and a list of those stores in
  the area; a tap opens that store's listing.
* **Map.** A `react-native-webview` showing a self-contained OpenStreetMap viewer
  (`src/components/map/`): pins per branch, the delivery/shopping pin, a circle for a
  radius search, and a highlighted outline for every selected block. Tiles come from
  `tile.openstreetmap.org` with visible attribution, so there is no Google Maps key,
  no native map SDK and no platform-specific setup; it behaves the same in Expo Go
  and in release builds. Tiles, blocks and pins are laid out once in world pixels, so
  a drag only moves that one GPU layer (a quick flick glides on and settles) and
  never rebuilds the page mid-gesture; a pinch scales the layer continuously and snaps
  to a whole zoom when the fingers lift; and a zoom step stretches the tiles already
  on screen underneath the new level until it loads, so the map never flashes blank.
  That keeps it as smooth as the Leaflet map on the website on low-end phones. The
  +/− buttons zoom, and the pins/dot use the same shapes as the website map. A tap
  places a pin (used by the location sheet, checkout and saved addresses) and a pin's
  popup opens that brand. Directions still opens the phone's own maps app with
  `mapsUrl`. The map only needs a data connection for its tiles; when they cannot
  load the viewer shows a short "could not load" message.
* **"Also sold by"** on the product page is **area-only**: it lists the other stores in
  the shopper's area that sell the same catalogue product. Without an area it asks for
  one; when nobody in the area sells it, it says so (a 404 from the server is that
  answer, not an error).
* The area is kept in `context/NearbyProvider.jsx` and the rules (query building, saved
  value checks, "find me" outcomes) in `services/nearby.js` and `services/location.js`,
  both unit tested; the screen is covered by `__tests__/nearby-screen.test.js` and the
  offers list by `__tests__/also-sold-by.test.js`.

## 10. Cart, checkout, addresses and orders (Phases 5 and v2 Phase 3)

All on the existing customer endpoints (`/cart`, `/addresses`, `/orders`).

* **Cart** (tab, with the item count as a badge): the cart is the server's, grouped by brand; every change (quantity, remove) is answered with the fresh cart, which is what is shown. It re-reads when the tab is focused and on pull-down. A line that cannot be ordered (out of stock, unavailable) is marked and blocks checkout. Quantities are 1 to 99 per line; the product page adds 1 to 10 at once. When the chosen area's stores cannot deliver a line, `POST /cart/area-check` produces a warning naming the items, with **Remove it** and **Change area**.
* **Add to cart** is a bar at the bottom of the product page. A visitor who is not signed in is sent to sign in with `?next=/product/<id>?add=<qty>` and, once back, the page adds that quantity once and clears the parameter.
* **Checkout:** the delivery address and a **delivery pin on the map**, delivery notes (required, 1 to 200 words, as on the web) and cash on delivery. Saved addresses are listed first (the default is preselected); "Deliver to a new address" shows the form, the map and "Save this address for next time" (on by default, with a name). A saved address sends its `addressId` and the order keeps its own snapshot; a new one sends `deliveryLocation` and optionally `saveAddress:{ label }`. The pin is checked with `/blocks/at`, and the order is refused locally outside a block; the server checks the same rules again (`OUTSIDE_DELIVERY_ZONE`, `ADDRESS_NOT_FOUND`, per-brand `NOT_DELIVERABLE`). The checks in `services/orders.js` were compared with the server's own validator on 43 cases (boundaries, phone formats, word limits) with no differences. **The server reads the cart and computes every price and total itself.** The place-order button is blocked from a second tap, and a failed order is retried without losing the form. A cart with several brands becomes one order per brand (the confirmation says so).
* **Saved addresses** (`addresses/index` and `addresses/[id]`, from the Account tab): add, edit, delete (with a confirmation) and make default; the server caps a customer at 10 and refuses a pin outside every active block. An address whose block was removed shows "We no longer deliver to this spot." The new/edit form starts on the shopper's area pin (or the saved address's pin) and moves it by tapping the map.
* **Confirmation** shows what was just placed from memory only (`rememberPlacedOrders`), not from the navigation address, and goes to the orders list if opened with nothing placed.
* **Orders:** the list loads ten at a time; the detail shows a six-step progress view (or why an order was cancelled/rejected), items, totals, the delivery address, courier tracking when there is one, and cancelling while the order is still pending (with a confirmation). **After delivery the detail shows what happened at the door** (v2 Phase 6): `order.fulfilment` says whether everything arrived (`FULL`), part of it (`PARTIAL`) or nothing (`NONE`), a notice explains it in words, refused lines are listed with their reasons, and the totals show “Returned goods” as a deduction with the **Final total** (`netTotal`) in place of the original total. The list also shows the final total. A `RETURNED` order is shown as such instead of “Delivered”. The detail is served by the existing `GET /orders/:id` (docs/05 §22f), so no app-side price is calculated.
* **Your rider on the map:** while the delivery is `OUT_FOR_DELIVERY`, the detail shows an internal OpenStreetMap view with the checkout pin and, when the rider shares their location, a rider dot that moves as new positions arrive. The screen polls the existing `GET /deliveries/:id/rider-location` about every 15 seconds while focused (`hooks/useRiderLocation.js`), keeps the last dot through a failed refresh, and says plainly when the rider is not sharing. The rider may have other stops, so the wording says so. The rider's account is never shown. **While a non-cash payment is being checked** the delivery stays out for delivery and the detail adds a short "your payment is being checked" note (`delivery.paymentPending`); after a refusal the note disappears and the rider collects again.
* **Not in this phase:** writing reviews after delivery (reviews are shown on product pages since Phase 3), and live order updates (pull down to refresh; live updates arrive with Phase 6's notifications).
* Every screen that needs an account (`RequireCustomer`) shows a sign-in prompt that brings the shopper back to where they were.

## 11. Chat and notifications (Phase 6)

The customer side of the web app's chat and notifications, on the same
endpoints and the same one socket (`/api/v1/chats`, `/api/v1/notifications`,
docs/12); no server changes. The socket is the connection the server designed
for this app: the login token in the handshake `auth` payload, accepted for
customers only, push-only — every write still goes through REST where
permissions are checked.

* **Live wiring.** `NotificationProvider` owns the single connection
  (`services/socket.js`): it exists while a customer is signed in, closes on
  sign-out, and re-reads the badge on connect and whenever the app returns to
  the foreground (`AppState`), so a missed push heals itself. `chat:message`
  pushes fan out to chat screens through `subscribeChat`.
* **Badges.** The Account tab shows Messages and Notifications rows with the
  unread counts (capped at "9+"). Counts always come from the server: a push
  only triggers a re-read, and `ChatProvider` debounces a burst of pushes into
  one (300 ms), like the web app.
* **Messages** (`chat/index`): the conversation list (twenty at a time, pull
  down to refresh) with the last message, its time and an unread pill per row.
  It re-reads on focus and when a push or reconnect arrives.
* **Thread** (`chat/[id]`): messages bubble WhatsApp-style with day dividers,
  older pages load with the server's `before` cursor, and a message received
  while the thread is open is shown and marked read at once. The composer
  allows 1,000 characters (counter past 200 left), blocks a second send while
  one is in flight, and reports the server's answer on failure with the draft
  kept. A seller that is not taking messages (`canSend`) closes the composer;
  the server enforces it for real either way. A brand-new conversation opens
  from memory the moment the first message starts it.
* **Starting from a product** ("Chat with seller" on the product page):
  `/chat?product=<id>` asks the server for the product's chat context; an
  existing thread with that brand opens straight away, otherwise the first
  message starts one. A visitor is sent to sign in with
  `?next=/chat?product=<id>` and returns to the same place.
* **Notifications** (`notifications`): the inbox loads twenty at a time with
  All / Unread filters (unread is counted from what is loaded), tap reads the
  notification and follows it to the order when it has one, and rows can be
  deleted or all marked read. Reads, deletes and mark-all keep the badge in
  step immediately, then the next fetch confirms it.

Tests: `chat.test.js` (requests, cursor, live-connection rules, time stamps),
`live.test.js` (socket lifecycle, badge honesty, fan-out and the debounced
re-read), `chat-screens.test.js` and `notifications-screen.test.js` (the
screens against a fake server).

## 12. Polish and release (Phase 7)

* **States.** Loading, empty and error states were built screen by screen in
  Phases 2–6 (skeletons while loading, an explanation with "Try again" on
  failure, pull-to-refresh or re-read on focus everywhere a list lives). This
  phase audited all fifteen screens against that checklist and found no gaps.
* **Offline.** `@react-native-community/netinfo` (installed with
  `npx expo install`, so it matches the SDK). `OfflineBanner` sits in the root
  layout and overlays every screen only while the OS reports the device as
  disconnected; the unknown state at launch is treated as online so it never
  flashes. It reads `isConnected` only — `isInternetReachable` needs a probe
  request and is unreliable on some networks — so a connected-but-broken
  network still surfaces as the per-screen "Cannot reach the server" errors,
  and the live socket backs off on its own until the connection returns.
* **Icon and splash.** The branded set (the clay "C" on clay and cream, plus
  the adaptive-icon foreground, background and monochrome layers) was already
  generated earlier and is wired in `app.json`; verified present, on-palette,
  and referenced by the splash-screen and adaptive-icon config.
* **Android build.** `eas.json` defines `development` and `preview` profiles
  that produce installable APKs for internal testing, and `production`, which
  auto-increments the version code on EAS (`appVersionSource: "remote"`).
  Building needs an Expo account and the EAS CLI as a global tool:
  ```bash
  npm i -g eas-cli && eas login
  npm run build:android            # production (AAB, for Play)
  npm run build:android:preview    # APK to install directly on a phone
  ```
  No maps key is needed for any profile: the map is OpenStreetMap inside a
  WebView, so release builds show it with no extra configuration.

### Device-test checklist

Automated tests cover logic against a fake server; these checks need a real
phone (Expo Go while developing, a preview APK for release behaviour):

1. **Launch and sign-in** — branded splash, home loads, register and login
   work, `?next=` returns to where the shopper was, sign-out clears the badges.
2. **Browse** — home skeletons then content, shop search/sort/filter and
   endless scroll, product photos and reviews, "Chat with seller" asks a
   visitor to sign in and returns to the same product.
3. **Nearby and the area** — the location-permission wording appears, blocks load
   with their outlines, the map shows pins and pans to results (OpenStreetMap tiles
   render in the release build), a pin's popup opens its brand, Directions opens the
   maps app. Then: an overlap starts with both blocks ticked, a border point offers the
   nearest blocks, a dropped pin switches the area, the Products view groups a catalogue
   item across stores, and a product page's "Also sold by" lists the area's other stores.
4. **Cart and checkout** — quantities, remove, an out-of-stock line blocks
   checkout, a cart line the area's stores cannot deliver shows the warning with
   Remove/Change area, the delivery pin is checked against the block outlines, "Save this
   address" is on by default, a multi-brand cart splits into one order per brand on the
   confirmation, a pending order can be cancelled.
5. **Saved addresses** — Account → Saved addresses: add one by tapping the map, edit it,
   make another default, delete one after confirming; a pin outside every block is
   refused with a message; at checkout the default is preselected and its pin is reused.
6. **Orders** — progress steps, pull-to-refresh, tracking link when the brand
   adds one.
7. **Chat** — start from a product page, send and receive with the seller on
   the web dashboard, unread pill on the conversation and the Account tab,
   receiving while the thread is open shows the message at once, badges settle
   after backgrounding and returning.
8. **Notifications** — an order update arrives live, the badge increments,
   tap follows to the order, mark-all-read and delete keep the badge honest.
9. **Offline** — airplane mode shows the banner on every screen and requests
   fail with "Cannot reach the server"; turning the connection back removes
   the banner and pull-to-refresh recovers without restarting the app.
10. **Release build** — install the preview APK, repeat sign-in, nearby map and
    one order end to end; the launcher icon and splash are the branded set.

## 13. Development

```bash
cd mobile
cp .env.example .env      # set EXPO_PUBLIC_API_URL
npx expo start            # scan the QR code with the Expo Go app
npm run lint
npm test
```

The phone must be able to reach the API: use the deployed (https) address, or
your computer's address on the same Wi-Fi. Plain `http` addresses work while
developing but not in release builds of Android.

## 14. Known limits

* A bearer token cannot be revoked individually; it ends at expiry, on account
  deactivation, or when the password version changes. A lost phone is
  therefore covered by deactivating the account or changing the password.
* No refresh tokens or push notifications in the first version.

## 15. Related: the Staff and Delivery apps

Riders and the people who keep order records use two separate apps that share
this app's stack and API:

* *CityCart Staff* (`partner/`, see `20-partner-app.md`) for pickers and brand
  team members: sign-in `/auth/staff/login`, `X-Client: staff`.
* *CityCart Delivery* (`delivery/`, see `23-delivery-app.md`) for riders:
  sign-in `/auth/delivery/login`, `X-Client: delivery`.

A shopper token never works there, and a staff or delivery token never works
here; the server checks the app mark on every request (docs/06). This app shows
the customer's delivery code (`GET /deliveries/:id/code`) on the order page while
the order is on the road, and the receipt number (`GET /receipts/order/:orderId`)
once it is paid.
