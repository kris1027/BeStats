import { createContext, useContext } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { createAccessibilityFlag } from "@/lib/accessibility-flag";

/**
 * Whether iOS's Reduce Transparency is on, followed live so toggling it in
 * Settings reaches every plate without a restart (apps/mobile/AGENTS.md,
 * Styling). Android has no such setting and always draws opaque plates.
 */
const useReduceTransparency = createAccessibilityFlag({
  event: "reduceTransparencyChanged",
  read: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  iosOnly: true,
});

/**
 * Plates inside a `PlateSolid` are opaque, as the web's `plate-solid` makes
 * every plate inside a poster card's badge slot opaque (the plate rule,
 * components/AGENTS.md): artwork of any colour sits behind them.
 */
export const SolidPlates = createContext(false);

/**
 * Whether a plate here frosts: real blur on iOS only, and never under Reduce
 * Transparency or inside a solid slot, where it takes the web's opaque
 * fallback instead (apps/mobile/AGENTS.md, Styling). Android always draws
 * opaque plates, since its blur is slow on a scrolling list.
 */
export function useFrosted(): boolean {
  const reduced = useReduceTransparency();
  const solid = useContext(SolidPlates);
  return Platform.OS === "ios" && !reduced && !solid;
}
