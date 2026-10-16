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
| 3 | Browse: home, shop (search, filters, endless scroll), brands, product and reviews | |
| 4 | Nearby: location permission, block detection, area picker, range, results, map | |
| 5 | Cart, checkout (cash on delivery), order confirmation, orders and tracking | |
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

## 8. Development

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

## 9. Known limits

* A bearer token cannot be revoked individually; it ends at expiry, on account
  deactivation, or when the password version changes. A lost phone is
  therefore covered by deactivating the account or changing the password.
* No refresh tokens or push notifications in the first version.
