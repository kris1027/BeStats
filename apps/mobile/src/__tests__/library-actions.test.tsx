import { V1_NETWORK_MESSAGE } from "@bestats/core/api/v1/errors";
import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import {
  EPISODE_TRACKING_MESSAGES,
  GAME_UNDO_MESSAGES,
  LIBRARY_MESSAGES,
  MARK_NEXT_MESSAGES,
  MISSING_SHOW_COPY,
  SHOW_TRACKING_COPY,
} from "@bestats/core/tracking/messages";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import { ApiError } from "@/lib/api";
import { cardActionFor } from "@/lib/library-actions";
import { MediaTypeProvider } from "@/lib/media-type";
import { LibraryScreen } from "@/screens/library-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-card-quick-actions.md decisions 1 to 5 and its
 * acceptance criteria 1 to 5: each page's web quick action and label, the
 * exact route and body each sends, the card hiding at once and coming back
 * on a refusal (AGENTS.md section 11, no false success), and every Undo
 * posting the write's own answer (spec 0035, Undo).
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { user: { email: "a@example.test" } },
    loading: false,
  }),
}));

function libraryPath(type: string, path: string) {
  return `/api/v1/me/library?${new URLSearchParams({ type, path, page: "1" })}`;
}

function answer(type: string, path: string, entries: unknown[]) {
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
  };
}

const SHOW_USER = {
  tracked: true,
  progress: null,
  seasonRatings: [],
  showRating: null,
};

const UP_NEXT_SHOW = {
  type: "tv",
  id: 1399,
  path: "/shows/1399",
  user: SHOW_USER,
  card: {
    kind: "title",
    name: "Game of Thrones",
    posterUrl: null,
    tmdbRating: 8.4,
    place: { page: "watchlist", next: { season: 2, episode: 3 } },
  },
};

const MISSING_SHOW = {
  type: "tv",
  id: 77,
  path: "/shows/77",
  user: SHOW_USER,
  card: { kind: "missing" },
};

const PLANNED_MOVIE = {
  type: "movie",
  id: 603,
  path: "/movies/603",
  user: { planned: true, watchedAt: null, rating: null },
  card: {
    kind: "title",
    name: "The Matrix",
    posterUrl: null,
    tmdbRating: 8.2,
    releaseDate: "1999-03-31",
  },
};

const WATCHED_MOVIE = {
  ...PLANNED_MOVIE,
  user: { planned: false, watchedAt: "2026-01-01T00:00:00Z", rating: 8 },
};

function game(status: string) {
  return {
    type: "game",
    id: 1942,
    path: "/games/1942",
    user: { status, rating: null, startedAt: null, finishedAt: null },
    card: {
      kind: "title",
      name: "The Witcher 3",
      coverUrl: null,
      communityRating: 92,
      releaseDate: "2015-05-19",
      startedAt: null,
      finishedAt: null,
    },
  };
}

const SEASON_2 = {
  show: { id: 1399, name: "Game of Thrones" },
  seasonNumber: 2,
  name: "Season 2",
  overview: null,
  airDate: "2012-04-01",
  posterUrl: null,
  episodes: [1, 2, 3].map((episodeNumber) => ({
    id: 63000 + episodeNumber,
    seasonNumber: 2,
    episodeNumber,
    name: `Episode ${episodeNumber}`,
    overview: null,
    airDate: "2012-04-01",
    stillUrl: null,
    runtimeMinutes: 55,
    tmdbRating: null,
  })),
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

/** Opens one library page whose first read answers `entries`, then empty. */
async function openPage(type: string, path: string, entries: unknown[]) {
  let first = true;
  mockApi.on("GET", libraryPath(type, path), () => {
    const shown = first ? entries : [];
    first = false;
    return answer(type, path, shown);
  });
  await renderRouter(
    { library: LibraryScreen, index: () => null },
    {
      initialUrl: `/library?${new URLSearchParams({ type, path })}`,
      wrapper,
    },
  );
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
});

