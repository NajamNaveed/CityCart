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
   │  │  ├─ (tabs)/            index (home feed), services, nearby, cart, account
   │  │  ├─ store/[id].jsx     a shop's public page                   (Phase 8)
   │  │  ├─ service/[slug]/    index (provider page), book            (Phase 9)
   │  │  ├─ bookings/          index (filtered list), [id] (detail)   (Phase 10)
   │  │  ├─ product/[id].jsx                                        (Phase 3)
   │  │  ├─ checkout.jsx  order-placed.jsx                          (Phase 5)
   │  │  ├─ orders/            index, [id]                          (Phase 5)
   │  │  ├─ chat/              index, [id]                          (Phase 6)
   │  │  ├─ notifications.jsx                                       (Phase 6)
   │  │  └─ help.jsx            help, FAQ and support contact        (Phase 11)
   │  ├─ components/ui/  AppText, Screen, Button, Card, Spinner, EmptyState
   │  ├─ context/        AuthProvider (more providers arrive with their screens)
   │  ├─ hooks/
   │  ├─ services/       api.js (axios + bearer token), storage.js, session.js, config.js, socket.js (the live connection), chats.js, services.js, bookings.js, push.js
   │  ├─ utils/          formatting, geo, range, chat, serviceSlots and notificationTarget (ported from client/src)
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
| expo-notifications | the push token that lets order and booking updates reach the phone while the app is closed (Phase 13) |

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Server: bearer-token login for shoppers, tests, docs | done |
| 1 | App foundation: Expo project, theme, API client, token storage, session rules, tab shell | done |
| 2 | Login and register: forms with instant checks, safe return-to-where-you-were, account tab | done |
| 3 | Browse: home (brands and search), brands, product page with photos and reviews | done |
| 4 | Nearby: location permission, shopping area (overlaps, border, dropped pin), range, results and products, map with block outlines | done |
| 5 | Cart (with the area delivery warning), checkout with saved addresses and a delivery pin, order confirmation, orders and tracking; saved-address book | done |
| 6 | Chat and notifications, unread badges | done |
| 7 | Polish and release: states, offline handling, icon/splash, Android build, device tests | done |
| 8 | Shopper discovery: a city-scoped home feed of stores and a picked shelf, the store page, and store links from every browsing screen | done |
| 9 | Services: providers in the shopper's area, the provider page, a booking request with a map pin, and direct chat with a provider | done |
| 10 | Bookings: the filtered booking list, the detail with every customer action (proposal, completion, dispute, cancel, review), booking chat, merged chat filters and notification deep links | done |
| 11 | Maps and support: a city selector, tri-state Blocks/Stores (and Blocks/Providers) layers and recenter on both maps, provider pins on the services map, and a Help & support screen fed by the public support settings | done |
| 12 | Theme and accessibility: the web's v3 warm palette in `theme.js`, reduced-motion sheets, AA contrast for small text, and larger tap targets | done |
| 13 | Push notifications: the phone registers after sign-in, the server's existing Expo pipeline delivers order and booking updates while the app is closed, and a tap opens the matching screen | done |
| later | Seller inbox on mobile | |

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
* Registration does **not** sign the shopper in. After `POST /auth/register` the
  screen shows "Check your inbox", with a resend button; the account becomes usable
  after the emailed link is opened. Signing in before verifying answers
  `EMAIL_NOT_VERIFIED`, and the login screen offers the same resend button instead
  of a dead end.
* `forgot-password` (in `(auth)/`) takes an email, calls
  `POST /auth/forgot-password` with `portal: "customer"`, and always shows the same
  "check your email" state. The emailed link opens the **web** reset page, where the
  shopper chooses a new password; the app then signs in with the new one.

## 8. Browsing (Phases 3 and 8; `store/[id]` added in Phase 8)

Everything here uses the public API, so no sign-in is needed.

