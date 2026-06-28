import { useQuery } from "@tanstack/react-query";

import type { components } from "@/lib/api/schema";

/** A single event a device pushed (discriminated union keyed by `type`). */
export type DeviceEvent = components["schemas"]["DeviceEvent"];

/** A `card_unknown` event: a scanned UID not bound to any audio on the device. */
export type DeviceEventCardUnknown =
  components["schemas"]["DeviceEventCardUnknown"];

/** A page of device events returned by `GET /v1/devices/{id}/events`. */
export type DeviceEventList = components["schemas"]["DeviceEventList"];

/** How often the "cards to bind" list re-polls while its screen is mounted. */
const CARD_UNKNOWN_POLL_MS = 5_000;

/**
 * Query key for a device's `card_unknown` events. The path (with its query
 * string) doubles as the key so the read flows through the default queryFn.
 */
export function cardUnknownEventsQueryKey(deviceId: string) {
  return [`/v1/devices/${deviceId}/events?type=card_unknown`] as const;
}

/** Narrow a `DeviceEvent` to the `card_unknown` variant. */
function isCardUnknown(event: DeviceEvent): event is DeviceEventCardUnknown {
  return event.type === "card_unknown";
}

/** Keep the first (newest) event per UID, preserving the newest-first order. */
function dedupeByUid(events: DeviceEventCardUnknown[]): DeviceEventCardUnknown[] {
  const seen = new Set<string>();
  const out: DeviceEventCardUnknown[] = [];
  for (const event of events) {
    if (seen.has(event.payload.uid)) {
      continue;
    }
    seen.add(event.payload.uid);
    out.push(event);
  }
  return out;
}

/**
 * Poll a device's `card_unknown` events for the "cards to bind" list.
 *
 * Polling (not SSE/websockets) is the v1 contract. The endpoint orders events
 * newest-first; we keep that order but collapse repeats of the same UID — a
 * card tapped several times yields several events, yet the user only needs to
 * bind it once. Polling runs only while the screen holding this hook is
 * mounted; `refetchIntervalInBackground` stays off so we don't poll while the
 * app is backgrounded. The first page is enough today — wire in `nextCursor`
 * if a device ever buffers more unbound cards than one page returns.
 */
export function useCardUnknownEvents(deviceId: string) {
  return useQuery<DeviceEventList, Error, DeviceEventCardUnknown[]>({
    queryKey: cardUnknownEventsQueryKey(deviceId),
    enabled: Boolean(deviceId),
    refetchInterval: CARD_UNKNOWN_POLL_MS,
    select: (data) => dedupeByUid(data.items.filter(isCardUnknown)),
  });
}
