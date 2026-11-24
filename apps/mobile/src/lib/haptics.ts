import * as Haptics from "expo-haptics";

/**
 * The app's one door to `expo-haptics`, so no screen calls it directly
 * (apps/mobile/AGENTS.md, BeStats rules). Both fire only once
 * the server has answered a tracking write, never on the optimistic step, a
 * read or a scroll (requirement 10). A device that cannot buzz just stays
 * still: a haptic is a courtesy, never the only sign of an outcome, so a
 * failure here is swallowed in a store build. A development build says why
 * in Metro, so a silent phone can be told apart from a missing native module.
 */
export function confirmedWriteHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(reportFailure);
}

/** The error buzz for a write the server refused or never received. */
export function refusedWriteHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    reportFailure,
  );
}

function reportFailure(error: unknown): void {
  if (__DEV__) console.warn("Haptic failed:", error);
}
