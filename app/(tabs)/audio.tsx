import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import { AudioListItem } from "@/components/AudioListItem";
import {
  audioQueryKey,
  createAudio,
  deleteAudio,
  finalizeAudio,
  uploadToPresignedUrl,
  useAudioList,
  type Audio,
} from "@/lib/api/audio";

/**
 * Content types the backend transcoder accepts. Mirrors the dashboard's
 * allow-list so both clients reject the same files up front, before we spend a
 * presigned URL on an upload S3 would refuse anyway.
 */
const ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
] as const;

/**
 * Fallback MIME by extension, for the Android providers that hand back a file
 * with no `mimeType`. Keeps the picker usable instead of rejecting valid files.
 */
const EXTENSION_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/x-m4a",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

const schema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

type PickedFile = { uri: string; name: string; contentType: string };

/**
 * Resolve a supported content type for a picked asset: prefer a reported MIME
 * that's in the allow-list, otherwise infer from the file extension. Returns
 * null when neither yields a supported type.
 */
function resolveContentType(asset: DocumentPicker.DocumentPickerAsset): string | null {
  const fromMime = asset.mimeType?.toLowerCase();
  if (fromMime && (ACCEPTED_TYPES as readonly string[]).includes(fromMime)) {
    return fromMime;
  }
  const ext = asset.name.split(".").pop()?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || null;
}

function toMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Audio library screen: lists the user's audio with lifecycle badges and drives
 * the full upload flow — create item → presigned PUT to S3 → finalize → refresh.
 * Recording in-app and post-upload metadata edits are out of scope (OPE-15).
 */
export default function AudioScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAudioList();
  const items = data?.items ?? [];

  const [file, setFile] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Tracked separately from react-query's fetching flags so the pull-to-refresh
  // spinner reflects only manual pulls, not the in-flight polling.
  const [refreshing, setRefreshing] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const pickFile = async () => {
    setFormError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (res.canceled) {
      return;
    }
    const asset = res.assets[0];
    const contentType = resolveContentType(asset);
    if (!contentType) {
      setFormError(
        `Unsupported file type${asset.mimeType ? `: ${asset.mimeType}` : ""}. Pick an MP3, WAV, FLAC, AAC, M4A or OGG file.`,
      );
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, contentType });
  };

  const upload = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!file) {
        throw new Error("Pick an audio file first.");
      }
      setProgress("Requesting upload URL…");
      const created = await createAudio({
        title: values.title,
        sourceContentType: file.contentType,
        ...(values.description ? { description: values.description } : {}),
      });

      setProgress(`Uploading ${file.name}…`);
      await uploadToPresignedUrl(created.upload, file.uri, file.contentType);

      setProgress("Finalizing…");
      await finalizeAudio(created.audio.id);
    },
    onSuccess: async () => {
      setProgress(null);
      setFormError(null);
      setFile(null);
      reset();
      await qc.invalidateQueries({ queryKey: audioQueryKey });
    },
    onError: (err) => {
      setProgress(null);
      setFormError(toMessage(err, "Upload failed. Try again."));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAudio(id),
    onMutate: (id: string) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: audioQueryKey }),
    onError: (err) => setFormError(toMessage(err, "Delete failed. Try again.")),
  });

  const confirmDelete = (audio: Audio) => {
    Alert.alert(
      "Delete audio",
      `“${audio.title}” will be permanently deleted, along with any card bindings that point to it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => remove.mutate(audio.id),
        },
      ],
    );
  };

  const submit = handleSubmit((values) => upload.mutate(values));
  const uploadDisabled = !file || upload.isPending;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="gap-4 rounded-3xl border border-neutral-200 bg-white p-5">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-neutral-900">
            Upload audio
          </Text>
          <Text className="text-sm text-neutral-500">
            MP3, WAV, FLAC, AAC, M4A or OGG.
          </Text>
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-700">Title</Text>
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Morning bells"
                placeholderTextColor="#a3a3a3"
                editable={!upload.isPending}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900"
              />
            )}
          />
          {errors.title ? (
            <Text className="text-sm text-red-600">{errors.title.message}</Text>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-700">
            Description (optional)
          </Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Gentle morning alarm"
                placeholderTextColor="#a3a3a3"
                editable={!upload.isPending}
                multiline
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900"
              />
            )}
          />
          {errors.description ? (
            <Text className="text-sm text-red-600">
              {errors.description.message}
            </Text>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-700">File</Text>
          <Pressable
            onPress={pickFile}
            disabled={upload.isPending}
            className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3"
          >
            <Text className="text-base text-neutral-700" numberOfLines={1}>
              {file ? file.name : "Choose an audio file"}
            </Text>
          </Pressable>
        </View>

        {progress ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator />
            <Text className="text-sm text-neutral-600">{progress}</Text>
          </View>
        ) : null}

        {formError ? (
          <View className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <Text className="text-sm font-medium text-red-700">{formError}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={uploadDisabled}
          className={`rounded-2xl px-6 py-4 ${
            uploadDisabled ? "bg-indigo-400" : "bg-indigo-600"
          }`}
        >
          <Text className="text-center text-base font-semibold text-white">
            {upload.isPending ? "Uploading…" : "Upload"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <Text className="px-1 text-sm font-medium uppercase tracking-wide text-neutral-400">
          Your library
        </Text>
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <View className="items-center gap-4 py-12">
            <Text className="text-center text-sm text-neutral-500">
              {error?.message ?? "Couldn't load your audio."}
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
        ) : items.length === 0 ? (
          <Text className="py-12 text-center text-neutral-500">
            No audio yet. Upload your first track above.
          </Text>
        ) : (
          items.map((audio) => (
            <AudioListItem
              key={audio.id}
              audio={audio}
              onDelete={() => confirmDelete(audio)}
              deleting={deletingId === audio.id}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
