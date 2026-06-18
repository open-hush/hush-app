import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ActiveDevice, DeviceSyncResponse } from "./types";

/** Default polling cadence for device sync, in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

const STORAGE_KEY = "hush.device-mode";

type DeviceModeState = {
  /**
   * UUID of the device the app is acting as. This is the source of truth and
   * the only piece of device identity we persist — `activeDevice` is a cache
   * that gets refilled from the server after a restart.
   */
  activeDeviceId: string | null;
  /** Cached device info for rendering. Not persisted; refetched on startup. */
  activeDevice: ActiveDevice | null;
  /** Last successful sync payload. In memory only — refetched on startup. */
  syncData: DeviceSyncResponse | null;
  /** ISO-8601 timestamp of the last successful sync. In memory only. */
  lastSyncAt: string | null;
  /** Polling cadence for device sync, in milliseconds. Persisted. */
  pollIntervalMs: number;
  /** True once the persisted slice has been read back from AsyncStorage. */
  hydrated: boolean;

  setActiveDevice: (device: ActiveDevice) => void;
  clearActiveDevice: () => void;
  setSyncData: (data: DeviceSyncResponse) => void;
  setPollInterval: (ms: number) => void;
};

export const useDeviceModeStore = create<DeviceModeState>()(
  persist(
    (set) => ({
      activeDeviceId: null,
      activeDevice: null,
      syncData: null,
      lastSyncAt: null,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      hydrated: false,

      setActiveDevice: (device) =>
        set({ activeDeviceId: device.id, activeDevice: device }),

      // Leaving device mode wipes both the identity and any synced state so the
      // next device starts from a clean slate.
      clearActiveDevice: () =>
        set({
          activeDeviceId: null,
          activeDevice: null,
          syncData: null,
          lastSyncAt: null,
        }),

      setSyncData: (data) =>
        set({ syncData: data, lastSyncAt: data.serverTime }),

      setPollInterval: (ms) => set({ pollIntervalMs: ms }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the durable identity and the user's polling preference.
      // Sync data and the cached device are intentionally refetched on launch.
      partialize: (state) => ({
        activeDeviceId: state.activeDeviceId,
        pollIntervalMs: state.pollIntervalMs,
      }),
      // Flag readiness once the async read resolves so callers can gate the
      // first render on a known device-mode state.
      onRehydrateStorage: () => () => {
        useDeviceModeStore.setState({ hydrated: true });
      },
    },
  ),
);
