import "../global.css";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { DarkTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { VariableContextProvider } from "nativewind";
import { type ReactNode, useEffect } from "react";
import { Appearance, View } from "react-native";

import { LaunchOverlay } from "@/components/launch-overlay";
import { OfflineBanner } from "@/components/offline-banner";
import { ToastProvider } from "@/components/toast";
import { MediaTypeProvider } from "@/lib/media-type";
import { watchConnection } from "@/lib/offline";
import { persistOptions, queryClient } from "@/lib/query-client";
import {
  SessionProvider,
  useSession,
  wipePrivateCacheIfSignedOut,
} from "@/lib/session";
import { TOKEN_VARS, tokenColor } from "@/theme/token-vars";

SplashScreen.preventAutoHideAsync();

// BeStats is dark only, as the web is (spec 0004). Native chrome the app
// does not draw itself (the glass tab bar, sheets, the keyboard) follows the
// system appearance, so pin it to dark or a light phone draws light glass
// under dark screens.
Appearance.setColorScheme("dark");

// Queries pause offline and resume when NetInfo reports a connection again
// (spec 0033, AC-13).
watchConnection();

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
 * The root stack: the tabs, with Sign in and Create account as modals over
 * them, so a signed out visitor browses and signs in from where they are
 * (prompts/mobile-app-shell-catalog.md, decisions 1 and 3;
 * prompts/mobile-account-deletion.md, decision 8).
 */
function Navigator() {
  const { notice } = useSession();
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
      <Stack.Screen
        name="sign-up"
        options={{ title: "Create account", presentation: "modal" }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{ title: "Forgot password", presentation: "modal" }}
      />
      <Stack.Screen
        name="reset-password/app"
        options={{ title: "Set a new password", presentation: "modal" }}
      />
    </Stack>
  );
}

/**
 * The launch animation over the app until the session has loaded; it hides
 * the native splash itself (prompts/mobile-app-icon-launch.md, decision 9).
 */
function LaunchGate({ children }: { children: ReactNode }) {
  const { loading } = useSession();
  return <LaunchOverlay ready={!loading}>{children}</LaunchOverlay>;
}

/**
 * The app's providers: tokens, the query cache persisted for offline reads
 * (wiped of private entries at once when no session is stored), the session,
 * the media type Home and Search share, the one toast tracking writes report
 * through, the offline banner above the stack (spec 0033, AC-13), and the
 * launch animation over all of it on cold start.
 */
export default function RootLayout() {
  return (
    <VariableContextProvider value={TOKEN_VARS}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        onSuccess={wipePrivateCacheIfSignedOut}
      >
        <SessionProvider>
          <MediaTypeProvider>
            <ThemeProvider value={NAV_THEME}>
              <ToastProvider>
                <StatusBar style="light" />
                <LaunchGate>
                  <View className="flex-1 bg-background">
                    <OfflineBanner />
                    <Navigator />
                  </View>
                </LaunchGate>
              </ToastProvider>
            </ThemeProvider>
          </MediaTypeProvider>
        </SessionProvider>
      </PersistQueryClientProvider>
    </VariableContextProvider>
  );
}