* **Home** (`(tabs)/index`): a city-scoped feed built from `GET /discover?scope=city`.
  A shop needs a city to be listed, so without a remembered city the page first asks
  **"Where are you shopping?"** with one tap per city. Once a city is chosen it shows
  **Stores on your street** — a card per shop with its cover, distance, blocks, branches,
  "Popular here" products and "From" price — then a **Picked from your block** (or
  **Picked from around town**) shelf. Shops with a branch in the shopper's area come
  first, and the shelf takes one product per shop per round, skipping repeated names, so
  no single shop fills it. Pull down to refresh. There is **no Shop tab and no public
  product list**: searching or tapping a shop card opens **Nearby** or the shop's own page,
  where results are scoped to the shopper's area.
* **Store page** (`store/[id]`): the public shop profile from
  `GET /brands/:id/storefront` — banner and logo, description, the categories it sells in,
  its newest products, address, phone, email and opening hours, with **Shop this store**
  and **See everything** opening Nearby searched for that shop. A closed or unknown shop
  (404, or a malformed id answered without a request) reads **"This store is not
  available"**; a network failure offers **Try again**. Every shop entry point — a home
  card, the Stores directory, a Nearby "See all products" and a product page's brand row —
  opens this page.
* **Stores directory** (`brands`): the full list for the chosen city, with a search box
  and an **All cities** option; the heading reads **Stores in {city}** or **All stores**.
* **Nearby** (`(tabs)/nearby`): the area-scoped browsing surface. It has a **Shops** list
  and a **Map** view (see §9), a search box and the area controls.
* **Product** (`product/[id]`): swipeable photos with a full-screen view, price and
  discount, stock, details, and the reviews summary with the reviews five at a time. A
  catalogue product also shows **"Also sold by"** (the other stores in the shopper's area)
  above the reviews; its brand row opens that shop's store page.
* **City**: remembered on the phone (`context/CityProvider.jsx`); a remembered city that
  no longer exists falls back to "all cities", and Home then asks for a city again.
* Photos hosted on Cloudinary are requested at the phone's real pixel width (same rule as the web); any other address is used as given. A missing or broken photo shows a monogram tile.
* Add to cart arrived with Phase 5, and "Chat with seller" with Phase 6.

Tests: the paging rules, query building, the home ordering/shelf rules (`services/home.js`)
and the storefront fetcher are unit tested; `__tests__/screens.test.js`,
`__tests__/home-screen.test.js` and `__tests__/storefront-screen.test.js` render the real
screens against a fake API (what is shown and its loading, empty and error states).

## 9. Nearby and the shopping area (Phases 4, v2 Phase 3 and 11)

The same area model as the web app, on the same public endpoints
(`GET /blocks`, `GET /blocks/at`, `GET /discover?scope=area`).

* **Location controls live in the map view.** The Nearby map owns the area picker; there is no
  separate location pop-up. Its overlay (`components/MapLayers.jsx`, shared with Services) has a
  **city chip**, one button per layer and the screen's actions. Each layer button is tri-state and
  cycles **everything → only mine → hidden** (`utils/layerState.js`), and says what it shows now and
  what a tap will show next in its accessibility label. The chips frame the whole city rather than
  one pin (`hooks/useMapFocus.js` and `boundsOfBlocks`), read that city's blocks with `GET /blocks`,
  and the map draws them with `setFocus(bounds)`; choosing a city swaps the active city and its
  results, never the shopper's saved spot. The city rectangle is **sticky**: later payloads (an
  empty result, a layer toggle, a search centre left over from the previous city) never move the
  camera, so the view cannot jump to another place. **Recenter** returns to that city rectangle
  when one was chosen on the map, otherwise it re-fits whatever the map currently draws.
  Home no longer shows a city chip or a location setter, and the website no longer shows a location
  control in its navbar; the website still asks for the shopper's position automatically on a first
  visit.
* **Finding the shopper.** The first time the Nearby tab opens, the app asks for the
  phone's position once (the system permission prompt appears then, not at launch). It
  uses a recent known position when there is one (instant), otherwise waits up to 12
  seconds for a fresh one. The server turns the position into the blocks that hold it
  (`/blocks/at`) and the app saves those `blockIds`. An explicit **Use my location** /
  **Update my location** button under the search box runs the same detection on demand —
  the separate "choose a location" option under the search was removed. Refusal, location
  switched off, a timeout and "outside every city we serve" each get their own plain
  message, and a permission blocked for good offers **Open Settings**.
