import type { ReactNode } from "react";
import { View } from "react-native";

import { PageBackground } from "@/components/page-background";

import { tokenColor } from "./token-vars";

/**
 * Every stack's header and screen look (prompts/mobile-web-parity-
 * foundation.md, requirement 1): the screen itself is transparent so the
 * page background shows, and the native header takes the background's top
 * colour with no rule under it, so bar and page meet without a seam. The
 * headers stay the platform's own (decision 1); the slices that give screens
 * large titles or a backdrop under the bar change them per screen.
 */
export const STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: tokenColor("color-page-top") },
  headerTintColor: tokenColor("color-foreground"),
  headerShadowVisible: false,
  contentStyle: { backgroundColor: "transparent" },
} as const;

/**
 * Draws the still page background under each screen of a stack, so no
 * screen paints its own (requirement 1).
 */
export function screenLayout({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      {children}
    </View>
  );
}
