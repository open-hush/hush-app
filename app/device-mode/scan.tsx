import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import { useAudioList } from "@/lib/api/audio";
import {
  audioPlayer,
  useDeviceEvents,
  useDeviceModeStore,
  useDeviceSync,
  usePlayback,
  type PlayCardResult,
} from "@/lib/device-mode";

/**
 * UID contract from the spec: RFID UID, lowercase hex, no separators. The input
 * is normalised to lowercase as the user types, so validation only has to reject
 * non-hex characters and out-of-range lengths.
 */
const UID_REGEX = /^[0-9a-f]{8,20}$/;

const scanSchema = z.object({
  uid: z
    .string()
    .regex(UID_REGEX, "Enter 8–20 lowercase hex characters (0–9, a–f)."),
});

type ScanForm = z.infer<typeof scanSchema>;

/** How often we poll the player for the progress/playing state shown in the UI. */
const PROGRESS_POLL_MS = 500;

type FeedbackTone = "info" | "success" | "warning" | "error";
type Feedback = { tone: FeedbackTone; message: string };

type PlaybackStatus = {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
};

const TONE_STYLES: Record<FeedbackTone, string> = {
  info: "border-neutral-200 bg-neutral-50",
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  error: "border-red-200 bg-red-50",
};

const TONE_TEXT: Record<FeedbackTone, string> = {
  info: "text-neutral-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  error: "text-red-700",
};

/** `123456` → `2:03`. Guards against NaN/negatives from a not-yet-loaded track. */
function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Card scan screen for device mode. Simulates an RFID tap by entering a UID,
 * resolves it against the synced card bindings, plays the bound audio, and
 * reports the scan to the backend.
 *
 * Wiring:
 * - {@link useDeviceSync} — `uid → audioId` map, plus load/error state.
 * - {@link usePlayback} — resolves the presigned URL and drives the player.
 * - {@link useDeviceEvents} — reports `card_scanned` / `card_unknown`.
 * - {@link useAudioList} — labels a bound card with its human title (the sync
 *   payload deliberately omits titles).
 *
 * Real NFC reading is out of scope (see OPE-41); the layout leaves room for a
 * "Tap a card" affordance to sit above the manual entry once that lands.
 */
