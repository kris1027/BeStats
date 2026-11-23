import { CircleAlertIcon, InfoIcon } from "lucide-react-native";
import { View } from "react-native";

import { Text } from "@/components/text";
import { tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";

/**
 * A message the screen must not hide, on a glass panel with the tone's icon:
 * an error is announced right away to a screen reader, so a failed write is
 * never silent (AGENTS.md section 11). The icon is decorative; the text
 * carries the message.
 */
export function Notice({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "error";
}) {
  const error = tone === "error";
  const Icon = error ? CircleAlertIcon : InfoIcon;
  return (
    <GlassPlate
      plate="panel"
      accessibilityRole={error ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      radius={16}
      className="flex-row items-start gap-3 px-4 py-3"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="pt-0.5"
      >
        <Icon
          size={18}
          color={tokenColor(
            error ? "color-destructive" : "color-text-secondary",
          )}
        />
      </View>
      <Text
        className={`flex-1 ${error ? "text-destructive" : "text-text-secondary"}`}
      >
        {message}
      </Text>
    </GlassPlate>
  );
}
