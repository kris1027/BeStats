import {
  emptySearchParams,
  type SearchParams,
} from "@bestats/core/search/params";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";

import { FiltersSheet } from "./filters-sheet";

/**
 * covers: prompts/mobile-look-search.md, decision 6 and requirements 3 and 4
 * (the sheet's Clear filters drops platforms too; a failed platform list
 * leaves Genres, Year and Rating working and never reads as an empty list;
 * a movie search offers no Platforms)
 */
const mockFetchPlatforms = jest.fn();
jest.mock("@/lib/catalog", () => ({
  ...jest.requireActual("@/lib/catalog"),
  fetchGenres: (type: string) =>
    Promise.resolve({ type, genres: [{ id: 12, name: "Adventure" }] }),
  fetchPlatforms: () => mockFetchPlatforms(),
}));

async function renderSheet(
  params: SearchParams = emptySearchParams("game"),
  onChange = jest.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <FiltersSheet
        visible
        params={params}
        currentYear={2026}
        onChange={onChange}
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  mockFetchPlatforms.mockReset();
  mockFetchPlatforms.mockResolvedValue({
    platforms: [{ id: 130, name: "Nintendo Switch" }],
  });
});

test("Clear filters drops ticked platforms with every other filter", async () => {
  const onChange = await renderSheet({
    ...emptySearchParams("game"),
    genreIds: [12],
    platformIds: [130],
    year: 2020,
  });
  await userEvent
    .setup()
    .press(screen.getByRole("button", { name: "Clear filters" }));
  expect(onChange).toHaveBeenLastCalledWith({
    genreIds: [],
    platformIds: [],
    year: null,
    rating: null,
  });
});

test("Clear filters counts a platform alone as a filter", async () => {
  await renderSheet({ ...emptySearchParams("game"), platformIds: [130] });
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeEnabled();
});

test("a failed platform list says so and leaves the other filters working", async () => {
  mockFetchPlatforms.mockRejectedValue(new Error("IGDB down"));
  const onChange = await renderSheet();
  expect(await screen.findByText("Platforms unavailable")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Any platform" })).toBeNull();

  await userEvent
    .setup()
    .press(await screen.findByRole("checkbox", { name: "Adventure" }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ genreIds: [12], platformIds: [] }),
  );
});

test("a movie search offers no Platforms and never reads the list", async () => {
  await renderSheet(emptySearchParams("movie"));
  expect(
    await screen.findByRole("checkbox", { name: "Adventure" }),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Platforms")).toBeNull();
  expect(mockFetchPlatforms).not.toHaveBeenCalled();
});
