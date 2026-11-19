import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { VariableContextProvider } from "nativewind";
import { useEffect } from "react";
import { Appearance } from "react-native";

import { MediaTypeProvider } from "@/lib/media-type";
import { queryClient } from "@/lib/query-client";
import { SessionProvider, useSession } from "@/lib/session";
import { TOKEN_VARS, tokenColor } from "@/theme/token-vars";

SplashScreen.preventAutoHideAsync();

// BeStats is dark only, as the web is (spec 0004). Native chrome the app
// does not draw itself (the glass tab bar, sheets, the keyboard) follows the
// system appearance, so pin it to dark or a light phone draws light glass
// under dark screens.
Appearance.setColorScheme("dark");

/**
 * BeStats is dark only, as the shipped web UI is (spec 0004), so the
 * navigation theme takes the web's own background, card and text tokens.
 */
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: tokenColor("color-background"),
    card: tokenColor("color-background"),
    text: tokenColor("color-foreground"),
    border: tokenColor("color-background"),
    primary: tokenColor("color-primary"),
  },
};

/**
 * The root stack: the tabs, with Sign in as a modal over them, so a signed
 * out visitor browses and signs in from where they are
 * (prompts/mobile-app-shell-catalog.md, decisions 1 and 3).
 */
function Navigator() {
  const { loading, notice } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  // An expired session is never silent (AGENTS.md section 11): with no
  // screen gated on the session any more, its notice opens Sign in, which
  // shows it. The router comes from the hook, not the global `router`: the
  // global one is bound in a parent effect that runs after this one, so a
  // notice set at launch (a failed restore) would throw and be lost.
  const router = useRouter();
  useEffect(() => {
    if (notice) router.push("/sign-in");
  }, [notice, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokenColor("color-background") },
        headerTintColor: tokenColor("color-foreground"),
        contentStyle: { backgroundColor: tokenColor("color-background") },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="sign-in"
        options={{ title: "Sign in", presentation: "modal" }}
      />
    </Stack>
  );
}

/**
 * The app's providers: tokens, the query cache, the session, and the media
 * type Home and Search share.
 */
export default function RootLayout() {
  return (
    <VariableContextProvider value={TOKEN_VARS}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <MediaTypeProvider>
            <ThemeProvider value={NAV_THEME}>
              <StatusBar style="light" />
              <Navigator />
            </ThemeProvider>
          </MediaTypeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </VariableContextProvider>
  );
}
