import type { components } from "@/lib/api/schema";

// Device-mode types are re-exported from the OpenAPI-generated schema so they
// stay in lockstep with the contract in hush-protocol. Never hand-edit the wire
// shapes here — change the spec and run `pnpm gen:api`. The aliases below exist
// purely for ergonomics (shorter import paths, a single device-mode surface).

/** Device configuration the firmware honours (sleep timers, volume ceiling…). */
export type DeviceConfig = components["schemas"]["DeviceConfig"];

/** A card UID bound to an audio track. */
export type CardBinding = components["schemas"]["CardBinding"];

/** One audio track in a sync payload, with its presigned download URL. */
export type AudioSyncEntry = components["schemas"]["AudioSyncEntry"];

/** Full sync payload returned by `GET /v1/device/sync?device_id=...`. */
export type DeviceSyncResponse = components["schemas"]["DeviceSyncResponse"];

// --- Events --------------------------------------------------------------

/** The discriminated union of every event the app can report while acting as a device. */
export type DeviceEvent = components["schemas"]["DeviceEvent"];

/** Card placed on the reader. */
export type DeviceEventCardScanned = components["schemas"]["DeviceEventCardScanned"];

/** Playback of a bound track began. */
export type DeviceEventPlaybackStarted = components["schemas"]["DeviceEventPlaybackStarted"];

/** Playback ended (completed, interrupted, or errored). */
export type DeviceEventPlaybackFinished = components["schemas"]["DeviceEventPlaybackFinished"];

/** Discriminator literal of a `DeviceEvent`, e.g. `"card_scanned"`. */
export type DeviceEventType = DeviceEvent["type"];

// --- App-local types ------------------------------------------------------

/**
 * The device the app is currently impersonating. A trimmed projection of the
 * full `Device` schema — only what the device-mode UI needs to render and
 * address sync/event calls.
 */
export type ActiveDevice = {
  /** Device UUID. */
  id: string;
  /** Per-unit serial printed on the device. */
  serial: string;
  /** User-chosen device name, when set. */
  name?: string;
};
