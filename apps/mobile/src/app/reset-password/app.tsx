import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  RECOVERY_UNAVAILABLE_MESSAGE,
  SIGN_IN_NOTICE,
} from "@bestats/core/auth/messages";
import { PASSWORD_HINT, resetPasswordSchema } from "@bestats/core/auth/schemas";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

import { LoadingState } from "@/components/centered-state";
import { FormField, INPUT_CLASS } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { authErrorMessage } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";

type LinkState = "checking" | "ready" | "invalid";

/**
 * `/reset-password/app`: where a reset asked in the app comes back, by
 * Universal Link, App Link or `bestats://` (spec 0033, AC-16; child 0036).
 *
 * The code is exchanged once, with the PKCE proof this phone stored when it
 * asked, then dropped from the route so it never lingers on screen. Saving
 * mirrors the web's `resetPasswordAction`: the new password, then a sign out
 * everywhere, then sign in with the web's "password saved" notice. A used,
 * expired or foreign code shows the web's invalid link message with a way to
 * ask again, and nothing claims success before Supabase answers (AGENTS.md
 * section 11).
 */
export default function AppResetPassword() {
  const delivery = getPublicEnv().EXPO_PUBLIC_AUTH_EMAIL_DELIVERY;
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const { signOut } = useSession();
  const [link, setLink] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if (delivery === "off" || exchanged.current) return;
    exchanged.current = true;
    if (typeof code !== "string" || code.length === 0) {
      setLink("invalid");
      return;
    }
    router.setParams({ code: undefined });
    getSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: authError }) => setLink(authError ? "invalid" : "ready"))
      .catch(() => setLink("invalid"));
  }, [code, delivery, router]);

  if (delivery === "off") {
    return (
      <View className="flex-1 gap-5 bg-background px-4 pt-6">
        <Notice message={RECOVERY_UNAVAILABLE_MESSAGE} />
      </View>
    );
  }

  if (link === "checking") return <LoadingState label="Checking the link" />;

  if (link === "invalid") {
    return (
      <View className="flex-1 gap-5 bg-background px-4 pt-6">
        <Notice
          tone="error"
          message={AUTH_MESSAGES[AUTH_OUTCOME.invalidLink]}
        />
        <GlassButton
          variant="primary"
          label="Request a new reset link"
          onPress={() => router.replace("/forgot-password")}
        />
      </View>
    );
  }

  async function submit() {
    setError(null);
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          AUTH_MESSAGES[AUTH_OUTCOME.invalidInput],
      );
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await getSupabase().auth.updateUser({
        password: parsed.data.password,
      });
      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }
    } catch {
      setError(authErrorMessage(null));
      return;
    } finally {
      setBusy(false);
    }
    // The password is saved, so a refused sign out cannot undo it; `signOut`
    // falls back to the local one and always ends signed out.
    await signOut();
    // The link may have opened over Sign in and Forgot password, so every
    // modal goes before Sign in opens fresh with the notice.
    router.dismissAll();
    router.push(`/sign-in?notice=${SIGN_IN_NOTICE.passwordReset}`);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="gap-5 px-4 pt-6">
        <Notice message="Choose a new password for your account. Saving it signs you out everywhere, then you sign in with the new one." />
        <FormField label="New password" hint={`${PASSWORD_HINT}.`}>
          <TextInput
            accessibilityLabel="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            className={INPUT_CLASS}
          />
        </FormField>
        {error ? <Notice tone="error" message={error} /> : null}
        <GlassButton
          variant="primary"
          label="Set new password"
          busy={busy}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
