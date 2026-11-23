import { createContext, useContext } from "react";
import { Platform } from "react-native";

import { useReduceTransparency } from "@/lib/reduce-transparency";

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