describe("cardActionFor", () => {
  const entry = (value: unknown) => value as V1LibraryEntry;

  test("movies unplan on Watchlist and Coming soon and unmark on Watched", () => {
    expect(cardActionFor(entry(PLANNED_MOVIE), "watchlist")).toMatchObject({
      kind: "unplan_movie",
      corner: true,
      label: "Remove The Matrix from Watchlist",
    });
    expect(cardActionFor(entry(PLANNED_MOVIE), "upcoming")).toMatchObject({
      label: "Remove The Matrix from Coming soon",
    });
    expect(cardActionFor(entry(WATCHED_MOVIE), "watched")).toMatchObject({
      kind: "unmark_movie",
      corner: false,
      label: "Unmark The Matrix as watched",
    });
  });

  test("games use the bookmark until started, then the X", () => {
    expect(
      cardActionFor(entry(game("want_to_play")), "watchlist"),
    ).toMatchObject({
      look: "planned",
      label: "Remove The Witcher 3 from Want to play",
    });
    expect(
      cardActionFor(entry(game("want_to_play")), "coming-soon"),
    ).toMatchObject({ label: "Remove The Witcher 3 from Coming soon" });
    expect(cardActionFor(entry(game("playing")), "upcoming")).toMatchObject({
      look: "remove",
      label: "Remove The Witcher 3 from your games",
    });
    expect(
      cardActionFor(
        entry({ ...game("finished"), card: { kind: "missing" } }),
        "watched",
      ),
    ).toMatchObject({ label: "Remove missing game from your games" });
  });

  test("Up next marks the next episode; Upcoming and Watched shows have none", () => {
    expect(cardActionFor(entry(UP_NEXT_SHOW), "watchlist")).toMatchObject({
      kind: "mark_next",
      label: MARK_NEXT_MESSAGES.markLabel("Game of Thrones", 2, 3),
      next: { season: 2, episode: 3 },
    });
    expect(cardActionFor(entry(MISSING_SHOW), "watchlist")).toMatchObject({
      kind: "stop_tracking",
      label: MISSING_SHOW_COPY.stopLabel,
    });
    const upcoming = {
      ...UP_NEXT_SHOW,
      card: {
        ...UP_NEXT_SHOW.card,
        place: { page: "upcoming", airDate: null, next: null },
      },
    };
    const watched = {
      ...UP_NEXT_SHOW,
      card: {
        ...UP_NEXT_SHOW.card,
        place: { page: "watched", label: "finished" },
      },
    };
    expect(cardActionFor(entry(upcoming), "upcoming")).toBeNull();
    expect(cardActionFor(entry(watched), "watched")).toBeNull();
  });
});

test("unplanning on Watchlist hides the card, and Undo plans it again", async () => {
  const user = userEvent.setup();
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => ({ ok: true }));
  mockApi.on("POST", "/api/v1/me/movies/603/watchlist/restore", () => ({
    ok: true,
  }));
  await openPage("movie", "/watchlist", [PLANNED_MOVIE]);

  await user.press(
    await screen.findByRole("button", {
      name: "Remove The Matrix from Watchlist",
    }),
  );
  expect(mockApi.callsTo("PUT", "/api/v1/me/movies/603/watchlist")).toEqual([
    expect.objectContaining({ body: { planned: false } }),
  ]);
  expect(
    await screen.findByText(LIBRARY_MESSAGES.watchlist.removed),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("link", { name: /The Matrix/ })).toBeNull();

  await user.press(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("POST", "/api/v1/me/movies/603/watchlist/restore"),
    ).toEqual([
      expect.objectContaining({
        body: { cleared: { kind: "movie_watchlist", movieId: 603 } },
      }),
    ]),
  );
});

test("unmarking a scored movie says the score went, and Undo restores both", async () => {
  const user = userEvent.setup();
  const cleared = { watchedAt: "2026-01-01T00:00:00Z", rating: 8 };
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => ({
    ok: true,
    cleared,
  }));
  mockApi.on("POST", "/api/v1/me/movies/603/watched/restore", () => ({
    ok: true,
  }));
  await openPage("movie", "/watched", [WATCHED_MOVIE]);

  await user.press(
    await screen.findByRole("button", { name: "Unmark The Matrix as watched" }),
  );
  expect(
    await screen.findByText(
      `${LIBRARY_MESSAGES.watched.removed}. ${LIBRARY_MESSAGES.watched.scoreRemoved}`,
    ),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("POST", "/api/v1/me/movies/603/watched/restore"),
    ).toEqual([
      expect.objectContaining({
        body: { cleared: { kind: "movie_watched", movieId: 603, ...cleared } },
      }),
    ]),
  );
});

