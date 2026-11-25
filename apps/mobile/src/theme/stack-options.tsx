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
 * A clear header over a title's backdrop (prompts/mobile-look-title-pages.md,
 * decision 4; prompts/mobile-title-header-clear-bar.md). Kept beside
 * `STACK_SCREEN_OPTIONS` because it undoes that bar colour: a native header
 * still paints its `headerStyle` colour when transparent, which would cover
 * the artwork's top with an opaque band. The screen's own `headerBackground`
 * then draws the solid colour as the artwork scrolls under it.
 */
export const BACKDROP_HEADER_OPTIONS = {
  headerTransparent: true,
  headerStyle: { backgroundColor: "transparent" },
} as const;

/**
 * A tab root's large title header (apps/mobile/AGENTS.md, Styling;
 * prompts/mobile-look-search.md, decisions 1 and 7; prompts/mobile-look-library.md,
 * decision 7): an iOS large title in Inter over the same seamless bar
 * colour, collapsing into the bar as the screen's list scrolls. Android has
 * no large title and shows the plain bar. The screen must be bare in
 * `tabScreenLayout` and draw every state inside its scroll view, which the
 * translucent bar lies over.
 */
export function largeTitleScreenOptions(title: string) {
  return {
    title,
    // A large title needs a translucent bar: on iOS 26 and later
    // react-native-screens insets a screen under an opaque bar itself, and
    // UIKit then loses track of the list's scroll position. Expanded, the
    // bar is clear over the page background; collapsed, it takes the bar
    // colour.
    headerTransparent: true,
    headerLargeStyle: { backgroundColor: "transparent" },
    headerLargeTitle: true,
    headerLargeTitleShadowVisible: false,
    headerLargeTitleStyle: {
      fontFamily: FONT_FAMILY,
      fontWeight: "700",
      color: tokenColor("color-foreground"),
    },
    headerTitleStyle: { fontFamily: FONT_FAMILY, fontWeight: "600" },
  } as const;
}

/**
 * Home's, Search's and Library's header: none, since the pinned media
 * switch takes the top of the screen (prompts/mobile-media-switch-glass.md,
 * decision 5). The title still names the screen for the back label of a
 * pushed title.
 */
export function pinnedSwitchScreenOptions(title: string) {
  return { title, headerShown: false } as const;
}

/** Search's screen options; its title field sits under the switch. */
export const SEARCH_SCREEN_OPTIONS = pinnedSwitchScreenOptions("Search");

/** Library's screen options. */
export const LIBRARY_SCREEN_OPTIONS = pinnedSwitchScreenOptions("Library");

/** Home's screen options. */
export const HOME_SCREEN_OPTIONS = pinnedSwitchScreenOptions("BeStats");

/** Account's header (prompts/mobile-look-account.md, decision 7). */
export const ACCOUNT_SCREEN_OPTIONS = largeTitleScreenOptions("Account");

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

/**
 * The tab stacks' screen layout: `screenLayout` for every screen except
 * those named in `bare`, which get no background layer of their own
 * (apps/mobile/AGENTS.md, Styling; prompts/mobile-look-search.md, decision 7).
 * A large title collapses only
 * when its scroll view is first in the screen's view chain, which UIKit
 * tracks, and the background layer sits before it; so a bare screen shows
 * the still background its tab stack draws behind every screen. The
 * background never moves, so the two look alike.
 */
export function tabScreenLayout(bare: readonly string[]) {
  return function layout({
    route,
    children,
  }: {
    route: { name: string };
    children: ReactNode;
  }) {
    return bare.includes(route.name) ? (
      <>{children}</>
    ) : (
      screenLayout({ children })
    );
  };
}
