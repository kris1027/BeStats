import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { VariableContextProvider } from "nativewind";
import { useEffect } from "react";

import { queryClient } from "@/lib/query-client";
import { SessionProvider, useSession } from "@/lib/session";
import { TOKEN_VARS, tokenColor } from "@/theme/token-vars";

SplashScreen.preventAutoHideAsync();

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

function Navigator() {
  const { loading } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokenColor("color-background") },
        headerTintColor: tokenColor("color-foreground"),
        contentStyle: { backgroundColor: tokenColor("color-background") },
      }}
    >
      <Stack.Screen name="index" options={{ title: "BeStats" }} />
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
      <Stack.Screen name="movies/[id]" options={{ title: "" }} />
    </Stack>
  );
}

/** The app's providers: tokens, the query cache, and the session. */
export default function RootLayout() {
  return (
    <VariableContextProvider value={TOKEN_VARS}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider value={NAV_THEME}>
            <StatusBar style="light" />
            <Navigator />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </VariableContextProvider>
  );
}
