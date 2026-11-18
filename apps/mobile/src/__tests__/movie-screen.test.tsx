import { MOVIE_CLEARED_MESSAGES } from "@bestats/core/tracking/messages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import MovieScreen from "@/app/movies/[id]";
import { ApiError } from "@/lib/api";
import { clearPrivateQueries } from "@/lib/query-client";

/**
 * covers: spec 0033, AC-6 (the pill reads as unavailable before release),
 * AC-11 (signed out shows Sign in), and child 0036 (an optimistic mark that
 * the server refuses goes back and says why; unmarking says so only when a
 * score went with the mark), and AC-13 (a forced sign out wipes the private
 * cache yet leaves the open screen usable)
 */
const mockFetchMovie = jest.fn();
const mockFetchMovieState = jest.fn();
const mockPutMovieWatched = jest.fn();
jest.mock("@/lib/movies", () => ({
  PRIVATE_QUERY_ROOT: "me",
  queryKeys: {
    movie: (id: number) => ["catalog", "movie", id],
    movieState: (id: number) => ["me", "titles", `movie:${id}`],
  },
  fetchMovie: (id: number) => mockFetchMovie(id),
  fetchMovieState: (id: number) => mockFetchMovieState(id),
  putMovieWatched: (id: number, value: boolean) =>
    mockPutMovieWatched(id, value),
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
  directors: [],
  cast: [],
};

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function open() {
  await renderRouter(
    { "movies/[id]": MovieScreen },
    { initialUrl: "/movies/603", wrapper },
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.resetAllMocks();
  mockSession = { user: { email: "a@example.test" } };
  mockFetchMovie.mockResolvedValue(MOVIE);
  mockFetchMovieState.mockResolvedValue({
    planned: false,
    watchedAt: null,
    rating: null,
  });
});

test("shows the movie with TMDB's rating labelled and the user's state", async () => {
  await open();
  expect(await screen.findByText("Mark watched")).toBeOnTheScreen();
  expect(screen.getByText("TMDB 8.2")).toBeOnTheScreen();
});

test("marks the movie watched", async () => {
  mockPutMovieWatched.mockResolvedValue({ ok: true });
  mockFetchMovieState
    .mockResolvedValueOnce({ planned: false, watchedAt: null, rating: null })
    .mockResolvedValue({
      planned: false,
      watchedAt: "2026-11-18T12:00:00+00:00",
      rating: null,
    });
  const user = userEvent.setup();
  await open();
  await user.press(
    await screen.findByRole("button", { name: "Mark The Matrix watched" }),
  );
  expect(mockPutMovieWatched).toHaveBeenCalledWith(603, true);
  expect(await screen.findByText("Watched")).toBeOnTheScreen();
});

test("puts the pill back and says why when the server refuses", async () => {
  mockPutMovieWatched.mockRejectedValue(
    new ApiError(
      409,
      "not_released",
      "This movie hasn't been released yet.",
      "not_released",
    ),
  );
  const user = userEvent.setup();
  await open();
  await user.press(
    await screen.findByRole("button", { name: "Mark The Matrix watched" }),
  );
  expect(
    await screen.findByText("This movie hasn't been released yet."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Mark watched")).toBeOnTheScreen();
});

test("reads as unavailable before release day", async () => {
  mockFetchMovie.mockResolvedValue({
    ...MOVIE,
    releaseDate: "2999-01-01",
    releaseYear: 2999,
  });
  await open();
  const pill = await screen.findByRole("button", {
    name: "Mark The Matrix watched",
  });
  expect(pill).toBeDisabled();
});

test("asks a signed out visitor to sign in instead of tracking", async () => {
  mockSession = null;
  await open();
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(mockFetchMovieState).not.toHaveBeenCalled();
});

test("offers Retry when the catalog read fails", async () => {
  mockFetchMovie.mockRejectedValue(
    new ApiError(
      502,
      "catalog_unavailable",
      "Couldn't reach the catalog. Try again.",
    ),
  );
  await open();
  expect(
    await screen.findByText("Couldn't reach the catalog. Try again."),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
});

test("unmarking a movie with no score shows no notice", async () => {
  mockFetchMovieState.mockResolvedValue({
    planned: false,
    watchedAt: "2026-11-18T12:00:00+00:00",
    rating: null,
  });
  mockPutMovieWatched.mockResolvedValue({
    ok: true,
    cleared: { watchedAt: "2026-11-18T12:00:00+00:00", rating: null },
  });
  const user = userEvent.setup();
  await open();
  await user.press(
    await screen.findByRole("button", { name: "Mark The Matrix watched" }),
  );
  expect(mockPutMovieWatched).toHaveBeenCalledWith(603, false);
  expect(screen.queryByText(MOVIE_CLEARED_MESSAGES.unwatched)).toBeNull();
});

test("unmarking a scored movie says the score went too", async () => {
  mockFetchMovieState.mockResolvedValue({
    planned: false,
    watchedAt: "2026-11-18T12:00:00+00:00",
    rating: 8,
  });
  mockPutMovieWatched.mockResolvedValue({
    ok: true,
    cleared: { watchedAt: "2026-11-18T12:00:00+00:00", rating: 8 },
  });
  const user = userEvent.setup();
  await open();
  await user.press(
    await screen.findByRole("button", { name: "Mark The Matrix watched" }),
  );
  expect(
    await screen.findByText(MOVIE_CLEARED_MESSAGES.unwatched),
  ).toBeOnTheScreen();
});

test("a forced sign out keeps the movie and asks to sign in", async () => {
  await open();
  expect(await screen.findByText("Mark watched")).toBeOnTheScreen();
  // A reload of the movie, should the wipe start one, stays in flight until
  // after the second wipe; the session provider wipes twice on a forced sign
  // out (the auth listener, then the expired session handler).
  let finishReload: (movie: unknown) => void = () => {};
  mockFetchMovie.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishReload = resolve;
      }),
  );
  await act(async () => {
    setSession(null);
    clearPrivateQueries(client);
  });
  await act(async () => {
    clearPrivateQueries(client);
    finishReload(MOVIE);
  });
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(screen.getByText("TMDB 8.2")).toBeOnTheScreen();
  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
});

test("a write refused as unauthenticated brings no private state back", async () => {
  mockFetchMovieState.mockResolvedValue({
    planned: false,
    watchedAt: "2026-11-18T12:00:00+00:00",
    rating: null,
  });
  // What the session provider does on a forced sign out, then the refusal.
  mockPutMovieWatched.mockImplementation(async () => {
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
  await user.press(
    await screen.findByRole("button", { name: "Mark The Matrix watched" }),
  );
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(
    screen.getByText("Your session expired, sign in again."),
  ).toBeOnTheScreen();
  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
});
