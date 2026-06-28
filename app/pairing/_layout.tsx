import { Stack } from "expo-router";

// The pairing flow lives outside the tab group: scan → wifi → confirm, each a
// step in a presented stack with its own header and back button.
export default function PairingStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="scan" options={{ title: "Pair a device" }} />
      <Stack.Screen name="wifi" options={{ title: "Wi-Fi setup" }} />
      <Stack.Screen
        name="confirm"
        options={{ title: "Finish setup", headerBackVisible: false }}
      />
    </Stack>
  );
}
