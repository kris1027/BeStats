import { router } from "expo-router";
import { View } from "react-native";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { useSession } from "@/lib/session";

/**
 * `/library`: the Library tab's root. The library is private (AGENTS.md
 * section 7), so signed out it offers Sign in. Signed in it reads no library
 * data yet and says so plainly, with no made up rows; slice 5c replaces this
 * with the pages from core's `libraryPages` (prompts/mobile-app-shell-catalog.md,
 * decision 3).
 */
export default function LibraryTab() {
  const { session, loading } = useSession();
  if (loading) return <LoadingState label="Loading" />;
  return (
    <View className="flex-1 bg-background">
      {session ? (
        <StatePanel
          title="Your library pages are on their way"
          description="Your watchlist, progress and history arrive in the next update of the app."
        />
      ) : (
        <StatePanel
          title="Sign in to see your library"
          description="Your watchlist, progress and history are private to your account."
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
      )}
    </View>
  );
}
