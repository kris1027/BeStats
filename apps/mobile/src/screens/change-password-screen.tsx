import {
  type AuthActionState,
  IDLE_STATE,
} from "@bestats/core/auth/action-state";
import {
  ACCOUNT_COPY,
  CHANGE_PASSWORD_COPY,
} from "@bestats/core/auth/messages";
import { PASSWORD_HINT } from "@bestats/core/auth/schemas";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LoadingState, SignedOutState } from "@/components/centered-state";
import { FormAlert, FormField } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { Text } from "@/components/text";
import { useToast } from "@/components/toast";
import { changePassword } from "@/lib/password";
import { useSession } from "@/lib/session";

/**
 * Change password, pushed from the Account tab's row
 * (prompts/mobile-look-account.md, decision 3), the web's change password
 * section on the phone: Current password, New password and Confirm, through
 * `changePassword`, which checks the current one without touching this
 * phone's session.
 *
 * While it saves the screen ignores Back (header button hidden, swipe back
 * off, Android's Back swallowed), as Delete account does, so nobody leaves
 * wondering whether it happened. Only Supabase's yes clears the fields, goes
 * back and shows the toast; every refusal stays here, under the field it
 * belongs to or as a form level alert (AGENTS.md section 11).
 */
export function ChangePasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, loading } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<AuthActionState>(IDLE_STATE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [busy]);

  if (loading) return <LoadingState label="Loading" />;
  if (!session) {
    return <SignedOutState description={ACCOUNT_COPY.signedOutManage} />;
  }

  async function submit() {
    if (busy) return;
    setState(IDLE_STATE);
    setBusy(true);
    const result = await changePassword({
      currentPassword,
      password,
      confirmPassword,
    });
    setBusy(false);
    if (result.status !== "success") {
      setState(result);
      return;
    }
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    toast.show({ id: "password", message: CHANGE_PASSWORD_COPY.changed });
    if (router.canGoBack()) router.back();
    else router.replace("/account");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Stack.Screen
        options={{ headerBackVisible: !busy, gestureEnabled: !busy }}
      />
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-6"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-muted-foreground">
          {CHANGE_PASSWORD_COPY.description}
        </Text>
        <FormField
          label={CHANGE_PASSWORD_COPY.currentLabel}
          secure
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={state.fieldErrors?.currentPassword}
          editable={!busy}
          placeholder={CHANGE_PASSWORD_COPY.currentPlaceholder}
          autoComplete="current-password"
          textContentType="password"
        />
        <FormField
          label={CHANGE_PASSWORD_COPY.newLabel}
          hint={`${PASSWORD_HINT}.`}
          secure
          value={password}
          onChangeText={setPassword}
          error={state.fieldErrors?.password}
          editable={!busy}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <FormField
          label={CHANGE_PASSWORD_COPY.confirmLabel}
          secure
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={state.fieldErrors?.confirmPassword}
          editable={!busy}
          placeholder={CHANGE_PASSWORD_COPY.confirmPlaceholder}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <FormAlert state={state} />
        <GlassButton
          variant="primary"
          label={CHANGE_PASSWORD_COPY.button}
          busy={busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
