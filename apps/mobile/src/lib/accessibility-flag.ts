import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

type FlagEvent = "reduceTransparencyChanged" | "reduceMotionChanged";

/**
 * One system accessibility setting, read once and then followed, with one
 * listener for the whole app rather than one per component: a grid draws a
 * dozen skeletons and a screen dozens of plates. A change in Settings
 * reaches every user without a restart (apps/mobile/AGENTS.md, Styling).
 * Reading starts on the first subscriber, and a setting the platform cannot
 * report (`ios` only) stays off there. A failed read leaves it off, the
 * full look, since every fallback it gates is a courtesy.
 */
export function createAccessibilityFlag({
  event,
  read,
  iosOnly = false,
}: {
  event: FlagEvent;
  read: () => Promise<boolean>;
  iosOnly?: boolean;
}): () => boolean {
  let value = false;
  let watching = false;
  const listeners = new Set<() => void>();

  function set(next: boolean) {
    const on = next === true;
    if (on === value) return;
    value = on;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    if (!watching && (!iosOnly || Platform.OS === "ios")) {
      watching = true;
      Promise.resolve()
        .then(read)
        .then(set)
        .catch(() => {});
      AccessibilityInfo.addEventListener(event, set);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return function useAccessibilityFlag() {
    return useSyncExternalStore(
      subscribe,
      () => value,
      () => false,
    );
  };
}
