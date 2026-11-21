import { onlineManager } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isOnlineState, OFFLINE_BANNER_MESSAGE } from "@/lib/offline";

import { OfflineBanner } from "./offline-banner";

/**
 * covers: spec 0033, AC-13 (offline, the banner shows over the last loaded
 * pages; child 0036, NetInfo drives it)
 */
afterEach(() => act(() => onlineManager.setOnline(true)));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

test("shows only while there is no connection", async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <OfflineBanner />
    </SafeAreaProvider>,
  );
  expect(screen.queryByText(OFFLINE_BANNER_MESSAGE)).toBeNull();

  await act(() => onlineManager.setOnline(false));
  expect(screen.getByText(OFFLINE_BANNER_MESSAGE)).toBeOnTheScreen();

  await act(() => onlineManager.setOnline(true));
  expect(screen.queryByText(OFFLINE_BANNER_MESSAGE)).toBeNull();
});

test("treats an unknown connection as online, so launch never flashes it", () => {
  expect(isOnlineState({ isConnected: null })).toBe(true);
  expect(isOnlineState({ isConnected: true })).toBe(true);
  expect(isOnlineState({ isConnected: false })).toBe(false);
});
