import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";

import { watchConnection } from "./offline";

/**
 * covers: spec 0033, AC-13 and child 0036 (NetInfo drives the offline state:
 * queries pause offline and resume when the connection returns)
 */
afterEach(() => onlineManager.setOnline(true));

function connectionListener(): (state: Partial<NetInfoState>) => void {
  const calls = jest.mocked(NetInfo.addEventListener).mock.calls;
  const listener = calls.at(-1)?.[0];
  if (!listener) throw new Error("watchConnection subscribed to nothing");
  return listener as (state: Partial<NetInfoState>) => void;
}

test("feeds NetInfo's connection into onlineManager", () => {
  watchConnection();
  const report = connectionListener();

  report({ isConnected: false });
  expect(onlineManager.isOnline()).toBe(false);

  report({ isConnected: true });
  expect(onlineManager.isOnline()).toBe(true);
});

test("keeps an unknown connection online, so launch never pauses reads", () => {
  watchConnection();
  const report = connectionListener();

  report({ isConnected: false });
  report({ isConnected: null });
  expect(onlineManager.isOnline()).toBe(true);
});
