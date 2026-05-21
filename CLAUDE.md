# `hush-app` — Claude Code operating context

You are working on the **Hush mobile app**: Expo (React Native + TypeScript), file-based routing via Expo Router, NativeWind for styles.

## Stack — non-negotiable

- **Expo SDK 52** (managed initially; Dev Client from phase 3 onward).
- **TypeScript strict**.
- **Expo Router** (file-based; layouts in `_layout.tsx`, route groups with `(parens)`).
- **NativeWind** for all styling. Do not mix in plain `StyleSheet` unless NativeWind genuinely cannot do it (rare).
- **Tanstack Query** for server state.
- **Zustand** for the small amount of client-only state (current pairing flow, etc.).
- **`react-hook-form` + Zod** for forms.
- **`expo-secure-store`** for tokens.

## Do NOT use Expo Go from phase 3 onward

BLE does not work in Expo Go. Once you start the pairing flow, switch to a **Dev Client** build:

```bash
npx expo run:ios     # one-time native build
npx expo run:android # one-time native build
npx expo start --dev-client
```

## Common commands

```bash
npm install
npm start                # Metro bundler; press i/a for sim/emulator
npm run ios              # native build + simulator
npm run android          # native build + emulator
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npm run gen:api          # OpenAPI client from ../hush-protocol/hush-api.yaml

# EAS (cloud builds; requires `eas login` first)
eas build --profile preview
eas build --profile production
eas update --branch production
```

## Routing — Expo Router conventions

- Folder-based. Each `*.tsx` file under `app/` is a route.
- `_layout.tsx` wraps its sibling routes.
- `(group)` directories don't appear in the URL — used to share layouts (`(auth)`, `(tabs)`).
- Programmatic navigation: `import { router } from "expo-router"` then `router.push("/devices")` or `router.replace("/(auth)/login")`.
- `app.json` has `experiments.typedRoutes: true` — `router.push` will autocomplete and typecheck.

## API client — generated, never hand-written

```bash
npm run gen:api
# reads ../hush-protocol/hush-api.yaml → lib/api/schema.ts
```

Wrap the fetch in a thin client (`lib/api/client.ts`) that:
- Adds `Authorization: Bearer <token>` from secure store.
- On 401, attempts a refresh; on refresh failure, signs out.
- Surfaces typed errors (`Error` schema from the spec).

## Tokens

- **Access token** lives **only in memory** (a Zustand store). On app launch we attempt a silent refresh.
- **Refresh token** lives in `expo-secure-store`. **Never** in plain AsyncStorage, never logged.

## BLE (phase 3+)

- Permissions are declared in `app.json` (iOS `infoPlist.NSBluetooth*`, Android `permissions`).
- iOS-required descriptions are user-facing — Apple reviewers read them. Keep them honest and short.
- Android 12+ (`API 31`) needs runtime `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; pre-31 wants `ACCESS_FINE_LOCATION`. The wrapper in `lib/ble/improv.ts` handles both.
- Improv WiFi spec: <https://www.improv-wifi.com/ble/>.

## Pivot to Flutter — when, not whether

If `react-native-ble-plx` proves unworkable in phase 3 (see [`PLAN.md`](./PLAN.md)):

1. Stop and tell the maintainer.
2. Document exactly what failed (which OS, which devices, which characteristic operations).
3. Wait for explicit approval to start the Flutter port. Do not "just try it" yourself.

## Open decisions — ask, do not invent

- EAS Update strategy (OTA fixes vs store-only).
- Design system (primitives vs library).
- Push provider (Expo wrapper vs raw FCM/APNs).
- Language strategy (EN-first vs EN+ES at launch).

## Phasing

Five phases in `PLAN.md`. Finish phase N before opening phase N+1. If you spot work that belongs later, write it under that phase's checklist; do not implement.

## Where things live

| Subject | File |
|---|---|
| Root layout (gates on auth) | `app/_layout.tsx` |
| Auth screens | `app/(auth)/{login,register}.tsx` |
| Tab layout + screens | `app/(tabs)/_layout.tsx` and siblings |
| Pairing flow | `app/pairing/{scan,wifi,confirm}.tsx` |
| OpenAPI types | `lib/api/schema.ts` (generated) |
| API client wrapper | `lib/api/client.ts` (phase 2) |
| Token storage | `lib/auth/` |
| BLE / Improv WiFi | `lib/ble/improv.ts` (phase 3) |
| Shared UI | `components/` |
| Styles config | `tailwind.config.js`, `global.css` |
