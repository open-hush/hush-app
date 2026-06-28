import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useCardBindings } from "@/lib/api/cards";
import { useCardUnknownEvents } from "@/lib/api/events";
import { formatCardUid, formatLastSeen } from "@/lib/format";

/**
 * "Cards to bind": the UIDs the device has reported as `card_unknown` that the
 * user has not bound yet. Polls the events endpoint while mounted and subtracts
 * UIDs already present in the device's bindings — a card stays in this list
 * until it gets bound, then drops out once the binding read refreshes.
 */
export default function UnknownCardsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const events = useCardUnknownEvents(id);
  const bindings = useCardBindings(id);

  const boundUids = useMemo(
    () => new Set((bindings.data?.items ?? []).map((b) => b.uid)),
    [bindings.data],
  );

  const toBind = (events.data ?? []).filter(
    (event) => !boundUids.has(event.payload.uid),
  );

  return (
    <View className="flex-1 bg-neutral-50">
      <Stack.Screen options={{ title: "Cards to bind" }} />

      <ScrollView className="flex-1">
        <View className="gap-3 p-4">
          {events.isLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          ) : events.isError ? (
            <View className="items-center gap-4 py-12">
              <Text className="text-center text-sm text-neutral-500">
                {events.error?.message ?? "Couldn't load device events."}
              </Text>
              <Pressable
                onPress={() => events.refetch()}
                className="rounded-2xl bg-indigo-600 px-6 py-3"
              >
                <Text className="text-base font-semibold text-white">
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : toBind.length === 0 ? (
            <Text className="py-12 text-center text-neutral-500">
              No unbound cards. Tap a card on the device, then pull it in here.
            </Text>
          ) : (
            toBind.map((event) => (
              <Pressable
                key={event.payload.uid}
                onPress={() =>
                  router.push(
                    `/devices/${id}/bind?uid=${event.payload.uid}`,
                  )
                }
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className="text-base font-semibold text-neutral-900">
                      {formatCardUid(event.payload.uid)}
                    </Text>
                    <Text className="text-xs text-neutral-400">
                      Seen {formatLastSeen(event.ts)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-indigo-700">
                    Bind
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
