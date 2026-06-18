import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { ApiError, apiRequest } from "@/lib/api/client";

import { useDeviceModeStore } from "./store";
import type {
  AudioSyncEntry,
  CardBinding,
  DeviceConfig,
  DeviceSyncResponse,
} from "./types";

const SYNC_PATH = "/v1/device/sync";

/**
 * Refetch this many ms before the soonest presigned URL expires so playback
 * never reaches for a dead `downloadUrl`. Only kicks in when an expiry lands
 * before the next regular poll tick.
 */
const URL_EXPIRY_SAFETY_MS = 60_000;

/** The subset of an audio entry needed to fetch and verify a track. */
export type AudioRef = Pick<AudioSyncEntry, "downloadUrl" | "expiresAt" | "sha256">;

export type UseDeviceSyncResult = {
  /** Raw sync payload, or `undefined` until the first successful fetch. */
  data: DeviceSyncResponse | undefined;
  /** Device configuration (sleep timers, volume ceiling…). */
  config: DeviceConfig | undefined;
  /** Raw card bindings as returned by the server. */
  cards: CardBinding[];
  /** Raw audio manifest as returned by the server. */
  audio: AudioSyncEntry[];
  /** `uid → audioId` for O(1) card lookup on scan. */
  cardsByUid: Map<string, string>;
  /** `audioId → { downloadUrl, expiresAt, sha256 }` for O(1) playback lookup. */
  audioById: Map<string, AudioRef>;
  /** True only while the very first fetch for the active device is in flight. */
  isLoading: boolean;
  /** Last query error, or `null`. `ApiError` carries the spec `code`/`status`. */
  error: Error | null;
  /** ISO-8601 time of the last successful sync check (200 or 304), or `null`. */
  lastSyncedAt: string | null;
  /** Force an immediate sync, e.g. for pull-to-refresh. */
  refetch: () => void;
};

/**
 * Build the lookup maps from a sync payload. Card scans resolve a `uid` to an
 * `audioId` in one step, and playback resolves that `audioId` to its presigned
 * URL — both O(1) instead of scanning the arrays on every tap.
 */
function buildSyncIndex(data: DeviceSyncResponse | undefined): {
  cardsByUid: Map<string, string>;
  audioById: Map<string, AudioRef>;
} {
  const cardsByUid = new Map<string, string>();
  const audioById = new Map<string, AudioRef>();
  if (!data) {
    return { cardsByUid, audioById };
  }
  for (const card of data.cards) {
    cardsByUid.set(card.uid, card.audioId);
  }
  for (const entry of data.audio) {
    audioById.set(entry.id, {
      downloadUrl: entry.downloadUrl,
      expiresAt: entry.expiresAt,
      sha256: entry.sha256,
    });
  }
  return { cardsByUid, audioById };
}

/**
 * Run one sync request as the active device.
 *
 * - Sends `since` (the last server `serverTime`) for an incremental diff;
 *   omitting it asks for a full snapshot.
 * - **200**: writes the fresh payload to the store and returns it.
 * - **304**: nothing changed — returns the cached payload untouched. We don't
 *   send conditional headers, so the server's literal 304 surfaces as an
 *   `ApiError` from the client rather than being absorbed by the HTTP cache.
 * - **401/403**: the session expired or the user no longer owns this device —
 *   drop out of device mode, then rethrow so the error is visible.
 */
async function fetchSync(
  deviceId: string,
  signal: AbortSignal,
): Promise<DeviceSyncResponse | null> {
  const { lastSyncAt, setSyncData, clearActiveDevice } =
    useDeviceModeStore.getState();

  const params = new URLSearchParams({ device_id: deviceId });
  if (lastSyncAt) {
    params.set("since", lastSyncAt);
  }

  try {
    const data = await apiRequest<DeviceSyncResponse>(
      `${SYNC_PATH}?${params.toString()}`,
      { method: "GET", signal },
    );
    setSyncData(data);
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 304) {
        // Incremental no-op: keep whatever we already have cached.
        return useDeviceModeStore.getState().syncData;
      }
      if (error.status === 401 || error.status === 403) {
        clearActiveDevice();
      }
    }
    throw error;
  }
}

/**
 * TanStack Query wrapper around `GET /v1/device/sync` for the device the app is
 * currently impersonating.
 *
 * Fetches on mount and whenever the active device changes, polls on the store's
 * configured interval, refetches when the app returns to the foreground, and
 * exposes a manual `refetch()`. The payload is also transformed into lookup
 * maps for card→audio resolution.
 */
export function useDeviceSync(): UseDeviceSyncResult {
  const activeDeviceId = useDeviceModeStore((s) => s.activeDeviceId);
  const pollIntervalMs = useDeviceModeStore((s) => s.pollIntervalMs);
  const hydrated = useDeviceModeStore((s) => s.hydrated);
  const storeLastSyncAt = useDeviceModeStore((s) => s.lastSyncAt);

  const query = useQuery({
    // The device id keys the query; `since` is read fresh from the store inside
    // the queryFn so the watermark advancing doesn't churn the cache key.
    queryKey: ["device-sync", activeDeviceId],
    queryFn: ({ signal }) => fetchSync(activeDeviceId as string, signal),
    enabled: hydrated && Boolean(activeDeviceId),
    refetchInterval: pollIntervalMs,
    // Polling stops while backgrounded; the AppState listener below covers the
    // return to foreground with a single immediate refetch.
    refetchIntervalInBackground: false,
  });

  const { refetch } = query;
  const data = query.data ?? undefined;

  const triggerRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Refetch on foreground — the React Native equivalent of refetch-on-focus.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          void refetch();
        }
      },
    );
    return () => subscription.remove();
  }, [refetch]);

  // Presigned URLs expire; if the soonest expiry lands before the next poll,
  // schedule an earlier refetch so a card tap never hits a dead link.
  useEffect(() => {
    if (!data || data.audio.length === 0) {
      return;
    }
    const soonestExpiry = data.audio.reduce((min, entry) => {
      const at = Date.parse(entry.expiresAt);
      return Number.isNaN(at) ? min : Math.min(min, at);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(soonestExpiry)) {
      return;
    }
    const fireIn = soonestExpiry - URL_EXPIRY_SAFETY_MS - Date.now();
    // Already inside the safety window, or expiry is past the next poll tick:
    // the regular interval refetch will handle it.
    if (fireIn <= 0 || fireIn >= pollIntervalMs) {
      return;
    }
    const timer = setTimeout(() => void refetch(), fireIn);
    return () => clearTimeout(timer);
  }, [data, pollIntervalMs, refetch]);

  const { cardsByUid, audioById } = useMemo(() => buildSyncIndex(data), [data]);

  // `dataUpdatedAt` advances on every successful resolve, including a 304 that
  // returns cache — exactly the "we confirmed sync at T" semantics we want.
  const lastSyncedAt = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toISOString()
    : storeLastSyncAt;

  return {
    data,
    config: data?.config,
    cards: data?.cards ?? [],
    audio: data?.audio ?? [],
    cardsByUid,
    audioById,
    isLoading: query.isLoading,
    error: query.error,
    lastSyncedAt,
    refetch: triggerRefetch,
  };
}
