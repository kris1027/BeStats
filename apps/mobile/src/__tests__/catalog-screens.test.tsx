import { catalogList } from "@bestats/core/catalog/lists";
import { TMDB_APP_ATTRIBUTION } from "@bestats/core/legal/attribution";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import { ToastProvider } from "@/components/toast";
import { ApiError } from "@/lib/api";
import { MediaTypeProvider } from "@/lib/media-type";
import { CatalogListScreen } from "@/screens/catalog-list-screen";
import { HomeScreen } from "@/screens/home-screen";
import { SearchScreen } from "@/screens/search-screen";

/**
 * covers: prompts/mobile-app-shell-catalog.md decisions 4, 6 and 7: Home's
 * sections come from core's slots and one failed list stays in its section;
 * a list ends quietly at a 404; Search sends core's params and the media
 * switch moves Home and Search together; AC-14's catalog notice shows;
 * prompts/mobile-look-card-actions.md R1 and R6: signed in, Home's rows show
 * each card's own state from one `/me/titles` read per row
 */
// The catalog screens are public: signed out by default, so no card reads
// its state; the signed in test sets a session and answers `/me/titles`.
let mockSession: object | null = null;
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession }),
}));

const mockApiRequest = jest.fn();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const mockFetchList = jest.fn();
const mockFetchSearch = jest.fn();
jest.mock("@/lib/catalog", () => ({
  ...jest.requireActual("@/lib/catalog"),
  fetchList: (...args: unknown[]) => mockFetchList(...args),
  fetchSearch: (...args: unknown[]) => mockFetchSearch(...args),
  fetchGenres: () => Promise.resolve({ type: "tv", genres: [] }),
  fetchPlatforms: () =>
    Promise.resolve({
      platforms: [
        { id: 6, name: "PC (Microsoft Windows)" },
        { id: 130, name: "Nintendo Switch" },
      ],
    }),
}));

function item(id: number, title: string) {
  return {
    id,
    title,
    year: 2024,
    releaseDate: "2024-01-01",
    posterUrl: null,
    communityRating: 7.5,
  };
}

function listPage(
  type: string,
  list: string,
  pageNumber: number,
  nextPage: number | null,
) {
  return {
    type,
    list,
    page: pageNumber,
    pageSize: 24,
    results: [item(pageNumber * 100 + 1, `${list} title ${pageNumber}`)],
    total: 48,
    totalIsExact: true,
    nextPage,
  };
}

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MediaTypeProvider>{children}</MediaTypeProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  jest.resetAllMocks();
  mockSession = null;
  mockApiRequest.mockImplementation((path: string) =>
    Promise.reject(new Error(`Unexpected ${path}`)),
  );
  mockFetchList.mockImplementation((type: string, list: string) =>
    Promise.resolve(listPage(type, list, 1, null)),
  );
  mockFetchSearch.mockImplementation((params: { type: string }) =>
    Promise.resolve({
      type: params.type,
      mode: "browse",
      page: 1,
      pageSize: 24,
      results: [item(7, "Found title")],
      total: 100,
      totalIsExact: true,
      nextPage: null,
      scanned: null,
    }),
  );
});

test("Home shows every landing section of Shows, with the TMDB notice", async () => {
  await renderRouter({ index: HomeScreen }, { initialUrl: "/", wrapper });
  for (const heading of [
    "Trending this week",
    "Popular",
    "On the air",
    "Top rated",
  ]) {
    expect(
      await screen.findByRole("header", { name: heading }),
    ).toBeOnTheScreen();
  }
  expect(screen.getByText("On TV today")).toBeOnTheScreen();
  expect(screen.getByText(TMDB_APP_ATTRIBUTION)).toBeOnTheScreen();
  expect(mockFetchList).toHaveBeenCalledWith("tv", "airing-today", 1);
});

