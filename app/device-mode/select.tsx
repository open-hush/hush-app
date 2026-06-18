import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { DeviceListItem } from "@/components/DeviceListItem";
import { useDevices, type Device } from "@/lib/api/devices";
import { useDeviceModeStore } from "@/lib/device-mode";

export default function SelectDeviceScreen() {
  // Optional pre-selection passed from the Devices tab's "Act as this device".
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const setActiveDevice = useDeviceModeStore((s) => s.setActiveDevice);
  const { data, isLoading, isError, error, refetch } = useDevices();

  // You can only act as a device you have claimed.
  const claimed = (data?.items ?? []).filter((d) => d.state === "claimed");

  function select(device: Device) {
    setActiveDevice({ id: device.id, serial: device.serial, name: device.name });
    // Land on the device-mode tab regardless of where we were pushed from.
    router.replace("/device-mode");
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-neutral-50 px-6">
        <Text className="text-center text-sm text-neutral-500">
          {error?.message ?? "Couldn't load your devices."}
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

  if (claimed.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-neutral-50 px-6">
        <Text className="text-center text-base font-semibold text-neutral-900">
          No claimed devices
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          Pair and claim a device before acting as one.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50">
      <View className="gap-3 p-4">
        {claimed.map((device) => (
          <DeviceListItem
            key={device.id}
            device={device}
            selected={device.id === deviceId}
            onPress={() => select(device)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
