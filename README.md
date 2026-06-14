# hush-app

> Hush mobile app — Expo (React Native + TypeScript). Pair devices over BLE, manage your audio library, bind RFID cards.

[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![expo](https://img.shields.io/badge/Expo-SDK%2052-black)](./package.json)

Hush is an open-source RFID-activated audio device for children — see [open-hush.com](https://open-hush.com).

---

## Stack

- **Expo SDK 52** with the [**Managed workflow**](https://docs.expo.dev/introduction/managed-vs-bare/) initially; will need to migrate to a **Dev Client** in phase 3 (BLE).
- **React Native 0.76** + **React 18.3**.
- **TypeScript** (strict).
- **Expo Router** (file-based, App-Router-style).
- **NativeWind** (Tailwind CSS for React Native).
- **Tanstack Query** for server state, **Zustand** for the small amount of client state, **react-hook-form** + **Zod** for forms.
- **react-native-ble-plx** for BLE pairing (planned, phase 3).
- **expo-secure-store** for tokens.

---

## Quick start

```bash
pnpm install

# Start the Metro bundler. Pick a target with `i` (iOS Simulator), `a`
# (Android Emulator), or scan the QR code with the Expo Go app.
pnpm start

# Or run directly on a connected device / simulator:
pnpm expo run:ios
pnpm expo run:android
```

> This project uses [**pnpm**](https://pnpm.io). If you don't have it,
> `corepack enable` (bundled with Node) will pick up the version pinned in
> `package.json`'s `packageManager` field.

> **Heads up**: from **phase 3** onwards (BLE pairing), the Expo Go app is no longer enough. You'll need a **Dev Client** build:
>
> ```bash
> pnpm expo run:ios       # one-time setup
> pnpm expo start --dev-client
> ```

---

## Project layout

```
hush-app/
├── app/                      # Expo Router screens, file-based routing
│   ├── _layout.tsx           # root layout
│   ├── index.tsx             # entry; redirects to auth or tabs
│   ├── (auth)/               # public group
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/               # authenticated tabs
│   │   ├── _layout.tsx
│   │   ├── devices.tsx
│   │   ├── audio.tsx
│   │   └── profile.tsx
│   └── pairing/              # BLE pairing flow
│       ├── scan.tsx
│       ├── wifi.tsx
│       └── confirm.tsx
├── components/               # shared UI components
├── lib/
│   ├── api/                  # generated OpenAPI TypeScript client
│   ├── auth/                 # token storage + refresh
│   └── ble/                  # Improv-WiFi wrapper over react-native-ble-plx
├── assets/                   # icon, splash, adaptive-icon
├── app.json                  # Expo config
├── babel.config.js           # NativeWind preset
├── metro.config.js           # NativeWind metro wrapper
├── tailwind.config.js
└── global.css                # NativeWind input
```

---

## OpenAPI client (shared with the dashboard)

Types are generated from [`hush-protocol/hush-api.yaml`](https://github.com/open-hush/hush-protocol):

```bash
pnpm gen:api
# writes lib/api/schema.ts
```

The Hush dashboard ([`hush-backend/dashboard`](https://github.com/open-hush/hush-backend)) consumes the **same** generator. Both clients track the same spec.

---

## Status

**Phase 0** — scaffolding only. Every screen is a stub. See [`PLAN.md`](./PLAN.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).
