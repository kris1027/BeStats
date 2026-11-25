import { ACCOUNT_COPY } from "@bestats/core/auth/messages";
import { SIGN_IN_ACTION_LABEL } from "@bestats/core/tracking/messages";
import { useCanGoBack, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import {
  InboxIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "@/components/icons";

import { Text } from "@/components/text";
import { lengthToken, tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";
import { GlassButton } from "./glass-button";
import {
  AccountSkeleton,
  PageSkeleton,
  PosterGridSkeleton,
  TitleSkeleton,
} from "./skeleton";

/** Each loading layout's skeleton, so a new screen shape is one entry. */
const SKELETONS = {
  page: PageSkeleton,
  grid: PosterGridSkeleton,
  title: TitleSkeleton,
  account: AccountSkeleton,
} as const;

/**
 * A whole screen's loading state: skeletons in the shape of what is coming,
 * a grid of posters for a list or search, a title's hero, Account's panels,
 * or a generic page
 * (prompts/mobile-web-parity-foundation.md, AC-5). The skeletons are hidden
 * from screen readers; this view announces the wait once by its label, so it
 * is never silent (AGENTS.md section 3).
 */
export function LoadingState({
  label,
  layout = "page",
}: {
  label: string;
  layout?: keyof typeof SKELETONS;
}) {
  const Skeleton = SKELETONS[layout];
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className="flex-1"
    >
      <Skeleton />
    </View>
  );
}

type StateProps = {
  title: string;
  description?: string;
  /** The button under the text: Retry, Sign in, Clear filters. */
  action?: { label: string; onPress: () => void };
  tone?: "empty" | "error" | "signed-out";
};

/** Each tone's icon, as the web's `StatePanel`. */
const ICONS = {
  empty: InboxIcon,
  error: TriangleAlertIcon,
  "signed-out": UserRoundIcon,
} as const;

/** The way out an error panel offers when its screen gives none. */
export const GO_BACK_LABEL = "Go back";

/** The way out when there is no screen to go back to, as after a deep link. */
export const GO_HOME_LABEL = "Go to Home";

/**
 * The web's `StatePanel` natively: a glass panel with the tone's icon in a
 * muted circle, a title, one line, and one way out. An error is announced as
 * an alert, so a failed read is never silent (AGENTS.md section 11), and it
 * is never a dead end (components/AGENTS.md, a dead end is a bug): with no
 * action of its own it offers Go back, or Go to Home when it was opened with
 * nothing under it, such as from a deep link.
 */
export function StatePanel({
  title,
  description,
  action,
  tone = "empty",
}: StateProps) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const Icon = ICONS[tone];
  const way =
    action ??
    (tone === "error"
      ? canGoBack
        ? { label: GO_BACK_LABEL, onPress: () => router.back() }
        : { label: GO_HOME_LABEL, onPress: () => router.replace("/") }
      : undefined);

  return (
    <View className="px-4 py-6">
      <GlassPlate
        plate="panel"
        shadow
        radius={lengthToken("radius-panel")}
        accessibilityRole={tone === "error" ? "alert" : undefined}
        className="items-center gap-4 px-6 py-10"
      >
        <View className="size-16 items-center justify-center rounded-full bg-muted">
          <Icon size={32} color={tokenColor("color-muted-foreground")} />
        </View>
        <View className="items-center gap-2">
          <Text className="text-center text-lg font-semibold leading-tight text-foreground">
            {title}
          </Text>
          {description ? (
            <Text className="text-center text-[15px] leading-relaxed text-muted-foreground">
              {description}
            </Text>
          ) : null}
        </View>
        {way ? (
          <View className="pt-1">
            <GlassButton label={way.label} onPress={way.onPress} />
          </View>
        ) : null}
      </GlassPlate>
    </View>
  );
}

/**
 * A whole screen's signed out state: "You're not signed in", one line on what
 * signing in gives, and Sign in, which opens the modal over this screen
 * (AGENTS.md section 3, every view has a signed out state). `children` sit
 * under it, such as the Account tab's Create an account.
 */
export function SignedOutState({
  description,
  children,
}: {
  description: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 gap-3">
      <StatePanel
        tone="signed-out"
        title={ACCOUNT_COPY.signedOutTitle}
        description={description}
        action={{
          label: SIGN_IN_ACTION_LABEL,
          onPress: () => router.push("/sign-in"),
        }}
      />
      {children}
    </View>
  );
}
