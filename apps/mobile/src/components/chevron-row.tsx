import { Pressable } from "react-native";
import { Text } from "@/components/text";

/**
 * A full width glass row with a `›` chevron that opens another screen or a
 * page: Account's Delete account and About, and About's legal links. One
 * component so the three keep one look and one 44pt tap area (AGENTS.md
 * section 3: reuse existing patterns, 44px touch targets).
 *
 * `tone="destructive"` colours only the label, for Delete account.
 */
export function ChevronRow({
  label,
  onPress,
  role = "button",
  hint,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  role?: "button" | "link";
  hint?: string;
  tone?: "default" | "destructive";
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-between rounded-3xl border border-border bg-glass-plate-panel px-5 py-4"
    >
      <Text
        className={`text-base font-semibold ${
          tone === "destructive" ? "text-destructive" : "text-foreground"
        }`}
      >
        {label}
      </Text>
      <Text aria-hidden className="text-lg text-text-secondary">
        ›
      </Text>
    </Pressable>
  );
}
