import { hasPasswordIdentity } from "@bestats/core/auth/identity";
import {
  ACCOUNT_COPY,
  ACCOUNT_NOTICE,
  ACCOUNT_NOTICES,
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  CHANGE_PASSWORD_COPY,
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
import { ScrollView, View } from "react-native";

import {
  LoadingState,
  SignedOutState,
  StatePanel,
} from "@/components/centered-state";
import { ChevronRow } from "@/components/chevron-row";
import { FormField } from "@/components/form-field";
import { GlassButton } from "@/components/glass-button";
import { GlassPanel } from "@/components/glass-panel";
import { Notice } from "@/components/notice";
import { Text } from "@/components/text";
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
 * decision 5; prompts/mobile-look-account.md, decisions 3, 7 and 8), private
 * state shown only once the server confirms it (AGENTS.md section 11). It
 * takes the large title, so every state sits in one scroll view the
 * translucent bar lies over. Signed out: Sign in or Create account. Signed
 * in, one column of glass panels: your username in bold with your email under
 * it and Sign out, your username field, then the rows Change password (only
 * for an account with an email password), Delete account and About. While
 * the username is unclaimed its panel comes first, with the taken notice when
 * sign up lost the name in between (`notice` param, only a known key shows
 * anything, as on the web).
 */
export function AccountScreen({ notice }: { notice?: string }) {
  const router = useRouter();
  const { session, loading, signOut } = useSession();
  const profile = useProfile(Boolean(session));

  if (loading) {
    return (
      <AccountScroll>
        <LoadingState label="Loading" />
      </AccountScroll>
    );
  }
  if (!session) {
    return (
      <AccountScroll>
        <SignedOutState description={ACCOUNT_COPY.signedOutTrack}>
          <View className="-mt-6 items-center px-6">
            <GlassButton
              label={ACCOUNT_COPY.createAccount}
              onPress={() => router.push("/sign-up")}
            />
          </View>
          <View className="mt-6 self-stretch px-4">
            <AboutRow />
          </View>
        </SignedOutState>
      </AccountScroll>
    );
  }

  if (profile.isPending) {
    return (
      <AccountScroll>
        <LoadingState label="Loading your account" />
      </AccountScroll>
    );
  }
  if (profile.isError) {
    return (
      <AccountScroll>
        <StatePanel
          tone="error"
          title={ACCOUNT_COPY.loadFailed}
          description={profile.error.message}
          action={{ label: "Retry", onPress: () => profile.refetch() }}
        />
      </AccountScroll>
    );
  }

  const { username, usernameChangeableAt } = profile.data;
  const takenNotice =
    !username && notice === ACCOUNT_NOTICE.usernameTaken
      ? ACCOUNT_NOTICES[ACCOUNT_NOTICE.usernameTaken]
      : null;

  const header = (
    <GlassPanel key="header">
      <View className="gap-1">
        <Text className="text-lg font-bold text-foreground">
          {username ?? session.user.email}
        </Text>
        {username && session.user.email ? (
          <Text className="text-text-secondary">{session.user.email}</Text>
        ) : null}
      </View>
      <GlassButton label="Sign out" onPress={signOut} />
    </GlassPanel>
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
    <AccountScroll padded>
      {username ? [header, usernamePanel] : [usernamePanel, header]}
      {hasPasswordIdentity(session.user.identities) ? (
        <ChevronRow
          label={CHANGE_PASSWORD_COPY.heading}
          onPress={() => router.push("/account/password")}
        />
      ) : null}
      <ChevronRow
        label={DELETE_ACCOUNT_COPY.heading}
        tone="destructive"
        onPress={() => router.push("/account/delete")}
      />
      <AboutRow />
    </AccountScroll>
  );
}

/**
 * The one scroll view every Account state sits in, inset by UIKit under the
 * translucent large title bar, so nothing hides under it and the title
 * collapses as you scroll (prompts/mobile-look-account.md, decision 7).
 */
function AccountScroll({
  children,
  padded = false,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName={padded ? "gap-4 px-4 py-6" : "flex-grow"}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * The row to About, where TMDB's and IGDB's logos and attribution live (spec
 * 0033, AC-14), shown signed in and signed out alike, so both states open it
 * through this one route (AGENTS.md section 12: attribution follows the
 * providers' terms).
 */
function AboutRow() {
  const router = useRouter();
  return (
    <ChevronRow label="About" onPress={() => router.push("/account/about")} />
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
    <GlassPanel>
      <Text
        accessibilityRole="header"
        className="text-xl font-bold text-foreground"
      >
        Username
      </Text>
      <Text className="text-text-secondary">
        {username
          ? AUTH_MESSAGES[AUTH_OUTCOME.usernameLocked]
          : ACCOUNT_COPY.chooseUsername}
      </Text>
      {notice ? <Notice message={notice} /> : null}
      <FormField
        label="Username"
        hint={
          locked
            ? `${ACCOUNT_COPY.usernameUnlocksOn} ${new Intl.DateTimeFormat(
                "en",
                LOCK_FORMAT,
              ).format(new Date(changeableAt))}.`
            : USERNAME_HINT
        }
        error={message?.tone === "error" ? message.text : null}
        value={value}
        onChangeText={setValue}
        editable={!locked}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        maxLength={USERNAME_MAX_LENGTH}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {message?.tone === "info" ? <Notice message={message.text} /> : null}
      <GlassButton
        variant="primary"
        label={ACCOUNT_COPY.saveUsername}
        busy={save.isPending}
        disabled={locked}
        onPress={submit}
      />
    </GlassPanel>
  );
}