* **Overlaps and borders.** A spot inside two drawn blocks starts with **both** ticked and
  the shopper may untick one (`This spot is in 2 blocks`). A spot between blocks shows the
  nearest ones to choose from. A radius search measures from the shopper's position but
  only inside the selected blocks.
* **Choosing on the map.** When no location is set, tapping the map picks the spot. When one is
  already set, the shopper presses **Choose location** first (a tap otherwise leaves the saved
  spot alone). The point goes to `/blocks/at` and switches the area to the blocks holding it
  (`pinned` is remembered on the phone). This is how a shopper in Samanabad can shop in D Ground
  without moving his position.
* **Privacy.** The position is rounded to about 11 metres and saved only on the phone
  (`prefs`, not secure storage: it is not a credential). The server receives it only as
  query parameters of the one search it answers; request logs drop query strings
  (docs/06).
* **Range.** This block, 2, 5, 10, 20 km, the whole city, or any custom distance from 0.5
  to 50 km. A range that needs an area the shopper has not given falls back to the whole
  city and says so. An empty result offers the next wider range.
* **Two views only.** **Shops** lists brands with their nearest distance, branches (Directions
  and Call), and a few products, with "Only at ..." where a product is sold at some branches only.
  They load ten brands at a time. A product opens its product page and **See all products** opens
  the shop's store page. The former **Products** view was removed: the public catalogue listing
  no longer exists, so products are reached through their shop or a product page.
* **Map.** A `react-native-webview` showing a self-contained OpenStreetMap viewer
  (`src/components/map/`): pins per branch (and per service provider), the delivery/shopping pin,
  a circle for a radius search, and a highlighted outline for every selected block. The **All**
  state of a layer is the whole city, not only the loaded list: `hooks/useCityDirectory.js` asks
  `/discover` or `/services/discover` with `scope=city&limit=30` (same search text and category),
  while **Mine** keeps the block-scoped results and **Off** hides the layer. Tiles come from
  `tile.openstreetmap.org` with visible attribution, so there is no Google Maps key,
  no native map SDK and no platform-specific setup; it behaves the same in Expo Go
  and in release builds. Tiles, blocks and pins are laid out once in world pixels, so
  a drag only moves that one GPU layer (a quick flick glides on and settles) and
  never rebuilds the page mid-gesture; a pinch scales the layer continuously and snaps
  to a whole zoom when the fingers lift; and a zoom step stretches the tiles already
  on screen underneath the new level until it loads, so the map never flashes blank.
  That keeps it as smooth as the Leaflet map on the website on low-end phones. The
  +/− buttons zoom, and the pins/dot use the same shapes as the website map. On a
  white page the map gets a hairline frame with a soft lift, white zoom/popup chrome
  and slightly larger pin tap targets. A search centre only frames the map when it
  is all there is to show; a city's blocks and pins otherwise decide the extent. A tap
  chooses the shopper's spot (see above) and a pin's popup opens that shop's store
  page (**See products**) or the provider's page (**View services**). Directions
  still opens the phone's own maps app with `mapsUrl`. The map only needs a data
  connection for its tiles; when they cannot load the viewer shows a short "could not
  load" message.
* **"Also sold by"** on the product page is **area-only**: it lists the other stores in
  the shopper's area that sell the same catalogue product. Without an area it asks for
  one; when nobody in the area sells it, it says so (a 404 from the server is that
  answer, not an error).
