import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0007, AC-3 to AC-6, AC-8, AC-9, AC-12 to AC-14, AC-18, AC-21;
 * spec 0008, AC-4, AC-6, AC-7, AC-19; prompts/movie-plan-watched-exclusive.md
 *
 * The session, TMDB and the database are the boundaries, so those are the
 * three things replaced. The fake Supabase client records every call, so each
 * test asserts what would reach PostgREST: which columns a payload names, and
 * that nothing is written at all on a refusal.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const loadMovie = vi.fn();
vi.mock("./[id]/load-movie", () => ({ loadMovie }));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh }));

const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "upsert", "update", "eq", "rpc", "single"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return chain;
}

// The client itself must not be thenable, or awaiting `createClient()` would
// resolve straight to the query result.
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
  rpc: (...args: unknown[]) =>
    (builder().rpc as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const {
  restoreMovieWatched,
  restoreMovieWatchlist,
  setMovieRating,
  setMovieWatched,
  setMovieWatchlist,
} = await import("./actions");

const USER = { id: "user-a", email: "a@example.test" };
const writes = () =>
  calls.filter((call) => call.method !== "eq" && call.method !== "single");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getOptionalUser.mockResolvedValue(USER);
  loadMovie.mockResolvedValue({
    kind: "found",
    movie: { id: 550, releaseDate: "1999-10-15" },
  });
  result = { data: null, error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("setMovieWatchlist", () => {
  const CLEARED_ROW = {
    cleared_watched_at: "2026-09-23T12:16:58.070024+00:00",
    cleared_rating: 8,
  };

  it("plans through plan_movie, after the TMDB check", async () => {
    result = {
      data: { cleared_watched_at: null, cleared_rating: null },
      error: null,
    };
    expect(await setMovieWatchlist(550, true)).toEqual({ ok: true });
    expect(writes()).toEqual([
      { method: "rpc", args: ["plan_movie", { p_movie_id: 550 }] },
    ]);
    expect(loadMovie).toHaveBeenCalledWith(550);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("returns the watch mark and score planning removed, for the Undo", async () => {
    result = { data: CLEARED_ROW, error: null };
    expect(await setMovieWatchlist(550, true)).toEqual({
      ok: true,
      cleared: { watchedAt: CLEARED_ROW.cleared_watched_at, rating: 8 },
    });
  });

  it("unplans with an update only, and skips TMDB (AC-14)", async () => {
    expect(await setMovieWatchlist(550, false)).toEqual({ ok: true });
    expect(writes()).toContainEqual({
      method: "update",
      args: [{ in_watchlist: false }],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
    expect(calls.some((call) => call.method === "upsert")).toBe(false);
    expect(loadMovie).not.toHaveBeenCalled();
  });
});

describe("setMovieWatched", () => {
  it("marks through mark_movie_watched (AC-4)", async () => {
    await setMovieWatched(550, true);
    expect(writes()).toEqual([
      { method: "rpc", args: ["mark_movie_watched", { p_movie_id: 550 }] },
    ]);
  });

  it("unmarks through unmark_movie_watched, with no TMDB check (AC-14)", async () => {
    expect(await setMovieWatched(550, false)).toEqual({ ok: true });
    expect(writes()).toEqual([
      { method: "rpc", args: ["unmark_movie_watched", { p_movie_id: 550 }] },
    ]);
    expect(loadMovie).not.toHaveBeenCalled();
  });

  it("returns the watch mark and the score unmarking removed", async () => {
    result = {
      data: {
        cleared_watched_at: "2026-09-23T12:16:58.070024+00:00",
        cleared_rating: null,
      },
      error: null,
    };
    expect(await setMovieWatched(550, false)).toEqual({
      ok: true,
      cleared: {
        watchedAt: "2026-09-23T12:16:58.070024+00:00",
        rating: null,
      },
    });
  });
});

describe("setMovieRating", () => {
  it("rates through rate_movie (AC-8)", async () => {
    await setMovieRating(550, 8);
    expect(writes()).toEqual([
      { method: "rpc", args: ["rate_movie", { p_movie_id: 550, p_rating: 8 }] },
    ]);
  });

  it("reports a score on an unwatched movie as not_watched, with no refresh", async () => {
    result = { data: null, error: { code: "BS001" } };
    expect(await setMovieRating(550, 8)).toEqual({
      ok: false,
      error: "not_watched",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.rate refused not_watched",
    );
  });

  it("clears by nulling only rating, with no TMDB check (AC-9, AC-14)", async () => {
    await setMovieRating(550, null);
    expect(writes()).toContainEqual({
      method: "update",
      args: [{ rating: null }],
    });
    expect(loadMovie).not.toHaveBeenCalled();
  });
});

describe("the release gate (prompts/movie-release-gate.md)", () => {
  function unreleased(releaseDate: string | null) {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { id: 550, releaseDate },
    });
  }

  it.each([
    ["a future date", "2999-01-01"],
    ["no date", null],
    ["a malformed date", "2026-13-40"],
  ])(
    "refuses a new mark, a restored mark or any score for %s, writing nothing (R1, R2, R6)",
    async (_label, date) => {
      unreleased(date);
      expect(await setMovieWatched(550, true)).toEqual({
        ok: false,
        error: "not_released",
      });
      expect(
        await restoreMovieWatched(550, "2026-09-23T12:16:58.070024+00:00", 7),
      ).toEqual({ ok: false, error: "not_released" });
      for (let score = 1; score <= 10; score++) {
        expect(await setMovieRating(550, score)).toEqual({
          ok: false,
          error: "not_released",
        });
      }
      expect(writes()).toEqual([]);
      expect(refresh).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("not_released"),
      );
    },
  );

  it("still plans, unplans, unmarks, clears and restores the plan of an unreleased movie (R3)", async () => {
    unreleased("2999-01-01");
    expect(await setMovieWatchlist(550, true)).toEqual({ ok: true });
    expect(await setMovieWatchlist(550, false)).toEqual({ ok: true });
    expect(await setMovieWatched(550, false)).toEqual({ ok: true });
    expect(await setMovieRating(550, null)).toEqual({ ok: true });
    expect(await restoreMovieWatchlist(550)).toEqual({ ok: true });
  });

  it("lets a movie released today be marked (R4)", async () => {
    unreleased(new Date().toISOString().slice(0, 10));
    expect(await setMovieWatched(550, true)).toEqual({ ok: true });
  });
});

describe("refusals write nothing", () => {
  it.each([
    ["a zero id", () => setMovieWatchlist(0, true)],
    ["a fractional id", () => setMovieWatchlist(1.5, true)],
    ["an id past int4", () => setMovieWatched(2147483648, true)],
    ["a rating of 0", () => setMovieRating(550, 0)],
    ["a rating of 11", () => setMovieRating(550, 11)],
    ["a fractional rating", () => setMovieRating(550, 7.5)],
    ["a string flag", () => setMovieWatched(550, "yes" as unknown as boolean)],
  ])("rejects %s as invalid_input before any call (AC-13)", async (_, call) => {
    expect(await call()).toEqual({ ok: false, error: "invalid_input" });
    expect(getOptionalUser).not.toHaveBeenCalled();
    expect(loadMovie).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns session_expired with no session (AC-12)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await setMovieRating(550, 8)).toEqual({
      ok: false,
      error: "session_expired",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("logs an invalid input under the action's own event (AC-21)", async () => {
    await setMovieWatchlist(0, true);
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.watchlist refused invalid_input",
    );
  });

  it("logs a missing session under the action's own event (AC-12, AC-21)", async () => {
    getOptionalUser.mockResolvedValue(null);
    await setMovieWatched(550, true);
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.watched refused session_expired",
    );
  });

  it("returns not_found for an unknown or adult movie (AC-14)", async () => {
    loadMovie.mockResolvedValue({ kind: "not_found" });
    expect(await setMovieWatchlist(550, true)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns tmdb_unavailable when TMDB fails (AC-14)", async () => {
    loadMovie.mockResolvedValue({ kind: "failed" });
    expect(await setMovieWatched(550, true)).toEqual({
      ok: false,
      error: "tmdb_unavailable",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("removals during a TMDB outage (AC-14)", () => {
  beforeEach(() => {
    loadMovie.mockResolvedValue({ kind: "failed" });
  });

  it.each([
    ["unplanning", () => setMovieWatchlist(550, false)],
    ["unwatching", () => setMovieWatched(550, false)],
    ["clearing the rating", () => setMovieRating(550, null)],
  ])("still succeeds when %s", async (_, call) => {
    expect(await call()).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["planning", () => setMovieWatchlist(550, true)],
    ["marking watched", () => setMovieWatched(550, true)],
    ["rating", () => setMovieRating(550, 7)],
    [
      "restoring a watched mark",
      () => restoreMovieWatched(550, "2026-09-23T12:16:58.070024+00:00", 7),
    ],
  ])("refuses %s with nothing written", async (_, call) => {
    expect(await call()).toEqual({ ok: false, error: "tmdb_unavailable" });
    expect(calls).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("database errors", () => {
  it.each([
    ["PGRST301", "session_expired", "session_expired"],
    ["PGRST303", "session_expired", "session_expired"],
    ["42501", "write_failed", "forbidden"],
    ["23514", "write_failed", "db_error"],
  ])(
    "maps %s to %s and logs %s (AC-12, AC-21)",
    async (code, error, outcome) => {
      result = {
        data: null,
        error: { code, message: "user-a movie 550 rating 8" },
      };
      expect(await setMovieRating(550, 8)).toEqual({ ok: false, error });
      expect(refresh).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        `movie_tracking.rate refused ${outcome}`,
      );
    },
  );

  it("turns a thrown client error into write_failed instead of throwing (AC-11)", async () => {
    createClient.mockRejectedValueOnce(new Error("fetch failed for user-a"));
    expect(await setMovieWatchlist(550, true)).toEqual({
      ok: false,
      error: "write_failed",
    });
  });

  it("turns a thrown TMDB check into write_failed with nothing written (AC-11)", async () => {
    loadMovie.mockRejectedValueOnce(new Error("boom for movie 550"));
    expect(await setMovieRating(550, 8)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(calls).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("movie_tracking.rate refused db_error");
  });

  it("reports a failed removal instead of a false success (AC-11)", async () => {
    result = { data: null, error: { code: "PGRST000" } };
    expect(await setMovieWatched(550, false)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.watched refused db_error",
    );
  });

  it("scopes every removal to the session user (AC-18)", async () => {
    await setMovieWatchlist(550, false);
    await setMovieRating(550, null);
    const userScopes = calls.filter(
      (call) => call.method === "eq" && call.args[0] === "user_id",
    );
    expect(userScopes).toEqual(
      Array(2).fill({ method: "eq", args: ["user_id", "user-a"] }),
    );
    // Unmarking runs in `unmark_movie_watched`, scoped by auth.uid() there
    // and pinned by pgTAP 050; no user id ever travels as an argument.
    await setMovieWatched(550, false);
    expect(JSON.stringify(calls.at(-2))).not.toContain("user-a");
  });

  it("never logs an id, an email or a rating (AC-21)", async () => {
    result = { data: null, error: { code: "42501" } };
    await setMovieRating(550, 8);
    getOptionalUser.mockResolvedValue(null);
    await setMovieWatchlist(603, true);
    for (const [line] of warn.mock.calls) {
      expect(String(line)).not.toMatch(/user-a|example\.test|550|603|\b8\b/);
    }
  });

  it("does not log a successful write", async () => {
    await setMovieWatchlist(550, true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("restoreMovieWatchlist (spec 0008)", () => {
  it("re-plans through restore_movie_watchlist with only the id, and skips TMDB (AC-6)", async () => {
    expect(await restoreMovieWatchlist(550)).toEqual({ ok: true });
    expect(writes()).toEqual([
      { method: "rpc", args: ["restore_movie_watchlist", { p_movie_id: 550 }] },
    ]);
    expect(loadMovie).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reports a refused restore as undo_expired, with no refresh and no ids logged (AC-6, AC-19)", async () => {
    result = {
      data: null,
      error: { code: "P0002", message: "undo_expired 550 user-a" },
    };
    expect(await restoreMovieWatchlist(550)).toEqual({
      ok: false,
      error: "undo_expired",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.restore_watchlist refused undo_expired",
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "refuses the id %s before any call (AC-4)",
    async (id) => {
      expect(await restoreMovieWatchlist(id)).toEqual({
        ok: false,
        error: "invalid_input",
      });
      expect(calls).toEqual([]);
      expect(getOptionalUser).not.toHaveBeenCalled();
    },
  );

  it("asks for sign in with no session, and writes nothing (AC-4)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await restoreMovieWatchlist(550)).toEqual({
      ok: false,
      error: "session_expired",
    });
    expect(calls).toEqual([]);
  });

  it("reports an expired JWT as session_expired", async () => {
    result = { data: null, error: { code: "PGRST303" } };
    expect(await restoreMovieWatchlist(550)).toEqual({
      ok: false,
      error: "session_expired",
    });
  });

  it("reports a thrown client as write_failed", async () => {
    createClient.mockRejectedValueOnce(new Error("offline 550"));
    expect(await restoreMovieWatchlist(550)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.restore_watchlist refused db_error",
    );
  });
});

describe("restoreMovieWatched (spec 0008)", () => {
  const WATCHED_AT = "2026-09-23T12:16:58.070024+00:00";

  it("restores the exact watched time through restore_movie_watched, after the release check (AC-7)", async () => {
    expect(await restoreMovieWatched(550, WATCHED_AT, 7)).toEqual({ ok: true });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_movie_watched",
          { p_movie_id: 550, p_watched_at: WATCHED_AT, p_rating: 7 },
        ],
      },
    ]);
    expect(loadMovie).toHaveBeenCalledWith(550);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["an empty string", ""],
    ["a date with no time", "2026-09-23"],
    ["a time with no offset", "2026-09-23T12:16:58"],
    ["free text", "yesterday"],
  ])("refuses %s before any call (AC-7)", async (_, watchedAt) => {
    expect(await restoreMovieWatched(550, watchedAt, 7)).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.restore_watched refused invalid_input",
    );
  });

  it("restores with no score as null, which the function's default keeps", async () => {
    expect(await restoreMovieWatched(550, WATCHED_AT, null)).toEqual({
      ok: true,
    });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_movie_watched",
          { p_movie_id: 550, p_watched_at: WATCHED_AT, p_rating: undefined },
        ],
      },
    ]);
  });

  it.each([0, 11, 7.5])(
    "refuses the score %s before any call",
    async (rating) => {
      expect(await restoreMovieWatched(550, WATCHED_AT, rating)).toEqual({
        ok: false,
        error: "invalid_input",
      });
      expect(calls).toEqual([]);
    },
  );

  it("reports a refused restore as undo_expired (AC-7)", async () => {
    result = { data: null, error: { code: "P0002" } };
    expect(await restoreMovieWatched(550, WATCHED_AT, 7)).toEqual({
      ok: false,
      error: "undo_expired",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5])(
    "refuses the id %s before any call, even with a valid time (AC-4)",
    async (id) => {
      expect(await restoreMovieWatched(id, WATCHED_AT, 7)).toEqual({
        ok: false,
        error: "invalid_input",
      });
      expect(calls).toEqual([]);
      expect(getOptionalUser).not.toHaveBeenCalled();
    },
  );

  it("asks for sign in with no session, and writes nothing (AC-4, AC-7)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await restoreMovieWatched(550, WATCHED_AT, 7)).toEqual({
      ok: false,
      error: "session_expired",
    });
    expect(calls).toEqual([]);
  });

  it("shows a policy refusal as a failed save, logged with no ids (AC-4, AC-19)", async () => {
    result = {
      data: null,
      error: { code: "42501", message: `user-a 550 ${WATCHED_AT}` },
    };
    expect(await restoreMovieWatched(550, WATCHED_AT, 7)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(refresh).not.toHaveBeenCalled();
    for (const [line] of warn.mock.calls) {
      expect(String(line)).not.toMatch(/user-a|550|2026/);
    }
  });

  it("reports a thrown client as write_failed, with no refresh", async () => {
    createClient.mockRejectedValueOnce(new Error("offline"));
    expect(await restoreMovieWatched(550, WATCHED_AT, 7)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
