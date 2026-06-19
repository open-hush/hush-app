import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useDevices } from "@/lib/api/devices";
import { useDeviceModeStore } from "@/lib/device-mode";

export default function DeviceModeScreen() {
  const activeDeviceId = useDeviceModeStore((s) => s.activeDeviceId);
  const activeDevice = useDeviceModeStore((s) => s.activeDevice);
  const setActiveDevice = useDeviceModeStore((s) => s.setActiveDevice);
  const clearActiveDevice = useDeviceModeStore((s) => s.clearActiveDevice);

  // After a cold start only `activeDeviceId` survives — the cached device info is
  // intentionally not persisted (see the store's `partialize`). Refill it from the
  // server, and drop the selection if that device is no longer claimed by this user.
  const { data } = useDevices();
  const needsRehydrate = Boolean(activeDeviceId) && !activeDevice;

  useEffect(() => {
    if (!needsRehydrate || !data) {
      return;
    }
    const match = data.items.find((d) => d.id === activeDeviceId);
    if (match) {
      setActiveDevice({ id: match.id, serial: match.serial, name: match.name });
    } else {
      clearActiveDevice();
    }
  }, [needsRehydrate, data, activeDeviceId, setActiveDevice, clearActiveDevice]);

  if (!activeDeviceId) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
        <Text className="text-center text-lg font-semibold text-neutral-900">
          No device selected
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          Pick one of your claimed devices to act as it from this phone.
        </Text>
        <Pressable
          onPress={() => router.push("/device-mode/select")}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">
            Select a device
          </Text>
        </Pressable>
      </View>
    );
  }

  // We have a persisted id but the cached info is still being refilled.
  if (!activeDevice) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const title = activeDevice.name?.trim() || activeDevice.serial;

  return (
    <View className="flex-1 gap-6 bg-white px-6 py-8">
      <View className="gap-1">
        <Text className="text-sm uppercase tracking-wide text-neutral-400">
          Acting as
        </Text>
        <Text className="text-2xl font-bold text-neutral-900">{title}</Text>
        <Text className="text-sm text-neutral-500">
          Serial {activeDevice.serial}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/device-mode/scan")}
        className="rounded-2xl bg-indigo-600 px-6 py-4"
      >
        <Text className="text-center text-base font-semibold text-white">
          Scan a card
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/device-mode/select")}
        className="rounded-2xl border border-neutral-300 px-6 py-4"
      >
        <Text className="text-center text-base font-semibold text-neutral-700">
          Switch device
        </Text>
      </Pressable>
    </View>
  );
}
