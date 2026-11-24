import { View } from "react-native";
import { Text } from "@/components/text";

/**
 * The heading and line at the top of an auth modal, the web's `AuthPanel`
 * header with core's `AUTH_PANEL_COPY` (prompts/mobile-look-account.md,
 * decision 5), so both apps open each auth form with the same words (AGENTS.md
 * section 5: copy comes from core, never a copy). No card around it: the
 * modal is the surface already (AGENTS.md section 3).
 */
export function AuthIntro({
  copy,
}: {
  copy: { title: string; description: string };
}) {
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="text-3xl font-bold text-foreground"
      >
        {copy.title}
      </Text>
      <Text className="text-sm text-muted-foreground">{copy.description}</Text>
    </View>
  );
}
