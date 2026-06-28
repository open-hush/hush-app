import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { type ApiError } from "@/lib/api/client";
import { useClaimDevice } from "@/lib/api/devices";
import { ImprovProvisionError, usePairingStore } from "@/lib/ble";

const claimSchema = z.object({
  claimCode: z.string().min(1, "Enter the claim code."),
  name: z.string().max(60, "Name is too long.").optional(),
});

type ClaimForm = z.infer<typeof claimSchema>;

type Phase =
  | { kind: "provisioning" }
  | { kind: "online"; claimParams: ClaimParams }
  | { kind: "provision_error"; message: string }
  | { kind: "done" };

/**
 * Claim parameters the app must resolve before it can call
 * `POST /v1/devices/{id}/claim`. `claimCode` the user can type; `deviceId` it
 * cannot (a UUID), so it must come from the device.
 *
 * OPEN DECISION (OPE-49): the current firmware sends an empty Improv result
 * (`hush-device/src/tasks/ble.rs`), so the app has no source for `deviceId`
 * after pairing. The forward-compatible path implemented here reads it from a
 * post-provisioning redirect URL — the standard Improv mechanism — but that
 * URL's shape is not yet pinned in `hush-protocol`. Until the team decides how
 * the app learns the deviceId (redirect URL vs. a claim-by-code endpoint), the
 * claim step stays gated. This is escalated in the PR; nothing here invents the
 * contract.
 */
