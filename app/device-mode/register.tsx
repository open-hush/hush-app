import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  useClaimDevice,
  useRegisterVirtualDevice,
  type Device,
} from "@/lib/api/devices";
import { useDeviceModeStore } from "@/lib/device-mode";

/** Serial for an app-registered virtual device, e.g. `APP-8f1b6a2e`. */
function generateSerial(): string {
  return `APP-${crypto.randomUUID().slice(0, 8)}`;
}

/** Firmware version a virtual device reports, derived from the app version. */
function appFirmwareVersion(): string {
  return `app-${Constants.expoConfig?.version ?? "0.0.0"}`;
}

export default function RegisterDeviceScreen() {
  // Snapshot, at mount, whether the user is already acting as a device. If so we
  // don't silently hijack their selection after claiming — we offer an explicit
  // switch instead (acceptance criterion).
  const [hadActiveDevice] = useState(
    () => useDeviceModeStore.getState().activeDeviceId !== null,
  );
  const setActiveDevice = useDeviceModeStore((s) => s.setActiveDevice);

  const register = useRegisterVirtualDevice();
  const claim = useClaimDevice();

  // Drives the screen's three steps: register → claim → done.
  const [registered, setRegistered] = useState<{
    device: Device;
    claimCode: string;
  } | null>(null);
  const [claimed, setClaimed] = useState<Device | null>(null);

  function activate(device: Device) {
    setActiveDevice({ id: device.id, serial: device.serial, name: device.name });
    router.replace("/device-mode/scan");
  }

  async function handleRegister() {
    try {
      const result = await register.mutateAsync({
        serial: generateSerial(),
        firmwareVersion: appFirmwareVersion(),
        virtual: true,
      });
      // A just-registered device is always unclaimed, so the code is present;
      // guard anyway since the contract marks `claimCode` optional.
      if (result.claimCode) {
        setRegistered({ device: result.device, claimCode: result.claimCode });
      }
    } catch {
      // Surfaced via `register.error` below.
    }
  }

  async function handleClaim() {
    if (!registered) {
      return;
    }
    try {
      const device = await claim.mutateAsync({
        deviceId: registered.device.id,
        claimCode: registered.claimCode,
      });
      setClaimed(device);
      // Fresh device-mode user: adopt the new device and go straight to scanning.
      // If they were already acting as a device, wait for an explicit switch.
      if (!hadActiveDevice) {
        activate(device);
      }
    } catch {
      // Surfaced via `claim.error` below.
    }
  }

  // Step 3 — claimed while another device was already active: let the user
  // decide whether to switch over.
  if (claimed && hadActiveDevice) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-neutral-50 px-6">
        <Text className="text-center text-lg font-semibold text-neutral-900">
          Device registered
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          {claimed.serial} is claimed and ready. You're currently acting as a
          different device.
        </Text>
        <Pressable
          onPress={() => activate(claimed)}
          className="rounded-2xl bg-indigo-600 px-6 py-4"
        >
          <Text className="text-center text-base font-semibold text-white">
            Switch to newly registered device
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="px-6 py-3">
          <Text className="text-center text-base font-semibold text-neutral-700">
            Keep current device
          </Text>
        </Pressable>
      </View>
    );
  }

  // Step 2 — registered, awaiting claim: show the code and the claim action.
  if (registered) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-neutral-50 px-6">
        <View className="items-center gap-2">
          <Text className="text-sm uppercase tracking-wide text-neutral-400">
            Claim code
          </Text>
          <Text className="text-4xl font-bold tracking-widest text-neutral-900">
            {registered.claimCode}
          </Text>
          <Text className="text-center text-sm text-neutral-500">
            Registered as {registered.device.serial}. Claim it to start acting as
            this device.
          </Text>
        </View>

        {claim.isError ? (
          <Text className="text-center text-sm text-red-600">
            {claim.error?.message ?? "Couldn't claim the device."}
          </Text>
        ) : null}

        <Pressable
          onPress={handleClaim}
          disabled={claim.isPending}
          className="w-full rounded-2xl bg-indigo-600 px-6 py-4"
        >
          {claim.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-center text-base font-semibold text-white">
              Claim now
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // Step 1 — entry: register this phone as a virtual device.
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-neutral-50 px-6">
      <Text className="text-center text-lg font-semibold text-neutral-900">
        Register this phone as a device
      </Text>
      <Text className="text-center text-sm text-neutral-500">
        Create a software-only device bound to your account so this phone can act
        as a Hush device.
      </Text>

      {register.isError ? (
        <Text className="text-center text-sm text-red-600">
          {register.error?.message ?? "Couldn't register the device."}
        </Text>
      ) : null}

      <Pressable
        onPress={handleRegister}
        disabled={register.isPending}
        className="w-full rounded-2xl bg-indigo-600 px-6 py-4"
      >
        {register.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-center text-base font-semibold text-white">
            Register this phone as a device
          </Text>
        )}
      </Pressable>
    </View>
  );
}
