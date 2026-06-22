import { Pressable, Text, View } from "react-native";

import type { Audio, AudioState } from "@/lib/api/audio";

/** Badge label + colors per lifecycle state, matching the dashboard's variants. */
const STATE_BADGE: Record<
  AudioState,
  { label: string; container: string; text: string }
> = {
  uploading: { label: "Uploading", container: "bg-neutral-100", text: "text-neutral-600" },
  processing: { label: "Processing", container: "bg-amber-100", text: "text-amber-700" },
  ready: { label: "Ready", container: "bg-emerald-100", text: "text-emerald-700" },
  failed: { label: "Failed", container: "bg-red-100", text: "text-red-700" },
};

/** `4500ms`, `180000 bytes` → `"5s · 0.2 MB"`. Null until transcoding fills them. */
function formatMeta(audio: Audio): string | null {
  const parts: string[] = [];
  if (typeof audio.durationMs === "number") {
    parts.push(`${Math.round(audio.durationMs / 1000)}s`);
  }
  if (typeof audio.sizeBytes === "number") {
    parts.push(`${(audio.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

type Props = {
  audio: Audio;
  /** Tap handler for the delete affordance. Omit to hide it. */
  onDelete?: () => void;
  /** Disables the delete affordance while a delete is in flight. */
  deleting?: boolean;
};

/**
 * A single audio row: title, lifecycle badge, optional description and the
 * duration/size that appear once the backend finishes transcoding.
 */
export function AudioListItem({ audio, onDelete, deleting }: Props) {
  const badge = STATE_BADGE[audio.state];
  const meta = formatMeta(audio);

  return (
    <View className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-1 text-base font-semibold text-neutral-900"
              numberOfLines={1}
            >
              {audio.title}
            </Text>
            <View className={`rounded-full px-2 py-0.5 ${badge.container}`}>
              <Text className={`text-xs font-medium ${badge.text}`}>
                {badge.label}
              </Text>
            </View>
          </View>
          {audio.description ? (
            <Text className="text-xs text-neutral-500" numberOfLines={2}>
              {audio.description}
            </Text>
          ) : null}
          {meta ? <Text className="text-xs text-neutral-400">{meta}</Text> : null}
        </View>

        {onDelete ? (
          <Pressable
            onPress={onDelete}
            disabled={deleting}
            hitSlop={8}
            className="px-2 py-1"
          >
            <Text
              className={`text-sm font-medium ${
                deleting ? "text-neutral-300" : "text-red-600"
              }`}
            >
              Delete
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
