import { Stack } from "expo-router";

// Device-scoped detail flow, presented over the Devices tab: detail → cards to
// bind → audio picker. Each screen sets its own header title via `Stack.Screen`
// so the dynamic `[id]` segment never leaks into the title.
export default function DevicesStackLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