* The area is kept in `context/NearbyProvider.jsx` and the rules (query building, saved
  value checks, "find me" outcomes) in `services/nearby.js` and `services/location.js`,
  both unit tested; the screen is covered by `__tests__/nearby-screen.test.js` and the
  offers list by `__tests__/also-sold-by.test.js`. The map helpers are covered by
  `__tests__/layer-state.test.js` (the cycle), `__tests__/city-map.test.js` (the city-wide
  directory and focus, including a late answer from a city that was replaced) and
  `__tests__/geo.test.js` (`boundsOfBlocks`).

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
* **Messages** (`chat/index`): one inbox for store threads and direct provider
  threads, with **All chats / Stores / Service providers** filters. The merged
  view tags each row with its kind and sorts both collections together by last
  message; the store list drives paging, and providers are re-asked only when
  the filter is providers-only (the same rule as the web chat panel). Twenty at
  a time, pull down to refresh, and it re-reads on focus and when a push or
  reconnect arrives.
* **Thread** (`chat/[id]`): messages bubble WhatsApp-style with day dividers,
  older pages load with the server's `before` cursor, and a message received
  while the thread is open is shown and marked read at once. The composer
  allows 1,000 characters (counter past 200 left), blocks a second send while
  one is in flight, and reports the server's answer on failure with the draft
  kept. A seller that is not taking messages (`canSend`) closes the composer;
  the server enforces it for real either way. A brand-new conversation opens
  from memory the moment the first message starts it. The same screen carries
  the direct provider thread (`kind=provider`) and the booking thread
  (`kind=booking`): the booking thread is keyed by the booking id, takes live
  `SERVICE_BOOKING` events addressed by `bookingId` (its server-side
  conversation id is not the route id), and stays closed until the provider
  accepts.
* **Starting from a product** ("Chat with seller" on the product page):
  `/chat?product=<id>` asks the server for the product's chat context; an
  existing thread with that brand opens straight away, otherwise the first
  message starts one. A visitor is sent to sign in with
  `?next=/chat?product=<id>` and returns to the same place.
* **Notifications** (`notifications`): the inbox loads twenty at a time with
  All / Unread filters (unread is counted from what is loaded), tap reads the
  notification and follows it where `notificationTarget` says (the same
  mapping as the web inbox): an order to `/orders/:id`, a booking to
  `/bookings/:id`, provider-only news to `/services` and product news to
  `/product/:id`. Service notifications carry their own calendar icon and
  colour. Rows can be deleted or all marked read; reads, deletes and mark-all
  keep the badge in step immediately, then the next fetch confirms it.
* **Push, while the app is closed** (Phase 13): after sign-in the app asks for
  notification permission, obtains an Expo push token and registers it with
  `PUT /devices/push-token`; signing out removes it again. The server already
  sends every in-app notification through Expo when `PUSH_ENABLED=true`
  (docs/12 §31), so order and booking updates reach the phone even when the app
  is not running. A tap opens the same screen as its inbox row
  (`notificationTarget`), including the tap that launched the app. Nothing
  breaks where push cannot work: Expo Go skips it, and without an Expo project
  id the app stays on the in-app inbox (`services/push.js` returns a status and
  never throws).

Tests: `chat.test.js` (requests, cursor, live-connection rules, time stamps),
`live.test.js` (socket lifecycle, badge honesty, fan-out and the debounced
re-read), `chat-screens.test.js` and `notifications-screen.test.js` (the
screens against a fake server). `chat-screens.test.js` also covers the merged
inbox and its filters, the direct provider thread (§12) with its own endpoints
and live event kind, and the booking thread with events addressed by
`bookingId`; `notifications-screen.test.js` covers the service deep links.
`push.test.js` covers registration, the permission refusal and the unsupported
cases, removing the token on sign-out, and where a tap lands.

## 12. Local services (Phases 9 and 11)

The shopper side of the local-services marketplace, on the public
`/services` endpoints and the customer booking and direct-chat endpoints
(docs/24); no server changes. Money moves in **paisa** on the wire, and only
the screens divide by 100 to show rupees. The server stays authoritative for
the provider's block, the price floor, the pin inside that block, and the
working hours.

