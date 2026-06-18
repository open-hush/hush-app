import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";

import { queryClient } from "@/lib/api/query";
import { refreshAccessToken } from "@/lib/auth/refresh";
import { useAuthStore } from "@/lib/auth/store";

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Read the persisted refresh token from SecureStore (fast, local).
      await hydrate();
      if (cancelled) return;
      // Then attempt a silent refresh in the background to mint an access
      // token. Failure just means there is no valid session — stay logged out.
      refreshAccessToken().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // Hold the first render until the token has been read so consumers never see
  // a transient "logged out" state before hydration completes.
  if (!hydrated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
