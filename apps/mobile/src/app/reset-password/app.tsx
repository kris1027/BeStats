import {
  type AuthActionState,
  failure,
  fromZodError,
  IDLE_STATE,
} from "@bestats/core/auth/action-state";
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  AUTH_PANEL_COPY,
  CHANGE_PASSWORD_COPY,
  RECOVERY_UNAVAILABLE_MESSAGE,
  SIGN_IN_NOTICE,
} from "@bestats/core/auth/messages";
import {
  PASSWORD_HINT_SENTENCE,
  resetPasswordSchema,
} from "@bestats/core/auth/schemas";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { AuthIntro } from "@/components/auth-intro";
import { LoadingState } from "@/components/centered-state";
import { FormAlert, FormField } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { newPasswordFailure } from "@/lib/auth-errors";
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
  const [state, setState] = useState<AuthActionState>(IDLE_STATE);
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
      <View className="flex-1 gap-5 px-4 pt-6">
        <AuthIntro
          copy={{
            title: AUTH_PANEL_COPY.resetPassword.title,
            description: RECOVERY_UNAVAILABLE_MESSAGE,
          }}
        />
      </View>
    );
  }

  if (link === "checking") return <LoadingState label="Checking the link" />;

  if (link === "invalid") {
    return (
      <View className="flex-1 gap-5 px-4 pt-6">
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
    setState(IDLE_STATE);
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setState(fromZodError(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await getSupabase().auth.updateUser({
        password: parsed.data.password,
      });
      if (authError) {
        setState(newPasswordFailure(authError));
        return;
      }
    } catch {
      setState(failure(AUTH_OUTCOME.unexpected));
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
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-6"
        keyboardShouldPersistTaps="handled"
      >
        <AuthIntro copy={AUTH_PANEL_COPY.resetPassword} />
        <FormField
          label={CHANGE_PASSWORD_COPY.newLabel}
          hint={PASSWORD_HINT_SENTENCE}
          secure
          value={password}
          onChangeText={setPassword}
          error={state.fieldErrors?.password}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <FormAlert state={state} />
        <GlassButton
          variant="primary"
          label="Set new password"
          busy={busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
