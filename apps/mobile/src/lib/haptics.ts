import * as Haptics from "expo-haptics";

/**
 * The app's one door to `expo-haptics`, so no screen calls it directly
 * (apps/mobile/AGENTS.md, BeStats rules). Both fire only once
 * the server has answered a tracking write, never on the optimistic step, a
 * read or a scroll (requirement 10). A device that cannot buzz just stays
 * still: a haptic is a courtesy, never the only sign of an outcome, so a
 * failure here is swallowed.
 */
export function confirmedWriteHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** The error buzz for a write the server refused or never received. */
export function refusedWriteHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