* **Discovery** (`(tabs)/services`): the providers in the shopper's chosen
  area, using the same area model as Nearby (`GET /services/discover` with
  `scope=area`, the chosen `blockIds`, and a radius when one is set). Without
  an area it searches the whole city, and with no city it asks for one. The
  card shows the category and block, rating, a "From" price and up to two
  offerings ("+n more"). The heading reads **Local services** and
  **Looking in {block}**. A category sheet and a sort sheet (Recommended, Top
  rated, Lowest starting price) narrow the list, and the search box debounces
  typing by 400 ms. Results load twelve at a time. An empty area suggests a
  wider range (**Try 5 km**), and a failure offers **Try again**. The query
  builder lives in `services/services.js`, unit tested.
* **Map view:** the same map as Nearby (`components/NearbyMap.jsx`) with provider pins at
  their block centre in the pine colour, the popup reading category, block, "From" price and
  distance, and **View services** opening the provider page. The header toggles **Providers**
  and **Map**; the map overlay is the shared `MapLayers` with the city chip, **Blocks** and
  **Providers** layers (each everything → only mine → hidden) and **Recenter** / **Choose
  location**. The **All** providers layer is the whole city (`/services/discover?scope=city`,
  30 at a time, current search and category), while **mine** keeps the area results. Tapping
  the map sets the shopping spot only while choosing a location, exactly as in Nearby, and
  the area warning's **Choose on the map** opens the map ready to pick.
* **Provider page** (`service/[slug]`): the public profile from
  `GET /services/providers/:slug` — cover, avatar, category, name, the block
  and city they serve, rating (or **New on CityCart**), completed jobs and the
  starting price; an expandable bio; the published services with price and
  duration; the weekly working hours and blackout dates in Pakistan time; the
  reviews with the provider's reply; and the service area. **Request a
  booking** opens the form (a visitor signs in first and returns to it), and
  **Message {provider}** starts a direct chat. A seller or admin account sees
  that only customer accounts can book. A gone provider (404) reads
  **Provider not found** with a link to the services list; a network failure
  offers **Try again**.
* **Booking request** (`service/[slug]/book`, customers only): choose a
  service, then a time. When the provider publishes hours, the form offers
  their own slots for the next ten days at the service's duration, saying
  plainly when the next ten days are full. When they publish none, the shopper
  asks for any future time over the next two weeks. All times are Karachi
  wall-clock, converted to the UTC instant the server stores
  (`utils/serviceSlots.js`, unit tested, no timezone database and no device
  timezone dependence). An optional **Your price for the job (Rs)** becomes
  `customerOfferPaisa`; leaving it blank lets the provider quote. The address
  comes from saved addresses **only when their blocks include the provider's
  block**; otherwise the form asks for the person, phone and address, and the
  job's spot is a pin on the map, movable by tapping or by **Use my current
  location**. The note is capped at 1,000 characters. The request sends only
  `providerId`, `offeringId`, `scheduledStart`, `address`, `location` and the
  optional `note`/`customerOfferPaisa`; the server re-checks the pin, the price
  and the hours (`OUTSIDE_SERVICE_BLOCK` and the validator's messages are shown
  on the field that caused them). Success shows the booking number and returns
  to the provider page; no payment is taken in the app.
* **Direct chat:** from the provider page, `POST /services/direct-chats/start`
  opens (or reopens) the thread and the app shows it in the existing chat
  screen with `kind=provider`. That one screen then uses the provider message
  endpoints (`/services/direct-chats/:id/messages`, `/read`) instead of the
  seller ones, and accepts only `kind: 'PROVIDER'` live events — product-chat
  pushes (no `kind`) and booking-chat pushes (`SERVICE_BOOKING`) are ignored,
  so the three threads never leak into each other. A provider that is not
  taking messages closes the composer with its own wording. The thread is not
  tied to a booking, so a question can be asked before requesting a time.

