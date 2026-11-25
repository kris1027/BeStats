import { render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { DetailHeader } from "./detail-header";

/**
 * covers: prompts/mobile-large-text-titles.md, decision 1, applied to the
 * title hero (at the accessibility text sizes the title goes under the
 * poster, so "Blade Runner 2099" wraps on whole words, never "Runne / r")
 */
const WINDOW = Dimensions.get("window");

function setFontScale(fontScale: number) {
  Dimensions.set({ window: { ...WINDOW, fontScale }, screen: WINDOW });
}

afterEach(() => setFontScale(WINDOW.fontScale));

async function heroRow() {
  await render(
    <DetailHeader
      title="Blade Runner 2099"
      posterUrl={null}
      meta={["2026"]}
      genres={[]}
      status={null}
      type="tv"
      communityRating={null}
      voteCount={null}
    />,
  );
  // NativeWind classes are not compiled under Jest, so read the class: the
  // header's text column sits directly in the hero row.
  return screen.getByRole("header", { name: "Blade Runner 2099" }).parent
    ?.parent;
}

test("at a standard text size the title sits beside the poster", async () => {
  setFontScale(1);
  expect((await heroRow())?.props.className).toContain("flex-row");
});

test("at an accessibility text size the title goes under the poster", async () => {
  setFontScale(3.12);
  expect((await heroRow())?.props.className).not.toContain("flex-row");
});
