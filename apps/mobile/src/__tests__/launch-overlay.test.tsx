import { LAUNCH_TOTAL_MS } from "@bestats/core/brand/mark";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Reanimated from "react-native-reanimated";
import { LaunchOverlay } from "@/components/launch-overlay";
import { Text } from "@/components/text";

/**
 * prompts/mobile-app-icon-launch.md, decision 9: the overlay hides the
 * native splash once its first frame is laid out, plays, holds the final
 * lockup until the session has loaded, skips on a tap, and with Reduce
 * Motion goes straight to the final lockup. It is hidden from screen readers.
 */

jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
  preventAutoHideAsync: jest.fn(),
}));

const hideAsync = SplashScreen.hideAsync as jest.Mock;

/** The overlay is hidden from screen readers, so queries must ask for it. */
const HIDDEN = { includeHiddenElements: true };

beforeEach(() => {
  jest.useFakeTimers();
  hideAsync.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderOverlay(ready: boolean) {
  const view = await render(
    <LaunchOverlay ready={ready}>
      <Text>Home</Text>
    </LaunchOverlay>,
  );
  return view;
}

/** Lays the lockup out, as the first native frame does. */
async function layOut() {
  const lockup = screen.getByTestId("launch-skip", HIDDEN).children[0];
  await act(async () => {
    fireEvent(screen.getByText("Be", HIDDEN), "textLayout", {
      nativeEvent: { lines: [{ height: 54, ascender: 43 }] },
    });
    fireEvent(lockup as never, "layout", {
      nativeEvent: { layout: { width: 200, height: 40, x: 0, y: 0 } },
    });
  });
  // The splash goes one frame later, once the measured lockup is drawn.
  await act(async () => {
    jest.advanceTimersByTime(16);
  });
}

/** Runs the clock forward, flushing the promise the splash hide returns. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

test("keeps the native splash up until the lockup is measured", async () => {
  await renderOverlay(true);
  expect(hideAsync).not.toHaveBeenCalled();
  await layOut();
  expect(hideAsync).toHaveBeenCalledTimes(1);
});

test("hides the splash and lets the app through if layout never comes", async () => {
  await renderOverlay(true);
  await advance(999);
  expect(hideAsync).not.toHaveBeenCalled();
  await advance(1);
  expect(hideAsync).toHaveBeenCalledTimes(1);
  // Only the app's own fade is left.
  await advance(600);
  expect(screen.queryByTestId("launch-overlay", HIDDEN)).toBeNull();
  expect(screen.getByText("Home")).toBeTruthy();
});

test("leaves after the sequence once the session is ready", async () => {
  await renderOverlay(true);
  await layOut();
  expect(screen.getByTestId("launch-overlay", HIDDEN)).toBeTruthy();
  // The fade starts once React has seen the hold end, so it is a second step.
  await advance(LAUNCH_TOTAL_MS);
  await advance(500);
  expect(screen.queryByTestId("launch-overlay", HIDDEN)).toBeNull();
  expect(screen.getByText("Home")).toBeTruthy();
});

test("holds the final lockup while the session still loads", async () => {
  const view = await renderOverlay(false);
  await layOut();
  await advance(LAUNCH_TOTAL_MS + 2000);
  expect(screen.getByTestId("launch-overlay", HIDDEN)).toBeTruthy();
  await view.rerender(
    <LaunchOverlay ready>
      <Text>Home</Text>
    </LaunchOverlay>,
  );
  await advance(1000);
  expect(screen.queryByTestId("launch-overlay", HIDDEN)).toBeNull();
});

test("a tap skips to the end", async () => {
  await renderOverlay(true);
  await layOut();
  await advance(300);
  await act(async () => {
    fireEvent.press(screen.getByTestId("launch-skip", HIDDEN));
  });
  // Only the app's own fade is left.
  await advance(600);
  expect(screen.queryByTestId("launch-overlay", HIDDEN)).toBeNull();
});

test("Reduce Motion goes straight to the final lockup and fades", async () => {
  jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
  await renderOverlay(true);
  await layOut();
  await advance(600);
  expect(screen.queryByTestId("launch-overlay", HIDDEN)).toBeNull();
});

test("is hidden from screen readers", async () => {
  await renderOverlay(true);
  const overlay = screen.getByTestId("launch-overlay", HIDDEN);
  expect(overlay.props.accessibilityElementsHidden).toBe(true);
  expect(overlay.props.importantForAccessibility).toBe("no-hide-descendants");
});
