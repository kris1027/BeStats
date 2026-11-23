import { AccessibilityInfo } from "react-native";

import { createAccessibilityFlag } from "./accessibility-flag";

/**
 * Whether iOS's Reduce Transparency is on, followed live so toggling it in
 * Settings reaches every plate and the title header without a restart
 * (apps/mobile/AGENTS.md, Styling; AGENTS.md section 3, accessibility).
 * Android has no such setting and always draws opaque plates.
 */
export const useReduceTransparency = createAccessibilityFlag({
  event: "reduceTransparencyChanged",
  read: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  iosOnly: true,
});
