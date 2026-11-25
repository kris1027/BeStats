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
 * covers: prompts/mobile-library-tabs.md decisions 1 to 4 and 7;
 * prompts/mobile-library-review-fixes.md items 1, 4, 8, 9, 11 and 12; spec 0033,
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

// prompts/mobile-look-verify-extras.md, decisions 3 and 4
const SEASON_2 = {
  show: { id: 1399, name: "Game of Thrones" },
  seasonNumber: 2,
  name: "Season 2",
  overview: null,
  airDate: "2012-04-01",
  posterUrl: null,
  episodes: [3, 4].map((number) => ({
    id: 200 + number,
    seasonNumber: 2,
    episodeNumber: number,
    name: number === 3 ? "What Is Dead May Never Die" : null,
    overview: null,
    airDate: "2012-04-15",
    stillUrl: null,
    runtimeMinutes: 55,
    tmdbRating: null,
  })),
};

test("an Up next card names its next episode once the season loads", async () => {
  mockApi.on("GET", libraryPath("tv", "/up-next"), () =>
    answer("tv", "/up-next", [UP_NEXT_SHOW]),
  );
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => SEASON_2);
  await openLibrary();
  expect(
    await screen.findByText("What Is Dead May Never Die"),
  ).toBeOnTheScreen();
  expect(
    screen.getByLabelText(
      "Game of Thrones, Next episode, season 2 episode 3, What Is Dead May Never Die",
    ),
  ).toBeOnTheScreen();
});

