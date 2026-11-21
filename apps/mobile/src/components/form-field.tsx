import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * The glass text field every form in the app uses: 44pt tall, so it meets the
 * touch target rule (AGENTS.md section 3), on the same plate as the web's
 * inputs. Written once so sign in, sign up, Search and Account never drift.
 */
export const INPUT_CLASS =
  "min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground";

/**
 * A label above its field and an optional hint under it, the layout of the
 * web's `AuthField` (AGENTS.md section 3, reuse the shipped patterns). The
 * field itself carries its own `accessibilityLabel`, so the visible label is
 * never the only name a screen reader gets.
 */
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="font-semibold text-text-label">{label}</Text>
      {children}
      {hint ? (
        <Text className="text-sm text-text-secondary">{hint}</Text>
      ) : null}
    </View>
  );
}
