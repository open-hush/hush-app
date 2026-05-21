import { Redirect } from "expo-router";

// Phase 1 stub: until auth is wired, send everyone to login.
// Phase 2 will gate this on token presence (Zustand auth store).
export default function Index() {
  return <Redirect href="/login" />;
}
