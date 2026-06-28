# `hush-app` — plan

This is the mobile app for the Hush ecosystem: pair devices over BLE, manage the audio library, bind RFID cards.

## Stack

Expo (React Native + TypeScript).

| Concern | Choice |
|---|---|
| Framework | Expo SDK 52, Managed workflow → Dev Client in phase 3 |
| Lang | TypeScript (strict) |
| Routing | Expo Router (file-based) |
| Styles | NativeWind (Tailwind for RN) |
| Server state | Tanstack Query |
| Client state | Zustand |
| Forms | react-hook-form + Zod |
| Storage | `expo-secure-store` (tokens), `expo-file-system` if needed |
| BLE | `react-native-ble-plx` (phase 3) |
| Push | Expo Notifications (phase 5) |
| Distribution | EAS Build (preview + production) |

---

## Phase 1 — Navigable shell (~1 week)

Acceptance: `pnpm expo start` boots the app, every screen renders its placeholder, navigation between routes works.

- [x] Project scaffolded with Expo SDK 52.
- [x] Expo Router file-based routes for `(auth)`, `(tabs)`, `pairing/`.
- [x] NativeWind set up with `babel.config.js` + `metro.config.js`.
- [x] TypeScript strict, paths alias `@/*` → repo root.
- [ ] EAS project configured (`eas init`); preview + production profiles in `eas.json`.
- [ ] App icon, splash and adaptive icon designed (placeholders today).
- [ ] `pnpm dlx expo-doctor` clean.

## Phase 2 — Auth and device management (~2 weeks)

Acceptance: a user can register, log in, see their list of devices, see audio library and profile.

- [x] OpenAPI TypeScript client generated from `hush-protocol/hush-api.yaml`.
- [x] Tanstack Query setup with custom fetch wrapper that adds the Bearer token.
- [x] `expo-secure-store` for access + refresh tokens; auto-refresh on 401.
- [x] Login screen with `react-hook-form` + Zod validation. **No Register screen:**
      the spec makes account creation admin-only (`POST /v1/users/register`,
      "no public self-registration") and the codebase already removed it
      (`feat/remove-public-registration`). Admin user-creation belongs in the
      dashboard, not the mobile app.
- [x] Devices list (`GET /v1/devices`), Audio list (`GET /v1/audio`), Profile (`GET /v1/users/me`).
- [x] Logout clears storage and routes back to login.

## Phase 3 — BLE Improv WiFi pairing (~2-3 weeks)

Acceptance: a user can take an unconfigured device out of the box, pair it via BLE, send WiFi credentials, and see the device come online in the dashboard.

- [x] Dev Client deps + config: `react-native-ble-plx` plugin in `app.json`
      (`pnpm expo run:ios` / `run:android` not yet exercised — no native build
      environment in the implementing session; needs a bench/device pass).
- [x] iOS Bluetooth permission strings (`app.json`).
- [x] Android permissions: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`,
      `ACCESS_FINE_LOCATION`, requested at runtime per API level
      (`lib/ble/permissions.ts`).
- [x] BLE scan filter on Improv WiFi service UUID (`lib/ble/transport.ts`).
- [x] Improv WiFi protocol + client state machine in `lib/ble/improv.ts`,
      byte-for-byte against `hush-device/src/proto/improv.rs`. Host-tested
      (`lib/ble/improv.test.ts`, `lib/ble/base64.test.ts` — 41 cases).
- [x] Pairing flow screens:
  1. `pairing/scan.tsx` — list nearby Hush devices in pairing mode.
  2. `pairing/wifi.tsx` — connect over BLE + collect SSID + password.
  3. `pairing/confirm.tsx` — send credentials, wait for Improv `Provisioned`,
     then claim.
- [ ] **OPEN DECISION (blocks claim):** after pairing the app has no source for
      the device UUID that `POST /v1/devices/{id}/claim` requires. The current
      firmware sends an empty Improv result (`hush-device/src/tasks/ble.rs`) and
      there is no serial/claimCode → UUID lookup in `hush-protocol`. `confirm.tsx`
      reads `deviceId`/`claimCode` from a redirect URL if present (the standard
      Improv mechanism) and otherwise gates the claim. Resolve with the PO:
      (a) firmware returns a redirect URL carrying the deviceId, with its shape
      pinned in `hush-protocol`, or (b) add a claim-by-code endpoint
      (`POST /v1/devices/claim` with just `claimCode`). Recommendation: (b).
- [ ] Bench/device pass: native build + real-firmware BLE validation across
      iOS versions and Android API 30/31/33.

## Phase 4 — Card assignment (~1-2 weeks)

Acceptance: a user can scan an unknown RFID UID seen by their device and bind it to an audio item.

- [ ] Subscribe to `device_events` (poll for now; SSE / push later).
- [ ] Surface `card_unknown` events in a "to-bind" list.
- [ ] Binding flow: tap unknown card → pick an audio item → `POST /v1/devices/{id}/cards`.
- [ ] Unbinding from the device detail screen.

## Phase 5 — Push, polish, stores (~2 weeks)

Acceptance: signed builds in the App Store and Play Store, with push notifications working.

- [ ] Expo Notifications setup; register device token in the backend.
- [ ] Notification categories: device offline > 24 h, audio ready after transcoding, new card seen.
- [ ] App icon + splash final designs.
- [ ] App Store + Play Store metadata, screenshots, privacy policy.
- [ ] EAS Submit configured.

---

## Decisions taken

- **Expo Managed** initially; **Dev Client** from phase 3 (BLE).
- **TypeScript strict**. No `any` without a `// eslint-disable-line` plus a comment justifying it.
- **NativeWind** for styles. No StyleSheet unless we hit a real NativeWind limitation.
- **Expo Router**, file-based.
- **Tanstack Query** for all server state.
- **OpenAPI client** generated, not hand-written.
- **Tokens** in `expo-secure-store`. The access token is read in memory; the refresh token never leaves SecureStore.

## Decisions open

- **EAS Update**: do we ship OTA JS updates via EAS Update, or only do full store releases? Lean: EAS Update for bug fixes, store releases for feature changes.
- **Design system**: stick with NativeWind primitives (cheap, accessible) or invest in a component library (e.g. tamagui, gluestack)? Lean: primitives now, revisit if the dashboard's shadcn pattern shows large UX gaps.
- **Push provider**: Expo Notifications wraps FCM + APNs. Stick with Expo, or talk directly to FCM/APNs for finer control? Lean: stay with Expo until a concrete blocker appears.
- **Language strategy**: ship English-only at first, add ES once we have non-test users? Lean: yes.

---

## Cross-repo touch points

- **`hush-protocol`**: every spec change requires `pnpm gen:api`. CI will gate this.
- **`hush-backend`**: same auth model as the dashboard (JWT + refresh), same endpoints.
- **`hush-device`**: BLE Improv WiFi service UUIDs and characteristic shapes (phase 3) must match the firmware exactly.

---

## Risks

- **BLE on iOS** has historically been brittle for third-party libraries. Allow time in phase 3 to validate against at least 3 iOS versions.
- **Android BLE permissions** change between API levels 30 / 31 / 33. Test on at least one device per level.
- **App Store review**: Bluetooth usage requires very clear `Info.plist` strings. Already drafted in `app.json`.
