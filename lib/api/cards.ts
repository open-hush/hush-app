import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ApiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** A card UID bound to an audio item on a device. */
export type CardBinding = components["schemas"]["CardBinding"];

/** List of bindings returned by `GET /v1/devices/{id}/cards`. */
export type CardBindingList = components["schemas"]["CardBindingList"];

/** Body for `POST /v1/devices/{id}/cards`. */
export type CardBindingRequest = components["schemas"]["CardBindingRequest"];

/**
 * Query key for a device's card bindings. Exported so the detail screen, the
 * bind flow and the unbind mutation stay aligned on a single key. The path
 * doubles as the key, so the read flows through the default queryFn (auth
 * header + refresh-on-401 + typed errors).
 */
export function cardBindingsQueryKey(deviceId: string) {
  return [`/v1/devices/${deviceId}/cards`] as const;
}

/** Fetch the bindings currently configured on a device. */
export function useCardBindings(deviceId: string) {
  return useQuery<CardBindingList>({
    queryKey: cardBindingsQueryKey(deviceId),
    enabled: Boolean(deviceId),
  });
}

/**
 * Bind a card UID to an audio item via `POST /v1/devices/{id}/cards`.
 * Invalidates the device's bindings so the new binding shows up on the detail
 * screen and drops out of the "cards to bind" list (which subtracts already
 * bound UIDs) on the next read.
 */
export function useBindCard(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation<CardBinding, ApiError, CardBindingRequest>({
    mutationFn: (body) =>
      api.post<CardBinding>(`/v1/devices/${deviceId}/cards`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: cardBindingsQueryKey(deviceId),
      });
    },
  });
}

/**
 * Unbind a card via `DELETE /v1/devices/{id}/cards/{uid}`. Invalidates the
 * device's bindings so the row disappears from the detail screen.
 */
export function useUnbindCard(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (uid) => api.del<void>(`/v1/devices/${deviceId}/cards/${uid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: cardBindingsQueryKey(deviceId),
      });
    },
  });
}
