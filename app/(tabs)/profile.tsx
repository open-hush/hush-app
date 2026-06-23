import { useMutation } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useMe, type UserRole } from "@/lib/api/users";
import { logout } from "@/lib/auth/login";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  user: "User",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1 border-b border-neutral-100 py-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </Text>
      <Text className="text-base text-neutral-900">{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { data: user, isLoading, isError, error, refetch } = useMe();

  const signOut = useMutation({
    mutationFn: () => logout(),
    onError: () =>
      Alert.alert("Sign out failed", "Something went wrong. Please try again."),
  });

  const confirmSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => signOut.mutate(),
      },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      <View className="gap-2 rounded-3xl border border-neutral-200 bg-white p-5">
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <View className="items-center gap-4 py-12">
            <Text className="text-center text-sm text-neutral-500">
              {error?.message ?? "Couldn't load your profile."}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="rounded-2xl bg-indigo-600 px-6 py-3"
            >
              <Text className="text-base font-semibold text-white">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : user ? (
          <>
            <Field label="Name" value={user.displayName?.trim() || "—"} />
            <Field label="Email" value={user.email} />
            <Field label="Role" value={ROLE_LABELS[user.role]} />
          </>
        ) : null}
      </View>

      <Pressable
        onPress={confirmSignOut}
        disabled={signOut.isPending}
        className={`rounded-2xl border border-red-200 px-6 py-4 ${
          signOut.isPending ? "bg-red-50" : "bg-white"
        }`}
      >
        <Text className="text-center text-base font-semibold text-red-600">
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
