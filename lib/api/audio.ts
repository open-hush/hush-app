import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** A single audio item owned by the authenticated user. */
export type Audio = components["schemas"]["Audio"];

/** Paginated audio list returned by `GET /v1/audio`. */
export type AudioList = components["schemas"]["AudioList"];

/** Lifecycle state of an audio item. */
export type AudioState = Audio["state"];

/** Body for `POST /v1/audio` — reserves an item and asks for an upload URL. */
export type AudioCreateRequest = components["schemas"]["AudioCreateRequest"];

/** Response for `POST /v1/audio` — the created item plus a presigned PUT. */
export type AudioCreateResponse = components["schemas"]["AudioCreateResponse"];

/**
 * Query key for the authenticated user's audio library. Exported so reads and
 * invalidations across screens stay aligned on a single key.
 */
export const audioQueryKey = ["/v1/audio"] as const;

/** True while any item is mid-pipeline and its state can still change. */
function hasInFlight(list: AudioList | undefined): boolean {
  return (list?.items ?? []).some(
    (a) => a.state === "uploading" || a.state === "processing",
  );
}

/**
 * Fetch the authenticated user's audio library. The path doubles as the query
 * key, so the request flows through the default queryFn (auth header +
 * refresh-on-401 + typed errors).
 *
 * Polls every 3s while any item is `uploading`/`processing` so state badges
 * advance to `ready`/`failed` without a manual refresh, then settles to no
 * polling once everything is terminal. The scan UI consumes the same key purely
 * to label bound cards with their title; the polling is harmless there because
 * it only kicks in while an upload is actually in flight. The first page is
 * enough for both today — wire in `nextCursor` if a user ever owns more audio
 * than one page returns.
 */
export function useAudioList() {
  return useQuery<AudioList>({
    queryKey: audioQueryKey,
    refetchInterval: (query) => (hasInFlight(query.state.data) ? 3000 : false),
  });
}

/**
 * `POST /v1/audio` — reserve an item (state `uploading`) and get a presigned
 * PUT URL for the raw file.
 */
export function createAudio(body: AudioCreateRequest) {
  return api.post<AudioCreateResponse>("/v1/audio", body);
}

/**
 * `POST /v1/audio/{id}/finalize` — tell the backend the raw upload landed so it
 * can transcode. Moves the item to `processing`.
 */
export function finalizeAudio(id: string) {
  return api.post<Audio>(`/v1/audio/${id}/finalize`);
}

/**
 * `DELETE /v1/audio/{id}` — remove the item and its stored objects. Cascades to
 * any card bindings that point at it.
 */
export function deleteAudio(id: string) {
  return api.del<void>(`/v1/audio/${id}`);
}

/**
 * PUT the picked file straight to S3 using the presigned upload descriptor.
 *
 * This bypasses the API client on purpose: the URL is pre-signed (no auth
 * header) and the body is raw bytes, so we stream the local file with
 * `expo-file-system` rather than buffering it through `fetch`. The signature is
 * bound to `contentType`, so the same value sent as `sourceContentType` must be
 * echoed here verbatim, alongside any headers the backend asked us to include.
 */
export async function uploadToPresignedUrl(
  upload: AudioCreateResponse["upload"],
  fileUri: string,
  contentType: string,
): Promise<void> {
  const result = await FileSystem.uploadAsync(upload.url, fileUri, {
    httpMethod: upload.method,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType, ...(upload.headers ?? {}) },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status}).`);
  }
}
