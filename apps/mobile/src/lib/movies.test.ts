/**
 * covers: spec 0033, AC-5 (every movie write runs the server's command, so
 * the plan, mark, score and release rules stay there), AC-7 (Undo is built
 * from the write's own `cleared` answer), and AGENTS.md section 7 (the
 * public detail is read without a session).
 */
const mockApiRequest = jest.fn();
jest.mock("./api", () => ({
  ApiError: class ApiError extends Error {},
  appVersion: () => "1.0.0",
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const {
  fetchMovie,
  putMovieRating,
  putMovieWatched,
  putMovieWatchlist,
  restoreMovie,
  writeMovieIntent,
} = require("./movies") as typeof import("./movies");
const { v1MovieSchema, v1MovieWriteOkSchema } =
  require("@bestats/core/api/v1/movie") as typeof import("@bestats/core/api/v1/movie");

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ ok: true });
});

function lastCall() {
  const [path, schema, options] = mockApiRequest.mock.calls.at(-1) ?? [];
  return { path, schema, options };
}

describe("fetchMovie", () => {
  test("reads the public detail without a session", async () => {
    await fetchMovie(550);
    const { path, schema, options } = lastCall();
    expect(path).toBe("/api/v1/movies/550");
    expect(schema).toBe(v1MovieSchema);
    expect(options?.auth).toBeFalsy();
  });
});

describe("movie writes", () => {
  test("planning sends PUT watchlist with the session", async () => {
    await putMovieWatchlist(550, true);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/movies/550/watchlist",
      schema: v1MovieWriteOkSchema,
      options: { method: "PUT", body: { planned: true }, auth: true },
    });
  });

  test("marking watched sends PUT watched with the flag", async () => {
    await putMovieWatched(550, false);
    expect(lastCall().path).toBe("/api/v1/me/movies/550/watched");
    expect(lastCall().options).toEqual({
      method: "PUT",
      body: { watched: false },
      auth: true,
    });
  });

  test("clearing a score sends a null rating, not a missing one", async () => {
    await putMovieRating(550, null);
    expect(lastCall().path).toBe("/api/v1/me/movies/550/rating");
    expect(lastCall().options?.body).toEqual({ rating: null });
  });

  test("hands back what the API answered", async () => {
    mockApiRequest.mockResolvedValue({ ok: true, cleared: null });
    await expect(putMovieRating(550, 8)).resolves.toEqual({
      ok: true,
      cleared: null,
    });
  });

  test("a refused write rejects, so the screen never shows a false success", async () => {
    const refusal = new Error("Not released yet");
    mockApiRequest.mockRejectedValue(refusal);
    await expect(putMovieWatched(550, true)).rejects.toBe(refusal);
  });
});

describe("writeMovieIntent", () => {
  test.each([
    [{ kind: "watchlist", value: true }, "watchlist", { planned: true }],
    [{ kind: "watched", value: true }, "watched", { watched: true }],
    [{ kind: "rating", value: 7 }, "rating", { rating: 7 }],
    [{ kind: "rating", value: null }, "rating", { rating: null }],
  ] as const)("sends %o to its own route", async (intent, resource, body) => {
    await writeMovieIntent(42, intent);
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(lastCall().path).toBe(`/api/v1/me/movies/42/${resource}`);
    expect(lastCall().options).toEqual({ method: "PUT", body, auth: true });
  });
});

describe("restoreMovie", () => {
  test("posts a watchlist Undo to the watchlist restore route", async () => {
    const cleared = { kind: "movie_watchlist", movieId: 550 } as const;
    await restoreMovie(cleared);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/movies/550/watchlist/restore",
      schema: v1MovieWriteOkSchema,
      options: { method: "POST", body: { cleared }, auth: true },
    });
  });

  test("posts a watched Undo with the mark time and score it removed", async () => {
    const cleared = {
      kind: "movie_watched",
      movieId: 550,
      watchedAt: "2026-11-01T12:00:00+00:00",
      rating: 8,
    } as const;
    await restoreMovie(cleared);
    expect(lastCall().path).toBe("/api/v1/me/movies/550/watched/restore");
    expect(lastCall().options?.body).toEqual({ cleared });
  });
});
