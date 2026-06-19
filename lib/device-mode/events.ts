import { AppState, AppStateStatus } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { useDeviceModeStore } from "@/lib/device-mode/store";
import type {
  DeviceEventCardScanned,
  DeviceEventCardUnknown,
  DeviceEventPlaybackFinished,
  DeviceEventPlaybackStarted,
} from "@/lib/device-mode/types";

type SupportedDeviceEvent =
  | DeviceEventCardScanned
  | DeviceEventCardUnknown
  | DeviceEventPlaybackStarted
  | DeviceEventPlaybackFinished;

type QueuedEvent = SupportedDeviceEvent;

const FLUSH_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

function generateEventId(): string {
  return crypto.randomUUID();
}

function generateTimestamp(): string {
  return new Date().toISOString();
}

function buildCardScannedEvent(uid: string): DeviceEventCardScanned {
  return {
    type: "card_scanned",
    payload: { uid },
    eventId: generateEventId(),
    ts: generateTimestamp(),
  };
}

function buildCardUnknownEvent(uid: string): DeviceEventCardUnknown {
  return {
    type: "card_unknown",
    payload: { uid },
    eventId: generateEventId(),
    ts: generateTimestamp(),
  };
}

function buildPlaybackStartedEvent(audioId: string): DeviceEventPlaybackStarted {
  return {
    type: "playback_started",
    payload: { audioId },
    eventId: generateEventId(),
    ts: generateTimestamp(),
  };
}

function buildPlaybackFinishedEvent(
  audioId: string,
  reason: "completed" | "interrupted" | "error",
  positionMs?: number,
): DeviceEventPlaybackFinished {
  return {
    type: "playback_finished",
    payload: { audioId, reason, positionMs },
    eventId: generateEventId(),
    ts: generateTimestamp(),
  };
}

export function useDeviceEvents() {
  const activeDeviceId = useDeviceModeStore((s) => s.activeDeviceId);
  const clearActiveDevice = useDeviceModeStore((s) => s.clearActiveDevice);

  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushingRef = useRef(false);
  const retryCountRef = useRef(0);

  const flush = useCallback(async () => {
    if (isFlushingRef.current || queue.length === 0 || !activeDeviceId) {
      return;
    }

    isFlushingRef.current = true;
    const eventsToSend = [...queue];

    try {
      await api.post<unknown>(
        `/v1/device/events?device_id=${activeDeviceId}`,
        { events: eventsToSend },
      );
      setQueue((prev) => prev.slice(eventsToSend.length));
      retryCountRef.current = 0;
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const status = (error as { status: number }).status;
        if (status === 401 || status === 403) {
          clearActiveDevice();
          setQueue([]);
          retryCountRef.current = 0;
          return;
        }
      }

      retryCountRef.current += 1;
      if (retryCountRef.current <= MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * 2 ** (retryCountRef.current - 1);
        flushTimeoutRef.current = setTimeout(flush, delay);
      } else {
        retryCountRef.current = 0;
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, [activeDeviceId, clearActiveDevice, queue]);

  useEffect(() => {
    if (queue.length > 0 && activeDeviceId) {
      flushTimeoutRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, [queue, activeDeviceId, flush]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        flush();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [flush]);

  const reportEvent = useCallback((event: QueuedEvent) => {
    setQueue((prev) => [...prev, event]);
  }, []);

  const reportCardScanned = useCallback(
    (uid: string) => {
      reportEvent(buildCardScannedEvent(uid));
    },
    [reportEvent],
  );

  const reportCardUnknown = useCallback(
    (uid: string) => {
      reportEvent(buildCardUnknownEvent(uid));
    },
    [reportEvent],
  );

  const reportPlaybackStarted = useCallback(
    (audioId: string) => {
      reportEvent(buildPlaybackStartedEvent(audioId));
    },
    [reportEvent],
  );

  const reportPlaybackFinished = useCallback(
    (
      audioId: string,
      reason: "completed" | "interrupted" | "error",
      positionMs?: number,
    ) => {
      reportEvent(buildPlaybackFinishedEvent(audioId, reason, positionMs));
    },
    [reportEvent],
  );

  return {
    reportEvent,
    reportCardScanned,
    reportCardUnknown,
    reportPlaybackStarted,
    reportPlaybackFinished,
    queueLength: queue.length,
    flush,
  };
}