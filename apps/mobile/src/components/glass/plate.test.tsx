import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { Text } from "@/components/text";
import { GlassPlate, gradientCss, PlateSolid } from "./plate";
import { gradientLine } from "./rim";

/**
 * covers: prompts/mobile-web-parity-foundation.md, decision 3 and
 * requirement 4 (frosted on iOS only; opaque on Android, under Reduce
 * Transparency and inside a solid slot, as the web's fallback)
 */
let reduceTransparency: (value: boolean) => void = () => {};

beforeAll(() => {
  jest
    .spyOn(AccessibilityInfo, "isReduceTransparencyEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((event, handler) => {
      if (event === "reduceTransparencyChanged") {
        reduceTransparency = handler as (value: boolean) => void;
      }
      return { remove: () => {} } as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
});

afterEach(() => act(() => reduceTransparency(false)));

test("frosts on iOS and keeps its content", async () => {
  await render(
    <GlassPlate plate="panel">
      <Text>Inside</Text>
    </GlassPlate>,
  );
  expect(screen.getByTestId("glass-blur")).toBeOnTheScreen();
  expect(screen.getByText("Inside")).toBeOnTheScreen();
});

test("goes opaque when Reduce Transparency turns on, without a restart", async () => {
  await render(<GlassPlate plate="panel" />);
  expect(screen.getByTestId("glass-blur")).toBeOnTheScreen();
  await act(() => reduceTransparency(true));
  expect(screen.queryByTestId("glass-blur")).toBeNull();
});

test("never blurs inside a solid slot or with the selected sheen", async () => {
  await render(
    <>
      <PlateSolid>
        <GlassPlate />
      </PlateSolid>
      <GlassPlate sheen="selected" />
    </>,
  );
  expect(screen.queryByTestId("glass-blur")).toBeNull();
});

test("never blurs on Android", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await render(<GlassPlate />);
  expect(screen.queryByTestId("glass-blur")).toBeNull();
  jest.restoreAllMocks();
});

test("writes the web's gradient as React Native's backgroundImage", () => {
  expect(
    gradientCss({
      angle: 169,
      stops: [
        { color: "a", at: 0 },
        { color: "b", at: 1 },
      ],
    }),
  ).toBe("linear-gradient(169deg, a 0%, b 100%)");
});

test("turns a CSS angle into an SVG gradient line", () => {
  expect(gradientLine(180)).toEqual({
    x1: expect.closeTo(0.5),
    y1: expect.closeTo(0),
    x2: expect.closeTo(0.5),
    y2: expect.closeTo(1),
  });
});