* **Bookings** (`bookings/index`, from Account → **My bookings** or the
  booking success screen): the customer's `GET /services/bookings` list, ten at
  a time, with status chips (All, Requested, Price ready, Accepted, In progress,
  Completed, Confirmed, Declined, Cancelled, Disputed) and pull-to-refresh. Each
  row shows the service photo, status, provider and booking number, the Karachi
  appointment time and the amount that matters now (`priceOf`: final, agreed,
  live proposal, the shopper's offer, then the guide price), plus a prompt for
  *Price ready* and *Confirm the job*. A status with no rows offers another
  filter; an empty list opens services discovery.
* **Booking detail** (`bookings/[id]`): the same information as the web page,
  with every customer action and nothing the serialized booking does not
  allow. **Next step** explains the current state and then offers only that
  state's action: accept or decline a proposal (with a confirmation before
  declining), confirm the finished job (with a confirmation and the auto-confirm
  date) or report a problem with a written reason, and post a 1–5 star review
  once confirmed (the existing review is shown with the provider's reply).
  Accepting, confirming, disputing and cancelling each replace the screen with
  the booking the server returned; a notice says what changed. **Messages**
  opens the booking thread when `canChat`; the history shows the server's
  events with their prices and notes; cancelling is offered only while the
  server lists the status as cancelable, asks for a reason, and warns that an
  accepted job counts as a late cancellation. The provider card opens their
  profile page and says payment is at the door. A gone booking (400/404) reads
  **Booking not found** with a link to the list; a network failure offers
  **Try again**.

Tests: `services.test.js` (the discovery query and fetchers), `service-slots.test.js`
(Karachi time, windows, blackouts, custom times, paisa), `bookings.test.js`
(`priceOf`, cancel rules, timeline labels and details), `notification-target.test.js`
(where each notification points), `services-screen.test.js`
(the tab against a fake server), `provider-screen.test.js` (profile states,
booking and chat entry points), `booking-request.test.js` (the form, its
validation, saved and manual addresses, the pin, published and free times),
`bookings-screens.test.js` (the list, filters and every detail action) and
the provider and booking thread cases in `chat-screens.test.js`.

## 13. Help and support (Phase 11)

`help.jsx`, reached from the Account tab (**Help & support**, signed in or not) and
directly at `/help`.

* The support address and phone come from the existing public settings endpoint
  (`GET /settings/public`: `platformName`, `supportEmail`, `supportPhone`). The request
  is made once and shared (`services/settings.js`, `hooks/usePublicSettings.js`).
  **Email support** and the address itself open the phone's mail app (`mailto:`); the
  phone row opens the dialer (`tel:`) using only digits and a leading `+`. When no
  address is configured the card says it is being set up and points to the order's
  Messages thread — the app never invents a support contact.
* The FAQ is the website help centre's approved copy (cash on delivery, delivery
  areas, multi-shop carts, damaged or missing items, booking a service, cancelling),
  so the app and the website give the same answers. Answers expand in place and carry
  `accessibilityState.expanded`.
* Topic rows open **My orders**, **My bookings** and **Saved addresses**; a visitor is
  sent through the usual sign-in gate and returns to the chosen screen.

Tests: `__tests__/settings.test.js` (defaults, one shared request, offline fallback)
and `__tests__/help-screen.test.js` (the support card, mail/phone links, the FAQ, the
missing-address fallback and the Account entry points).

## 14. Polish, theme and release (Phases 7 and 12)

* **States.** Loading, empty and error states were built screen by screen in
  Phases 2–6 (skeletons while loading, an explanation with "Try again" on
  failure, pull-to-refresh or re-read on focus everywhere a list lives). This
  phase audited all fifteen screens against that checklist and found no gaps.
