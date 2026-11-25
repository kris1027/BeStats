import { catalogList } from "@bestats/core/catalog/lists";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";
import { Dimensions } from "react-native";

import { LandingSection } from "./landing-section";

/**
 * covers: prompts/mobile-large-text-titles.md, decision 1 (at the
 * accessibility text sizes See all moves under the section title, so the
 * title wraps on whole words; standard sizes keep the row)
 */
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

jest.mock("@/lib/catalog", () => ({
  ...jest.requireActual("@/lib/catalog"),
  fetchList: (type: string, list: string) =>
    Promise.resolve({
      type,
      list,
      page: 1,
      pageSize: 24,
      results: [],
      total: 0,
      totalIsExact: true,
      nextPage: null,
    }),
}));

const WINDOW = Dimensions.get("window");

function setFontScale(fontScale: number) {
  Dimensions.set({ window: { ...WINDOW, fontScale }, screen: WINDOW });
}

afterEach(() => setFontScale(WINDOW.fontScale));

async function renderSection() {
  const list = catalogList("tv", "trending");
  if (!list) throw new Error("no trending list");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  await renderRouter(
    { index: () => <LandingSection list={list} count={6} variant="large" /> },
    { initialUrl: "/", wrapper },
  );
  return list;
}

/**
 * The row holding the title block and See all. NativeWind classes are not
 * compiled to styles under Jest, so the tests read the class it was given.
 */
async function headerRow() {
  const link = await screen.findByRole("link", { name: /^See all/ });
  // The link's Pressable sits directly in the header row.
  return link.parent;
}

test("at a standard text size the title and See all share one row", async () => {
  setFontScale(1);
  await renderSection();
  expect((await headerRow())?.props.className).toContain("flex-row");
});

test("at an accessibility text size See all moves under the title", async () => {
  setFontScale(3.12);
  await renderSection();
  expect((await headerRow())?.props.className).not.toContain("flex-row");
});

/**
 * covers: prompts/mobile-look-verify-extras.md, the See all baseline fix
 * (the title and See all align by baseline, as the web's `SectionHeader`;
 * aligned by their bottoms, the 44pt link box lifted See all above the title)
 */
test("the title and See all share a baseline, not their bottoms", async () => {
  setFontScale(1);
  await renderSection();
  const row = (await headerRow())?.props.className;
  expect(row).toContain("items-baseline");
  expect(row).not.toContain("items-end");
});

test("the blurb sits under the title, in the title's column", async () => {
  setFontScale(1);
  const list = catalogList("tv", "trending");
  if (!list) throw new Error("no trending list");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderRouter(
    {
      index: () => (
        <QueryClientProvider client={client}>
          <LandingSection
            list={list}
            count={6}
            variant="large"
            blurb={() => "Six on the air"}
          />
        </QueryClientProvider>
      ),
    },
    { initialUrl: "/" },
  );
  const blurb = await screen.findByText("Six on the air");
  const title = screen.getByRole("header", { name: list.rowTitle });
  expect(blurb.parent).toBe(title.parent);
});
