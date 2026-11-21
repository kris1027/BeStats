import { Stack } from "expo-router";

import { tokenColor } from "@/theme/token-vars";

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
 * data loads.
 */
export default function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokenColor("color-background") },
        headerTintColor: tokenColor("color-foreground"),
        contentStyle: { backgroundColor: tokenColor("color-background") },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: "BeStats" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="library" options={{ title: "Library" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
      <Stack.Screen
        name="account/delete"
        options={{ title: "Delete account" }}
      />
      <Stack.Screen name="movies/[id]" options={{ title: "" }} />
      <Stack.Screen name="shows/[id]" options={{ title: "" }} />
      <Stack.Screen name="shows/[id]/season/[number]" options={{ title: "" }} />
      <Stack.Screen name="games/[id]" options={{ title: "" }} />
    </Stack>
  );
}
