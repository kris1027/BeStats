import {
  ACCOUNT_COPY,
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

import {
  LoadingState,
  SignedOutState,
  StatePanel,
} from "@/components/centered-state";
import { INPUT_CLASS } from "@/components/form-field";
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
 * decision 5), private state shown only once the server confirms it (AGENTS.md
 * section 11). Signed out: Sign in or Create account. Signed in, one column of
 * glass panels: your username in bold with your email under it and Sign out,
 * your username field, then Delete account and About. While the username is unclaimed its panel comes first, with the
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
      <SignedOutState description={ACCOUNT_COPY.signedOutTrack}>
        <View className="-mt-6 items-center px-6">
          <GlassButton
            label={ACCOUNT_COPY.createAccount}
            onPress={() => router.push("/sign-up")}
          />
        </View>
        <View className="mt-6 self-stretch px-4">
          <AboutRow onPress={() => router.push("/account/about")} />
        </View>
      </SignedOutState>
    );
  }

  if (profile.isPending) return <LoadingState label="Loading your account" />;
  if (profile.isError) {
    return (
      <View className="flex-1 bg-background">
        <StatePanel
          tone="error"
          title={ACCOUNT_COPY.loadFailed}
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
      <View className="gap-1">
        <Text className="text-lg font-bold text-foreground">
          {username ?? session.user.email}
        </Text>
        {username && session.user.email ? (
          <Text className="text-text-secondary">{session.user.email}</Text>
        ) : null}
      </View>
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
      <AboutRow onPress={() => router.push("/account/about")} />
    </ScrollView>
  );
}

/**
 * The row to About, where TMDB's and IGDB's logos and attribution live (spec
 * 0033, AC-14), shown signed in and signed out alike.
 */
function AboutRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="About"
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-between rounded-3xl border border-border bg-glass-plate-panel px-5 py-4"
    >
      <Text className="text-base font-semibold text-foreground">About</Text>
      <Text aria-hidden className="text-lg text-text-secondary">
        ›
      </Text>
    </Pressable>
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
          : ACCOUNT_COPY.chooseUsername}
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
        className={`${INPUT_CLASS} ${locked ? "opacity-50" : ""}`}
      />
      {locked ? (
        <Text className="text-sm text-text-secondary">
          {ACCOUNT_COPY.usernameUnlocksOn}{" "}
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
        label={ACCOUNT_COPY.saveUsername}
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
