import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { CardBindingListItem } from "@/components/CardBindingListItem";
import { useAudioList } from "@/lib/api/audio";
import { useCardBindings, useUnbindCard } from "@/lib/api/cards";
import { useDevices } from "@/lib/api/devices";
import { formatCardUid } from "@/lib/format";

/**
 * Device detail: the device header, the cards currently bound on it (each with
 * an unbind affordance), and an entry point to the "cards to bind" list that
 * surfaces unknown UIDs the device has reported.
 */
export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // The device list is already cached from the Devices tab; reuse it for the
  // header instead of adding a single-device read the spec doesn't expose.
  const { data: devices } = useDevices();
  const device = devices?.items.find((d) => d.id === id);
  const deviceTitle = device?.name?.trim() || device?.serial || "Device";

  const bindings = useCardBindings(id);
  const audio = useAudioList();
  const unbind = useUnbindCard(id);

  // audioId → title, so each binding row can show what the card plays.
  const audioTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of audio.data?.items ?? []) {
      map.set(item.id, item.title);
    }
    return map;
  }, [audio.data]);

  const items = bindings.data?.items ?? [];

  const confirmUnbind = (uid: string) => {
    Alert.alert(
      "Unbind card",
      `Stop ${formatCardUid(uid)} from playing its audio on this device?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unbind",
          style: "destructive",
          onPress: () =>
            unbind.mutate(uid, {
              onError: (err) =>
                Alert.alert(
                  "Unbind failed",
                  err.message || "Something went wrong. Try again.",
                ),
            }),
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-neutral-50">
      <Stack.Screen options={{ title: deviceTitle }} />

      <ScrollView className="flex-1">
        <View className="gap-4 p-4">
          <Pressable
            onPress={() => router.push(`/devices/${id}/unknown`)}
            className="rounded-2xl bg-indigo-600 px-6 py-4"
          >
            <Text className="text-center text-base font-semibold text-white">
              Cards to bind
            </Text>
          </Pressable>

          <Text className="px-1 text-xs font-semibold uppercase text-neutral-500">
            Bound cards
          </Text>

          {bindings.isLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          ) : bindings.isError ? (
            <View className="items-center gap-4 py-12">
              <Text className="text-center text-sm text-neutral-500">
                {bindings.error?.message ?? "Couldn't load card bindings."}
              </Text>
              <Pressable
                onPress={() => bindings.refetch()}
                className="rounded-2xl bg-indigo-600 px-6 py-3"
              >
                <Text className="text-base font-semibold text-white">
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <Text className="py-12 text-center text-neutral-500">
              No cards bound yet. Tap a card the device has seen to bind it.
            </Text>
          ) : (
            items.map((binding) => (
              <CardBindingListItem
                key={binding.uid}
                binding={binding}
                audioTitle={audioTitles.get(binding.audioId)}
                onUnbind={() => confirmUnbind(binding.uid)}
                unbinding={unbind.isPending && unbind.variables === binding.uid}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
