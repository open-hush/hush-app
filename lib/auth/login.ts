import { router } from "expo-router";

import { api } from "@/lib/api/client";
import { queryClient } from "@/lib/api/query";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/lib/auth/store";

type AuthTokens = components["schemas"]["AuthTokens"];
type UserLoginRequest = components["schemas"]["UserLoginRequest"];
type User = components["schemas"]["User"];

/**
 * Exchange email + password for a token pair (`POST /v1/users/login`), persist
 * the tokens, and prime the in-memory profile so the tab shell has the user
 * immediately. The login call is public, so it skips the Authorization header
 * and the refresh-on-401 dance; the follow-up `/me` read uses the fresh token.
 */
export async function loginWithPassword(
  credentials: UserLoginRequest,
): Promise<void> {
  const tokens = await api.post<AuthTokens>("/v1/users/login", credentials, {
    auth: false,
  });
  await useAuthStore.getState().setTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });

  const user = await api.get<User>("/v1/users/me");
  useAuthStore.getState().setUser(user);
}

/**
 * Sign the user out: there is no server-side logout endpoint, so this clears the
 * persisted refresh token and in-memory state, drops every cached query so the
 * next account never sees the previous one's data, and routes back to login.
 */
export async function logout(): Promise<void> {
  await useAuthStore.getState().clearTokens();
  queryClient.clear();
  router.replace("/login");
}
