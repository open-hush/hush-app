import { router } from "expo-router";

import { API_BASE_URL } from "@/lib/api/config";
import type { components } from "@/lib/api/schema";
import { refreshAccessToken } from "@/lib/auth/refresh";
import { useAuthStore } from "@/lib/auth/store";

type ApiErrorBody = components["schemas"]["Error"];

/**
 * Error thrown for any non-2xx response. Carries the canonical `code` from the
 * spec's `Error` schema so callers can branch on it (e.g. `invalid_credentials`)
 * instead of parsing messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorBody["details"];

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? "unknown_error";
    this.details = body.details;
  }
}

export type RequestOptions = Omit<RequestInit, "body"> & {
  /** Plain object (JSON-encoded), string, or FormData. */
  body?: unknown;
  /** Attach the Bearer token and run the refresh-on-401 flow. Default: true. */
  auth?: boolean;
};

/**
 * Thin wrapper around `fetch`:
 * - Prefixes {@link API_BASE_URL} and JSON-encodes object bodies.
 * - Adds `Authorization: Bearer <accessToken>` for authenticated requests.
 * - On 401, refreshes the token once and retries; if refresh fails, signs the
 *   user out and routes to login.
 * - Throws {@link ApiError} for non-2xx responses, decoding the spec's `Error`.
 */
export async function apiRequest<TResponse = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { auth = true, body, headers, ...init } = options;

  // Built fresh each call so the retry picks up the refreshed access token.
  const send = () =>
    fetch(`${API_BASE_URL}${path}`, buildRequest(body, headers, auth, init));

  let response = await send();

  if (response.status === 401 && auth) {
    try {
      await refreshAccessToken();
    } catch {
      await signOut();
      throw new ApiError(401, {
        code: "unauthorized",
        message: "Your session has expired. Please sign in again.",
      });
    }
    response = await send();
  }

  return parse<TResponse>(response);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  del: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};

function buildRequest(
  body: unknown,
  headers: HeadersInit | undefined,
  auth: boolean,
  init: RequestInit,
): RequestInit {
  const finalHeaders = new Headers(headers);

  if (auth) {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      finalHeaders.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === "string" || body instanceof FormData) {
      serializedBody = body;
    } else {
      finalHeaders.set("Content-Type", "application/json");
      serializedBody = JSON.stringify(body);
    }
  }

  return { ...init, headers: finalHeaders, body: serializedBody };
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    const data = (await response.json()) as unknown;
    if (data && typeof data === "object") {
      body = data as Partial<ApiErrorBody>;
    }
  } catch {
    // Non-JSON error body (e.g. a gateway HTML page); fall back to status.
  }
  return new ApiError(response.status, body);
}

async function signOut(): Promise<void> {
  await useAuthStore.getState().clearTokens();
  router.replace("/login");
}
