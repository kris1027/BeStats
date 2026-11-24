import { CHANGE_PASSWORD_COPY } from "@bestats/core/auth/messages";
import { Stack, ThemeProvider, useTheme } from "expo-router";
import { View } from "react-native";

import { PageBackground } from "@/components/page-background";
import {
  ACCOUNT_SCREEN_OPTIONS,
  LIBRARY_SCREEN_OPTIONS,
  SEARCH_SCREEN_OPTIONS,
  STACK_SCREEN_OPTIONS,
  tabScreenLayout,
} from "@/theme/stack-options";

/**
 * Search, Library and Account, the large title screens, have no background
 * layer of their own (`tabScreenLayout`).
 */
const TAB_SCREEN_LAYOUT = tabScreenLayout(["search", "library", "account"]);

/**
 * Each tab's first screen. The four tabs share this folder, so a movie,
 * show, game or list screen opened in a tab is pushed on that tab's own
 * stack; the anchor names the screen each group's stack starts on, keyed by
 * the group's name without its parentheses (Expo Router's `groupName`).
 */
export const unstable_settings = {
  index: { anchor: "index" },
  search: { anchor: "search" },
  library: { anchor: "library" },
  account: { anchor: "account" },
};

/**
 * The stack inside every tab (prompts/mobile-app-shell-catalog.md, decision
 * 3). Each tab root sets its own title; title screens set theirs once their
 * data loads. The stack draws the still background once behind its screens
 * for Search, Library and Account, whose screens have none of their own so their
 * large titles can collapse (`tabScreenLayout`); every other screen keeps
 * its own layer.
 */
export default function TabStack() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      {/* The native stack paints its container in the theme's background,
          which would hide the still background behind a bare screen. */}
      <ThemeProvider
        value={{
          ...theme,
          colors: { ...theme.colors, background: "transparent" },
        }}
      >
        <Stack
          screenOptions={{
            ...STACK_SCREEN_OPTIONS,
            headerBackButtonDisplayMode: "minimal",
          }}
          screenLayout={TAB_SCREEN_LAYOUT}
        >
          <Stack.Screen name="index" options={{ title: "BeStats" }} />
          <Stack.Screen name="search" options={SEARCH_SCREEN_OPTIONS} />
          <Stack.Screen name="library" options={LIBRARY_SCREEN_OPTIONS} />
          <Stack.Screen name="account" options={ACCOUNT_SCREEN_OPTIONS} />
          <Stack.Screen
            name="account/delete"
            options={{ title: "Delete account" }}
          />
          <Stack.Screen
            name="account/password"
            options={{ title: CHANGE_PASSWORD_COPY.heading }}
          />
          <Stack.Screen name="account/about" options={{ title: "About" }} />
          <Stack.Screen name="movies/[id]" options={{ title: "" }} />
          <Stack.Screen name="shows/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="shows/[id]/season/[number]"
            options={{ title: "" }}
          />
          <Stack.Screen name="games/[id]" options={{ title: "" }} />
        </Stack>
      </ThemeProvider>
    </View>
  );
}
