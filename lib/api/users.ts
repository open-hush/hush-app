import { useQuery } from "@tanstack/react-query";

import type { components } from "@/lib/api/schema";

/** The authenticated user's profile. */
export type User = components["schemas"]["User"];

/** Authorization role of an account. */
export type UserRole = User["role"];

/**
 * Query key for the authenticated user's profile. Exported so the profile
 * screen and any future consumer stay aligned on a single key, and so logout
 * can target it for removal.
 */
export const meQueryKey = ["/v1/users/me"] as const;

/**
 * Fetch the authenticated user's profile (`GET /v1/users/me`). The path doubles
 * as the query key, so the request flows through the default queryFn (auth
 * header + refresh-on-401 + typed errors).
 */
export function useMe() {
  return useQuery<User>({ queryKey: meQueryKey });
}
