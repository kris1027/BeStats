import { isAlreadyRegistered } from "@bestats/core/auth/auth-error";
import {
  ACCOUNT_COPY,
  ACCOUNT_NOTICE,
  AUTH_MESSAGES,
  AUTH_OUTCOME,
} from "@bestats/core/auth/messages";
import { PASSWORD_HINT, signUpSchema } from "@bestats/core/auth/schemas";
import {
  USERNAME_HINT,
  USERNAME_MAX_LENGTH,
} from "@bestats/core/auth/username";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { FormField, INPUT_CLASS } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { TextInput } from "@/components/text";
import { profileKey, putUsername } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { tokenColor } from "@/theme/token-vars";

/**
 * Create an account on the phone (spec 0035, Sign up on mobile;
 * prompts/mobile-account-deletion.md, decision 8), the web action's steps
 * with the password going only to Supabase Auth, its rules and copy from core
 * (AGENTS.md sections 5 and 7):
 *
 * 1. `signUpSchema` from core, the web's rules and copy.
 * 2. `username_available` as anon, so a taken name never leaves behind an
 *    account without one; an error is never read as available.
 * 3. `supabase.auth.signUp`.
 * 4. `PUT /api/v1/me/profile` with the name, the same claim command as the
 *    web. If someone took it in between, the account stays and the Account
 *    tab opens with the taken notice, as the web sends you to `/account`.
 *
 * No session from step 3 means the project asks for email confirmation,
 * which today's config does not and the app cannot finish without deep links
 * (5e), so it says sign up is unavailable, exactly as the web does while no
 * email is sent (spec 0018, AC-11).
 */
export default function SignUp() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearNotice } = useSession();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setRegistered(false);
    const parsed = signUpSchema.safeParse({ username, email, password });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          AUTH_MESSAGES[AUTH_OUTCOME.invalidInput],
      );
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { data: available, error: availabilityError } = await supabase.rpc(
        "username_available",
        { p_username: parsed.data.username },
      );
      if (availabilityError) {
        setError(AUTH_MESSAGES[AUTH_OUTCOME.signUpUnavailable]);
        return;
      }
      if (!available) {
        setError(AUTH_MESSAGES[AUTH_OUTCOME.usernameTaken]);
        return;
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (isAlreadyRegistered(authError, data.user)) {
        setError(AUTH_MESSAGES[AUTH_OUTCOME.alreadyRegistered]);
        setRegistered(true);
        return;
      }
      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }
      if (!data.session) {
        setError(AUTH_MESSAGES[AUTH_OUTCOME.signUpUnavailable]);
        return;
      }

      clearNotice();
      const notice = await claimName(parsed.data.username);
      // The Account tab under this modal reads the profile as soon as the
      // session appears, before the claim lands, so read it again now.
      await queryClient.invalidateQueries({ queryKey: profileKey });
      if (router.canDismiss()) router.dismissAll();
      router.navigate(
        notice
          ? { pathname: "/account", params: { notice } }
          : { pathname: "/account" },
      );
    } catch {
      setError(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
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
        <FormField label="Username" hint={USERNAME_HINT}>
          <TextInput
            accessibilityLabel="Username"
            accessibilityHint={USERNAME_HINT}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="nickname"
            maxLength={USERNAME_MAX_LENGTH}
            placeholderTextColor={tokenColor("color-muted-foreground")}
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField label="Email">
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField label="Password" hint={`${PASSWORD_HINT}.`}>
          <TextInput
            accessibilityLabel="Password"
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
        {registered ? (
          <GlassButton
            label={ACCOUNT_COPY.signInInstead}
            onPress={() => router.replace("/sign-in")}
          />
        ) : null}
        <GlassButton
          variant="primary"
          label="Create account"
          busy={busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Claims the username for the new account. Returns the Account tab's notice
 * key when the name was taken in between; any other failure leaves the name
 * unclaimed too, and the Account tab then asks for one first, so the account
 * is never stuck (spec 0035, Sign up on mobile).
 */
async function claimName(username: string): Promise<string | null> {
  try {
    await putUsername(username);
    return null;
  } catch (caught) {
    return caught instanceof ApiError && caught.code === "conflict"
      ? ACCOUNT_NOTICE.usernameTaken
      : null;
  }
}