test("an unmark that cleared nothing offers no Undo", async () => {
  const user = userEvent.setup();
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => ({ ok: true }));
  await openPage("movie", "/watched", [WATCHED_MOVIE]);
  await user.press(
    await screen.findByRole("button", { name: "Unmark The Matrix as watched" }),
  );
  expect(
    await screen.findByText(LIBRARY_MESSAGES.watched.removed),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

test("a refused removal brings the card back with the server's reason", async () => {
  const user = userEvent.setup();
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    throw new ApiError(500, "internal", "Couldn't save. Try again.");
  });
  await openPage("movie", "/watchlist", [PLANNED_MOVIE]);
  // The refused write changed nothing, so the refetch still lists the movie.
  mockApi.on("GET", libraryPath("movie", "/watchlist"), () =>
    answer("movie", "/watchlist", [PLANNED_MOVIE]),
  );
  await user.press(
    await screen.findByRole("button", {
      name: "Remove The Matrix from Watchlist",
    }),
  );
  expect(
    await screen.findByText("Couldn't save. Try again."),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Remove The Matrix from Watchlist" }),
  ).toBeOnTheScreen();
});

/** covers: acceptance 4 (offline) and spec 0033, AC-13: Retry, nothing queued */
test("an offline removal brings the card back, and Retry sends it again", async () => {
  const user = userEvent.setup();
  let attempts = 0;
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    attempts += 1;
    if (attempts === 1) throw new ApiError(0, "network", V1_NETWORK_MESSAGE);
    return { ok: true };
  });
  await openPage("movie", "/watchlist", [PLANNED_MOVIE]);
  // Offline the write changed nothing, so the refetch still lists the movie.
  mockApi.on("GET", libraryPath("movie", "/watchlist"), () =>
    answer("movie", "/watchlist", attempts > 1 ? [] : [PLANNED_MOVIE]),
  );
  const name = "Remove The Matrix from Watchlist";
  await user.press(await screen.findByRole("button", { name }));
  expect(await screen.findByText(V1_NETWORK_MESSAGE)).toBeOnTheScreen();
  expect(await screen.findByRole("button", { name })).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByText(LIBRARY_MESSAGES.watchlist.removed),
  ).toBeOnTheScreen();
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/movies/603/watchlist"),
  ).toHaveLength(2);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name })).toBeNull(),
  );
});

/** covers: decision 3: the button is its own element beside the card's link */
test("a screen reader reads the card's link, then its button with the web's label", async () => {
  await openPage("movie", "/watchlist", [PLANNED_MOVIE]);
  const button = await screen.findByRole("button", {
    name: "Remove The Matrix from Watchlist",
  });
  const link = screen.getByRole("link", { name: /The Matrix/ });
  expect(button).toBeEnabled();
  expect(link).not.toContainElement(button);
});

test("removing a game sends DELETE, and Undo restores the row it returned", async () => {
  const user = userEvent.setup();
  const undo = {
    kind: "removed",
    previous: {
      status: "playing",
      rating: 9,
      startedAt: null,
      finishedAt: null,
    },
    removedAt: "2026-11-22T10:00:00Z",
  };
  mockApi.on("DELETE", "/api/v1/me/games/1942", () => ({ ok: true, undo }));
  mockApi.on("POST", "/api/v1/me/games/1942/restore", () => ({ ok: true }));
  await openPage("game", "/playing", [game("playing")]);

  await user.press(
    await screen.findByRole("button", {
      name: "Remove The Witcher 3 from your games",
    }),
  );
  expect(await screen.findByText(GAME_UNDO_MESSAGES.removed)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(mockApi.callsTo("POST", "/api/v1/me/games/1942/restore")).toEqual([
      expect.objectContaining({
        body: {
          cleared: {
            kind: "game_removed",
            gameId: 1942,
            previous: undo.previous,
            removedAt: undo.removedAt,
          },
        },
      }),
    ]),
  );
});

