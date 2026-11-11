# CityCart Delivery

The rider app: sign in, see today's jobs, navigate, complete a delivery at the
door and see the cash you are holding. Flutter, Android first.

It is the v3 rebuild of the React Native rider app in `delivery/`, written
against the same server API. The server stays authoritative for every figure and
every permission; this app only presents and collects.

## Screens

| Tab | What it does |
|---|---|
| **Today** | The next job as one large card with one clear action, the rest of the route below, pull to refresh. |
| **Cash** | The cash the rider has collected and not yet handed to the store, plus a plain explanation of how settlement works. |
| **Account** | Rider details, opt-in foreground location sharing, server address, sign-out. |

Outside the tabs: delivery detail (open in maps, call the customer, start the
trip) and the door flow (six-digit code, per-line accept/refuse with reason and
optional photo, payment method and proof, final review).

Only the server decides what happens next. A delivery cannot be marked delivered
without the customer's code, a non-cash payment waits for the store to verify
it, and the delivery fee is refunded only when every item is refused for a
store-side reason. The app never invents a settlement action.

## Requirements

* Flutter 3.47.9 / Dart 3.13.7.
* The CityCart API (`server/`) with a rider account. The account must have the
  `RIDER` role; it signs in at `POST /auth/delivery/login` with
  `X-Client: delivery`.
* Cloudinary configured on the server for photo proof and refused-item photos.
  Without it the server offers cash only.

## Run

```bash
flutter pub get
flutter run --dart-define=API_URL=https://your-server.example.com/api/v1
```

Android emulators reach the host machine at `10.0.2.2`; without `API_URL` the
sign-in screen offers a setup sheet with that suggestion. A release build should
always bake in `API_URL`.

## Test

```bash
flutter analyze
flutter test
```

`test/delivery_rules_test.dart` covers the door rules (line answers, fee refund,
estimate math, payload shape, payment readiness). The remaining suites cover API
error translation, models, money and date formatting, URL normalisation and
shared widgets. All tests are offline. `test/flutter_test_config.dart` loads the
`intl` date data first, mirroring `main()`.

## Launcher icons

The icon is drawn from the same forest square and cream scooter as the in-app
brand mark, so no design tool is needed. After changing the mark, regenerate
every Android, iOS and web size:

```bash
flutter test tool/generate_icons.dart
```

iOS icons are written as opaque RGB PNGs (App Store rejects icons with an alpha
channel), and Android also gets adaptive foreground layers. The source is
`assets/icon/app_icon.png`.

## Device permissions

Defined in `android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist`:

* Internet (API), camera (payment proof and return photos), photo library (iOS).
* Fine and coarse location, used only while the rider turns on sharing and only
  while a delivery is out.
* `<queries>` for the dialler and https links so "Call customer" and "Open in
  maps" work on Android 11+.
* Debug and profile builds allow cleartext HTTP for local development; release
  builds do not.

## Known limits

* Not yet run on a physical device in this environment: the camera upload was
  exercised only against mocks, and GPS permission prompts are untested.
* No push notifications in this rebuild. The old app had them; the rider
  currently finds new jobs by pulling to refresh.
* Cash settlement happens in the brand dashboard. The app only reports what is
  still held.
