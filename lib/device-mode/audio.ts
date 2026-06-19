import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
  type AVPlaybackStatus,
} from "expo-av";

/**
 * Why a `playback_finished` ended. Mirrors the `reason` enum of the
 * `DeviceEventPlaybackFinished` wire schema so the value flows straight to the
 * backend without translation.
 */
export type PlaybackFinishedReason = "completed" | "interrupted" | "error";

/**
 * A playback lifecycle transition emitted by the {@link AudioPlayer}. The hook
 * that owns the player maps each of these onto a backend device event.
 *
 * - `playback_started` fires once per track, the first time it is actually
 *   audible (status reports `isPlaying`).
 * - `playback_finished` fires exactly once per track that started, carrying the
 *   position at which it stopped (useful when `reason === "interrupted"`).
 */
export type PlaybackEvent =
  | { type: "playback_started"; audioId: string }
  | {
      type: "playback_finished";
      audioId: string;
      reason: PlaybackFinishedReason;
      positionMs: number;
    };

export type PlaybackEventListener = (event: PlaybackEvent) => void;

/** How often expo-av reports status while a track plays. */
const PROGRESS_UPDATE_INTERVAL_MS = 500;

/**
 * `volumeMax` is an integer 0–100 (the device's hard volume ceiling, per
 * `DeviceConfig`); expo-av's `volume` is a 0.0–1.0 float. Map and clamp. A
 * missing value means "no ceiling" → full volume.
 */
function resolveVolume(volumeMax?: number): number {
  if (typeof volumeMax !== "number" || Number.isNaN(volumeMax)) {
    return 1.0;
  }
  return Math.min(1, Math.max(0, volumeMax / 100));
}

/**
 * Single-track audio playback for device mode.
 *
 * The app, while impersonating a Hush device, plays exactly one track at a
 * time. This manager wraps a single `Audio.Sound` and serialises playback:
 * starting a new track tears down the previous one (reported as
 * `interrupted`). It is intentionally framework-agnostic — React wiring
 * (AppState pause/resume, event reporting) lives in `usePlayback`, which
 * registers a single {@link PlaybackEventListener}.
 *
 * Use the shared {@link audioPlayer} singleton; one player per app process.
 */
export class AudioPlayer {
  private sound: Audio.Sound | null = null;
  private currentAudioId: string | null = null;
  /** Guards `playback_started` so it is emitted at most once per track. */
  private startedEmitted = false;
  private listener: PlaybackEventListener | null = null;
  private audioModeReady = false;

  /**
   * Register the single sink for playback events, or `null` to detach. Last
   * caller wins — there is only ever one player and one consumer (the hook).
   */
  setListener(listener: PlaybackEventListener | null): void {
    this.listener = listener;
  }

  /** UUID of the track currently loaded, or `null` when idle. */
  get activeAudioId(): string | null {
    return this.currentAudioId;
  }

  /**
   * Load `downloadUrl` and start playing it. Any track already playing is
   * stopped first and reported as `interrupted`. Resolves once playback has
   * been told to start; the audible `playback_started` event is emitted from
   * the status callback.
   *
   * Throws if the sound fails to load (e.g. an expired/dead presigned URL or a
   * network error); in that case a `playback_finished` with `reason: "error"`
   * is emitted before the throw so the backend still sees the attempt.
   */
  async play(
    audioId: string,
    downloadUrl: string,
    opts?: { volumeMax?: number },
  ): Promise<void> {
    await this.ensureAudioMode();

    // Interrupt whatever is playing before loading the new track.
    if (this.sound) {
      await this.teardown("interrupted");
    }

    const volume = resolveVolume(opts?.volumeMax);

    try {
      // Create paused so `currentAudioId` is set before the status callback can
      // fire — otherwise an early `isPlaying` tick would have no id to attach.
      const { sound } = await Audio.Sound.createAsync(
        { uri: downloadUrl },
        {
          shouldPlay: false,
          rate: 1.0,
          volume,
          progressUpdateIntervalMillis: PROGRESS_UPDATE_INTERVAL_MS,
        },
      );
      this.sound = sound;
      this.currentAudioId = audioId;
      this.startedEmitted = false;
      sound.setOnPlaybackStatusUpdate(this.handleStatus);
      await sound.playAsync();
    } catch (error) {
      // Load/start failed: surface it as an error finish, then rethrow so the
      // caller can react (e.g. refetch a fresh URL and retry).
      this.sound = null;
      this.currentAudioId = null;
      this.startedEmitted = false;
      this.emit({ type: "playback_finished", audioId, reason: "error", positionMs: 0 });
      throw error;
    }
  }

