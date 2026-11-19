import { v1MovieWriteOkSchema } from "@bestats/core/api/v1/movie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import movieFixture from "@/lib/tmdb/__fixtures__/movie-550.json";
import { normalizeMovie } from "@/lib/tmdb/normalize";

import {
  AUTH,
  calls,
  ctx,
  errorOf,
  fakeClient,
  req,
  resetDb,
  setDbResult,
} from "../../test-kit";

/**
 * covers: spec 0033, AC-5, AC-6, AC-7, AC-8 for the movie writes beyond the
 * tracer's watched route. TMDB and Supabase are the boundaries; each route
 * runs the real shared command.
 */
const loadMovie = vi.fn();
vi.mock("@/lib/tmdb/load-movie", () => ({ loadMovie }));
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { PUT: putWatchlist } = await import("./[id]/watchlist/route");
const { PUT: putRating } = await import("./[id]/rating/route");
const { POST: restoreWatchlist } = await import(
  "./[id]/watchlist/restore/route"
);
const { POST: restoreWatched } = await import("./[id]/watched/restore/route");

const MOVIE = normalizeMovie(movieFixture as never);
const UNRELEASED = {
  kind: "found",
  movie: { ...MOVIE, releaseDate: "2026-11-19" },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  resetDb();
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  loadMovie.mockResolvedValue({ kind: "found", movie: MOVIE });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function call(
  handler: typeof putWatchlist,
  path: string,
  method: string,
  body: unknown,
  id = "550",
) {
  return handler(
    req(`/api/v1/me/movies/${id}/${path}`, AUTH, { method, body }),
    ctx({ id }),
  );
}

describe("PUT /api/v1/me/movies/{id}/watchlist", () => {
  it("plans a movie and returns the watch mark it dropped", async () => {
    setDbResult({
      data: {
        cleared_watched_at: "2026-11-10T09:00:00+00:00",
        cleared_rating: 7,
      },
      error: null,
    });
    const response = await call(putWatchlist, "watchlist", "PUT", {
      planned: true,
    });
    expect(response.status).toBe(200);
    expect(v1MovieWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      cleared: { watchedAt: "2026-11-10T09:00:00+00:00", rating: 7 },
    });
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["plan_movie", { p_movie_id: 550 }],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("plans an unreleased movie: planning is never gated", async () => {
    loadMovie.mockResolvedValue(UNRELEASED);
    const response = await call(putWatchlist, "watchlist", "PUT", {
      planned: true,
    });
    expect(response.status).toBe(200);
  });

  it("unplans with no TMDB call, scoped to the verified user", async () => {
    const response = await call(putWatchlist, "watchlist", "PUT", {
      planned: false,
    });
    expect(response.status).toBe(200);
    expect(loadMovie).not.toHaveBeenCalled();
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
  });

  it("answers 404 for a movie TMDB does not know", async () => {
    loadMovie.mockResolvedValue({ kind: "not_found" });
    const response = await call(putWatchlist, "watchlist", "PUT", {
      planned: true,
    });
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("PUT /api/v1/me/movies/{id}/rating", () => {
  it("answers 409 not_released for a score before release day", async () => {
    loadMovie.mockResolvedValue(UNRELEASED);
    const response = await call(putRating, "rating", "PUT", { rating: 8 });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).reason).toBe("not_released");
    expect(calls).toEqual([]);
  });

  it("clears a score on an unreleased movie without a TMDB call", async () => {
    loadMovie.mockResolvedValue(UNRELEASED);
    const response = await call(putRating, "rating", "PUT", { rating: null });
    expect(response.status).toBe(200);
    expect(loadMovie).not.toHaveBeenCalled();
  });

  it("answers 409 conflict when the movie is not watched", async () => {
    setDbResult({ data: null, error: { code: "BS001" } });
    const response = await call(putRating, "rating", "PUT", { rating: 8 });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "conflict",
      reason: "not_watched",
    });
  });

  it("answers 400 for a score outside 1 to 10", async () => {
    const response = await call(putRating, "rating", "PUT", { rating: 11 });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/me/movies/{id}/…/restore", () => {
  const watched = {
    kind: "movie_watched",
    movieId: 550,
    watchedAt: "2026-11-10T09:00:00+00:00",
    rating: 7,
  };

  it("restores a watch mark and score from its cleared state", async () => {
    const response = await call(restoreWatched, "watched/restore", "POST", {
      cleared: watched,
    });
    expect(response.status).toBe(200);
    expect(calls).toContainEqual({
      method: "rpc",
      args: [
        "restore_movie_watched",
        {
          p_movie_id: 550,
          p_watched_at: "2026-11-10T09:00:00+00:00",
          p_rating: 7,
        },
      ],
    });
  });

  it("restores a plan from a movie_watchlist state with no TMDB call", async () => {
    const response = await call(restoreWatchlist, "watchlist/restore", "POST", {
      cleared: { kind: "movie_watchlist", movieId: 550 },
    });
    expect(response.status).toBe(200);
    expect(loadMovie).not.toHaveBeenCalled();
  });

  it("refuses a cleared state of another kind or movie with 400", async () => {
    const wrongKind = await call(
      restoreWatchlist,
      "watchlist/restore",
      "POST",
      {
        cleared: watched,
      },
    );
    const wrongMovie = await call(restoreWatched, "watched/restore", "POST", {
      cleared: { ...watched, movieId: 551 },
    });
    expect(wrongKind.status).toBe(400);
    expect(wrongMovie.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers 409 for an Undo the database refuses", async () => {
    setDbResult({ data: null, error: { code: "P0002" } });
    const response = await call(restoreWatchlist, "watchlist/restore", "POST", {
      cleared: { kind: "movie_watchlist", movieId: 550 },
    });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "conflict",
      reason: "undo_expired",
    });
  });
});
