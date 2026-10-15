# CityCart mobile (shopper app)

React Native + Expo (SDK 57), plain JavaScript. Plan, phases and decisions: [`../docs/19-mobile-app.md`](../docs/19-mobile-app.md).

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

If the Home tab says **Connected to the CityCart server**, the app is talking to your API.

## If something goes wrong

| Problem | Fix |
|---|---|
| Home says "not connected to a server yet" | `.env` must contain the **whole line** `EXPO_PUBLIC_API_URL=http://YOUR-ADDRESS:5000`, not just the address. Save it, then restart with `npx expo start -c`. |
| "Can't reach the server" with a local address | Use your computer's real Wi-Fi address (Windows: `ipconfig`, look for *IPv4 Address*; Mac/Linux: `ifconfig`). Phone and computer must be on the same Wi-Fi. |
| It worked in a browser but not on the phone | Windows Firewall is probably blocking Node on port 5000: allow Node.js on **Private networks**, or run `New-NetFirewallRule -DisplayName "CityCart API" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow` in an Administrator PowerShell. |
| "Unable to resolve ..." or a screen from the starter template | Leftover starter files. The app has no `.tsx` files and no `tsconfig.json`; delete any you find. |
| Expo Go says the project is incompatible | Update Expo Go from the store: it must support SDK 57. |
| Strange cached behaviour | `npx expo start -c` clears the cache. |

## Useful commands

| Command | What it does |
|---|---|
| `npx expo start` | start the dev server |
| `npm run lint` | check the code |
| `npm test` | unit tests |
| `npx expo install <package>` | add a package (always use this, never plain `npm install`, so versions match the SDK) |

## Where things are

- `src/app/` screens (each file is a route)
- `src/services/` API client, token storage, session rules
- `src/components/ui/` shared building blocks
- `src/theme.js` colours and fonts (the same as the web app)
