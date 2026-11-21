import {
  DELETE_ACCOUNT_CONFIRM_WORD,
  DELETE_ACCOUNT_COPY,
} from "@bestats/core/auth/messages";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { deleteOwnAccount } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Delete account (spec 0033, child 0036; AC-12;
 * prompts/mobile-account-deletion.md, decision 6).
 *
 * The button stays disabled until the field holds exactly `DELETE`, the rule
 * the server checks again. While the call runs, Back is hidden and the swipe
 * back is off, so nobody leaves wondering whether it happened. Only the
 * server's 204 ends the session on this phone, wipes every private query and
 * returns to the Account tab with a toast; any failure stays here with the
 * "still here" copy and the session kept (AGENTS.md section 11). An expired
 * session follows the app's usual path (sign out with its notice).
 */
export function DeleteAccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, loading, endLocalSession } = useSession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Loading" />;
  if (!session && !busy) {
    return (
      <View className="flex-1 bg-background">
        <StatePanel
          title="You're not signed in"
          description="Sign in to manage your account."
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
      </View>
    );
  }

  async function confirm() {
    if (typed !== DELETE_ACCOUNT_CONFIRM_WORD) return;
    setError(null);
    setBusy(true);
    try {
      await deleteOwnAccount();
    } catch (caught) {
      setBusy(false);
      // A 401 already signed out with its notice; anything else keeps you
      // signed in, with the copy that says the account is still there.
      if (!(caught instanceof ApiError && caught.code === "unauthenticated")) {
        setError(DELETE_ACCOUNT_COPY.failed);
      }
      return;
    }
    await endLocalSession();
    toast.show({ id: "account", message: DELETE_ACCOUNT_COPY.deleted });
    if (router.canGoBack()) router.back();
    else router.replace("/account");
  }

  const armed = typed === DELETE_ACCOUNT_CONFIRM_WORD;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <Stack.Screen
        options={{
          title: DELETE_ACCOUNT_COPY.heading,
          headerBackVisible: !busy,
          gestureEnabled: !busy,
        }}
      />
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-6"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-base text-text-secondary">
          {DELETE_ACCOUNT_COPY.warning}
        </Text>
        <View className="gap-2">
          <Text className="font-semibold text-text-label">
            {DELETE_ACCOUNT_COPY.confirmLabel}
          </Text>
          <TextInput
            accessibilityLabel={DELETE_ACCOUNT_COPY.confirmLabel}
            value={typed}
            onChangeText={setTyped}
            editable={!busy}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground"
          />
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        <GlassButton
          variant="destructive"
          label={DELETE_ACCOUNT_COPY.button}
          disabled={!armed}
          busy={busy}
          onPress={confirm}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
