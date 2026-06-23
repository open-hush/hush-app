import { Redirect } from "expo-router";

import { useAuthStore } from "@/lib/auth/store";

/**
 * Landing route. The root layout has already settled the session by the time
 * this renders, so the access token in memory is the source of truth: send
 * authenticated users into the tabs and everyone else to login.
 */
export default function Index() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return <Redirect href={accessToken ? "/devices" : "/login"} />;
}
