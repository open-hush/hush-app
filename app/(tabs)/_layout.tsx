import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="devices" options={{ title: "Devices" }} />
      <Tabs.Screen name="device-mode" options={{ title: "Device Mode" }} />
      <Tabs.Screen name="audio" options={{ title: "Audio" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