export default function CardScanScreen() {
  const activeDeviceId = useDeviceModeStore((s) => s.activeDeviceId);
  const activeDevice = useDeviceModeStore((s) => s.activeDevice);

  const {
    cardsByUid,
    isLoading: syncLoading,
    error: syncError,
    lastSyncedAt,
    refetch,
  } = useDeviceSync();
  const { playCard, stop, pause, resume, currentAudioId, isPlaying } =
    usePlayback();
  const { reportCardScanned, reportCardUnknown } = useDeviceEvents();
  const { data: audioList } = useAudioList();

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<PlaybackStatus | null>(null);

  const titleByAudioId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of audioList?.items ?? []) {
      map.set(item.id, item.title);
    }
    return map;
  }, [audioList]);

  const describeAudio = useCallback(
    (audioId: string | null | undefined): string => {
      if (!audioId) {
        return "this track";
      }
      return titleByAudioId.get(audioId) ?? `Audio ${audioId.slice(0, 8)}`;
    },
    [titleByAudioId],
  );

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ScanForm>({
    resolver: zodResolver(scanSchema),
    defaultValues: { uid: "" },
    mode: "onSubmit",
  });

  // Subtle pulse on the scan card to acknowledge a tap, alongside the haptic.
  const pulse = useRef(new Animated.Value(1)).current;
  const triggerPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.03,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [pulse]);

  // Poll the player for progress while a track is loaded. The player reports
  // play/pause/finish through usePlayback, but position isn't surfaced there, so
  // we read it straight off the singleton for the progress bar.
  useEffect(() => {
    if (!currentAudioId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const s = await audioPlayer.getStatus();
      if (cancelled) {
        return;
      }
      if (s?.isLoaded) {
        setStatus({
          positionMs: s.positionMillis,
          durationMs: s.durationMillis ?? 0,
          isPlaying: s.isPlaying,
        });
      }
    };
    void tick();
    const timer = setInterval(tick, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentAudioId]);

  const applyResult = useCallback(
    (result: PlayCardResult, uid: string) => {
      switch (result) {
        case "playing":
          setFeedback({
            tone: "success",
            message: `Playing ${describeAudio(cardsByUid.get(uid))}`,
          });
          return;
        case "audio_missing":
          setFeedback({
            tone: "error",
            message: "The bound track isn't in the latest sync yet.",
          });
          return;
        case "url_expired":
          setFeedback({
            tone: "error",
            message: "Audio link expired — scan again to refresh it.",
          });
          return;
        case "unknown_card":
          setFeedback({
            tone: "warning",
            message: "Unknown card — it isn't bound to any audio.",
          });
          return;
        case "error":
        default:
          setFeedback({
            tone: "error",
            message: "Couldn't play this track. Try again.",
          });
      }
    },
    [cardsByUid, describeAudio],
  );

  const onScan = handleSubmit(async ({ uid }) => {
    const normalized = uid.toLowerCase().trim();

    triggerPulse();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Every scan is reported, known or not — the backend tracks raw taps.
    reportCardScanned(normalized);

    if (!cardsByUid.has(normalized)) {
      reportCardUnknown(normalized);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
      setFeedback({
        tone: "warning",
        message: "Unknown card — it isn't bound to any audio.",
      });
      return;
    }

    setFeedback({ tone: "info", message: `Scanning ${normalized}…` });
    const result = await playCard(normalized);
    applyResult(result, normalized);
  });

  // --- Blocking states -----------------------------------------------------

  if (!activeDeviceId) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
        <Text className="text-center text-lg font-semibold text-neutral-900">
          No active device
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          Select a device to act as before scanning cards.
        </Text>
        <Pressable
          onPress={() => router.replace("/device-mode/select")}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">
            Select a device
          </Text>
        </Pressable>
      </View>
    );
  }

  if (syncLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-white">
        <ActivityIndicator />
        <Text className="text-sm text-neutral-500">Loading device data…</Text>
      </View>
    );
  }

  if (syncError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
        <Text className="text-center text-base font-semibold text-neutral-900">
          Couldn't sync this device
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          {syncError.message}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  // --- Scan UI -------------------------------------------------------------

  const deviceTitle = activeDevice?.name?.trim() || activeDevice?.serial || "device";
  const showPlayer = currentAudioId !== null && status !== null;
  const progress =
    status && status.durationMs > 0
      ? Math.min(1, status.positionMs / status.durationMs)
      : 0;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, gap: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-sm uppercase tracking-wide text-neutral-400">
          Acting as {deviceTitle}
        </Text>
        <Text className="text-2xl font-bold text-neutral-900">Scan a card</Text>
        <Text className="text-sm text-neutral-500">
          {cardsByUid.size} card{cardsByUid.size === 1 ? "" : "s"} bound
          {lastSyncedAt ? " · synced" : ""}
        </Text>
      </View>

      <Animated.View
        style={{ transform: [{ scale: pulse }] }}
        className="gap-3 rounded-3xl border border-neutral-200 bg-neutral-50 p-5"
      >
        <Text className="text-sm font-medium text-neutral-700">Card UID</Text>
        <Controller
          control={control}
          name="uid"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextInput
              value={value}
              onChangeText={(text) => onChange(text.toLowerCase().trim())}
              onBlur={onBlur}
              onSubmitEditing={onScan}
              placeholder="04a3f1b2"
              placeholderTextColor="#a3a3a3"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="ascii-capable"
              returnKeyType="go"
              maxLength={20}
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 font-mono text-xl tracking-widest text-neutral-900"
            />
          )}
        />
        {errors.uid ? (
          <Text className="text-sm text-red-600">{errors.uid.message}</Text>
        ) : null}

        <Pressable
          onPress={onScan}
          disabled={isSubmitting}
          className={`rounded-2xl px-6 py-4 ${
            isSubmitting ? "bg-indigo-400" : "bg-indigo-600"
          }`}
        >
          <Text className="text-center text-base font-semibold text-white">
            {isSubmitting ? "Scanning…" : "Scan"}
          </Text>
        </Pressable>
      </Animated.View>

      {feedback ? (
        <View className={`rounded-2xl border p-4 ${TONE_STYLES[feedback.tone]}`}>
          <Text className={`text-sm font-medium ${TONE_TEXT[feedback.tone]}`}>
            {feedback.message}
          </Text>
        </View>
      ) : null}

      {showPlayer ? (
        <View className="gap-4 rounded-3xl border border-neutral-200 bg-white p-5">
          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-neutral-400">
              Now playing
            </Text>
            <Text
              className="text-lg font-semibold text-neutral-900"
              numberOfLines={1}
            >
              {describeAudio(currentAudioId)}
            </Text>
          </View>

          <View className="gap-1.5">
            <View className="h-2 flex-row overflow-hidden rounded-full bg-neutral-200">
              <View
                className="h-full rounded-full bg-indigo-600"
                style={{ flex: progress }}
              />
              <View style={{ flex: 1 - progress }} />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-neutral-500">
                {formatTime(status.positionMs)}
              </Text>
              <Text className="text-xs text-neutral-500">
                {formatTime(status.durationMs)}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => (status.isPlaying ? pause() : resume())}
              className="flex-1 rounded-2xl border border-neutral-300 px-6 py-3"
            >
              <Text className="text-center text-base font-semibold text-neutral-700">
                {status.isPlaying ? "Pause" : "Resume"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => stop()}
              className="flex-1 rounded-2xl bg-red-600 px-6 py-3"
            >
              <Text className="text-center text-base font-semibold text-white">
                Stop
              </Text>
            </Pressable>
          </View>
        </View>
      ) : isPlaying ? (
        // Track started but the first status poll hasn't landed yet.
        <View className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4">
          <ActivityIndicator />
          <Text className="text-sm text-neutral-500">Starting playback…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
