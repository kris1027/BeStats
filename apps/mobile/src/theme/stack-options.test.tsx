import { render, screen } from "@testing-library/react-native";

import { Text } from "@/components/text";

import { tabScreenLayout } from "./stack-options";

jest.mock("@/components/page-background", () => {
  const { View } = require("react-native");
  return { PageBackground: () => <View testID="page-background" /> };
});

const layout = tabScreenLayout(["search"]);

async function draw(name: string, id?: string) {
  await render(
    layout({
      route: { name, params: id === undefined ? undefined : { id } },
      children: <Text>Screen</Text>,
    }),
  );
}

/**
 * covers: prompts/mobile-backdrop-clear-top.md, AC-3 (nothing else changes):
 * the catalog lists share the title routes and keep the stack's background.
 */
test.each([
  ["movies/[id]", "popular"],
  ["shows/[id]", "popular"],
  ["games/[id]", "coming-soon"],
  ["shows/[id]/season/[number]", "1396"],
  ["account/about", undefined],
])("%s with %s gets the page background", async (name, id) => {
  await draw(name, id);
  expect(screen.getByTestId("page-background")).toBeOnTheScreen();
});

test.each([
  ["movies/[id]", "693134"],
  ["shows/[id]", "1396"],
  ["games/[id]", "119133"],
  ["movies/[id]", "not-an-id"],
  ["search", undefined],
])("%s with %s is left bare", async (name, id) => {
  await draw(name, id);
  expect(screen.getByText("Screen")).toBeOnTheScreen();
  expect(screen.queryByTestId("page-background")).toBeNull();
});
