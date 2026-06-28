import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useAudioList, type Audio } from "@/lib/api/audio";
import { useBindCard } from "@/lib/api/cards";
import { formatCardUid } from "@/lib/format";

/**
 * Audio picker for a card UID: lists the user's `ready` audio (the only state a
 * card can play) and binds the selected item to the UID via
 * `POST /v1/devices/{id}/cards`. On success it pops back to the "cards to bind"
 * list, which refreshes its bindings and drops the now-bound card.
 */
export default function BindCardScreen() {
  const { id, uid } = useLocalSearchParams<{ id: string; uid: string }>();

  const { data, isLoading, isError, error, refetch } = useAudioList();
  const bind = useBindCard(id);

  // A card can only play finished audio; uploading/processing/failed can't bind.
  const ready = (data?.items ?? []).filter((a) => a.state === "ready");

  const select = (audio: Audio) => {
    bind.mutate(
      { uid, audioId: audio.id },
      {
        onSuccess: () => {
          Alert.alert("Card bound", `${formatCardUid(uid)} now plays "${audio.title}".`);
          router.back();
        },
        onError: (err) =>
          Alert.alert(
            "Bind failed",
            err.message || "Something went wrong. Try again.",
          ),
      },
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <Stack.Screen options={{ title: "Pick audio" }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-neutral-50 px-6">
        <Stack.Screen options={{ title: "Pick audio" }} />
        <Text className="text-center text-sm text-neutral-500">
          {error?.message ?? "Couldn't load your audio library."}
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

  if (ready.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-neutral-50 px-6">
        <Stack.Screen options={{ title: "Pick audio" }} />
        <Text className="text-center text-base font-semibold text-neutral-900">
          No ready audio
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          Upload an audio item and wait for it to finish processing before
          binding a card to it.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <Stack.Screen options={{ title: "Pick audio" }} />

      <View className="border-b border-neutral-200 bg-white px-4 py-3">
        <Text className="text-xs text-neutral-500">Binding card</Text>
        <Text className="text-base font-semibold text-neutral-900">
          {formatCardUid(uid)}
        </Text>
      </View>

      <ScrollView className="flex-1">
        <View className="gap-3 p-4">
          {ready.map((audio) => (
            <Pressable
              key={audio.id}
              onPress={() => select(audio)}
              disabled={bind.isPending}
              className={`rounded-2xl border border-neutral-200 bg-white px-4 py-3 ${
                bind.isPending ? "opacity-50" : ""
              }`}
            >
              <Text
                className="text-base font-semibold text-neutral-900"
                numberOfLines={1}
              >
                {audio.title}
              </Text>
              {audio.description ? (
                <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={2}>
                  {audio.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
