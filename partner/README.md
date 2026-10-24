# CityCart Partner (riders and brand team members)

React Native + Expo (SDK 57), plain JavaScript. **Read [`../docs/20-partner-app.md`](../docs/20-partner-app.md) first**: it explains why this app exists, what is built, and what comes next.

It is one app for two kinds of people; the account's role decides the screens:

| Account | Sees |
|---|---|
| Delivery rider (`RIDER`) | Their own deliveries, one delivery at a time (call the customer, open Maps, status, the customer's code, failed attempt), the cash they hold, alerts, account |
| Brand team member (`BRAND_EMPLOYEE`) | A "records coming soon" screen. The records screens are the next phase (docs/20 §6.3) |

Brand owners and the super admin sign in on the website, not here. Riders are created by their brand on the website (Brand dashboard, Riders) and sign in here with the email and password the brand gave them.

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

* **Sign-in:** `POST /auth/partner/login` with the header `X-Client: partner`. The token is kept in the phone's secure storage under its own key and lasts one shift; after that the rider signs in again. A deactivated rider or a reset password signs the app out at the next request.
* **Everything a rider sees comes from `/rider/deliveries`**, which the server pins to the signed-in rider: another rider's delivery is simply "not found".
* **Delivering:** the rider cannot mark a delivery as delivered by tapping a button. They ask the customer for the six-digit code shown in the shopper app or on the website, and enter it. Five wrong tries lock it; the brand then completes the delivery.
* **No extra packages:** Maps and the phone dialler open through plain links (`Linking`). No maps library, no location permission, no fonts to download.
* **Updates:** the list refreshes when the screen opens, every minute, and when you pull down. Push notifications and live location are a later, optional phase (docs/20 §6.5).

## If something goes wrong

| Problem | Fix |
|---|---|
| "The app is not connected to a server yet" | `.env` must contain the **whole line** `EXPO_PUBLIC_API_URL=http://YOUR-ADDRESS:5000`. Save it, then restart with `npx expo start -c`. |
| "Cannot reach the server" with a local address | Use your computer's real Wi-Fi address (Windows: `ipconfig`, *IPv4 Address*; Mac/Linux: `ifconfig`). Phone and computer must be on the same Wi-Fi, and the firewall must allow Node on port 5000. |
| "This sign-in is for the CityCart Partner app" | The request did not come from this app (it must send `X-Client: partner`). |
| Brand owner cannot sign in | By design: owners use the website. |
| A rider is signed out suddenly | Their sign-in lasted one shift, or the brand deactivated them or reset their password. |
| Expo Go says the project is incompatible | Update Expo Go from the store: it must support SDK 57. |

## Building an installable Android app

Same as the shopper app: `npm run build:android:preview` (needs an Expo account and `npx eas-cli`). The Android package is `com.citycart.partner`.
