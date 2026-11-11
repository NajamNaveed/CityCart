# CityCart Shopper

The customer app: shop nearby stores, book trusted service providers, track
orders and bookings, and talk to the shop or provider in one inbox. Flutter,
Android first, with a working web build.

It is the v3 rebuild of the React Native customer app in `mobile/`, written
against the same server API. The server stays authoritative for prices,
availability, delivery zones, booking state and every permission; this app only
presents and collects.

## Screens

| Tab | What it does |
|---|---|
| **Home** | The shops around the chosen block, each showing a few real products and prices, plus a row of nearby service categories. Pull to refresh. |
| **Explore** | Search shops and items in the area. An empty search explains what to try instead of showing a blank list. |
| **Services** | Approved providers around the block: cleaning, repairs, tuition and more, with search, category chips and sorting. |
| **Basket** | Lines grouped by shop, quantity changes, removal, and one clear checkout action. |
| **Account** | The shopper's details, orders, bookings, messages, notification badge, delivery area, saved addresses, server address, help and sign-out. |

Outside the tabs:

* **Storefront** — the brand, its categories and featured products.
* **Product** — price, availability, details, verified reviews and add to basket.
* **Checkout** — a saved or new address (pinned to a delivery block), delivery
  notes, the server-priced summary and order placement.
* **Orders** — every order with its shop and status; detail shows progress, the
  door code, change proposals, cancellation, per-item reviews, the receipt and
  buy-again.
* **Service provider** — services, working hours, photos and reviews; a paused
  provider cannot be booked.
* **Booking request** — service, time slot, address and an optional offer, all
  validated before sending.
* **Bookings** — requests, offers and scheduled visits, with accept/decline,
  confirmation, review and a chat with the provider.
* **Messages** — one inbox for shop chats, booking chats and direct provider
  chats, filtered and with unread counts.
* **Notifications** — order, booking and payment updates; opening one marks it
  read and jumps to the order or booking, and removing one never touches them.
* **Saved addresses** — up to the server's limit, default address, delivery-pin
  warnings and editing.
* **Help & support** — the support email and phone published by the platform,
  quick links and answers to common questions.

## Requirements

* Flutter 3.47.9 / Dart 3.13.7.
* The CityCart API (`server/`) with a `CUSTOMER` account. It signs in at
  `POST /auth/login`; the app sends `X-Client: mobile` on every request.
* Cloudinary configured on the server if product, store or review images are
  expected. Without it the app shows its own initials and product marks.
* No extra device permissions: the delivery pin comes from the chosen block, not
  from device location.

## Run

```bash
flutter pub get
flutter run --dart-define=API_URL=https://your-server.example.com/api/v1
```

Android emulators reach the host machine at `10.0.2.2`; without `API_URL` the
sign-in screen offers a setup sheet with that suggestion, and the account screen
can change it later. A release build should always bake in `API_URL`.

```bash
flutter build apk --release --dart-define=API_URL=https://your-server.example.com/api/v1
flutter build web --release --dart-define=API_URL=https://your-server.example.com/api/v1
```

## Test

```bash
flutter analyze
flutter test
```

70 offline tests in 9 suites. Every screen suite runs at 320 × 900 with a 1.3
text scale and asserts no layout overflow:

* `widget_test` — the router guard (splash, sign-in, area, home), sign-in
  validation, the area chooser, home and the storefront.
* `discovery_test` — explore search, product details and reviews, and a product
  chat thread.
* `cart_test` — basket quantities, removal, empty state, add to basket, checkout
  with a saved and with a new address, and the server payloads.
* `orders_test` — order list and empty state, tracking with the door code,
  receipts, change proposals, cancellation, reviews and buy-again.
* `services_test` — service discovery and search, provider pages, the booking
  request form and its slot maths, and address prefills.
* `bookings_test` — booking list and detail, offers, confirmation, reviews,
  provider declines, the merged inbox and both chat routes.
* `phase7_test` — address CRUD and defaults, notification read/remove/mark-all,
  help contacts, the inbox merge, and password recovery.
* `account_test` — the account screen at a narrow width, its unread badge and
  the notification row's route.
* `core_format_test` — money, distance, initials, greeting and plural helpers.

The tests make no network calls.

## Launcher icons

The icon is the cream shopping bag on the app's forest square, taken from the
sign-in mark, so the launcher and the app chrome match. After changing the mark,
regenerate every Android, iOS and web size:

```bash
flutter test tool/generate_icons.dart
```

iOS icons are written as opaque RGB PNGs (App Store rejects icons with an alpha
channel), and Android also gets adaptive foreground layers. The source is
`assets/icon/app_icon.png`.

## Device permissions

Defined in `android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist`:

* Internet only, for the API and remote images.
