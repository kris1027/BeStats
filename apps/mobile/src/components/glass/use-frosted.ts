import { createContext, useContext, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Whether iOS's Reduce Transparency is on, read once and then followed, so a
 * change in Settings reaches every plate without a restart
 * (prompts/mobile-web-parity-foundation.md, requirement 4). One listener for
 * the whole app rather than one per plate.
 */
let reduceTransparency = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (value === reduceTransparency) return;
  reduceTransparency = value;
  for (const listener of listeners) listener();
}

let watching = false;
function watch() {
  if (watching || Platform.OS !== "ios") return;
  watching = true;
  AccessibilityInfo.isReduceTransparencyEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener("reduceTransparencyChanged", set);
}

function subscribe(listener: () => void) {
  watch();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Plates inside a `PlateSolid` are opaque, as the web's `plate-solid` makes
 * every plate inside a poster card's badge slot opaque (the plate rule,
 * components/AGENTS.md): artwork of any colour sits behind them.
 */
export const SolidPlates = createContext(false);

/**
 * Whether a plate here frosts: real blur on iOS only, and never under Reduce
 * Transparency or inside a solid slot, where it takes the web's opaque
 * fallback instead (decision 3). Android always draws opaque plates, since
 * its blur is slow on a scrolling list.
 */
export function useFrosted(): boolean {
  const reduced = useSyncExternalStore(
    subscribe,
    () => reduceTransparency,
    () => false,
  );
  const solid = useContext(SolidPlates);
  return Platform.OS === "ios" && !reduced && !solid;
}
