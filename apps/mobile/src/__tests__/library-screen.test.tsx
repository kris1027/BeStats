import {
  LIBRARY_CLASSIFY_LIMIT,
  libraryPageName,
  libraryPages,
} from "@bestats/core/catalog/library-list";
import {
  LIBRARY_LIST_FAILED_TITLE,
  LIBRARY_NOTES,
  libraryCopy,
} from "@bestats/core/tracking/messages";
import type { QueryClient } from "@tanstack/react-query";
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import { ApiError } from "@/lib/api";
import { libraryCardView } from "@/lib/library-card";
import { MediaTypeProvider } from "@/lib/media-type";
import { LibraryScreen } from "@/screens/library-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-library-tabs.md decisions 1 to 4 and 7; spec 0033,
 * AC-10 (pages, routes and names from core, the route sent and never a page
 * key), AC-14 (a personal score stays apart from TMDB's); AGENTS.md section
 * 11 (signed out sends no private request; a failed read is never the empty
 * state) and section 12 (a title whose catalog read failed still shows)
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = { user: { email: "a@example.test" } };
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession, loading: false }),
}));

const TODAY = "2026-11-20";

function libraryPath(type: string, path: string, page = 1) {
  return `/api/v1/me/library?${new URLSearchParams({
    type,
    path,
    page: String(page),
  })}`;
}

function answer(
  type: string,
  path: string,
  entries: unknown[],
  extra: Record<string, unknown> = {},
) {
  return {
    type,
    path,
    page: 1,
    pageSize: 24,
    entries,
    total: entries.length,
    failedCount: 0,
    capped: false,
    nextPage: null,
    ...extra,
  };
}

const UP_NEXT_SHOW = {
  type: "tv",
  id: 1399,
  path: "/shows/1399",
  user: {
    tracked: true,
    progress: null,
    seasonRatings: [],
    showRating: null,
  },
  card: {
    kind: "title",
    name: "Game of Thrones",
    posterUrl: null,
    tmdbRating: 8.4,
    place: { page: "watchlist", next: { season: 2, episode: 3 } },
  },
};

const WATCHED_MOVIE = {
  type: "movie",
  id: 603,
  path: "/movies/603",
  user: { planned: false, watchedAt: "2026-01-01T00:00:00Z", rating: 8 },
  card: {
    kind: "title",
    name: "The Matrix",
    posterUrl: null,
    tmdbRating: 8.2,
    releaseDate: "1999-03-31",
  },
};

let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  const Titles = titleWrapper(client);
  return (
    <Titles>
      <MediaTypeProvider>{children}</MediaTypeProvider>
    </Titles>
  );
}

async function openLibrary(url = "/library") {
  await renderRouter(
    { library: LibraryScreen, index: () => null },
    { initialUrl: url, wrapper },
  );
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
  for (const type of ["tv", "movie", "game"]) {
    for (const page of libraryPages(type as "tv")) {
      const route = {
        tv: {
          watchlist: "/up-next",
          upcoming: "/upcoming",
          watched: "/watched",
        },
        movie: {
          watchlist: "/watchlist",
          upcoming: "/coming-soon",
          watched: "/watched",
        },
        game: {
          "coming-soon": "/coming-soon",
          watchlist: "/want-to-play",
          upcoming: "/playing",
          watched: "/finished",
        },
      } as Record<string, Record<string, string>>;
      const path = route[type][page];
      mockApi.on("GET", libraryPath(type, path), () => answer(type, path, []));
    }
  }
});

