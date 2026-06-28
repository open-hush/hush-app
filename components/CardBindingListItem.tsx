import { Pressable, Text, View } from "react-native";

import type { CardBinding } from "@/lib/api/cards";
import { formatCardUid } from "@/lib/format";

type Props = {
  binding: CardBinding;
  /** Title of the audio this card points at; falls back when it can't resolve. */
  audioTitle?: string;
  /** Tap handler for the unbind affordance. Omit to render the row read-only. */
  onUnbind?: () => void;
  /** Disables the unbind affordance while the delete is in flight. */
  unbinding?: boolean;
};

/**
 * A single card binding row: the bound audio's title, the card UID, and an
 * optional unbind affordance. Shared so the device detail screen renders every
 * binding the same way.
 */
export function CardBindingListItem({
  binding,
  audioTitle,
  onUnbind,
  unbinding,
}: Props) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text
            className="text-base font-semibold text-neutral-900"
            numberOfLines={1}
          >
            {audioTitle ?? "Unknown audio"}
          </Text>
          <Text className="text-xs font-medium text-neutral-400">
            {formatCardUid(binding.uid)}
          </Text>
        </View>

        {onUnbind ? (
          <Pressable
            onPress={onUnbind}
            disabled={unbinding}
            hitSlop={8}
            className="px-2 py-1"
          >
            <Text
              className={`text-sm font-medium ${
                unbinding ? "text-neutral-300" : "text-red-600"
              }`}
            >
              Unbind
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
