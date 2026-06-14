import { Text, View } from "react-native";

export default function LoginScreen() {
  // Self-registration was removed: accounts are not public. The backend seeds
  // the first admin at boot, and further users are created by an existing user.
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-neutral-950 px-6">
      <Text className="text-2xl font-semibold text-white">Hush</Text>
      <Text className="text-neutral-400">Login — phase 2 stub</Text>
    </View>
  );
}
