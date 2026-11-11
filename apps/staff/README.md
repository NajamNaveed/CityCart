# CityCart Staff

The staff app: sign in, pick orders, keep the day's records, take returned goods
back in and check the daily takings. Flutter, Android first.

It is the v3 rebuild of the React Native Staff app in `partner/` (docs/24 §7.1
names the Flutter folder `apps/staff_flutter/`; this checkout keeps
`apps/staff/`, as the Delivery rebuild kept `apps/delivery/`). It calls the same
server API and follows the same rules. The server stays authoritative for every
figure and every permission; this app only presents and collects.

## Screens

The signed-in account decides which doors exist. A `PICKER` sees the queue; a
`BRAND_EMPLOYEE` sees the records and money tabs their permissions allow.

| Tab | What it does |
|---|---|
| **Home** | Today at a glance: orders, deliveries, goods coming back, proofs waiting and cash held by riders, with one tap to the screen that needs attention. |
| **Orders** | Orders with plain status filters; detail shows the lines, money, delivery details, change proposals and the receipt link. |
| **Deliveries** | Deliveries with filters; detail shows the address and phone, and lets someone with `delivery.manage` + `riders.view` assign or clear a rider. |
| **Returns** | Returned goods: All / Coming back / Received, a value summary, per-line reasons and signed photos, and **Receive goods** with restock or write-off per line (write-off is the default). |
| **Money** | Three segments: **Receipts**, **To verify** (payment proofs with duplicate/reference warnings) and **Cash** (who is holding what, select payments, settle all). Receipt detail prints the full receipt paper. |
| **Queue** (picker only) | Waiting orders, claim, mark each line Picked / Short / Unavailable, propose a substitution and pack. |

Outside the tabs: order detail, delivery detail, return detail, receipt,
payment-proof review and the cash collector screen. Every screen says who may
act; a read-only visitor gets the facts and a plain notice instead of a button
that would fail.

## Requirements

* Flutter 3.47.9 / Dart 3.13.7.
* The CityCart API (`server/`) with a `BRAND_EMPLOYEE` or `PICKER` account. It
  signs in at `POST /auth/staff/login` with `X-Client: staff`; an account that
  works for more than one brand chooses the brand on the sign-in screen.
* Cloudinary configured on the server if return or payment-proof photos are
  expected. Without it the server simply has no photo to show.

## Run

```bash
flutter pub get
flutter run --dart-define=API_URL=https://your-server.example.com/api/v1
```

Android emulators reach the host machine at `10.0.2.2`; without `API_URL` the
sign-in screen offers a setup sheet with that suggestion. A release build should
always bake in `API_URL`.

```bash
flutter build apk --release --dart-define=API_URL=https://your-server.example.com/api/v1
```

## Test

```bash
flutter analyze
flutter test
```

30 offline tests in 5 suites:

* `models_test` — pick orders and shortfall, returns and their summary, proof
  duplicates, receipts, cash collectors and the permission list.
* `access_test` — which permission opens which area, and the rider-assignment
  combination.
* `redirect_test` — where each role lands and which routes stay shut without a
  permission.
* `format_test` — money, dates and the plain-words status labels.
* `widget_test` + `layout_test` — sign-in at 320 × 640 with a 1.3 text scale, and
  the shared buttons, cards, pills, metric tiles and filters at the same width,
  asserting no layout overflow.

The tests make no network calls. `flutter analyze` is clean.

## Device permissions

Defined in `android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist`:

* Internet (API).
* Debug and profile builds allow cleartext HTTP for local development; release
  builds do not.

There is no camera, location or notification permission in this app yet.

## Known limits

* Not yet run on a physical device in this environment. The screens have been
  exercised in offline widget tests and a web build; the server contract is
  covered by the server test suites.
* No push notifications in this rebuild; the team finds new work by pulling to
  refresh.
* The launcher icon is still the Flutter default.
* Picking is brand-wide, not per branch, because orders have no fulfilment
  branch (see docs/20 §5.9).