test("opens on Shows, Up next, with core's pages and names", async () => {
  mockApi.on("GET", libraryPath("tv", "/up-next"), () =>
    answer("tv", "/up-next", [UP_NEXT_SHOW]),
  );
  await openLibrary();
  expect(
    await screen.findByLabelText(
      "Game of Thrones, Next episode, season 2 episode 3",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText("S2E3")).toBeOnTheScreen();
  // The three media tabs come first, then the pills in core's order.
  const names = libraryPages("tv").map((page) => libraryPageName(page, "tv"));
  expect(screen.getAllByRole("tab").slice(3)).toEqual(
    names.map((name) => screen.getByRole("tab", { name })),
  );
  expect(
    screen.getByRole("tab", { name: libraryPageName("watchlist", "tv") }),
  ).toBeSelected();
});

test("Games lists Coming soon, Want to play, Playing, Finished and sends routes", async () => {
  const user = userEvent.setup();
  await openLibrary();
  await user.press(await screen.findByRole("tab", { name: "Games" }));
  for (const page of libraryPages("game")) {
    expect(
      screen.getByRole("tab", { name: libraryPageName(page, "game") }),
    ).toBeOnTheScreen();
  }
  await user.press(screen.getByRole("tab", { name: "Playing" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("GET", libraryPath("game", "/playing")),
    ).toHaveLength(1),
  );
  // Switching to Movies keeps the same page key: Playing becomes Coming soon.
  await user.press(screen.getByRole("tab", { name: "Movies" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("GET", libraryPath("movie", "/coming-soon")),
    ).toHaveLength(1),
  );
  expect(screen.getByRole("tab", { name: "Coming soon" })).toBeSelected();
});

test("an empty page shows its own copy and Browse", async () => {
  await openLibrary("/library?type=movie&path=/watched");
  const copy = libraryCopy("watched", "movie");
  expect(await screen.findByText(copy.empty.title)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: copy.browse })).toBeOnTheScreen();
});

test("a 502 shows the failed panel with Retry, never the empty state", async () => {
  let fail = true;
  mockApi.on("GET", libraryPath("tv", "/upcoming"), () => {
    if (fail) {
      throw new ApiError(502, "catalog_unavailable", "TMDB didn't respond.");
    }
    return answer("tv", "/upcoming", []);
  });
  const user = userEvent.setup();
  await openLibrary("/library?type=tv&path=/upcoming");
  expect(await screen.findByText(LIBRARY_LIST_FAILED_TITLE)).toBeOnTheScreen();
  expect(
    screen.queryByText(libraryCopy("upcoming", "tv").empty.title),
  ).toBeNull();
  fail = false;
  await user.press(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByText(libraryCopy("upcoming", "tv").empty.title),
  ).toBeOnTheScreen();
});

test("a watched movie shows the personal score apart from TMDB's", async () => {
  mockApi.on("GET", libraryPath("movie", "/watched"), () =>
    answer("movie", "/watched", [WATCHED_MOVIE]),
  );
  await openLibrary("/library?type=movie&path=/watched");
  expect(
    await screen.findByLabelText("The Matrix, Your score 8"),
  ).toBeOnTheScreen();
  expect(screen.getByText("★ 8")).toBeOnTheScreen();
  expect(screen.queryByText("TMDB 8.2")).toBeNull();
});

test("a title whose catalog read failed still shows and opens", async () => {
  mockApi.on("GET", libraryPath("movie", "/watched"), () =>
    answer("movie", "/watched", [{ ...WATCHED_MOVIE, card: null }]),
  );
  await openLibrary("/library?type=movie&path=/watched");
  const card = await screen.findByRole("link", {
    name: "Couldn't load this title",
  });
  expect(card).toBeOnTheScreen();
});

test("the notes show for capped and failed titles", async () => {
  mockApi.on("GET", libraryPath("tv", "/up-next"), () =>
    answer("tv", "/up-next", [UP_NEXT_SHOW], { capped: true, failedCount: 2 }),
  );
  await openLibrary();
  expect(
    await screen.findByText(
      LIBRARY_NOTES.checked(LIBRARY_CLASSIFY_LIMIT, "tv"),
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText(LIBRARY_NOTES.failed(2, "tv"))).toBeOnTheScreen();
});

test("scrolling to the end asks for the next page", async () => {
  mockApi.on("GET", libraryPath("tv", "/up-next"), () =>
    answer("tv", "/up-next", [UP_NEXT_SHOW], { total: 30, nextPage: 2 }),
  );
  mockApi.on("GET", libraryPath("tv", "/up-next", 2), () =>
    answer("tv", "/up-next", [], { page: 2, total: 30 }),
  );
  await openLibrary();
  await screen.findByText("S2E3");
  fireEvent(screen.getByLabelText("Up next"), "endReached");
  await waitFor(() =>
    expect(
      mockApi.callsTo("GET", libraryPath("tv", "/up-next", 2)),
    ).toHaveLength(1),
  );
});

test("an invalid page falls back to the type's Watchlist slot", async () => {
  await openLibrary("/library?type=tv&path=/playing");
  await waitFor(() =>
    expect(mockApi.callsTo("GET", libraryPath("tv", "/up-next"))).toHaveLength(
      1,
    ),
  );
});

test("signed out, the tab offers Sign in and sends no private request", async () => {
  mockSession = null;
  await openLibrary();
  expect(
    await screen.findByText("Sign in to see your library"),
  ).toBeOnTheScreen();
  expect(mockApi.calls).toHaveLength(0);
});

describe("libraryCardView", () => {
  test("an Upcoming show with a date reads as the web's pill", () => {
    const view = libraryCardView(
      {
        ...UP_NEXT_SHOW,
        card: {
          ...UP_NEXT_SHOW.card,
          place: {
            page: "upcoming",
            airDate: "2026-12-03",
            next: { season: 3, episode: 1 },
          },
        },
      } as never,
      "upcoming",
      TODAY,
    );
    expect(view.kind === "title" && view.pill?.text).toBe("S3E1 · Dec 3");
  });

  test("a Watched show with no rated season has no badge, never 0", () => {
    const view = libraryCardView(
      {
        ...UP_NEXT_SHOW,
        card: {
          ...UP_NEXT_SHOW.card,
          place: { page: "watched", label: "finished" },
        },
      } as never,
      "watched",
      TODAY,
    );
    expect(view).toMatchObject({ badge: null, meta: "Finished" });
  });

  test("a game shows the user's score before IGDB's, and Coming soon its date", () => {
    const game = {
      type: "game",
      id: 1942,
      path: "/games/1942",
      user: { status: "want_to_play", rating: null },
      card: {
        kind: "title",
        name: "Hades II",
        coverUrl: null,
        communityRating: 9.1,
        releaseDate: null,
      },
    } as never;
    expect(libraryCardView(game, "coming-soon", TODAY)).toMatchObject({
      badge: { tone: "community", text: "IGDB 9.1" },
      pill: { text: "Date TBA" },
    });
    const scored = {
      ...(game as object),
      user: { status: "finished", rating: 9 },
    } as never;
    expect(libraryCardView(scored, "watched", TODAY)).toMatchObject({
      badge: { tone: "personal", text: "9" },
      pill: null,
    });
  });

  test("a title the catalog no longer has names its catalog", () => {
    expect(
      libraryCardView(
        { ...WATCHED_MOVIE, card: { kind: "missing" } } as never,
        "watched",
        TODAY,
      ),
    ).toEqual({ kind: "missing", name: "No longer on TMDB" });
  });
});
