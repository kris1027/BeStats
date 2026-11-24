import { Pressable, View } from "react-native";
import { ChevronRightIcon } from "@/components/icons";

import { Text } from "@/components/text";
import { lengthToken, tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";

/**
 * A full width glass row with a chevron that opens another screen or a
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
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <GlassPlate
        plate="panel"
        radius={lengthToken("radius-panel")}
        className="min-h-11 flex-row items-center justify-between gap-3 px-5 py-4"
      >
        <Text
          className={`flex-1 text-base font-semibold ${
            tone === "destructive" ? "text-destructive" : "text-foreground"
          }`}
        >
          {label}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ChevronRightIcon
            size={20}
            color={tokenColor("color-text-secondary")}
          />
        </View>
      </GlassPlate>
    </Pressable>
  );
}
