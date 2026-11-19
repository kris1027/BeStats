import { signedInAs } from "@bestats/core/auth/messages";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassButton } from "@/components/glass-button";
import { useSession } from "@/lib/session";

/**
 * `/account`: the Account tab's root. Signed in it shows who you are and
 * Sign out; signed out it offers Sign in. The full account screen (profile,
 * deletion, About) is slice 5d (prompts/mobile-app-shell-catalog.md,
 * decision 3).
 */
export default function AccountTab() {
  const { session, loading, signOut } = useSession();
  if (loading) return <LoadingState label="Loading" />;
  if (!session) {
    return (
      <View className="flex-1 bg-background">
        <StatePanel
          title="You're not signed in"
          description="Sign in to track what you watch and play."
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
      </View>
    );
  }
  return (
    <View className="flex-1 gap-6 bg-background px-4 pt-6">
      <Text className="text-text-secondary">
        {signedInAs(session.user.email)}
      </Text>
      <GlassButton label="Sign out" onPress={signOut} />
    </View>
  );
}
