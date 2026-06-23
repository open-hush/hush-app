import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { loginWithPassword } from "@/lib/auth/login";

// Login validates shape only: a well-formed email and a non-empty password.
// The password-strength rule (>= 12 chars) is enforced server-side at account
// creation, not here — gating login on it would lock out otherwise valid
// accounts. There is no public self-registration (admin-only per the spec), so
// this screen is the single entry point into the app.
const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Incorrect email or password.";
    }
    if (err.status === 429) {
      return "Too many attempts. Wait a moment and try again.";
    }
    return err.message;
  }
  return "Couldn't sign in. Check your connection and try again.";
}

export default function LoginScreen() {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: FormValues) => loginWithPassword(values),
    onSuccess: () => router.replace("/devices"),
  });

  const submit = handleSubmit((values) => login.mutate(values));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-950"
    >
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-2">
          <Text className="text-3xl font-semibold text-white">Hush</Text>
          <Text className="text-base text-neutral-400">
            Sign in to manage your devices and audio.
          </Text>
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-300">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="you@example.com"
                placeholderTextColor="#737373"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!login.isPending}
                className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-white"
              />
            )}
          />
          {errors.email ? (
            <Text className="text-sm text-red-400">{errors.email.message}</Text>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-300">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Your password"
                placeholderTextColor="#737373"
                autoCapitalize="none"
                autoComplete="password"
                autoCorrect={false}
                secureTextEntry
                editable={!login.isPending}
                onSubmitEditing={submit}
                returnKeyType="go"
                className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-white"
              />
            )}
          />
          {errors.password ? (
            <Text className="text-sm text-red-400">
              {errors.password.message}
            </Text>
          ) : null}
        </View>

        {login.isError ? (
          <View className="rounded-2xl border border-red-900 bg-red-950 p-3">
            <Text className="text-sm font-medium text-red-300">
              {toErrorMessage(login.error)}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={login.isPending}
          className={`rounded-2xl px-6 py-4 ${
            login.isPending ? "bg-indigo-400" : "bg-indigo-600"
          }`}
        >
          <Text className="text-center text-base font-semibold text-white">
            {login.isPending ? "Signing in…" : "Sign in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