type ClaimParams = {
  deviceId: string | null;
  claimCode: string | null;
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Best-effort extraction of claim parameters from the device's redirect URLs.
 * Looks for `deviceId` / `claimCode` query params, falling back to a UUID found
 * anywhere in the URL path. Returns nulls when nothing usable is present (the
 * current firmware case).
 */
function extractClaimParams(redirectUrls: string[]): ClaimParams {
  for (const raw of redirectUrls) {
    try {
      const url = new URL(raw);
      const deviceId =
        url.searchParams.get("deviceId") ??
        url.searchParams.get("device_id") ??
        url.pathname.match(UUID_RE)?.[0] ??
        null;
      const claimCode =
        url.searchParams.get("claimCode") ??
        url.searchParams.get("claim_code") ??
        null;
      if (deviceId || claimCode) {
        return { deviceId, claimCode };
      }
    } catch {
      // Not a URL — ignore and try the next string.
    }
  }
  return { deviceId: null, claimCode: null };
}

/**
 * Step 3 of pairing: write the Wi-Fi credentials over Improv, wait for the
 * device to report it joined the network (Improv state `Provisioned`), then
 * claim it for the signed-in user.
 */
export default function ConfirmScreen() {
  const connection = usePairingStore((s) => s.connection);
  const credentials = usePairingStore((s) => s.credentials);
  const setRedirectUrls = usePairingStore((s) => s.setRedirectUrls);
  const reset = usePairingStore((s) => s.reset);
  const claim = useClaimDevice();

  const [phase, setPhase] = useState<Phase>({ kind: "provisioning" });
  const [claimError, setClaimError] = useState<string | null>(null);
  // Guard the one-shot provisioning effect against React's double-invoke.
  const startedRef = useRef(false);

  const provision = useCallback(async () => {
    if (!connection || !credentials) {
      return;
    }
    setPhase({ kind: "provisioning" });
    try {
      const result = await connection.sendWifiSettings(
        credentials.ssid,
        credentials.password,
      );
      setRedirectUrls(result.redirectUrls);
      setPhase({
        kind: "online",
        claimParams: extractClaimParams(result.redirectUrls),
      });
    } catch (error) {
      const message =
        error instanceof ImprovProvisionError || error instanceof Error
          ? error.message
          : "Setup failed. Please try again.";
      setPhase({ kind: "provision_error", message });
    }
  }, [connection, credentials, setRedirectUrls]);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void provision();
  }, [provision]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ClaimForm>({
    resolver: zodResolver(claimSchema),
    defaultValues: { claimCode: "", name: "" },
    mode: "onSubmit",
  });

  const onClaim = handleSubmit(async ({ claimCode, name }) => {
    if (phase.kind !== "online" || !phase.claimParams.deviceId) {
      return;
    }
    setClaimError(null);
    try {
      await claim.mutateAsync({
        deviceId: phase.claimParams.deviceId,
        claimCode: claimCode.trim(),
        name: name?.trim() ? name.trim() : undefined,
      });
      setPhase({ kind: "done" });
      reset();
      router.dismissAll();
      router.replace("/(tabs)/devices");
    } catch (error) {
      setClaimError(mapClaimError(error));
    }
  });

  // --- Provisioning ---------------------------------------------------------

  if (!connection || !credentials) {
    return (
      <Centered>
        <Text className="text-center text-base font-semibold text-neutral-900">
          Pairing session expired
        </Text>
        <Pressable
          onPress={() => {
            reset();
            router.replace("/pairing/scan");
          }}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">Start over</Text>
        </Pressable>
      </Centered>
    );
  }

  if (phase.kind === "provisioning") {
    return (
      <Centered>
        <ActivityIndicator />
        <Text className="text-center text-base font-semibold text-neutral-900">
          Bringing the device online
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          Sending your Wi-Fi credentials and waiting for the device to join the
          network. This can take up to 30 seconds.
        </Text>
      </Centered>
    );
  }

  if (phase.kind === "provision_error") {
    return (
      <Centered>
        <Text className="text-center text-lg font-semibold text-neutral-900">
          Couldn&apos;t bring the device online
        </Text>
        <Text className="text-center text-sm text-neutral-500">
          {phase.message}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="rounded-2xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">
            Edit Wi-Fi details
          </Text>
        </Pressable>
      </Centered>
    );
  }

  // --- Online → claim -------------------------------------------------------

  const canClaim = phase.kind === "online" && phase.claimParams.deviceId !== null;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 24, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <Text className="text-sm font-semibold text-emerald-700">
          Device online
        </Text>
        <Text className="text-sm text-emerald-700">
          It joined your network. Enter the claim code to add it to your
          account.
        </Text>
      </View>

      {!canClaim ? (
        <View className="gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Text className="text-sm font-semibold text-amber-700">
            Claim step unavailable
          </Text>
          <Text className="text-sm text-amber-700">
            This firmware doesn&apos;t report which device just came online, so
            the app can&apos;t complete the claim yet. The device is online and
            will appear once claiming is wired up.
          </Text>
        </View>
      ) : null}

      <View className="gap-4">
        <View className="gap-2">
          <Text className="text-sm font-medium text-neutral-700">
            Claim code
          </Text>
          <Controller
            control={control}
            name="claimCode"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={canClaim}
                placeholder="428913"
                placeholderTextColor="#a3a3a3"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 font-mono text-xl tracking-widest text-neutral-900"
              />
            )}
          />
          {errors.claimCode ? (
            <Text className="text-sm text-red-600">
              {errors.claimCode.message}
            </Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-neutral-700">
            Device name (optional)
          </Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={canClaim}
                placeholder="Marta's box"
                placeholderTextColor="#a3a3a3"
                maxLength={60}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900"
              />
            )}
          />
        </View>
      </View>

      {claimError ? (
        <View className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-sm font-medium text-red-700">{claimError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onClaim}
        disabled={!canClaim || claim.isPending}
        className={`rounded-2xl px-6 py-4 ${
          canClaim && !claim.isPending ? "bg-indigo-600" : "bg-indigo-300"
        }`}
      >
        <Text className="text-center text-base font-semibold text-white">
          {claim.isPending ? "Claiming…" : "Claim device"}
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
          Done for now
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** Map a claim failure to a user-facing message keyed on the spec's codes. */
function mapClaimError(error: unknown): string {
  const apiError = error as Partial<ApiError>;
  switch (apiError?.code) {
    case "device_already_claimed":
      return "This device is already owned by another account.";
    case "not_found":
      return "We couldn't find that device. Double-check the claim code.";
    case "validation_failed":
      return "That claim code looks invalid or has expired.";
    default:
      return apiError?.message ?? "Couldn't claim the device. Please try again.";
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
      {children}
    </View>
  );
}