test("Mark next watched reads the season, marks that episode, and Undo takes it back", async () => {
  const user = userEvent.setup();
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => SEASON_2);
  mockApi.on("PUT", "/api/v1/me/episodes/63003", () => ({
    ok: true,
    showTracked: false,
    newlyMarked: true,
    markedAt: "2026-11-22T10:00:00Z",
  }));
  mockApi.on("POST", "/api/v1/me/episodes/63003/restore", () => ({
    ok: true,
    showTracked: false,
  }));
  await openPage("tv", "/up-next", [UP_NEXT_SHOW]);

  await user.press(
    await screen.findByRole("button", {
      name: MARK_NEXT_MESSAGES.markLabel("Game of Thrones", 2, 3),
    }),
  );
  expect(
    await screen.findByText(MARK_NEXT_MESSAGES.marked("Game of Thrones", 2, 3)),
  ).toBeOnTheScreen();
  expect(mockApi.callsTo("PUT", "/api/v1/me/episodes/63003")).toEqual([
    expect.objectContaining({
      body: { showId: 1399, season: 2, watched: true },
    }),
  ]);

  await user.press(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("POST", "/api/v1/me/episodes/63003/restore"),
    ).toEqual([
      expect.objectContaining({
        body: {
          cleared: {
            kind: "episode",
            showId: 1399,
            episodeId: 63003,
            markedAt: "2026-11-22T10:00:00Z",
          },
        },
      }),
    ]),
  );
});

test("a failed season read marks nothing and says the episode is unavailable", async () => {
  const user = userEvent.setup();
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => {
    throw new ApiError(502, "catalog_unavailable", "TMDB is down.");
  });
  await openPage("tv", "/up-next", [UP_NEXT_SHOW]);
  await user.press(
    await screen.findByRole("button", {
      name: MARK_NEXT_MESSAGES.markLabel("Game of Thrones", 2, 3),
    }),
  );
  expect(
    await screen.findByText(MARK_NEXT_MESSAGES.unavailable),
  ).toBeOnTheScreen();
  expect(mockApi.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
});

test("a failed episode write reads as an episode write, not an unavailable episode", async () => {
  const user = userEvent.setup();
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => SEASON_2);
  mockApi.on("PUT", "/api/v1/me/episodes/63003", () => {
    throw new Error("unparsable answer");
  });
  await openPage("tv", "/up-next", [UP_NEXT_SHOW]);
  await user.press(
    await screen.findByRole("button", {
      name: MARK_NEXT_MESSAGES.markLabel("Game of Thrones", 2, 3),
    }),
  );
  expect(
    await screen.findByText(EPISODE_TRACKING_MESSAGES.write_failed),
  ).toBeOnTheScreen();
  expect(screen.queryByText(MARK_NEXT_MESSAGES.unavailable)).toBeNull();
});

test("a double tap on Mark next watched sends one write", async () => {
  const user = userEvent.setup();
  let release: (value: unknown) => void = () => {};
  mockApi.on("GET", "/api/v1/shows/1399/seasons/2", () => SEASON_2);
  mockApi.on(
    "PUT",
    "/api/v1/me/episodes/63003",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await openPage("tv", "/up-next", [UP_NEXT_SHOW]);
  const button = await screen.findByRole("button", {
    name: MARK_NEXT_MESSAGES.markLabel("Game of Thrones", 2, 3),
  });
  await user.press(button);
  await waitFor(() => expect(button).toBeDisabled());
  await user.press(button);
  release({
    ok: true,
    showTracked: false,
    newlyMarked: false,
    markedAt: null,
  });
  expect(
    await screen.findByText(
      MARK_NEXT_MESSAGES.alreadyWatched("Game of Thrones", 2, 3),
    ),
  ).toBeOnTheScreen();
  expect(mockApi.callsTo("PUT", "/api/v1/me/episodes/63003")).toHaveLength(1);
});

test("a missing show's Stop tracking clears it, with Undo", async () => {
  const user = userEvent.setup();
  const undo = { trackedAt: "2026-01-01T00:00:00Z" };
  mockApi.on("DELETE", "/api/v1/me/shows/77/tracking", () => ({
    ok: true,
    undo,
  }));
  mockApi.on("POST", "/api/v1/me/shows/77/tracking/restore", () => ({
    ok: true,
  }));
  await openPage("tv", "/up-next", [MISSING_SHOW]);
  await user.press(
    await screen.findByRole("button", { name: MISSING_SHOW_COPY.stopLabel }),
  );
  expect(
    await screen.findByText(
      SHOW_TRACKING_COPY.stopped(MISSING_SHOW_COPY.toastName),
    ),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(
      mockApi.callsTo("POST", "/api/v1/me/shows/77/tracking/restore"),
    ).toEqual([
      expect.objectContaining({
        body: { cleared: { kind: "show_tracking", showId: 77, undo } },
      }),
    ]),
  );
});
