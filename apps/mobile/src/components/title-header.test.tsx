import { screen } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";

import { Text } from "@/components/text";

import { backdropHeight, TitleScroll } from "./title-header";

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

test("a title with no backdrop draws no artwork", async () => {
  await open(null);
  expect(await screen.findByText("Hero")).toBeOnTheScreen();
  expect(
    screen.queryByTestId("title-backdrop", { includeHiddenElements: true }),
  ).toBeNull();
});
