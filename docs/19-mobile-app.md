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
   ├─ app/          screens; each file is a route (Expo Router)
   │  ├─ _layout.jsx        fonts and providers
   │  ├─ (auth)/            login, register
   │  ├─ (tabs)/            index (home), shop, nearby, cart, account
   │  ├─ product/[id].jsx
   │  ├─ checkout.jsx  order-placed.jsx
   │  ├─ orders/            index, [id]
   │  ├─ chat/              index, [id]
   │  └─ notifications.jsx
   ├─ src/
   │  ├─ components/  context/  hooks/
   │  ├─ services/    api.js (axios + bearer token), socket.js, storage.js
   │  ├─ utils/       geo, range, chat, formatting (ported from client/src/utils)
   │  └─ theme.js     colours and the Poppins font
   └─ assets/
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
| axios | same HTTP client and interceptors as the web app |
| socket.io-client | live chat and notifications |
| expo-secure-store | the login token (Keychain / Keystore) |
| @react-native-async-storage/async-storage | non-secret choices: city, block, range |
| expo-location | the shopper's position for Nearby |
| expo-font, @expo-google-fonts/poppins | the brand font |
| react-native-maps | the Nearby map (Android release builds need a Google Maps key) |

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Server: bearer-token login for shoppers, tests, docs | done |
| 1 | App foundation: Expo project, theme, API client, navigation shell | |
| 2 | Login and register | |
| 3 | Browse: home, shop (search, filters, endless scroll), brands, product and reviews | |
| 4 | Nearby: location permission, block detection, area picker, range, results, map | |
| 5 | Cart, checkout (cash on delivery), order confirmation, orders and tracking | |
| 6 | Chat and notifications, unread badges | |
| 7 | Polish and release: states, offline handling, icon/splash, Android build, device tests | |
| later | Push notifications when the app is closed (needs a server device-token model); seller inbox | |

Each phase ends with the server tests, lint and a successful app bundle.

## 7. Known limits

* A bearer token cannot be revoked individually; it ends at expiry, on account
  deactivation, or when the password version changes. A lost phone is
  therefore covered by deactivating the account or changing the password.
* No refresh tokens or push notifications in the first version.
