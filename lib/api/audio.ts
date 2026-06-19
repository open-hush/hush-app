import { useQuery } from "@tanstack/react-query";

import type { components } from "@/lib/api/schema";

/** A single audio item owned by the authenticated user. */
export type Audio = components["schemas"]["Audio"];

/** Paginated audio list returned by `GET /v1/audio`. */
export type AudioList = components["schemas"]["AudioList"];

/**
 * Query key for the authenticated user's audio library. Exported so reads and
 * invalidations across screens stay aligned on a single key.
 */
export const audioQueryKey = ["/v1/audio"] as const;

/**
 * Fetch the authenticated user's audio library. The path doubles as the query
 * key, so the request flows through the default queryFn (auth header +
 * refresh-on-401 + typed errors).
 *
 * Device sync (`AudioSyncEntry`) intentionally carries no human title — the
 * firmware never needs one. The scan UI uses this list purely to label a bound
 * card with its track title; playback still resolves URLs from the sync payload.
 * The first page is enough for that label today — wire in `nextCursor` if a user
 * ever owns more audio than one page returns.
 */
export function useAudioList() {
  return useQuery<AudioList>({ queryKey: audioQueryKey });
}