test("an Up next card shows no episode name after a failed season read", async () => {
  mockApi.on("GET", libraryPath("tv", "/up-next"), () =>
    answer("tv", "/up-next", [UP_NEXT_SHOW]),
  );
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => {
    throw new ApiError(502, "catalog_unavailable", "TMDB didn't respond.");
  });
  await openLibrary();
  expect(await screen.findByText("S2E3")).toBeOnTheScreen();
  await waitFor(() =>
    expect(mockApi.callsTo("GET", "/api/v1/shows/1399/seasons/2")).toHaveLength(
      1,
    ),
  );
  expect(screen.queryByText("What Is Dead May Never Die")).toBeNull();
  expect(
    screen.getByLabelText("Game of Thrones, Next episode, season 2 episode 3"),
  ).toBeOnTheScreen();
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
  expect(screen.getByText("8")).toBeOnTheScreen();
  expect(screen.queryByText("8.2")).toBeNull();
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

test("an invalid page falls back to the type's first page", async () => {
  await openLibrary("/library?type=tv&path=/playing");
  await waitFor(() =>
    expect(mockApi.callsTo("GET", libraryPath("tv", "/up-next"))).toHaveLength(
      1,
    ),
  );
});

test("an invalid games page falls back to Coming soon", async () => {
  await openLibrary("/library?type=game&path=/up-next");
  await waitFor(() =>
    expect(
      mockApi.callsTo("GET", libraryPath("game", "/coming-soon")),
    ).toHaveLength(1),
  );
  expect(screen.getByRole("tab", { name: "Coming soon" })).toBeSelected();
});

test("pulsing poster skeletons show while the first page loads", async () => {
  let release: () => void = () => {};
  mockApi.on(
    "GET",
    libraryPath("tv", "/up-next"),
    () =>
      new Promise((resolve) => {
        release = () => resolve(answer("tv", "/up-next", []));
      }),
  );
  await openLibrary();
  expect(await screen.findByLabelText("Loading Up next")).toBeOnTheScreen();
  // Two rows of the grid's poster cards, each a poster and a line, hidden
  // from screen readers (prompts/mobile-look-library.md, decision 9).
  expect(
    screen.getAllByTestId("skeleton", { includeHiddenElements: true }),
  ).toHaveLength(12);
  release();
  expect(
    await screen.findByText(libraryCopy("watchlist", "tv").empty.title),
  ).toBeOnTheScreen();
});

test("a failed refresh replaces the cards with the failed panel", async () => {
  let fail = false;
  mockApi.on("GET", libraryPath("tv", "/up-next"), () => {
    if (fail) throw new ApiError(502, "catalog_unavailable", "TMDB is down.");
    return answer("tv", "/up-next", [UP_NEXT_SHOW]);
  });
  await openLibrary();
  await screen.findByText("S2E3");
  fail = true;
  await client.refetchQueries();
  expect(await screen.findByText(LIBRARY_LIST_FAILED_TITLE)).toBeOnTheScreen();
  expect(screen.queryByText("S2E3")).toBeNull();
});

test("a failed refresh of an empty page is never the empty copy", async () => {
  let fail = false;
  mockApi.on("GET", libraryPath("tv", "/upcoming"), () => {
    if (fail) throw new ApiError(502, "catalog_unavailable", "TMDB is down.");
    return answer("tv", "/upcoming", []);
  });
  await openLibrary("/library?type=tv&path=/upcoming");
  const empty = libraryCopy("upcoming", "tv").empty.title;
  await screen.findByText(empty);
  fail = true;
  await client.refetchQueries();
  expect(await screen.findByText(LIBRARY_LIST_FAILED_TITLE)).toBeOnTheScreen();
  expect(screen.queryByText(empty)).toBeNull();
});

test("signed out, the tab offers Sign in and sends no private request", async () => {
  mockSession = null;
  await openLibrary();
  const panel = await screen.findByText("Sign in to see your library");
  expect(panel).toBeOnTheScreen();
  // Inside a scroll view the large title's bar insets, never under it
  // (prompts/mobile-look-library.md, decision 8).
  let scroll = panel.parent;
  while (scroll && scroll.props.contentInsetAdjustmentBehavior === undefined) {
    scroll = scroll.parent;
  }
  expect(scroll?.props.contentInsetAdjustmentBehavior).toBe("automatic");
  expect(mockApi.calls).toHaveLength(0);
});

describe("libraryCardView", () => {
  test("an Up next show's pill leads with the next episode mark", () => {
    expect(
      libraryCardView(UP_NEXT_SHOW as never, "watchlist", TODAY),
    ).toMatchObject({
      pill: { text: "S2E3", nextEpisode: true },
      next: { season: 2, episode: 3 },
    });
  });

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

  const GAME = {
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
      startedAt: "2026-02-10T12:00:00+00:00",
      finishedAt: "2026-10-01T08:00:00+00:00",
    },
  };

  test("a game shows the user's score before IGDB's, and Coming soon its date", () => {
    expect(libraryCardView(GAME as never, "coming-soon", TODAY)).toMatchObject({
      badge: {
        tone: "community",
        text: "9.1",
        label: "IGDB community rating 9.1",
      },
      pill: { text: "Date TBA" },
      meta: null,
    });
    const scored = { ...GAME, user: { status: "finished", rating: 9 } };
    expect(libraryCardView(scored as never, "watched", TODAY)).toMatchObject({
      badge: { tone: "personal", text: "9", label: "Your score 9" },
      pill: null,
    });
  });

  test("Want to play shows IGDB's rating only, never a score", () => {
    const rated = { ...GAME, user: { status: "want_to_play", rating: 9 } };
    expect(libraryCardView(rated as never, "watchlist", TODAY)).toMatchObject({
      badge: { tone: "community", text: "9.1" },
    });
  });

  test("Playing and Finished games show the web's month line", () => {
    const playing = { ...GAME, user: { status: "playing", rating: null } };
    expect(libraryCardView(playing as never, "upcoming", TODAY)).toMatchObject({
      meta: "Started Feb 2026",
    });
    const finished = { ...GAME, user: { status: "finished", rating: null } };
    expect(libraryCardView(finished as never, "watched", TODAY)).toMatchObject({
      meta: "Finished Oct 2026",
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
