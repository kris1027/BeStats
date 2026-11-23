import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  RECOVERY_UNAVAILABLE_MESSAGE,
  RESET_REQUESTED_MESSAGE,
} from "@bestats/core/auth/messages";
import { emailOnlySchema } from "@bestats/core/auth/schemas";
import { appResetRedirectUrl } from "@bestats/core/links/app-links";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { FormField, INPUT_CLASS } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { TextInput } from "@/components/text";
import { authErrorMessage } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { tokenColor } from "@/theme/token-vars";

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
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (env.EXPO_PUBLIC_AUTH_EMAIL_DELIVERY === "off") {
    return (
      <View className="flex-1 gap-5 px-4 pt-6">
        <Notice message={RECOVERY_UNAVAILABLE_MESSAGE} />
      </View>
    );
  }

  async function submit() {
    setError(null);
    setSent(false);
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          AUTH_MESSAGES[AUTH_OUTCOME.invalidInput],
      );
      return;
    }
    const redirectTo = appResetRedirectUrl(env.EXPO_PUBLIC_API_BASE_URL);
    if (!redirectTo) {
      setError(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
      return;
    }
    setBusy(true);
    try {
      const { error: authError } =
        await getSupabase().auth.resetPasswordForEmail(parsed.data.email, {
          redirectTo,
        });
      const message = authError ? authErrorMessage(authError) : null;
      // Only a rate limit is shown, exactly as on the web, so the answer
      // never reveals whether the address has an account.
      if (message === AUTH_MESSAGES[AUTH_OUTCOME.rateLimited])
        setError(message);
      else setSent(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <View className="gap-5 px-4 pt-6">
        <Notice message="Enter your address and we will send you a link to set a new password. Open it on this phone." />
        <FormField label="Email">
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="send"
            onSubmitEditing={submit}
            placeholderTextColor={tokenColor("color-muted-foreground")}
            className={INPUT_CLASS}
          />
        </FormField>
        {error ? <Notice tone="error" message={error} /> : null}
        {sent ? <Notice message={RESET_REQUESTED_MESSAGE} /> : null}
        <GlassButton
          variant="primary"
          label="Send the reset link"
          busy={busy}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
