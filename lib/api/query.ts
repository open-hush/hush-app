import { QueryClient, type QueryFunction } from "@tanstack/react-query";

import { ApiError, apiRequest } from "@/lib/api/client";

// Default query function: the first element of the query key is treated as the
// request path, so a read is just `useQuery({ queryKey: ["/v1/devices"] })` and
// it flows through the API client (auth header + refresh-on-401 + typed errors).
const defaultQueryFn: QueryFunction = async ({ queryKey, signal }) => {
  const path = queryKey[0];
  if (typeof path !== "string") {
    throw new Error(
      "The default queryFn expects the first queryKey element to be a request path string.",
    );
  }
  return apiRequest(path, { method: "GET", signal });
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Don't retry client errors (auth, validation, not-found) — only transient
      // network/5xx failures. The client already handles 401 via refresh.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
