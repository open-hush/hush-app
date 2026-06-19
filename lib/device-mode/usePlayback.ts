import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { audioPlayer, type PlaybackEvent } from "./audio";
import { useDeviceEvents } from "./events";
import { useDeviceModeStore } from "./store";
import { useDeviceSync } from "./useDeviceSync";

/**
 * Outcome of a card tap. Lets the scan UI (OPE-41) decide what to show without
 * reaching into playback internals.
 */
export type PlayCardResult =
  | "playing"
  | "unknown_card"
  | "audio_missing"
  | "url_expired"
  | "error";

/**
 * Refetch and wait up to this long for a fresh sync when the presigned URL for
 * a tapped card has already expired.
 */
const FRESH_SYNC_TIMEOUT_MS = 5_000;

type Playable = { audioId: string; downloadUrl: string };

/**
 * Resolve a card `uid` to its current audio + presigned URL from the freshest
 * sync payload in the store. Reading the store directly (rather than a
 * render-time map) guarantees we use the latest URL after a background refetch.
 */
function resolvePlayable(
  uid: string,
): { audioId: string; playable: Playable | null; expiresAt: string | null } {
  const sync = useDeviceModeStore.getState().syncData;
  const audioId = sync?.cards.find((card) => card.uid === uid)?.audioId ?? null;
  if (!sync || !audioId) {
    return { audioId: "", playable: null, expiresAt: null };
  }
  const entry = sync.audio.find((a) => a.id === audioId) ?? null;
  if (!entry) {
    return { audioId, playable: null, expiresAt: null };
  }
  return {
    audioId,
    playable: { audioId, downloadUrl: entry.downloadUrl },
    expiresAt: entry.expiresAt,
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const at = Date.parse(expiresAt);
  return !Number.isNaN(at) && at <= Date.now();
}

/**
 * Resolve once the store's sync payload changes (a refetch landed), or after
 * `timeoutMs`. Used to wait for a fresh presigned URL before playing.
 */
function waitForFreshSync(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const initial = useDeviceModeStore.getState().syncData;
    const finish = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const unsubscribe = useDeviceModeStore.subscribe((state) => {
      if (state.syncData !== initial) {
        finish();
      }
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/**
 * Device-mode playback orchestrator. Wires the single-track {@link audioPlayer}
 * to the synced card/audio data ({@link useDeviceSync}) and the event reporting
 * queue ({@link useDeviceEvents}).
 *
 * Responsibilities:
 * - `playCard(uid)`: look the card up in the latest sync, refetch first if its
 *   presigned URL has expired, then start playback.
 * - Bridge `playback_started` / `playback_finished` from the player to
 *   `reportPlaybackStarted` / `reportPlaybackFinished`.
 * - Pause on background and resume on foreground.
 *
 * Mount this once where device-mode playback is active (the scan screen,
 * OPE-41). Exposes the current track and playing state for the UI.
 */
export function usePlayback() {
  const { config, refetch } = useDeviceSync();
  const { reportPlaybackStarted, reportPlaybackFinished } = useDeviceEvents();

  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Latest config volume ceiling, read at play time without re-binding playCard.
  const volumeMaxRef = useRef<number | undefined>(config?.volumeMax);
  volumeMaxRef.current = config?.volumeMax;

  // Whether a track was playing when we backgrounded, so foreground can resume it.
  const resumeOnForegroundRef = useRef(false);

  // Bridge player events → backend event reporting + local UI state.
  useEffect(() => {
    const listener = (event: PlaybackEvent) => {
      if (event.type === "playback_started") {
        setCurrentAudioId(event.audioId);
        setIsPlaying(true);
        reportPlaybackStarted(event.audioId);
        return;
      }
      // playback_finished
      setCurrentAudioId((prev) => (prev === event.audioId ? null : prev));
      setIsPlaying(false);
      reportPlaybackFinished(event.audioId, event.reason, event.positionMs);
    };
    audioPlayer.setListener(listener);
    return () => audioPlayer.setListener(null);
  }, [reportPlaybackStarted, reportPlaybackFinished]);

  // Pause on background, resume on return to foreground.
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        if (audioPlayer.activeAudioId) {
          resumeOnForegroundRef.current = true;
          void audioPlayer.pause();
          setIsPlaying(false);
        }
        return;
      }
      if (next === "active" && resumeOnForegroundRef.current) {
        resumeOnForegroundRef.current = false;
        if (audioPlayer.activeAudioId) {
          void audioPlayer.resume();
          setIsPlaying(true);
        }
      }
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);

  const playCard = useCallback(
    async (uid: string): Promise<PlayCardResult> => {
      let { audioId, playable, expiresAt } = resolvePlayable(uid);

      if (!audioId) {
        return "unknown_card";
      }
      if (!playable) {
        return "audio_missing";
      }

      // Presigned URL already dead: pull a fresh sync, then re-resolve.
      if (isExpired(expiresAt)) {
        refetch();
        await waitForFreshSync(FRESH_SYNC_TIMEOUT_MS);
        ({ audioId, playable, expiresAt } = resolvePlayable(uid));
        if (!playable) {
          return audioId ? "audio_missing" : "unknown_card";
        }
        if (isExpired(expiresAt)) {
          return "url_expired";
        }
      }

      try {
        await audioPlayer.play(playable.audioId, playable.downloadUrl, {
          volumeMax: volumeMaxRef.current,
        });
        return "playing";
      } catch {
        // The player already emitted a `playback_finished` with reason "error".
        return "error";
      }
    },
    [refetch],
  );

  const stop = useCallback(() => audioPlayer.stop(), []);
  const pause = useCallback(() => audioPlayer.pause(), []);
  const resume = useCallback(() => audioPlayer.resume(), []);

  return {
    /** Play the track bound to a scanned card UID. */
    playCard,
    /** Stop the current track (reported as interrupted). */
    stop,
    /** Pause without unloading. */
    pause,
    /** Resume a paused track. */
    resume,
    /** UUID of the track currently playing, or `null`. */
    currentAudioId,
    /** True while a track is audibly playing (false while paused/idle). */
    isPlaying,
  };
}
