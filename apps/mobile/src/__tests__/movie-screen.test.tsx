import { formatAirDate } from "@bestats/core/format";
import {
  MOVIE_CLEARED_MESSAGES,
  MOVIE_OVERVIEW_MISSING,
} from "@bestats/core/tracking/messages";
import type { QueryClient } from "@tanstack/react-query";
import { act, screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import { ApiError } from "@/lib/api";
import { clearPrivateQueries } from "@/lib/query-client";
import { MovieScreen } from "@/screens/movie-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: spec 0033, AC-6 (before release only Plan works), AC-7 (a write
 * that removed a watch mark offers Undo, and Undo posts the `movie_watched`
 * state to its restore route), AC-11 (signed out shows Sign in), AC-13 (a
 * forced sign out wipes the private cache yet leaves the screen usable), AC-14
 * (TMDB's rating labelled apart from the user's score), and child 0036 (an
 * optimistic write the server refuses goes back and says why)
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = { user: { email: "a@example.test" } };
const mockListeners = new Set<() => void>();
function setSession(next: object | null) {
  mockSession = next;
  for (const listener of mockListeners) listener();
}
jest.mock("@/lib/session", () => {
  const { useSyncExternalStore } = require("react");
  return {
    useSession: () => ({
      session: useSyncExternalStore(
        (listener: () => void) => {
          mockListeners.add(listener);
          return () => mockListeners.delete(listener);
        },
        () => mockSession,
      ),
    }),
  };
});

const MOVIE = {
  id: 603,
  title: "The Matrix",
  originalTitle: "The Matrix",
  overview: "A hacker learns the truth.",
  tagline: null,
  releaseDate: "1999-03-31",
  releaseYear: 1999,
  runtimeMinutes: 136,
  status: "Released",
  genres: [{ id: 28, name: "Action" }],
  posterUrl: null,
  backdropUrl: null,
  tmdbRating: 8.2,
  tmdbVoteCount: 1000,
  directors: ["Lana Wachowski"],
  cast: [
    {
      personId: 1,
      creditId: "c1",
      name: "Keanu Reeves",
      character: "Neo",
      profileUrl: null,
      order: 0,
    },
  ],
};
const MOVIE_PATH = "/api/v1/movies/603";
const STATE_PATH = "/api/v1/me/titles?ids=movie:603";
const WATCHED_AT = "2026-11-18T12:00:00+00:00";

let client: QueryClient;
let state: {
  planned: boolean;
  watchedAt: string | null;
  rating: number | null;
};

function serveState(next: typeof state) {
  state = next;
}

async function open() {
  await renderRouter(
    { "movies/[id]": MovieScreen },
    { initialUrl: "/movies/603", wrapper: titleWrapper(client) },
  );
}

const pill = (name: string) => screen.findByRole("button", { name });

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
  serveState({ planned: false, watchedAt: null, rating: null });
  mockApi.on("GET", MOVIE_PATH, () => MOVIE);
  mockApi.on("GET", STATE_PATH, () => ({ "movie:603": state }));
});

test("shows the movie with TMDB's rating labelled, crew and cast", async () => {
  await open();
  expect(await screen.findByText("Mark watched")).toBeOnTheScreen();
  expect(screen.getByText("TMDB 8.2")).toBeOnTheScreen();
  expect(
    screen.getByText(`${formatAirDate("1999-03-31")} · 2h 16m · Action`),
  ).toBeOnTheScreen();
  expect(screen.getByText("Lana Wachowski")).toBeOnTheScreen();
  expect(screen.getByLabelText("Keanu Reeves as Neo")).toBeOnTheScreen();
});

test("says so when the movie has no overview or cast", async () => {
  mockApi.on("GET", MOVIE_PATH, () => ({ ...MOVIE, overview: null, cast: [] }));
  await open();
  expect(await screen.findByText(MOVIE_OVERVIEW_MISSING)).toBeOnTheScreen();
  expect(
    screen.getByText("TMDB lists no cast for this movie."),
  ).toBeOnTheScreen();
});

test("Mark watched takes the movie off the plan and opens the score sheet", async () => {
  serveState({ planned: true, watchedAt: null, rating: null });
  mockApi.on(
    "PUT",
    "/api/v1/me/movies/603/watched",
    () => new Promise(() => {}),
  );
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Mark The Matrix watched"));
  expect(client.getQueryData(["me", "titles", "movie:603"])).toEqual({
    planned: false,
    watchedAt: expect.any(String),
    rating: null,
  });
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/movies/603/watched")[0].body,
  ).toEqual({ watched: true });
  expect(await screen.findByText("Your score")).toBeOnTheScreen();
});

