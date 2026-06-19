import { useQuery } from "@tanstack/react-query";

import type { components } from "@/lib/api/schema";

/** A device owned by the authenticated user. */
export type Device = components["schemas"]["Device"];

/** Paginated device list returned by `GET /v1/devices`. */
export type DeviceList = components["schemas"]["DeviceList"];

/** Lifecycle state of a device. */
export type DeviceState = Device["state"];

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
