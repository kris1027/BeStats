import {
  type AuthActionState,
  failure,
  fromZodError,
  IDLE_STATE,
} from "@bestats/core/auth/action-state";
import {
  AUTH_OUTCOME,
  AUTH_PANEL_COPY,
  RECOVERY_UNAVAILABLE_MESSAGE,
  RESET_LINK_PHONE_NOTE,
  RESET_REQUESTED_MESSAGE,
} from "@bestats/core/auth/messages";
import { emailOnlySchema } from "@bestats/core/auth/schemas";
import { appResetRedirectUrl } from "@bestats/core/links/app-links";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { AuthIntro } from "@/components/auth-intro";
import { FormAlert, FormField } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { authErrorOutcome } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

/**
 * Ask for a password reset email from the phone (spec 0033, child 0036),
 * the web's `requestPasswordResetAction` with the request going straight to
 * Supabase Auth.
 *
 * The link comes back to `/reset-password/app`, never the web's
 * `/auth/callback`, because the client runs PKCE: the proof that redeems the
 * code stays on this phone (prompts/mobile-deep-links.md, decisions 6 and 7).
 * Like the web, any answer but a rate limit reads as "on its way", so the
 * screen never tells whether an address has an account. While the build
 * sends no email it shows the same notice as the web and no form, never a
 * false success (AGENTS.md section 11).
 */
export default function ForgotPassword() {
  const env = getPublicEnv();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<AuthActionState>(IDLE_STATE);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (env.EXPO_PUBLIC_AUTH_EMAIL_DELIVERY === "off") {
    return (
      <View className="flex-1 gap-5 px-4 pt-6">
        <AuthIntro
          copy={{
            title: AUTH_PANEL_COPY.forgotPassword.title,
            description: RECOVERY_UNAVAILABLE_MESSAGE,
          }}
        />
      </View>
    );
  }

  async function submit() {
    setState(IDLE_STATE);
    setSent(false);
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      setState(fromZodError(parsed.error));
      return;
    }
    const redirectTo = appResetRedirectUrl(env.EXPO_PUBLIC_API_BASE_URL);
    if (!redirectTo) {
      setState(failure(AUTH_OUTCOME.unexpected));
      return;
    }
    setBusy(true);
    try {
      const { error: authError } =
        await getSupabase().auth.resetPasswordForEmail(parsed.data.email, {
          redirectTo,
        });
      // Only a rate limit is shown, exactly as on the web, so the answer
      // never reveals whether the address has an account.
      if (authError && authErrorOutcome(authError) === AUTH_OUTCOME.rateLimited)
        setState(failure(AUTH_OUTCOME.rateLimited));
      else setSent(true);
    } catch {
      setState(failure(AUTH_OUTCOME.unexpected));
    } finally {
      setBusy(false);
    }
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
        <AuthIntro
          copy={{
            title: AUTH_PANEL_COPY.forgotPassword.title,
            description: `${AUTH_PANEL_COPY.forgotPassword.description} ${RESET_LINK_PHONE_NOTE}`,
          }}
        />
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={state.fieldErrors?.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        <FormAlert state={state} />
        {sent ? <Notice message={RESET_REQUESTED_MESSAGE} /> : null}
        <GlassButton
          variant="primary"
          label="Send the reset link"
          busy={busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
