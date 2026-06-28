import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import {
  ImprovConnection,
  PSK_MAX_LEN,
  SSID_MAX_LEN,
  usePairingStore,
} from "@/lib/ble";

// The radio caps SSID at 32 bytes and the WPA2 PSK at 64 (see improv.ts). We
// validate on character length here as a friendly first pass; the byte-accurate
// check (multi-byte glyphs) lives in buildSendWifiSettings and surfaces as a
// submit error if it trips.
const wifiSchema = z.object({
  ssid: z
    .string()
    .min(1, "Enter your network name.")
    .max(SSID_MAX_LEN, `Network name is too long (max ${SSID_MAX_LEN}).`),
  password: z
    .string()
    .max(PSK_MAX_LEN, `Password is too long (max ${PSK_MAX_LEN}).`),
});

type WifiForm = z.infer<typeof wifiSchema>;

type ConnState =
  | { kind: "connecting" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Step 2 of pairing: open the BLE connection to the selected device and collect
 * the Wi-Fi credentials. Submitting stores the credentials and advances to the
 * confirm step, which writes them over Improv and waits for the device to come
 * online. The plaintext password stays in the in-memory pairing store only.
 */
export default function WifiScreen() {
  const selected = usePairingStore((s) => s.selected);
  const setConnection = usePairingStore((s) => s.setConnection);
  const setCredentials = usePairingStore((s) => s.setCredentials);
  const reset = usePairingStore((s) => s.reset);

  const [conn, setConn] = useState<ConnState>({ kind: "connecting" });

  const connect = useCallback(async () => {
    if (!selected) {
      return;
    }
    setConn({ kind: "connecting" });
    try {
      const connection = await ImprovConnection.connect(selected.id);
      setConnection(connection);
      setConn({ kind: "ready" });
    } catch (error) {
      setConn({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't connect to the device.",
      });
    }
  }, [selected, setConnection]);

  useEffect(() => {
    void connect();
  }, [connect]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WifiForm>({
    resolver: zodResolver(wifiSchema),
    defaultValues: { ssid: "", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = handleSubmit(({ ssid, password }) => {
    setCredentials({ ssid: ssid.trim(), password });
    router.push("/pairing/confirm");
  });

  if (!selected) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
        <Text className="text-center text-base font-semibold text-neutral-900">
          No device selected
        </Text>
        <Pressable
          onPress={() => router.replace("/pairing/scan")}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">
            Back to scan
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 24, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-sm uppercase tracking-wide text-neutral-400">
          {selected.name ?? "Hush device"}
        </Text>
        <Text className="text-2xl font-bold text-neutral-900">
          Wi-Fi credentials
        </Text>
        <Text className="text-sm text-neutral-500">
          The device joins this network and comes online. Only 2.4 GHz networks
          are supported.
        </Text>
      </View>

      {conn.kind === "connecting" ? (
        <View className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4">
          <ActivityIndicator />
          <Text className="text-sm text-neutral-500">
            Connecting to the device…
          </Text>
        </View>
      ) : conn.kind === "error" ? (
        <View className="gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-sm font-semibold text-red-700">
            Couldn&apos;t connect
          </Text>
          <Text className="text-sm text-red-700">{conn.message}</Text>
          <Pressable onPress={() => void connect()} className="self-start pt-1">
            <Text className="text-sm font-semibold text-indigo-700">
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View className="gap-4">
        <View className="gap-2">
          <Text className="text-sm font-medium text-neutral-700">
            Network name (SSID)
          </Text>
          <Controller
            control={control}
            name="ssid"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="MyHomeWiFi"
                placeholderTextColor="#a3a3a3"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={SSID_MAX_LEN}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900"
              />
            )}
          />
          {errors.ssid ? (
            <Text className="text-sm text-red-600">{errors.ssid.message}</Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-neutral-700">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Leave empty for an open network"
                placeholderTextColor="#a3a3a3"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                maxLength={PSK_MAX_LEN}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900"
              />
            )}
          />
          {errors.password ? (
            <Text className="text-sm text-red-600">
              {errors.password.message}
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={conn.kind !== "ready"}
        className={`rounded-2xl px-6 py-4 ${
          conn.kind === "ready" ? "bg-indigo-600" : "bg-indigo-300"
        }`}
      >
        <Text className="text-center text-base font-semibold text-white">
          Send to device
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          reset();
          router.dismissAll();
        }}
        className="px-6 py-2"
      >
        <Text className="text-center text-sm font-semibold text-neutral-500">
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}
