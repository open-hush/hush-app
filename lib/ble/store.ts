import { create } from "zustand";

import type { DiscoveredDevice } from "./transport";
import type { ImprovConnection } from "./transport";

/**
 * Ephemeral state for a single pairing run, shared across the
 * `scan → wifi → confirm` screens. Nothing here is persisted: a pairing flow
 * that's interrupted should start over, not resume against a stale BLE handle.
 */
type PairingState = {
  /** Devices seen in the current scan, de-duped by id, newest signal kept. */
  discovered: DiscoveredDevice[];
  /** The device the user picked to pair. */
  selected: DiscoveredDevice | null;
  /** Live connection once `wifi` has connected; null before/after. */
  connection: ImprovConnection | null;
  /**
   * Wi-Fi credentials collected on the `wifi` screen, consumed once by
   * `confirm`. In memory only and wiped on {@link reset} — the password never
   * touches storage, logs, or route params.
   */
  credentials: { ssid: string; password: string } | null;
  /** Redirect URLs the device returned on success (usually empty today). */
  redirectUrls: string[];

  upsertDiscovered: (device: DiscoveredDevice) => void;
  clearDiscovered: () => void;
  select: (device: DiscoveredDevice) => void;
  setConnection: (connection: ImprovConnection | null) => void;
  setCredentials: (credentials: { ssid: string; password: string }) => void;
  setRedirectUrls: (urls: string[]) => void;
  /** Drop the live connection and wipe the flow (on cancel/finish/error). */
  reset: () => void;
};

export const usePairingStore = create<PairingState>((set, get) => ({
  discovered: [],
  selected: null,
  connection: null,
  credentials: null,
  redirectUrls: [],

  upsertDiscovered: (device) =>
    set((state) => {
      const next = state.discovered.filter((d) => d.id !== device.id);
      next.push(device);
      // Strongest signal first so the closest device is easiest to tap.
      next.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
      return { discovered: next };
    }),

  clearDiscovered: () => set({ discovered: [] }),

  select: (device) => set({ selected: device }),

  setConnection: (connection) => set({ connection }),

  setCredentials: (credentials) => set({ credentials }),

  setRedirectUrls: (urls) => set({ redirectUrls: urls }),

  reset: () => {
    void get().connection?.disconnect();
    set({
      discovered: [],
      selected: null,
      connection: null,
      credentials: null,
      redirectUrls: [],
    });
  },
}));
