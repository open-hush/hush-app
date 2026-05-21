import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function RegisterScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-neutral-950 px-6">
      <Text className="text-2xl font-semibold text-white">Hush</Text>
      <Text className="text-neutral-400">Register — phase 2 stub</Text>
      <Link href="/login" className="text-blue-400">
        Already have an account? Log in
      </Link>
    </View>
  );
}
