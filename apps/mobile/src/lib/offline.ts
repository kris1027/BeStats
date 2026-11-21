import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/** The offline banner's line (prompts/mobile-offline-about.md, decision 6). */
export const OFFLINE_BANNER_MESSAGE =
  "You're offline. Pages you opened recently still show.";

/**
 * Online unless NetInfo knows otherwise: at launch `isConnected` is `null`
 * (not yet known), and that must not flash the banner.
 */
export function isOnlineState(state: Pick<NetInfoState, "isConnected">) {
  return state.isConnected !== false;
}

/**
 * Feeds NetInfo into TanStack Query's `onlineManager` (spec 0033, child 0036:
 * NetInfo drives the offline state). Offline, queries pause instead of
 * failing, so a page already loaded keeps its data, and paused queries
 * resume on their own when the connection returns. Called once, from the
 * root layout.
 */
export function watchConnection(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
}

/**
 * True while the phone has no connection, for the offline banner (AC-13).
 * It reads the same `onlineManager` the queries obey, so the banner and the
 * paused reads never disagree.
 */
export function useIsOffline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => !onlineManager.isOnline(),
  );
}
