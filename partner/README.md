# CityCart Staff (pickers and brand team members)

React Native + Expo (SDK 57), plain JavaScript. **Read [`../docs/20-partner-app.md`](../docs/20-partner-app.md) first**: it explains why this app exists, what is built, and what comes next. Delivery riders have their own app: [`../delivery`](../delivery) and [`../docs/23-delivery-app.md`](../docs/23-delivery-app.md).

It is one app for two kinds of people; the account's role decides the screens:

| Account | Sees |
|---|---|
| Brand team member (`BRAND_EMPLOYEE`) | The records screens, each shown only if the brand gave them the permission: **Overview** (counts and cash with riders), **Orders**, **Deliveries** (and giving a delivery to a rider), **Money** (receipts, and counting the cash riders hand over). Returns come with a later update |
| Picker (`PICKER`) | The **Queue** of accepted orders, one pick screen (claim, per-line picked/short/unavailable, substitute proposal, pack), and their account |

Brand owners and the super admin sign in on the website, not here. Team members and pickers are created by their brand on the website (Brand dashboard, Team) and sign in here with the email and password the brand gave them.

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

To try it with demo data: run `npm run seed:demo` in the project root, then sign in with `hira.anwar@citycart.demo` for the records screens (Loom & Co.'s demo "Records Keeper") or `areeba.saleem@citycart.demo` for the pick queue. Other team members see less, because what a team member sees depends on the permissions the brand gave them. The seed script prints the demo password.

## Commands

```bash
npx expo lint     # lint
npm test          # unit and screen tests (jest-expo)
npx expo start -c # start with a clean cache
```

## How it works

* **Sign-in:** `POST /auth/staff/login` with the header `X-Client: staff`. The token is kept in the phone's secure storage under its own key and lasts one shift; after that the person signs in again. A deactivated account or a reset password signs the app out at the next request. A rider's account is refused here, with "This account signs in to a different CityCart app."
* **Records screens:** `/orders`, `/deliveries`, `/receipts` and the overview are the same brand endpoints the website uses. The server decides what the person's permissions allow, and the app hides what they cannot see.
* **Pick queue:** `/picker/*` is brand-scoped and pinned to the signed-in picker. The serializers send a customer's first name and items only — never phone, address, prices, totals or payment details.
* **No extra packages:** Maps and the phone dialler open through plain links (`Linking`).
* **Updates:** lists refresh when the screen opens, every minute, and when you pull down.

## Notifications

Push notifications (a new order, an answered substitution) need a real build of the app: **Expo Go on Android cannot receive them**, and the app simply skips them there. To enable: run `npx eas-cli init` in this folder (links an Expo project), add Firebase credentials in EAS, run `eas build --profile development --platform android`, and set `PUSH_ENABLED=true` on the server. See `../docs/12-notification-system.md` §31. Location sharing belongs to the delivery app, not this one.

## If something goes wrong

| Problem | Fix |
|---|---|
| "The app is not connected to a server yet" | `.env` must contain the **whole line** `EXPO_PUBLIC_API_URL=http://YOUR-ADDRESS:5000`. Save it, then restart with `npx expo start -c`. |
| "Cannot reach the server at http://..." | The message shows the address the app tried. First open `http://YOUR-ADDRESS:5000/health` in your **phone's browser**: if that page does not load, the problem is the network or firewall, not the app. |
| "Cannot reach the server" with a local address | Use your computer's real Wi-Fi address (Windows: `ipconfig`, *IPv4 Address*; Mac/Linux: `ifconfig`). Phone and computer must be on the same Wi-Fi, and the firewall must allow Node on port 5000. |
| "This sign-in is for the CityCart Staff app" | The request did not come from this app (it must send `X-Client: staff`). |
| "This account signs in to a different CityCart app" | Riders use the delivery app; owners and admins use the website. |
| Brand owner cannot sign in | By design: owners use the website. |
| A team member or picker is signed out suddenly | Their sign-in lasted one shift, or the brand deactivated them or reset their password. |
| Expo Go says the project is incompatible | Update Expo Go from the store: it must support SDK 57. |

## Building an installable Android app

Same as the shopper app: `npm run build:android:preview` (needs an Expo account and `npx eas-cli`). The Android package is `com.citycart.staff`.
