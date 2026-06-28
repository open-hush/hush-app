import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { DeviceListItem } from "@/components/DeviceListItem";
import { useDevices } from "@/lib/api/devices";

export default function DevicesScreen() {
  const { data, isLoading, isError, error, refetch } = useDevices();
  const devices = data?.items ?? [];

  return (
    <View className="flex-1 bg-neutral-50">
      <ScrollView className="flex-1">
        <View className="gap-3 p-4">
          {isLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          ) : isError ? (
            <View className="items-center gap-4 py-12">
              <Text className="text-center text-sm text-neutral-500">
                {error?.message ?? "Couldn't load your devices."}
              </Text>
              <Pressable
                onPress={() => refetch()}
                className="rounded-2xl bg-indigo-600 px-6 py-3"
              >
                <Text className="text-base font-semibold text-white">
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : devices.length === 0 ? (
            <Text className="py-12 text-center text-neutral-500">
              No devices yet. Pair one to get started.
            </Text>
          ) : (
            devices.map((device) => (
              <View key={device.id} className="gap-2">
                <DeviceListItem
                  device={device}
                  onPress={() => router.push(`/devices/${device.id}`)}
                />
                {device.state === "claimed" ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/device-mode/select",
                        params: { deviceId: device.id },
                      })
                    }
                    className="self-start rounded-xl bg-indigo-50 px-4 py-2"
                  >
                    <Text className="text-sm font-semibold text-indigo-700">
                      Act as this device
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View className="border-t border-neutral-200 bg-white p-4">
        <Pressable
          onPress={() => router.push("/pairing/scan")}
          className="rounded-2xl bg-indigo-600 px-6 py-4"
        >
          <Text className="text-center text-base font-semibold text-white">
            Pair new device
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
