import { AccessibilityInfo } from "react-native";

import { createAccessibilityFlag } from "./accessibility-flag";

/**
 * Whether the system asks for reduced motion, followed live with one
 * listener for the whole app (apps/mobile/AGENTS.md, Styling). React
 * Native's own `AccessibilityInfo`, not Reanimated's hook, which reads the
 * setting once: the skeleton pulse and the title header's stretch both stop
 * the moment it turns on.
 */
export const useReduceMotion = createAccessibilityFlag({
  event: "reduceMotionChanged",
  read: () => AccessibilityInfo.isReduceMotionEnabled(),
});
