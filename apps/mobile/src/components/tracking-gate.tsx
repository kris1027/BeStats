import { TRACKING_READ_FAILED } from "@bestats/core/tracking/messages";
import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { GlassButton } from "./glass-button";
import { Notice } from "./notice";

/**
 * What a title screen shows where its tracking controls go, before it has
 * the user's state: Sign in to track when signed out (the catalog is public,
 * so the screen still shows), a spinner while the state loads, and the core
 * "Couldn't load your tracking" line with Retry when it fails. The controls
 * only ever start from the server's real state, never a guess (AGENTS.md
 * section 11).
 */
export function TrackingGate<T>({
  signedIn,
  state,
  children,
}: {
  signedIn: boolean;
  state: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const router = useRouter();
  if (!signedIn) {
    return (
      <GlassButton
        variant="primary"
        label="Sign in to track"
        onPress={() => router.push("/sign-in")}
      />
    );
  }
  if (state.isPending) {
    return <ActivityIndicator accessibilityLabel="Loading your tracking" />;
  }
  if (state.isError) {
    return (
      <View className="gap-3">
        <Notice tone="error" message={TRACKING_READ_FAILED} />
        <GlassButton label="Retry" onPress={() => state.refetch()} />
      </View>
    );
  }
  return <>{children(state.data)}</>;
}