* **Offline.** `@react-native-community/netinfo` (installed with
  `npx expo install`, so it matches the SDK). `OfflineBanner` sits in the root
  layout above the navigator and takes its own row (under the status-bar inset)
  only while the OS reports the device as disconnected, so no screen title is
  covered; the unknown state at launch is treated as online so it never
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
* **White canvas, v3 accents (Phase 12, revised).** `src/theme.js` keeps the web
  app's v3 customer accents but sets both `paper` (the canvas) and `surface`
  (cards, bars and sheets) to `#ffffff`, separated by `line #e5e3dd` hairlines.
  `cream #fdf5ed` is the warm inset wash and `sand #f2f0eb` the image well;
  `ink #15140f` and `clay #b6472a` stay as the text and action colours, with
  `pine #1c3a2e` for service providers. Radii follow the web too — tiles 10,
  cards 14, sheets 20. Because every screen reads the theme, the change is one
  file plus the surfaces the theme does not reach: the map HTML
  (`components/map/mapHtml.js` — white chrome, neutral tile wells), the modal
  scrims (`rgba(21,20,15,0.45)`) and the store and provider hero overlays. The
  native window background in `app.json` is white as well.
* **Contrast.** Small secondary text (`muted #5d6979`) clears WCAG AA (4.5:1) on
  the white canvas (5.58:1), on sand wells (4.90:1) and on cream (5.17:1); `ink`
  (18.44:1) and `clay` (5.35:1) clear it too. `__tests__/theme.test.js` pins the
  tokens, computes the contrast of every used pair from first principles, and
  fails if one drops below its floor.
* **Reduced motion.** `hooks/useReduceMotion.js` reads the OS setting and keeps
  listening for changes, guarding for platforms that answer nothing. The three
  modals (`OptionSheet`, `RangeBar`, `ImageGallery`) switch to
  `animationType="none"` when it is on, so they still open — just without the
  slide or fade.
* **Screen-reader labels and roles.** Sheet scrims and icons are hidden from the
  reader where they only decorate (`EmptyState`, `UnreadPill`), empty-state and
  section titles announce as headers, range chips and the list/map toggle report
  as radio groups with a selected state, filter pills and small "Change" rows
  carry `hitSlop`, and the map WebView gets an internal `aria-label` per screen
  ("Map of nearby shops", "Map for choosing a spot" and so on) from
  `buildMapData`.
* **Tap targets.** Small rows that were 40 points tall — the list/map toggle,
  the location buttons, the address actions — are 44 or use `hitSlop`, so they
  meet the 44×44 guideline without changing how dense screens look.
* **2026-11 Shopper app audit:** the offline banner now takes its own space at
  the top of the layout instead of covering screen titles; every paged list
  (Nearby, Services, orders, bookings, chat, notifications) tells a failed
  refresh apart from a failed next page and offers the matching retry (the map
  views say so under "Load more"), instead of silently dropping the failure;
  chat says when earlier messages could not be loaded and retries from the same
  control; marking all notifications read or deleting one reports a failure in
  a banner instead of pretending it worked; the chat filter pills scroll
  sideways so "Service providers" cannot clip at 360 px or with large text; a
  store card's distance chip moved to the bottom of the photo and truncates to
  one line, section headers shrink their title around the action link, and the
  saved-address and cart-subtotal rows can no longer push their values out of
  the card (tab labels stopped scaling too); and a provider with no services
  gets an explanation instead of a form that cannot be sent. Tests: 507 in 48
  suites; lint clean.

Tests: `__tests__/theme.test.js` (tokens, contrast pairs, radii, touch size),
`__tests__/reduce-motion.test.js` (setting read, live change, listener cleanup,
platform that cannot answer) and the updated `__tests__/map-data.test.js` (the
label is carried into the map HTML).

### Device-test checklist

The combined pass for all three apps — builds, push, camera, location and the
one golden path — is `25-device-test-checklist.md`. This list stays the
shopper's own detail.

Automated tests cover logic against a fake server; these checks need a real
phone (Expo Go while developing, a preview APK for release behaviour):

1. **Launch and sign-in** — branded splash, home loads, register and login
   work, `?next=` returns to where the shopper was, sign-out clears the badges.
2. **Browse** — Home asks for a city the first time, then shows skeletons, the store grid
   (shops in the chosen block first, with the "Your block" badge and "From" price) and the
   picked shelf. A store card opens the store page (banner, description, categories, hours,
   phone and email); "Shop this store" / "See everything" opens Nearby searching that shop;
   "All stores" opens the directory; the search box opens Nearby. Product photos and reviews
   work, and "Chat with seller" asks a visitor to sign in and returns to the same product.
