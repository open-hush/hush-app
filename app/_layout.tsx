import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

import { queryClient } from "@/lib/api/query";
import { refreshAccessToken } from "@/lib/auth/refresh";
import { useAuthStore } from "@/lib/auth/store";

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  // Gate the first render until the session is fully resolved (SecureStore read
  // + silent refresh settled), so the landing redirect in `index` sees the
  // final auth state instead of flashing login on a returning user.
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Read the persisted refresh token from SecureStore (fast, local).
      await hydrate();
      // Then attempt a silent refresh to mint an access token. Failure (no or
      // expired refresh token) just means there is no session — stay logged
      // out; either way the auth state is settled once this resolves.
      await refreshAccessToken().catch(() => {});
      if (!cancelled) {
        setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  if (!bootstrapped) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
