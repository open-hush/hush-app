import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  bleManager,
  requestBlePermissions,
  scanForImprovDevices,
  usePairingStore,
  type DiscoveredDevice,
} from "@/lib/ble";

type ScanStatus =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "denied" }
  | { kind: "bluetooth_off" }
  | { kind: "error"; message: string };

/**
 * Step 1 of pairing: scan for nearby Hush devices advertising the Improv Wi-Fi
 * service and let the user pick one. Tapping a device selects it and advances
 * to the Wi-Fi step, where the BLE connection is opened.
 *
 * Requires a Dev Client build — BLE is unavailable in Expo Go.
 */
export default function ScanScreen() {
  const discovered = usePairingStore((s) => s.discovered);
  const upsertDiscovered = usePairingStore((s) => s.upsertDiscovered);
  const clearDiscovered = usePairingStore((s) => s.clearDiscovered);
  const select = usePairingStore((s) => s.select);
  const reset = usePairingStore((s) => s.reset);

  const [status, setStatus] = useState<ScanStatus>({ kind: "starting" });

  const startScan = useCallback(async () => {
    setStatus({ kind: "starting" });
    clearDiscovered();

    const granted = await requestBlePermissions();
    if (!granted) {
      setStatus({ kind: "denied" });
      return;
    }

    const state = await bleManager.state();
    if (state !== "PoweredOn") {
      setStatus({ kind: "bluetooth_off" });
      return;
    }

    setStatus({ kind: "scanning" });
    return scanForImprovDevices(
      (device) => upsertDiscovered(device),
      (error) => setStatus({ kind: "error", message: error.message }),
    );
  }, [clearDiscovered, upsertDiscovered]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void startScan().then((fn) => {
      stop = fn;
    });
    return () => stop?.();
  }, [startScan]);

  const onSelect = (device: DiscoveredDevice) => {
    select(device);
    router.push("/pairing/wifi");
  };

  const onCancel = () => {
    reset();
    router.back();
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, gap: 16 }}
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-neutral-900">
            Nearby devices
          </Text>
          <Text className="text-sm text-neutral-500">
            Put your Hush device in pairing mode, then pick it from the list.
          </Text>
        </View>

        {status.kind === "denied" ? (
          <Banner
            tone="error"
            title="Bluetooth permission needed"
            message="Allow Bluetooth access to find your device, then try again."
            actionLabel="Try again"
            onAction={() => void startScan()}
          />
        ) : status.kind === "bluetooth_off" ? (
          <Banner
            tone="warning"
            title="Bluetooth is off"
            message="Turn Bluetooth on to scan for devices."
            actionLabel="Try again"
            onAction={() => void startScan()}
          />
        ) : status.kind === "error" ? (
          <Banner
            tone="error"
            title="Scan failed"
            message={status.message}
            actionLabel="Try again"
            onAction={() => void startScan()}
          />
        ) : null}

        {discovered.map((device) => (
          <Pressable
            key={device.id}
            onPress={() => onSelect(device)}
            className="flex-row items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-semibold text-neutral-900">
                {device.name ?? "Hush device"}
              </Text>
              <Text className="text-xs text-neutral-400">{device.id}</Text>
            </View>
            {device.rssi !== null ? (
              <Text className="text-xs text-neutral-400">{device.rssi} dBm</Text>
            ) : null}
          </Pressable>
        ))}

        {(status.kind === "scanning" || status.kind === "starting") &&
        discovered.length === 0 ? (
          <View className="flex-row items-center gap-3 py-8">
            <ActivityIndicator />
            <Text className="text-sm text-neutral-500">
              Searching for devices in pairing mode…
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-neutral-200 bg-white p-4">
        <Pressable onPress={onCancel} className="rounded-2xl px-6 py-3">
          <Text className="text-center text-base font-semibold text-neutral-600">
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type BannerTone = "warning" | "error";

function Banner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50"
      : "border-amber-200 bg-amber-50";
  const text = tone === "error" ? "text-red-700" : "text-amber-700";
  return (
    <View className={`gap-2 rounded-2xl border p-4 ${styles}`}>
      <Text className={`text-sm font-semibold ${text}`}>{title}</Text>
      <Text className={`text-sm ${text}`}>{message}</Text>
      <Pressable onPress={onAction} className="self-start pt-1">
        <Text className="text-sm font-semibold text-indigo-700">
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}
