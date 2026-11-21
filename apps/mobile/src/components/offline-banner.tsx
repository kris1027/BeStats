import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OFFLINE_BANNER_MESSAGE, useIsOffline } from "@/lib/offline";

/**
 * The offline banner (spec 0033, AC-13; prompts/mobile-offline-about.md,
 * decision 6): a slim glass strip under the status bar, shown only while
 * there is no connection, so cached pages are never mistaken for fresh ones.
 * It sits in the layout above the root stack rather than over it, so it
 * pushes the screens down instead of hiding a header's title or back button;
 * the native headers then measure their own safe area from where they start.
 * Its arrival is announced, since a screen reader user cannot see it appear.
 */
export function OfflineBanner() {
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (offline)
      AccessibilityInfo.announceForAccessibility(OFFLINE_BANNER_MESSAGE);
  }, [offline]);
  if (!offline) return null;
  return (
    <View
      className="bg-background px-4 pb-1"
      style={{ paddingTop: insets.top + 4 }}
    >
      <View
        accessibilityLiveRegion="polite"
        className="rounded-2xl border border-border bg-glass-plate-panel px-4 py-2"
      >
        <Text className="text-center text-sm text-text-secondary">
          {OFFLINE_BANNER_MESSAGE}
        </Text>
      </View>
    </View>
  );
}
