import { API_BASE_URL } from "@/lib/api/config";
import type { components } from "@/lib/api/schema";
import { useAuthStore } from "@/lib/auth/store";

type AuthTokens = components["schemas"]["AuthTokens"];
type RefreshRequest = components["schemas"]["RefreshRequest"];

// A single in-flight refresh shared by all callers. The refresh token is
// single-use and rotated on every call, so two concurrent refreshes would
// invalidate each other and sign the user out. De-duping serialises them onto
// one network request.
let inflight: Promise<string> | null = null;

/**
 * Exchange the stored refresh token for a fresh access/refresh pair, update the
 * auth store, and return the new access token. Throws if there is no refresh
 * token or the backend rejects it.
 *
 * Uses a raw `fetch` rather than the API client on purpose: the client calls
 * this function when it sees a 401, so routing refresh through it would recurse.
 */
export function refreshAccessToken(): Promise<string> {
  if (!inflight) {
    inflight = performRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function performRefresh(): Promise<string> {
  const { refreshToken, setTokens } = useAuthStore.getState();

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const body: RefreshRequest = { refreshToken };
  const response = await fetch(`${API_BASE_URL}/v1/users/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed (status ${response.status})`);
  }

  const tokens = (await response.json()) as AuthTokens;
  await setTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return tokens.accessToken;
}
