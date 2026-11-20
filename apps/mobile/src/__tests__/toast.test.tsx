import { UNDO_TOAST_MS } from "@bestats/core/tracking/messages";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useToast } from "@/components/toast";
import { testQueryClient, titleWrapper } from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-title-tracking.md decision 3: a new toast replaces
 * the earlier one of the same control and stacks beside another control's,
 * a toast with Undo stays `UNDO_TOAST_MS` (the web's 10 seconds), and a
 * running action keeps it up until its outcome.
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

test("a new toast replaces the one of the same control", async () => {
  await mount();
  await act(async () => {
    api.show({ id: "movie-1-watched", message: "First" });
    api.show({ id: "movie-1-watched", message: "Second" });
  });
  expect(screen.queryByText("First")).toBeNull();
  expect(screen.getByText("Second")).toBeOnTheScreen();
});

test("another control's failure leaves a pending Undo on screen", async () => {
  await mount();
  await act(async () => {
    api.show({
      id: "movie-1-watchlist",
      message: "Removed from watched",
      action: { label: "Undo", onPress() {} },
    });
    api.show({ id: "movie-1-rating", message: "Couldn't save", tone: "error" });
  });
  expect(screen.getByText("Removed from watched")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Undo" })).toBeOnTheScreen();
  expect(screen.getByText("Couldn't save")).toBeOnTheScreen();
});

test("at most three toasts show, dropping the oldest", async () => {
  await mount();
  await act(async () => {
    for (const n of [1, 2, 3, 4]) api.show({ message: `Toast ${n}` });
  });
  expect(screen.queryByText("Toast 1")).toBeNull();
  expect(screen.getByText("Toast 4")).toBeOnTheScreen();
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
