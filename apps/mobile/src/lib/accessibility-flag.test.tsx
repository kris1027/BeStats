import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { createAccessibilityFlag } from "./accessibility-flag";

/**
 * covers: apps/mobile/AGENTS.md, Styling: a system accessibility setting is
 * read once, then followed live, for every component that reads it.
 */
test("reads the setting once, then follows its change event", async () => {
  let emit: (value: boolean) => void = () => {};
  const listen = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((_event, handler) => {
      emit = handler as (value: boolean) => void;
      return { remove: () => {} } as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  const read = jest.fn().mockResolvedValue(true);
  const useFlag = createAccessibilityFlag({
    event: "reduceMotionChanged",
    read,
  });

  const first = await renderHook(() => useFlag());
  const second = await renderHook(() => useFlag());
  await waitFor(() => expect(first.result.current).toBe(true));
  expect(second.result.current).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
  expect(listen).toHaveBeenCalledTimes(1);

  await act(() => emit(false));
  expect(first.result.current).toBe(false);
  expect(second.result.current).toBe(false);
  listen.mockRestore();
});
