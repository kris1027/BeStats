import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0033, AC-5, AC-6 (movies)
 *
 * The command both the Server Action and the v1 route run. TMDB and the
 * database are replaced; the caller's verified user arrives in `deps`, so no
 * session or cookie is involved at all.
 */
const loadMovie = vi.fn();
vi.mock("@/lib/tmdb/load-movie", () => ({ loadMovie }));

const { setMovieWatchedCommand } = await import("./movie-writes");

const rpcCalls: unknown[][] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

function fakeClient() {
  const chain = {
    single: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
    then: (resolve: (value: unknown) => unknown) => resolve(rpcResult),
  };
  return {
    rpc: (...args: unknown[]) => {
      rpcCalls.push(args);
      return chain;
    },
  };
}

const getClient = vi.fn(async () => fakeClient());
const deps = {
  userId: "user-a",
  getClient: getClient as unknown as Parameters<
    typeof setMovieWatchedCommand
  >[0]["getClient"],
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  warn.mockRestore();
});

function movieOut(releaseDate: string | null) {
  loadMovie.mockResolvedValue({
    kind: "found",
    movie: { id: 603, releaseDate },
  });
}

describe("setMovieWatchedCommand", () => {
  it("marks a released movie watched", async () => {
    movieOut("1999-03-31");
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: true });
    expect(rpcCalls).toEqual([["mark_movie_watched", { p_movie_id: 603 }]]);
  });

  it("marks a movie released today in UTC", async () => {
    movieOut("2026-11-18");
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a movie out tomorrow and writes nothing", async () => {
    movieOut("2026-11-19");
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: false, error: "not_released" });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("refuses a movie with no release date", async () => {
    movieOut(null);
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: false, error: "not_released" });
  });

  it("answers not_found and tmdb_unavailable from the catalog", async () => {
    loadMovie.mockResolvedValueOnce({ kind: "not_found" });
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    loadMovie.mockResolvedValueOnce({ kind: "failed" });
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: true }),
    ).resolves.toEqual({ ok: false, error: "tmdb_unavailable" });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("unmarks an unreleased movie without asking TMDB, returning what it cleared", async () => {
    rpcResult = {
      data: {
        cleared_watched_at: "2026-11-01T10:00:00+00:00",
        cleared_rating: 7,
      },
      error: null,
    };
    await expect(
      setMovieWatchedCommand(deps, { movieId: 603, watched: false }),
    ).resolves.toEqual({
      ok: true,
      cleared: { watchedAt: "2026-11-01T10:00:00+00:00", rating: 7 },
    });
    expect(loadMovie).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([["unmark_movie_watched", { p_movie_id: 603 }]]);
  });

  it("answers write_failed when the database refuses", async () => {
    movieOut("1999-03-31");
    rpcResult = { data: null, error: { code: "XX000" } };
    const result = await setMovieWatchedCommand(deps, {
      movieId: 603,
      watched: true,
    });
    expect(result.ok).toBe(false);
  });
});
