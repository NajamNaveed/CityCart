# CityCart Delivery (riders)

React Native + Expo (SDK 57), plain JavaScript. **Read [`../docs/23-delivery-app.md`](../docs/23-delivery-app.md) first**: it explains why this app exists, what is built, and what comes next.

This app is for one kind of person: the **delivery rider** (`RIDER`) of one brand. Brand team members and pickers use the separate Staff app (`../partner`); shoppers use `../mobile`.

| The rider sees | What they can do |
|---|---|
| Their own deliveries | Call the customer, open the address in Maps, mark picked up / out for delivery, enter the customer's six-digit code, record a failed attempt |
| One delivery | Record cash, bank transfer, wallet or card-machine payment at the door, with a private photo for non-cash |
| Cash | The money they collected and have not yet handed to the brand |
| Alerts | Their notifications; a new delivery appears even when the app is closed (with push set up) |
| Account | Share their location while delivering, sign out |

Riders are created by their brand on the website (Brand dashboard, Riders). Brand owners and brand team members cannot sign in here.

## Run it on your phone

1. Install the **Expo Go** app on your phone (Play Store / App Store).
2. Make sure your API is running or deployed (see `.env.example` for which address to use).
3. In this folder:

```bash
npm install
cp .env.example .env     # then set EXPO_PUBLIC_API_URL
npx expo start
```

4. Scan the QR code (Android: from inside Expo Go; iPhone: with the Camera app). Phone and computer must be on the same Wi-Fi.

To try the rider flow with demo data: run `npm run seed:demo` in the project root, then sign in with `shoaib.raza@citycart.demo` and the demo password the seed script prints.

## Commands

```bash
npx expo lint     # lint
npm test          # unit and screen tests (jest-expo)
npx expo start -c # start with a clean cache
```

## How it works

* **Sign-in:** `POST /auth/delivery/login` with the header `X-Client: delivery`. The token is kept in the phone's secure storage under its own key and lasts one shift; after that the rider signs in again. A deactivated rider or a reset password signs the app out at the next request. An account of another app is refused by the server and never stored.
* **Everything a rider sees comes from `/rider/deliveries`**, which the server pins to the signed-in rider: another rider's delivery is simply "not found".
* **Delivering:** the rider cannot mark a delivery as delivered by tapping a button. They ask the customer for the six-digit code shown in the shopper app or on the website, and enter it. Five wrong tries lock it; the brand then completes the delivery.
* **No extra packages:** Maps and the phone dialler open through plain links (`Linking`). No maps library, no fonts to download.
* **Updates:** the list refreshes when the screen opens, every minute, and when you pull down.

## Notifications and sharing your location

* **Share my location while I deliver** (Account tab, off by default): while an order is out for delivery, that order's customer and your brand can see where you were last seen. Only your latest position is kept, and it works only while this app is open.
* **Push notifications** (a new delivery, even when the app is closed) need a real build of the app: **Expo Go on Android cannot receive them**, and the app simply skips them there. To enable: run `npx eas-cli init` in this folder (links an Expo project), add Firebase credentials in EAS, run `eas build --profile development --platform android`, and set `PUSH_ENABLED=true` on the server. See `../docs/12-notification-system.md` §31.

## If something goes wrong

| Problem | Fix |
|---|---|
| "The app is not connected to a server yet" | `.env` must contain the **whole line** `EXPO_PUBLIC_API_URL=http://YOUR-ADDRESS:5000`. Save it, then restart with `npx expo start -c`. |
| "Cannot reach the server" with a local address | Use your computer's real Wi-Fi address (Windows: `ipconfig`, *IPv4 Address*; Mac/Linux: `ifconfig`). Phone and computer must be on the same Wi-Fi, and the firewall must allow Node on port 5000. |
| "This sign-in is for the CityCart Delivery app" | The request did not come from this app (it must send `X-Client: delivery`). |
| "This account signs in to a different CityCart app" | The account is a brand team member, picker or shopper: they use the Staff or shopper app, not this one. |
| Brand owner cannot sign in | By design: owners use the website. |
| A rider is signed out suddenly | Their sign-in lasted one shift, or the brand deactivated them or reset their password. |
| Expo Go says the project is incompatible | Update Expo Go from the store: it must support SDK 57. |

## Building an installable Android app

`npm run build:android:preview` (needs an Expo account and `npx eas-cli`). The Android package is `com.citycart.delivery`.
