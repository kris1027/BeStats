import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0014, AC-3, AC-11, AC-13, AC-14, AC-15
 *
 * The database is the boundary, so the query builder records what it was
 * asked: each test asserts the owner filter, the order and the ceiling that
 * would reach PostgREST. `comingSoonMovies` is pure and runs as is.
 */
const calls: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: unknown; count?: number | null } = {
  data: [],
  error: null,
};

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(response);
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const requireUser = vi.fn(async () => ({ id: "user-a", email: "a@example" }));
vi.mock("@/lib/auth/user", () => ({ requireUser }));

// React `cache()` memoizes only inside a request; outside one it passes
// through, so every call below reads again.
const {
  comingSoonMovies,
  getUpcomingMovieCandidates,
  getUpNextShows,
  UPCOMING_MOVIE_CHECK_LIMIT,
} = await import("./up-next");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.length = 0;
  response = { data: [], error: null };
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("getUpNextShows (AC-3, AC-15)", () => {
  it("reads the caller's view rows, most recently active first", async () => {
    response = {
      data: [{ show_id: 3 }, { show_id: null }, { show_id: 1 }],
      error: null,
    };
    expect(await getUpNextShows()).toEqual({ kind: "ok", state: [3, 1] });
    expect(calls).toEqual([
      { method: "from", args: ["user_up_next_shows"] },
      { method: "select", args: ["show_id"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "order", args: ["last_activity_at", { ascending: false }] },
      { method: "order", args: ["show_id", { ascending: true }] },
    ]);
  });

  it("fails without logging the error's details", async () => {
    response = { data: null, error: { message: "user-a leaked" } };
    expect(await getUpNextShows()).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.up_next_read refused db_error",
    );
  });

  it("turns a thrown client into a failed read", async () => {
    createClient.mockRejectedValueOnce(new Error("offline"));
    expect(await getUpNextShows()).toEqual({ kind: "failed" });
  });
});

describe("both reads check the session first (AC-1, AC-15)", () => {
  it("reads nothing when there is no session", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    const clientsBefore = createClient.mock.calls.length;
    requireUser.mockRejectedValueOnce(redirect);
    await expect(getUpNextShows()).rejects.toBe(redirect);
    requireUser.mockRejectedValueOnce(redirect);
    await expect(getUpcomingMovieCandidates()).rejects.toBe(redirect);
    expect(createClient.mock.calls.length).toBe(clientsBefore);
    expect(calls).toEqual([]);
  });
});

describe("getUpcomingMovieCandidates (AC-11, AC-15)", () => {
  it("reads the latest planned movies up to the ceiling, with the exact total", async () => {
    response = {
      data: [{ movie_id: 9 }, { movie_id: 4 }],
      error: null,
      count: 250,
    };
    expect(await getUpcomingMovieCandidates()).toEqual({
      kind: "ok",
      state: { ids: [9, 4], total: 250 },
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_movie_state"] },
      { method: "select", args: ["movie_id", { count: "exact" }] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["in_watchlist", true] },
      { method: "order", args: ["watchlisted_at", { ascending: false }] },
      { method: "order", args: ["movie_id", { ascending: false }] },
      { method: "limit", args: [UPCOMING_MOVIE_CHECK_LIMIT] },
    ]);
    expect(UPCOMING_MOVIE_CHECK_LIMIT).toBe(200);
  });

  it("fails on a database error, even with a count", async () => {
    response = { data: null, error: { message: "boom" }, count: 3 };
    expect(await getUpcomingMovieCandidates()).toEqual({ kind: "failed" });
  });

  it("turns a thrown client into a failed read", async () => {
    createClient.mockRejectedValueOnce(new Error("offline"));
    expect(await getUpcomingMovieCandidates()).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.coming_soon_read refused db_error",
    );
  });

  it("fails when the count is missing", async () => {
    response = { data: [], error: null, count: null };
    expect(await getUpcomingMovieCandidates()).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.coming_soon_read refused db_error",
    );
  });
});

function movie(id: number, title: string, releaseDate: string | null) {
  return {
    id,
    title,
    releaseDate,
    posterUrl: null,
    releaseYear: null,
    overview: null,
    tmdbRating: null,
    tmdbVoteCount: 0,
    genreIds: [],
  };
}

describe("comingSoonMovies (AC-11)", () => {
  const today = "2026-09-28";

  it("keeps only known dates after today, soonest first", () => {
    const kept = comingSoonMovies(
      [
        movie(1, "Later", "2027-02-03"),
        movie(2, "Today", today),
        movie(3, "Released", "2025-01-01"),
        movie(4, "Undated", null),
        movie(5, "Tomorrow", "2026-09-29"),
        movie(6, "Malformed", "2026-02-30"),
      ],
      today,
    );
    expect(kept.map((item) => item.id)).toEqual([5, 1]);
  });

  it("breaks a date tie by title, then by id", () => {
    const kept = comingSoonMovies(
      [
        movie(30, "beta", "2026-12-25"),
        movie(20, "Alpha", "2026-12-25"),
        movie(10, "Alpha", "2026-12-25"),
      ],
      today,
    );
    expect(kept.map((item) => item.id)).toEqual([10, 20, 30]);
  });
});
