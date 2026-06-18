import { Pressable, Text, View } from "react-native";

import type { Device, DeviceState } from "@/lib/api/devices";
import { formatLastSeen } from "@/lib/format";

const STATE_LABELS: Record<DeviceState, string> = {
  unclaimed: "Unclaimed",
  claimed: "Claimed",
  retired: "Retired",
};

type Props = {
  device: Device;
  /** Tap handler. When omitted the row renders as non-interactive. */
  onPress?: () => void;
  /** Applies the selected/active visual treatment. */
  selected?: boolean;
};

/**
 * A single device row, shared by the Devices tab and the device picker so both
 * render identity, state and last-seen the same way.
 */
export function DeviceListItem({ device, onPress, selected }: Props) {
  const title = device.name?.trim() || device.serial;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`rounded-2xl border px-4 py-3 ${
        selected
          ? "border-indigo-500 bg-indigo-50"
          : "border-neutral-200 bg-white"
      }`}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-neutral-900"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="text-xs font-medium uppercase text-neutral-500">
          {STATE_LABELS[device.state]}
        </Text>
      </View>
      {device.name ? (
        <Text className="mt-0.5 text-xs text-neutral-500">{device.serial}</Text>
      ) : null}
      <Text className="mt-1 text-xs text-neutral-400">
        Last seen: {formatLastSeen(device.lastSeenAt)}
      </Text>
    </Pressable>
  );
}
