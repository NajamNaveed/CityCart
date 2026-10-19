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
   ├─ app.json  package.json  .env (the API address; see .env.example)
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
   │  ├─ services/       api.js (axios + bearer token), storage.js, session.js, config.js
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
| @react-native-async-storage/async-storage | non-secret choices: city, block, range |
| expo-location | the shopper's position for Nearby |
| expo-font, @expo-google-fonts/poppins, @expo-google-fonts/fraunces | the brand fonts, importing only the five weights used |
| @expo/vector-icons | tab and button icons (Feather, the family Lucide came from) |
| react-native-maps | the Nearby map (Android release builds need a Google Maps key) |

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Server: bearer-token login for shoppers, tests, docs | done |
| 1 | App foundation: Expo project, theme, API client, token storage, session rules, tab shell | done |
| 2 | Login and register: forms with instant checks, safe return-to-where-you-were, account tab | done |
| 3 | Browse: home, shop (search, sort, brand filter, endless scroll), brands, product page with photos and reviews | done |
| 4 | Nearby: location permission, block detection, area picker, range, results, map | done |
| 5 | Cart, checkout (cash on delivery), order confirmation, orders and tracking | done |
| 6 | Chat and notifications, unread badges | |
| 7 | Polish and release: states, offline handling, icon/splash, Android build, device tests | |
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
* **Brands** (`brands`) and **Product** (`product/[id]`): the product page has swipeable photos with a full-screen view, price and discount, stock, details, and the reviews summary with the reviews five at a time.
* **City**: remembered on the phone (`context/CityProvider.jsx`); a remembered city that no longer exists falls back to "all cities".
* **Opening the Shop from elsewhere** uses `shopHref()` (`utils/nav.js`), which stamps each request, because the Shop stays alive in the tab bar and would otherwise ignore asking for the same brand twice.
* Photos hosted on Cloudinary are requested at the phone's real pixel width (same rule as the web); any other address is used as given. A missing or broken photo shows a monogram tile.
* Add to cart is not on the product page yet (Phase 5), and "Chat with seller" arrives with Phase 6.

Tests: the paging rules, query building and helpers are unit tested, and `__tests__/screens.test.js` renders the real screens against a fake API (what is shown, loading and error states, and the Shop navigation rule).

## 9. Nearby (Phase 4)

The same feature as the web app's Nearby page, on the same public endpoints
(`GET /blocks`, `GET /blocks/resolve`, `GET /discover`).

* **Finding the shopper.** The first time the Nearby tab opens, the app asks for the
  phone's position once (the system permission prompt appears then, not at launch). It
  uses a recent known position when there is one (instant), otherwise waits up to 12
  seconds for a fresh one. The server turns the position into a block and city.
  Refusal, location switched off, a timeout and "outside every city we serve" each get
  their own plain message, and a permission blocked for good offers **Open Settings**.
  Choosing an area by hand never asks for the position.
* **Privacy.** The position is rounded to about 11 metres and saved only on the phone
  (`prefs`, not secure storage: it is not a credential). The server receives it only as
  query parameters of the one search it answers; request logs drop query strings
  (docs/06).
* **Range.** This block, 2, 5, 10, 20 km, the whole city, or any custom distance from 0.5
  to 50 km. A range that needs an area the shopper has not given falls back to the whole
  city and says so. An empty result offers the next wider range.
* **Results** are brands with their nearest distance, branches (Directions and Call),
  and a few products, with "Only at ..." where a product is sold at some branches only.
  They load ten brands at a time.
* **Map.** `react-native-maps`: pins per branch, a marker at the search centre, and a
  circle for a radius search. It uses the phone's own map: Apple Maps on iPhone (no
  setup), Google Maps on Android. It works in Expo Go. **Android release builds need a
  Google Maps API key**: set the `GOOGLE_MAPS_API_KEY` environment variable when building
  (`app.config.js` passes it to the build), and restrict the key to the app's package name
  in Google Cloud. Without a key the Android map is blank but everything else, including
  Directions (which opens the maps app), works.
* The area is kept in `context/NearbyProvider.jsx` and the rules (query building, saved
  value checks, "find me" outcomes) in `services/nearby.js` and `services/location.js`,
  both unit tested; the screen is covered by `__tests__/nearby-screen.test.js`.

## 10. Cart, checkout and orders (Phase 5)

All on the existing customer endpoints (`/cart`, `/orders`); no server changes.

* **Cart** (tab, with the item count as a badge): the cart is the server's, grouped by brand; every change (quantity, remove) is answered with the fresh cart, which is what is shown. It re-reads when the tab is focused and on pull-down. A line that cannot be ordered (out of stock, unavailable) is marked and blocks checkout. Quantities are 1 to 99 per line; the product page adds 1 to 10 at once.
* **Add to cart** is a bar at the bottom of the product page. A visitor who is not signed in is sent to sign in with `?next=/product/<id>?add=<qty>` and, once back, the page adds that quantity once and clears the parameter.
* **Checkout:** address, delivery notes (required, 1 to 200 words, as on the web) and cash on delivery. The checks in `services/orders.js` were compared with the server's own validator on 43 cases (boundaries, phone formats, word limits) with no differences. The app sends only the address and payment method; **the server reads the cart and computes every price and total itself**. The place-order button is blocked from a second tap, and a failed order is retried without losing the form. A cart with several brands becomes one order per brand (the confirmation says so).
* **Confirmation** shows what was just placed from memory only (`rememberPlacedOrders`), not from the navigation address, and goes to the orders list if opened with nothing placed.
* **Orders:** the list loads ten at a time; the detail shows a six-step progress view (or why an order was cancelled/rejected), items, totals, the delivery address, courier tracking when there is one, and cancelling while the order is still pending (with a confirmation).
* **Not in this phase:** writing reviews after delivery (reviews are shown on product pages since Phase 3), and live order updates (pull down to refresh; live updates arrive with Phase 6's notifications).
* Every screen that needs an account (`RequireCustomer`) shows a sign-in prompt that brings the shopper back to where they were.

## 11. Development

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

## 12. Known limits

* A bearer token cannot be revoked individually; it ends at expiry, on account
  deactivation, or when the password version changes. A lost phone is
  therefore covered by deactivating the account or changing the password.
* No refresh tokens or push notifications in the first version.
