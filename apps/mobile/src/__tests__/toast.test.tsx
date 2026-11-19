import { UNDO_TOAST_MS } from "@bestats/core/tracking/messages";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useToast } from "@/components/toast";
import { testQueryClient, titleWrapper } from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-title-tracking.md decision 3: a new toast replaces
 * the one on screen, a toast with Undo stays `UNDO_TOAST_MS` (the web's 10
 * seconds), and a running action keeps it up until its outcome.
 */
let api: ReturnType<typeof useToast>;
function Probe() {
  api = useToast();
  return <Text>probe</Text>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function mount() {
  await render(<Probe />, { wrapper: titleWrapper(testQueryClient()) });
}

test("a new toast replaces the one on screen", async () => {
  await mount();
  await act(async () => {
    api.show({ message: "First" });
    api.show({ message: "Second" });
  });
  expect(screen.queryByText("First")).toBeNull();
  expect(screen.getByText("Second")).toBeOnTheScreen();
});

test("an Undo toast stays ten seconds, then closes", async () => {
  await mount();
  await act(async () => {
    api.show({ message: "Removed", action: { label: "Undo", onPress() {} } });
  });
  await act(async () => {
    jest.advanceTimersByTime(UNDO_TOAST_MS - 1);
  });
  expect(screen.getByText("Removed")).toBeOnTheScreen();
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(screen.queryByText("Removed")).toBeNull();
});

test("a running action keeps the toast until it settles", async () => {
  await mount();
  let key = 0;
  await act(async () => {
    key = api.show({
      message: "Removed",
      action: { label: "Undo", onPress() {} },
    });
    api.busy(key);
  });
  await act(async () => {
    jest.advanceTimersByTime(UNDO_TOAST_MS * 2);
  });
  expect(screen.getByText("Removed")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  await act(async () => {
    api.dismiss(key);
  });
  expect(screen.queryByText("Removed")).toBeNull();
});
