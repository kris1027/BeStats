import { screen } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Dimensions } from "react-native";

import { Text } from "@/components/text";
import { BACKDROP_HEADER_OPTIONS } from "@/theme/stack-options";

import {
  backdropHeight,
  solidness,
  stretchTransform,
  TitleScroll,
} from "./title-header";

let mockReduceTransparency = false;
jest.mock("@/lib/reduce-transparency", () => ({
  useReduceTransparency: () => mockReduceTransparency,
}));

afterEach(() => {
  mockReduceTransparency = false;
});

/**
 * covers: prompts/mobile-look-title-pages.md, decision 4 and AC-1 (a
 * backdrop runs full bleed under the header and fills the 16:9 artwork plus
 * the bar; with none, the screen keeps the solid header and shows no blank
 * artwork). The scroll fade and stretch run on the UI thread, which Jest
 * does not drive; they are checked in the simulator.
 */

function screenWith(backdropUrl: string | null) {
  return function Title() {
    return (
      <TitleScroll title="Dune: Part Two" backdropUrl={backdropUrl}>
        <Text>Hero</Text>
      </TitleScroll>
    );
  };
}

async function open(backdropUrl: string | null) {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: screenWith(backdropUrl),
    },
    { initialUrl: "/" },
  );
}

test("the backdrop is the 16:9 artwork plus the header it runs under", () => {
  expect(backdropHeight(375, 0)).toBe(211);
  expect(backdropHeight(375, 100)).toBe(311);
});

test("a title with a backdrop draws the artwork, hidden from screen readers", async () => {
  await open("https://image.tmdb.org/t/p/original/backdrop.jpg");
  expect(await screen.findByText("Hero")).toBeOnTheScreen();
  expect(
    screen.getByTestId("title-backdrop", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

/**
 * covers: prompts/mobile-look-title-pages.md, AC-1, and
 * prompts/mobile-title-header-clear-bar.md: over a backdrop the bar itself
 * is clear. The stack's solid `headerStyle` colour (STACK_SCREEN_OPTIONS)
 * still paints under a transparent native header, which hid the artwork's
 * top behind an opaque band; only `HeaderFade` may draw the solid colour.
 * The options reach `Stack.Screen` unchanged through `HeaderOptions`, so the
 * spy reads exactly what the native header gets.
 */
test("a title with a backdrop clears the stack's solid bar colour", async () => {
  const screenSpy = jest.spyOn(Stack, "Screen");
  try {
    await open("https://image.tmdb.org/t/p/original/backdrop.jpg");
    expect(await screen.findByText("Hero")).toBeOnTheScreen();
    const clearHeader = screenSpy.mock.calls.some(([{ options }]) =>
      expect.objectContaining(BACKDROP_HEADER_OPTIONS).asymmetricMatch(options),
    );
    expect(clearHeader).toBe(true);
    expect(BACKDROP_HEADER_OPTIONS).toEqual({
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
    });
  } finally {
    screenSpy.mockRestore();
  }
});

test("a title with no backdrop draws no artwork", async () => {
  await open(null);
  expect(await screen.findByText("Hero")).toBeOnTheScreen();
  expect(
    screen.queryByTestId("title-backdrop", { includeHiddenElements: true }),
  ).toBeNull();
});

/**
 * covers: prompts/mobile-look-title-pages.md, requirement 6 and AC-1:
 * Reduce Motion stops the stretch and makes the header switch at once.
 */
test("Reduce Motion: the backdrop never stretches when pulled", () => {
  expect(stretchTransform(-80, 300, false)).toEqual([]);
  expect(stretchTransform(-80, 300, true)).not.toEqual([]);
  expect(stretchTransform(40, 300, true)).toEqual([]);
});

test("Reduce Motion: the header switches at once instead of fading", () => {
  // The fade itself is Reanimated's `interpolate`, which the Jest stand-in
  // does not compute; the step under Reduce Motion is this file's own.
  const solidAt = 200;
  expect(solidness(solidAt - 1, solidAt, true)).toBe(0);
  expect(solidness(solidAt, solidAt, true)).toBe(1);
  expect(solidness(solidAt + 300, solidAt, true)).toBe(1);
});

/**
 * covers: prompts/mobile-look-title-pages.md, requirement 6: Reduce
 * Transparency keeps the solid header, so the artwork starts under it and
 * fills only its own 16:9, not the bar's height too.
 */
test("Reduce Transparency: the artwork starts under the solid header", async () => {
  mockReduceTransparency = true;
  await open("https://image.tmdb.org/t/p/original/backdrop.jpg");
  expect(await screen.findByText("Hero")).toBeOnTheScreen();
  const backdrop = screen.getByTestId("title-backdrop", {
    includeHiddenElements: true,
  });
  const { width } = Dimensions.get("window");
  expect(backdrop).toHaveStyle({ height: backdropHeight(width, 0) });
});
