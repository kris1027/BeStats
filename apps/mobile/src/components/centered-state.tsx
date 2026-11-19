import { ActivityIndicator, Text, View } from "react-native";

import { GlassButton } from "./glass-button";

/**
 * A whole screen's loading state: a spinner a screen reader names, so the
 * wait is never silent (AGENTS.md section 3).
 */
export function LoadingState({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-background py-12">
      <ActivityIndicator accessibilityLabel={label} />
    </View>
  );
}

type StateProps = {
  title: string;
  description?: string;
  /** The button under the text: Retry, Sign in, Clear filters. */
  action?: { label: string; onPress: () => void };
  tone?: "empty" | "error";
};

/**
 * The web's `StatePanel` natively: a title, one line, and at most one way
 * out. An error is announced as an alert, so a failed read is never silent
 * (AGENTS.md section 11).
 */
export function StatePanel({
  title,
  description,
  action,
  tone = "empty",
}: StateProps) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      className="items-center gap-3 px-6 py-10"
    >
      <Text className="text-center text-lg font-semibold text-foreground">
        {title}
      </Text>
      {description ? (
        <Text className="text-center text-text-secondary">{description}</Text>
      ) : null}
      {action ? (
        <GlassButton label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}
