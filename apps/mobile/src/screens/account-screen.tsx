import {
  ACCOUNT_NOTICE,
  ACCOUNT_NOTICES,
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  DELETE_ACCOUNT_COPY,
  USERNAME_UNCHANGED_MESSAGE,
  USERNAME_UPDATED_MESSAGE,
} from "@bestats/core/auth/messages";
import { changeUsernameSchema } from "@bestats/core/auth/schemas";
import {
  USERNAME_HINT,
  USERNAME_MAX_LENGTH,
} from "@bestats/core/auth/username";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { useProfile, useSaveUsername } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Month, day and time, as `/account` shows when the weekly lock ends. */
const LOCK_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * The Account tab (spec 0035, Account screen; prompts/mobile-account-deletion.md,
 * decision 5). Signed out: Sign in or Create account. Signed in, one column of
 * glass panels: who you are with Sign out, your username, then Delete
 * account. While the username is unclaimed its panel comes first, with the
 * taken notice when sign up lost the name in between (`notice` param, only a
 * known key shows anything, as on the web).
 */
export function AccountScreen({ notice }: { notice?: string }) {
  const router = useRouter();
  const { session, loading, signOut } = useSession();
  const profile = useProfile(Boolean(session));

  if (loading) return <LoadingState label="Loading" />;
  if (!session) {
    return (
      <View className="flex-1 gap-3 bg-background">
        <StatePanel
          title="You're not signed in"
          description="Sign in to track what you watch and play."
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
        <View className="px-6">
          <GlassButton
            label="Create an account"
            onPress={() => router.push("/sign-up")}
          />
        </View>
      </View>
    );
  }

  if (profile.isPending) return <LoadingState label="Loading your account" />;
  if (profile.isError) {
    return (
      <View className="flex-1 bg-background">
        <StatePanel
          tone="error"
          title="We couldn't load your account"
          description={profile.error.message}
          action={{ label: "Retry", onPress: () => profile.refetch() }}
        />
      </View>
    );
  }

  const { username, usernameChangeableAt } = profile.data;
  const takenNotice =
    !username && notice === ACCOUNT_NOTICE.usernameTaken
      ? ACCOUNT_NOTICES[ACCOUNT_NOTICE.usernameTaken]
      : null;

  const header = (
    <Panel key="header">
      <Text className="text-3xl font-bold text-foreground">Account</Text>
      <Text className="text-text-secondary">
        You are signed in as{" "}
        <Text className="font-semibold text-foreground">
          {username ?? session.user.email}
        </Text>
        {username && session.user.email ? ` (${session.user.email})` : ""}.
      </Text>
      <GlassButton label="Sign out" onPress={signOut} />
    </Panel>
  );
  const usernamePanel = (
    <UsernamePanel
      key="username"
      username={username}
      changeableAt={usernameChangeableAt}
      notice={takenNotice}
    />
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 py-6"
      keyboardShouldPersistTaps="handled"
    >
      {username ? [header, usernamePanel] : [usernamePanel, header]}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={DELETE_ACCOUNT_COPY.heading}
        onPress={() => router.push("/account/delete")}
        className="min-h-11 flex-row items-center justify-between rounded-3xl border border-border bg-glass-plate-panel px-5 py-4"
      >
        <Text className="text-base font-semibold text-destructive">
          {DELETE_ACCOUNT_COPY.heading}
        </Text>
        <Text aria-hidden className="text-lg text-text-secondary">
          ›
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * The username field and Save, through `PUT /api/v1/me/profile`. The weekly
 * lock shown here comes from the server's `usernameChangeableAt`; the
 * database trigger is what refuses an early change, and its 409 still shows
 * here if the two ever disagree. Success is shown only after the server
 * answers (AGENTS.md section 11).
 */
function UsernamePanel({
  username,
  changeableAt,
  notice,
}: {
  username: string | null;
  changeableAt: string | null;
  notice: string | null;
}) {
  const save = useSaveUsername();
  const [value, setValue] = useState(username ?? "");
  const [message, setMessage] = useState<{
    text: string;
    tone: "info" | "error";
  } | null>(null);
  useEffect(() => setValue(username ?? ""), [username]);

  const locked = changeableAt !== null;

  function submit() {
    setMessage(null);
    const parsed = changeUsernameSchema.safeParse({ username: value });
    if (!parsed.success) {
      setMessage({
        tone: "error",
        text:
          parsed.error.issues[0]?.message ??
          AUTH_MESSAGES[AUTH_OUTCOME.invalidInput],
      });
      return;
    }
    save.mutate(parsed.data.username, {
      onSuccess: (result) =>
        setMessage({
          tone: "info",
          text: result.changed
            ? USERNAME_UPDATED_MESSAGE
            : USERNAME_UNCHANGED_MESSAGE,
        }),
      onError: (error) =>
        setMessage({
          tone: "error",
          text:
            error instanceof ApiError
              ? error.message
              : AUTH_MESSAGES[AUTH_OUTCOME.unexpected],
        }),
    });
  }

  return (
    <Panel>
      <Text className="text-xl font-bold text-foreground">Username</Text>
      <Text className="text-text-secondary">
        {username
          ? AUTH_MESSAGES[AUTH_OUTCOME.usernameLocked]
          : "Choose a username. You can change it once a week."}
      </Text>
      {notice ? <Notice message={notice} /> : null}
      <TextInput
        accessibilityLabel="Username"
        accessibilityHint={locked ? undefined : USERNAME_HINT}
        value={value}
        onChangeText={setValue}
        editable={!locked}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        maxLength={USERNAME_MAX_LENGTH}
        returnKeyType="done"
        onSubmitEditing={submit}
        className={`min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground ${
          locked ? "opacity-50" : ""
        }`}
      />
      {locked ? (
        <Text className="text-sm text-text-secondary">
          You can change it again on{" "}
          {new Intl.DateTimeFormat("en", LOCK_FORMAT).format(
            new Date(changeableAt),
          )}
          .
        </Text>
      ) : (
        <Text className="text-sm text-text-secondary">{USERNAME_HINT}</Text>
      )}
      {message ? <Notice tone={message.tone} message={message.text} /> : null}
      <GlassButton
        variant="primary"
        label="Save username"
        busy={save.isPending}
        disabled={locked}
        onPress={submit}
      />
    </Panel>
  );
}

/** The glass card every Account section sits on, the web `PANEL`'s look. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <View className="gap-4 rounded-3xl border border-border bg-glass-plate-panel px-5 py-6">
      {children}
    </View>
  );
}
