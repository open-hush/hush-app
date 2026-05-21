import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function LoginScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-neutral-950 px-6">
      <Text className="text-2xl font-semibold text-white">Hush</Text>
      <Text className="text-neutral-400">Login — phase 2 stub</Text>
      <Link href="/register" className="text-blue-400">
        Need an account? Register
      </Link>
    </View>
  );
}