test("signed in, Home's rows show each card's own state from one read per row", async () => {
  mockSession = { user: { email: "a@example.test" } };
  mockApiRequest.mockImplementation((path: string) =>
    path === "/api/v1/me/titles?ids=tv:101"
      ? Promise.resolve({
          "tv:101": {
            tracked: true,
            progress: null,
            seasonRatings: [],
            showRating: null,
          },
        })
      : Promise.reject(new Error(`Unexpected ${path}`)),
  );
  await renderRouter({ index: HomeScreen }, { initialUrl: "/", wrapper });

  const tracked = await screen.findAllByRole("link", {
    name: /^popular title 1, 2024, TMDB 7\.5, Tracking$/,
  });
  expect(tracked).toHaveLength(1);
  const reads = mockApiRequest.mock.calls.map(([path]) => path);
  expect(reads.every((path) => path === "/api/v1/me/titles?ids=tv:101")).toBe(
    true,
  );
  // One read per row, never one per card: each row here holds one card.
  const rows = mockFetchList.mock.calls.length;
  expect(reads.length).toBeLessThanOrEqual(rows);
});

test("one failed Home list offers Try again in its section only", async () => {
  mockFetchList.mockImplementation((type: string, list: string) =>
    list === "popular"
      ? Promise.reject(new ApiError(502, "catalog_unavailable", "TMDB down"))
      : Promise.resolve(listPage(type, list, 1, null)),
  );
  await renderRouter({ index: HomeScreen }, { initialUrl: "/", wrapper });
  expect(await screen.findByText("Couldn't load Popular")).toBeOnTheScreen();
  expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
  expect(
    await screen.findByRole("link", {
      name: "trending title 1, 2024, TMDB 7.5",
    }),
  ).toBeOnTheScreen();
});

test("a list loads its next page and stops quietly at a 404", async () => {
  mockFetchList.mockImplementation(
    (type: string, list: string, pageNumber: number) =>
      pageNumber === 1
        ? Promise.resolve(listPage(type, list, 1, 2))
        : Promise.reject(new ApiError(404, "not_found", "Not found")),
  );
  const popular = catalogList("movie", "popular");
  await renderRouter(
    { "movies/[id]": () => <CatalogListScreen list={popular} /> },
    { initialUrl: "/movies/popular", wrapper },
  );
  expect(await screen.findByText(popular.note)).toBeOnTheScreen();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("Search sends core's params and follows the media switch", async () => {
  const user = userEvent.setup();
  await renderRouter(
    { search: SearchScreen },
    { initialUrl: "/search", wrapper },
  );
  expect(await screen.findByText("Popular shows on TMDB")).toBeOnTheScreen();
  await user.press(screen.getByRole("tab", { name: "Games" }));
  expect(await screen.findByText("Popular games on IGDB")).toBeOnTheScreen();
  expect(mockFetchSearch).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "game", q: null, genreIds: [] }),
    1,
  );
});

test("Search offers Try again when the catalog fails", async () => {
  mockFetchSearch.mockRejectedValue(
    new ApiError(502, "catalog_unavailable", "TMDB down"),
  );
  await renderRouter(
    { search: SearchScreen },
    { initialUrl: "/search", wrapper },
  );
  expect(await screen.findByText("Couldn't reach TMDB")).toBeOnTheScreen();
  mockFetchSearch.mockResolvedValue({
    type: "tv",
    mode: "browse",
    page: 1,
    pageSize: 24,
    results: [item(7, "Found title")],
    total: 100,
    totalIsExact: true,
    nextPage: null,
    scanned: null,
  });
  await userEvent
    .setup()
    .press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByText("Popular shows on TMDB")).toBeOnTheScreen(),
  );
});

// prompts/mobile-look-search.md, AC-3 and AC-5
test("a games search filters by platform, and other catalogs offer none", async () => {
  const user = userEvent.setup();
  await renderRouter(
    { search: SearchScreen },
    { initialUrl: "/search", wrapper },
  );
  await user.press(await screen.findByRole("button", { name: "Filters" }));
  expect(screen.queryByRole("button", { name: "Any platform" })).toBeNull();
  await user.press(screen.getByRole("button", { name: "Done" }));

  await user.press(screen.getByRole("tab", { name: "Games" }));
  await user.press(await screen.findByRole("button", { name: "Filters" }));
  await user.press(await screen.findByRole("button", { name: "Any platform" }));
  await user.press(
    await screen.findByRole("checkbox", { name: "Nintendo Switch" }),
  );
  await user.press(screen.getByRole("button", { name: "Back to filters" }));
  expect(
    screen.getByRole("button", { name: "Platforms (1)" }),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Done" }));

  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "game", platformIds: [130] }),
      1,
    ),
  );
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "game", platformIds: [] }),
      1,
    ),
  );
});