3. **Nearby and the area** — the location-permission wording appears, the **Use my
   location** button re-detects, blocks load with their outlines, the map shows pins and
   pans to results (OpenStreetMap tiles render in the release build). The city chip frames
   the chosen city; **All → Mine → Off** on Blocks and Stores changes what is drawn and
   **Recenter** re-fits it; a pin's popup opens its store page; Directions opens the maps app.
   Then: an overlap starts with both blocks ticked, a border point offers the nearest blocks,
   with no area a map tap sets it and **Choose location** changes it later, and a product
   page's "Also sold by" lists the area's other stores.
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
   after backgrounding and returning. The All chats / Stores / Service
   providers filters switch the inbox without mixing the collections, and a
   provider row opens the direct thread.
8. **Local services** — the Services tab lists providers in the chosen area,
   the category and sort sheets and the search narrow the list, and a card
   opens the provider page (services, working hours in Pakistan time, reviews,
   service area). The **Map** view draws provider pins city-wide (Blocks and
   Providers cycle All → Mine → Off, city chip and Recenter work), a pin's
   **View services** opens the provider, and **Choose location** moves the
   shopping spot. Request a booking as a customer: pick a service and a
   published slot, use a saved address inside the block or a manual one with
   the map pin and current location, add an optional price offer, and see the
   booking number. Message the provider: the thread opens, a reply from the
   provider dashboard arrives live in it, and a provider with messages closed
   shows the composer notice instead.
9. **Bookings** — Account → My bookings lists the request just made; the status
   chips filter it and each row opens the detail. As the provider moves the
   booking on the web dashboard (proposal, acceptance, start, completion), the
   detail's Next step offers the matching action: accept or decline a price,
   confirm the finished job or report a problem with a reason, then post a
   review. Cancelling asks for a reason and warns when it is late. The chat
   button opens the booking thread, and a message from either side arrives live.
10. **Notifications** — an order update and a booking update arrive live, the
    badge increments, tapping each follows to the order and the booking
    respectively, mark-all-read and delete keep the badge honest.
11. **Offline** — airplane mode shows the banner on every screen and requests
    fail with "Cannot reach the server"; turning the connection back removes
    the banner and pull-to-refresh recovers without restarting the app.
12. **Help & support** — Account → Help & support (signed in and signed out):
    the support email and phone match the admin settings, the buttons open the
    mail and dialer with the address prefilled, an answer expands and folds,
    the topic rows open orders, bookings and addresses, and with no support
    address configured the card explains that instead of showing a dead link.
13. **Release build** — install the preview APK, repeat sign-in, nearby map and
    one order end to end; the launcher icon and splash are the branded set.
14. **Accessibility and theme** — with TalkBack or VoiceOver on, the tabs,
    buttons, cards and the list/map toggle announce a name and state, headings
    read as headings, and the map is announced by its screen ("Map of nearby
    shops", "Map of local service providers"). Turn the system font up: text
    grows without clipping. Turn on Reduce Motion: sheets still open, without
    sliding. Finally, compare a few screens and the map with the website — the
    cream canvas, warm cards, clay accent and forest services should match.
15. **Push notifications** — this needs an EAS development or preview build
    (Expo Go on Android cannot receive push), `PUSH_ENABLED=true` on the server
    and FCM credentials in EAS. Sign in and allow notifications, then have the
    brand move an order (and the provider send a booking proposal) while the
    app is closed: the banner arrives, and tapping it opens the matching order
    or booking. Sign out and confirm the phone stops receiving them.

## 15. Development

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

## 16. Known limits

* A bearer token cannot be revoked individually; it ends at expiry, on account
  deactivation, or when the password version changes. A lost phone is
  therefore covered by deactivating the account or changing the password.
* No refresh tokens in the first version. Push notifications need an EAS
  build (Expo Go on Android cannot receive them) and `PUSH_ENABLED=true` on
  the server.

## 17. Related: the Staff and Delivery apps

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