test("picking a score sends it and shows it as yours", async () => {
  serveState({ planned: false, watchedAt: WATCHED_AT, rating: null });
  mockApi.on("PUT", "/api/v1/me/movies/603/rating", (body) => {
    serveState({ ...state, rating: (body as { rating: number }).rating });
    return { ok: true };
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Your score for The Matrix: Not rated"));
  await user.press(await pill("Score The Matrix 8"));
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/movies/603/rating")[0].body,
  ).toEqual({ rating: 8 });
  expect(await pill("Your score for The Matrix: 8")).toBeOnTheScreen();
});

test("planning a scored, watched movie offers Undo that restores both", async () => {
  serveState({ planned: false, watchedAt: WATCHED_AT, rating: 8 });
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    serveState({ planned: true, watchedAt: null, rating: null });
    return { ok: true, cleared: { watchedAt: WATCHED_AT, rating: 8 } };
  });
  mockApi.on("POST", "/api/v1/me/movies/603/watched/restore", () => {
    serveState({ planned: false, watchedAt: WATCHED_AT, rating: 8 });
    return { ok: true };
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Plan The Matrix"));
  expect(
    await screen.findByText(MOVIE_CLEARED_MESSAGES.planned(true)),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(
    mockApi.callsTo("POST", "/api/v1/me/movies/603/watched/restore")[0].body,
  ).toEqual({
    cleared: {
      kind: "movie_watched",
      movieId: 603,
      watchedAt: WATCHED_AT,
      rating: 8,
    },
  });
  expect(await pill("Your score for The Matrix: 8")).toBeOnTheScreen();
  expect(screen.queryByText(MOVIE_CLEARED_MESSAGES.planned(true))).toBeNull();
});

test("an expired Undo says so in the web's words", async () => {
  serveState({ planned: false, watchedAt: WATCHED_AT, rating: 8 });
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => {
    serveState({ planned: false, watchedAt: null, rating: null });
    return { ok: true, cleared: { watchedAt: WATCHED_AT, rating: 8 } };
  });
  mockApi.on("POST", "/api/v1/me/movies/603/watched/restore", () => {
    throw new ApiError(409, "conflict", "Couldn't undo.", "undo_expired");
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Mark The Matrix watched"));
  expect(
    await screen.findByText(MOVIE_CLEARED_MESSAGES.unwatched),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(
    await screen.findByText(MOVIE_CLEARED_MESSAGES.undoExpired),
  ).toBeOnTheScreen();
});

test("unmarking a movie with no score offers no Undo", async () => {
  serveState({ planned: false, watchedAt: WATCHED_AT, rating: null });
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => {
    serveState({ planned: false, watchedAt: null, rating: null });
    return { ok: true, cleared: { watchedAt: WATCHED_AT, rating: null } };
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Mark The Matrix watched"));
  expect(await screen.findByText("Mark watched")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

test("puts the pill back and says why when the server refuses", async () => {
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => {
    throw new ApiError(
      409,
      "not_released",
      "This movie hasn't been released yet.",
      "not_released",
    );
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Mark The Matrix watched"));
  expect(
    await screen.findByText("This movie hasn't been released yet."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Mark watched")).toBeOnTheScreen();
});

test("offers only Plan and the release line before release day", async () => {
  mockApi.on("GET", MOVIE_PATH, () => ({
    ...MOVIE,
    releaseDate: "2999-01-01",
    releaseYear: 2999,
  }));
  await open();
  expect(await pill("Plan The Matrix")).toBeOnTheScreen();
  expect(
    screen.getByText(`Releases ${formatAirDate("2999-01-01")}`),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Mark The Matrix watched" }),
  ).toBeNull();
});

test("asks a signed out visitor to sign in instead of tracking", async () => {
  mockSession = null;
  await open();
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(mockApi.callsTo("GET", STATE_PATH)).toHaveLength(0);
});

test("offers Retry when the catalog read fails", async () => {
  mockApi.on("GET", MOVIE_PATH, () => {
    throw new ApiError(
      502,
      "catalog_unavailable",
      "Couldn't reach the catalog. Try again.",
    );
  });
  await open();
  expect(
    await screen.findByText("Couldn't reach the catalog. Try again."),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
});

test("a forced sign out keeps the movie and asks to sign in", async () => {
  await open();
  expect(await screen.findByText("Mark watched")).toBeOnTheScreen();
  await act(async () => {
    setSession(null);
    clearPrivateQueries(client);
  });
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(screen.getByText("TMDB 8.2")).toBeOnTheScreen();
  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
});

test("a write refused as unauthenticated brings no private state back", async () => {
  serveState({ planned: false, watchedAt: WATCHED_AT, rating: null });
  // What the session provider does on a forced sign out, then the refusal.
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => {
    setSession(null);
    clearPrivateQueries(client);
    throw new ApiError(
      401,
      "unauthenticated",
      "Your session expired, sign in again.",
    );
  });
  const user = userEvent.setup();
  await open();
  await user.press(await pill("Mark The Matrix watched"));
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(
    screen.getByText("Your session expired, sign in again."),
  ).toBeOnTheScreen();
  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
});
