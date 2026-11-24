import { View } from "react-native";
import { Text } from "@/components/text";

/**
 * The heading and line at the top of an auth modal, the web's `AuthPanel`
 * header with core's `AUTH_PANEL_COPY` (prompts/mobile-look-account.md,
 * decision 5). No card around it: the modal is the surface already.
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