  /** Stop and unload the current track, reported as `interrupted`. No-op when idle. */
  async stop(): Promise<void> {
    if (!this.sound) {
      return;
    }
    await this.teardown("interrupted");
  }

  /** Pause the current track without unloading it. No-op when idle. */
  async pause(): Promise<void> {
    if (!this.sound) {
      return;
    }
    try {
      await this.sound.pauseAsync();
    } catch {
      // A pause that races a teardown is harmless.
    }
  }

  /** Resume a paused track. No-op when idle. */
  async resume(): Promise<void> {
    if (!this.sound) {
      return;
    }
    try {
      await this.sound.playAsync();
    } catch {
      // A resume that races a teardown is harmless.
    }
  }

  /** Current expo-av status, or `null` when nothing is loaded. */
  async getStatus(): Promise<AVPlaybackStatus | null> {
    if (!this.sound) {
      return null;
    }
    return this.sound.getStatusAsync();
  }

  private handleStatus = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) {
      // `error` is only present on the unloaded variant when load/playback fails.
      if (status.error) {
        void this.teardown("error");
      }
      return;
    }
    if (status.isPlaying && !this.startedEmitted && this.currentAudioId) {
      this.startedEmitted = true;
      this.emit({ type: "playback_started", audioId: this.currentAudioId });
    }
    if (status.didJustFinish && !status.isLooping) {
      void this.teardown("completed", status.positionMillis);
    }
  };

  /**
   * Unload the current sound and emit a single `playback_finished`. The id and
   * sound are cleared up front so a concurrent status callback or a fresh
   * `play()` cannot double-emit. A track that never became audible is torn down
   * silently (no spurious finish for something that never started), except for
   * the `error`/`completed` reasons which always report.
   */
  private async teardown(
    reason: PlaybackFinishedReason,
    finishedPositionMs?: number,
  ): Promise<void> {
    const sound = this.sound;
    const audioId = this.currentAudioId;
    const wasStarted = this.startedEmitted;
    this.sound = null;
    this.currentAudioId = null;
    this.startedEmitted = false;

    if (!sound || !audioId) {
      return;
    }

    let positionMs = finishedPositionMs ?? 0;
    if (finishedPositionMs === undefined) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          positionMs = status.positionMillis ?? 0;
        }
      } catch {
        // Fall back to 0 if the status read fails during teardown.
      }
    }

    sound.setOnPlaybackStatusUpdate(null);
    try {
      await sound.unloadAsync();
    } catch {
      // Already unloaded or never fully loaded — nothing to clean up.
    }

    // Only report finishes for tracks that actually played, or hard outcomes
    // (completed / error) that the backend should always see.
    if (wasStarted || reason === "completed" || reason === "error") {
      this.emit({ type: "playback_finished", audioId, reason, positionMs });
    }
  }

  private emit(event: PlaybackEvent): void {
    this.listener?.(event);
  }

  /**
   * Configure the audio session once: play through the speaker even with the
   * iOS mute switch on, do not keep playing in the background (device mode
   * pauses on background), and don't mix with other apps.
   */
  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeReady) {
      return;
    }
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    this.audioModeReady = true;
  }
}

/** Process-wide single-track player for device mode. */
export const audioPlayer = new AudioPlayer();
