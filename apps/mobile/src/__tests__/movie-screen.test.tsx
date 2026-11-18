import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import MovieScreen from "@/app/movies/[id]";
import { ApiError } from "@/lib/api";

/**
 * covers: spec 0033, AC-6 (the pill reads as unavailable before release),
 * AC-11 (signed out shows Sign in), and child 0036 (an optimistic mark that
 * the server refuses goes back and says why)
 */
const mockFetchMovie = jest.fn();
const mockFetchMovieState = jest.fn();
const mockPutMovieWatched = jest.fn();
jest.mock("@/lib/movies", () => ({
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
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession }),
}));
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

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function open() {
  await renderRouter(
    { "movies/[id]": MovieScreen },
    { initialUrl: "/movies/603", wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
