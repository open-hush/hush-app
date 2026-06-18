import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import type { components } from "@/lib/api/schema";

export type User = components["schemas"]["User"];

// Only the refresh token is persisted, and only in SecureStore. The access
// token lives in memory for the lifetime of the process and is re-minted from
// the refresh token on launch (see `hydrate` + the silent refresh in the root
// layout). It is never written to disk.
const REFRESH_TOKEN_KEY = "hush.refreshToken";

type AuthState = {
  /** Short-lived JWT. In memory only — never persisted. */
  accessToken: string | null;
  /** Long-lived, single-use token. Persisted in expo-secure-store. */
  refreshToken: string | null;
  user: User | null;
  /** True once `hydrate` has read SecureStore. Gates the first render. */
  hydrated: boolean;

  setTokens: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  clearTokens: () => Promise<void>;
  setUser: (user: User | null) => void;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  hydrated: false,

  setTokens: async ({ accessToken, refreshToken }) => {
    set({ accessToken, refreshToken });
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  clearTokens: async () => {
    set({ accessToken: null, refreshToken: null, user: null });
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  setUser: (user) => set({ user }),

  hydrate: async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    set({ refreshToken, hydrated: true });
  },
}));
