import { Text, View } from "react-native";

/**
 * A message the screen must not hide: an error is announced right away to a
 * screen reader, so a failed write is never silent (AGENTS.md section 11).
 */
export function Notice({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "error";
}) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      className={`rounded-2xl border px-4 py-3 ${
        tone === "error"
          ? "border-destructive bg-glass-plate-panel"
          : "border-border bg-glass-plate-panel"
      }`}
    >
      <Text
        className={
          tone === "error" ? "text-destructive" : "text-text-secondary"
        }
      >
        {message}
      </Text>
    </View>
  );
}
