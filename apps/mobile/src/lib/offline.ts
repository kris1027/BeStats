import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * The offline banner's line (prompts/mobile-offline-about.md, decision 6).
 * It stays in the app, not core's message files: the web has no offline
 * banner, so there is no second app to keep in step (apps/mobile/AGENTS.md,
 * BeStats rules).
 */
export const OFFLINE_BANNER_MESSAGE =
  "You're offline. Pages you opened recently still show.";

/**
 * Online unless NetInfo knows otherwise: at launch `isConnected` is `null`
 * (not yet known), and that must not flash the banner, which would claim a
 * state the phone has not confirmed (AGENTS.md section 11: the UI never shows
 * a false state; spec 0033, AC-13).
 */
export function isOnlineState(state: Pick<NetInfoState, "isConnected">) {
  return state.isConnected !== false;
}

/**
 * Feeds NetInfo into TanStack Query's `onlineManager` (spec 0033, child 0036:
 * NetInfo drives the offline state). Offline, queries pause instead of
 * failing, so a page already loaded keeps its data, and paused queries
 * resume on their own when the connection returns (AGENTS.md section 12:
 * user history stays visible when the catalog cannot be reached). Called
 * once, from the root layout.
 */
export function watchConnection(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
}

/**
 * True while the phone has no connection, for the offline banner (AC-13).
 * It reads the same `onlineManager` the queries obey, so the banner and the
 * paused reads never disagree (AGENTS.md section 12).
 */
export function useIsOffline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => !onlineManager.isOnline(),
  );
}
