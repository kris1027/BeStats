import { signInSchema } from "@bestats/core/auth/schemas";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { signInErrorMessage } from "@/lib/auth-errors";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { tokenColor } from "@/theme/token-vars";

/**
 * Email and password sign in (spec 0033, AC-11; child 0036), straight to
 * Supabase Auth with the same rules (`signInSchema`) and copy as the web.
 * The password never passes through BeStats' own server. Forgot password
 * stays hidden while production sends no email
 * (`EXPO_PUBLIC_AUTH_EMAIL_DELIVERY`), exactly as on the web.
 */
export default function SignIn() {
  const { session, notice, clearNotice } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Redirect href="/" />;

  async function submit() {
    setError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await getSupabase().auth.signInWithPassword(
        parsed.data,
      );
      if (authError) setError(signInErrorMessage(authError));
      else clearNotice();
    } catch {
      setError(signInErrorMessage({}));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="gap-5 px-4 pt-6">
        {notice ? <Notice message={notice} /> : null}
        <View className="gap-2">
          <Text className="font-semibold text-text-label">Email</Text>
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            placeholderTextColor={tokenColor("color-muted-foreground")}
            className={inputClass}
          />
        </View>
        <View className="gap-2">
          <Text className="font-semibold text-text-label">Password</Text>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            className={inputClass}
          />
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        <GlassButton
          variant="primary"
          label="Sign in"
          busy={busy}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
