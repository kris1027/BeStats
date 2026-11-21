import {
  ACCOUNT_COPY,
  AUTH_MESSAGES,
  AUTH_OUTCOME,
} from "@bestats/core/auth/messages";
import { signInSchema } from "@bestats/core/auth/schemas";
import { SIGN_IN_ACTION_LABEL } from "@bestats/core/tracking/messages";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

import { FormField, INPUT_CLASS } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { authErrorMessage } from "@/lib/auth-errors";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { tokenColor } from "@/theme/token-vars";

/**
 * Email and password sign in (spec 0033, AC-11; child 0036), straight to
 * Supabase Auth with the same rules (`signInSchema`) and copy as the web.
 * The password never passes through BeStats' own server. Forgot password
 * stays hidden while production sends no email
 * (`EXPO_PUBLIC_AUTH_EMAIL_DELIVERY`), exactly as on the web.
 *
 * It opens as a modal over the tabs, so signing in closes it and leaves you
 * on the screen that asked (prompts/mobile-app-shell-catalog.md, decision 3).
 */
export default function SignIn() {
  const { session, notice, clearNotice } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <CloseSignIn />;

  async function submit() {
    setError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          AUTH_MESSAGES[AUTH_OUTCOME.invalidInput],
      );
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await getSupabase().auth.signInWithPassword(
        parsed.data,
      );
      if (authError) setError(authErrorMessage(authError));
      else clearNotice();
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="gap-5 px-4 pt-6">
        {notice ? <Notice message={notice} /> : null}
        <FormField label="Email">
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            placeholderTextColor={tokenColor("color-muted-foreground")}
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField label="Password">
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            className={INPUT_CLASS}
          />
        </FormField>
        {error ? <Notice tone="error" message={error} /> : null}
        <GlassButton
          variant="primary"
          label={SIGN_IN_ACTION_LABEL}
          busy={busy}
          onPress={submit}
        />
        <GlassButton
          label={ACCOUNT_COPY.createAccount}
          onPress={() => router.replace("/sign-up")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Closes the modal once signed in, or opens Home when nothing is under it. */
function CloseSignIn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  return null;
}
