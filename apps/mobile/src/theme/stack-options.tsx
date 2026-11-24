import type { ReactNode } from "react";
import { View } from "react-native";

import { PageBackground } from "@/components/page-background";
import { FONT_FAMILY } from "@/components/text";

import { fractionToken, tokenColor, tokenColorOver } from "./token-vars";

/**
 * The solid header's colour: the colour the page background settles to at
 * its top edge, so bar and page meet without a seam. Its own constant so
 * the title header's fade paints exactly this colour (AGENTS.md section 3).
 */
export const HEADER_BACKGROUND = tokenColorOver(
  "color-page-top",
  "color-page-wash",
  fractionToken("page-wash-alpha"),
);

/**
 * Every stack's header and screen look (apps/mobile/AGENTS.md, Styling):
 * the screen itself is transparent so the
 * page background shows, and the native header takes the colour the
 * background settles to at its top edge (its top colour under the wash),
 * with no rule under it, so bar and page meet without a seam. The
 * headers stay the platform's own (decision 1); the slices that give screens
 * large titles or a backdrop under the bar change them per screen.
 */
export const STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: HEADER_BACKGROUND },
  headerTintColor: tokenColor("color-foreground"),
  headerShadowVisible: false,
  contentStyle: { backgroundColor: "transparent" },
} as const;

/**
 * Search's header (prompts/mobile-look-search.md, decisions 1 and 7): an iOS
 * large title in Inter over the same seamless bar colour, collapsing into
 * the bar as the grid scrolls. Android has no large title and shows the
 * plain bar; the search field itself is set by the screen, which owns its
 * text. The other tab roots take theirs in their own slices.
 */
export const SEARCH_SCREEN_OPTIONS = {
  title: "Search",
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
  headerLargeTitleStyle: {
    fontFamily: FONT_FAMILY,
    fontWeight: "700",
    color: tokenColor("color-foreground"),
  },
  headerTitleStyle: { fontFamily: FONT_FAMILY, fontWeight: "600" },
} as const;

/**
 * Draws the still page background under each screen of a stack, so no
 * screen paints its own (apps/mobile/AGENTS.md, Styling).
 */
export function screenLayout({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      {children}
    </View>
  );
}
