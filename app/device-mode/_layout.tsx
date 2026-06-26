import { Stack } from "expo-router";

// The device-mode flow lives outside the tab group so the picker can present
// over the tabs with its own header and back button.
export default function DeviceModeStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="select" options={{ title: "Select device" }} />
      <Stack.Screen name="register" options={{ title: "Register device" }} />
      <Stack.Screen name="scan" options={{ title: "Scan a card" }} />
    </Stack>
  );
}
