import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ApiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** A device owned by the authenticated user. */
export type Device = components["schemas"]["Device"];

/** Paginated device list returned by `GET /v1/devices`. */
export type DeviceList = components["schemas"]["DeviceList"];

/** Lifecycle state of a device. */
export type DeviceState = Device["state"];

/** Body for `POST /v1/device/register`. */
export type DeviceRegisterRequest = components["schemas"]["DeviceRegisterRequest"];

/** Response from `POST /v1/device/register`. */
export type DeviceRegisterResponse = components["schemas"]["DeviceRegisterResponse"];

/** Body for `POST /v1/devices/{id}/claim`. */
export type DeviceClaimRequest = components["schemas"]["DeviceClaimRequest"];

/**
 * Query key for the authenticated user's device list. Exported so reads and
 * invalidations across screens stay aligned on a single key.
 */
export const devicesQueryKey = ["/v1/devices"] as const;

/**
 * Fetch the authenticated user's devices. The path doubles as the query key, so
 * the request flows through the default queryFn (auth header + refresh-on-401 +
 * typed errors). The first page is enough for the device picker today — wire in
 * `nextCursor` if a user ever owns more devices than one page returns.
 */
export function useDevices() {
  return useQuery<DeviceList>({ queryKey: devicesQueryKey });
}

/**
 * Register the app itself as a virtual device via `POST /v1/device/register`.
 * Authenticates with the user's JWT (the client's default), so the backend
 * binds the device to the caller. Always sends `virtual: true`; the returned
 * `claimCode` is then handed to {@link useClaimDevice}.
 */
export function useRegisterVirtualDevice() {
  return useMutation<DeviceRegisterResponse, ApiError, DeviceRegisterRequest>({
    mutationFn: (body) =>
      api.post<DeviceRegisterResponse>("/v1/device/register", body),
  });
}

/** Arguments for claiming a freshly registered device. */
export type ClaimDeviceArgs = {
  deviceId: string;
  claimCode: string;
  name?: string;
};

/**
 * Claim an unclaimed device via `POST /v1/devices/{id}/claim`, transferring
 * ownership to the authenticated user. Invalidates the device list so the
 * newly claimed device shows up everywhere it's read.
 */
export function useClaimDevice() {
  const queryClient = useQueryClient();
  return useMutation<Device, ApiError, ClaimDeviceArgs>({
    mutationFn: ({ deviceId, claimCode, name }) =>
      api.post<Device>(`/v1/devices/${deviceId}/claim`, {
        claimCode,
        ...(name ? { name } : {}),
      } satisfies DeviceClaimRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devicesQueryKey });
    },
  });
}
