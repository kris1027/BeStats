import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-1, AC-2, AC-9, AC-11, AC-19; spec 0013, AC-13, AC-17;
 * spec 0019, AC-1 to AC-3, AC-5, AC-10, AC-12
 *
 * The database and TMDB are the boundaries, so those are replaced. The query
 * builder records what it was asked, so each test asserts the order, the
 * range, the count and the owner filter that would reach PostgREST. Each
 * builder answers from a queue, so a test can script the page read and the
 * count read that follows a past the end page.
 */
const calls: { method: string; args: unknown[] }[] = [];
let responses: {
  data: unknown;
  error: unknown;
  count: number | null;
}[] = [];

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "eq",
    "in",
    "not",
    "or",
    "order",
    "range",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(responses.shift());
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
// `show-ratings` is imported for its page size only; its session read is not
// exercised here.
vi.mock("@/lib/auth/user", () => ({ getOptionalUser: vi.fn() }));

class FakeTmdbError extends Error {}
const getMovieSummaries = vi.fn();
const getTvShowsByIds = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getMovieSummaries: (...args: unknown[]) => getMovieSummaries(...args),
  getTvShowsByIds: (...args: unknown[]) => getTvShowsByIds(...args),
  TmdbError: FakeTmdbError,
}));

const {
  getLibraryTitles,
  getShowRatings,
  getWatchedPage,
  getWatchlistPage,
  LIBRARY_PAGE_SIZE,
  libraryLastPage,
} = await import("./library-lists");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.length = 0;
  responses = [];
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("libraryLastPage (AC-9)", () => {
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])("a list of %s rows ends on page %s", (total, last) => {
    expect(libraryLastPage(total)).toBe(last);
  });

  it("pages by 20", () => {
    expect(LIBRARY_PAGE_SIZE).toBe(20);
  });
});

describe("getWatchlistPage (AC-1; spec 0013, AC-13)", () => {
  it("reads the owner's merged entries, newest first, movies first on a tie, 20 per page, with an exact count", async () => {
    responses = [
      {
        data: [
          { kind: "movie", tmdb_id: 603, status: null },
          { kind: "tv", tmdb_id: 1396, status: "watching" },
        ],
        error: null,
        count: 22,
      },
    ];
    expect(await getWatchlistPage("user-a", 2)).toEqual({
      kind: "ok",
      rows: [
        { kind: "movie", tmdbId: 603, status: null },
        { kind: "tv", tmdbId: 1396, status: "watching" },
      ],
      total: 22,
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_watchlist_entries"] },
      { method: "select", args: ["kind, tmdb_id, status", { count: "exact" }] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "order", args: ["listed_at", { ascending: false }] },
      { method: "order", args: ["kind", { ascending: true }] },
      { method: "order", args: ["tmdb_id", { ascending: true }] },
      { method: "range", args: [20, 39] },
    ]);
  });

  it("drops a row the view could never yield rather than inventing a kind", async () => {
    responses = [
      {
        data: [
          { kind: "person", tmdb_id: 1, status: null },
          { kind: "movie", tmdb_id: null, status: null },
          { kind: "tv", tmdb_id: 1399, status: "want_to_watch" },
        ],
        error: null,
        count: 1,
      },
    ];
    expect(await getWatchlistPage("user-a", 1)).toEqual({
      kind: "ok",
      rows: [{ kind: "tv", tmdbId: 1399, status: "want_to_watch" }],
      total: 1,
    });
  });

  it("answers a page past the end with the real total, from a count only read (AC-9)", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: null, count: 3 },
    ];
    expect(await getWatchlistPage("user-a", 4)).toEqual({
      kind: "ok",
      rows: [],
      total: 3,
    });
    expect(calls).toContainEqual({
      method: "select",
      args: ["tmdb_id", { count: "exact", head: true }],
    });
    expect(calls.filter((call) => call.method === "eq")).toEqual([
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["user_id", "user-a"] },
    ]);
  });

  it("reports a failed read, logging no identifiers (AC-11, AC-19)", async () => {
    responses = [
      {
        data: null,
        error: { code: "PGRST000", message: "user-a" },
        count: null,
      },
    ];
    expect(await getWatchlistPage("user-a", 1)).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused db_error",
    );
  });

  it("reports a thrown client as a failed read, never an empty list (AC-11)", async () => {
    createClient.mockRejectedValueOnce(new Error("offline"));
    expect(await getWatchlistPage("user-a", 1)).toEqual({ kind: "failed" });
  });

  it("reports a read with no count as failed, since the last page can't be known (AC-9)", async () => {
    responses = [
      {
        data: [{ kind: "movie", tmdb_id: 550, status: null }],
        error: null,
        count: null,
      },
    ];
    expect(await getWatchlistPage("user-a", 1)).toEqual({ kind: "failed" });
  });

  it("answers an empty list's past the end page with a total of 0, not a failure (AC-9)", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: null, count: 0 },
    ];
    expect(await getWatchlistPage("user-a", 2)).toEqual({
      kind: "ok",
      rows: [],
      total: 0,
    });
  });
});

describe("getWatchedPage (AC-2; spec 0019, AC-1 to AC-3)", () => {
  it("reads the owner's merged entries, newest first, movies first on a tie, 20 per page, with an exact count", async () => {
    responses = [
      {
        data: [
          {
            kind: "tv",
            tmdb_id: 1396,
            last_watched_at: "2026-09-24T12:00:00+00:00",
            rating: null,
          },
          {
            kind: "movie",
            tmdb_id: 603,
            last_watched_at: "2026-09-23T12:00:00+00:00",
            rating: 9,
          },
          {
            kind: "movie",
            tmdb_id: 550,
            last_watched_at: "2026-09-22T12:00:00+00:00",
            rating: null,
          },
        ],
        error: null,
        count: 23,
      },
    ];
    expect(await getWatchedPage("user-a", 2)).toEqual({
      kind: "ok",
      rows: [
        {
          kind: "tv",
          tmdbId: 1396,
          watchedAt: "2026-09-24T12:00:00+00:00",
          rating: null,
        },
        {
          kind: "movie",
          tmdbId: 603,
          watchedAt: "2026-09-23T12:00:00+00:00",
          rating: 9,
        },
        {
          kind: "movie",
          tmdbId: 550,
          watchedAt: "2026-09-22T12:00:00+00:00",
          rating: null,
        },
      ],
      total: 23,
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_watched_entries"] },
      {
        method: "select",
        args: ["kind, tmdb_id, last_watched_at, rating", { count: "exact" }],
      },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "order", args: ["last_watched_at", { ascending: false }] },
      { method: "order", args: ["kind", { ascending: true }] },
      { method: "order", args: ["tmdb_id", { ascending: true }] },
      { method: "range", args: [20, 39] },
    ]);
  });

  it("drops a row the view could never yield rather than inventing one", async () => {
    responses = [
      {
        data: [
          {
            kind: "person",
            tmdb_id: 1,
            last_watched_at: "2026-09-24",
            rating: null,
          },
          {
            kind: "movie",
            tmdb_id: null,
            last_watched_at: "2026-09-24",
            rating: 7,
          },
          { kind: "tv", tmdb_id: 1399, last_watched_at: null, rating: null },
          {
            kind: "tv",
            tmdb_id: 1396,
            last_watched_at: "2026-09-23",
            rating: null,
          },
        ],
        error: null,
        count: 1,
      },
    ];
    expect(await getWatchedPage("user-a", 1)).toEqual({
      kind: "ok",
      rows: [
        { kind: "tv", tmdbId: 1396, watchedAt: "2026-09-23", rating: null },
      ],
      total: 1,
    });
  });

  it("counts a past the end page over the same view and owner (AC-3)", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: null, count: 5 },
    ];
    expect(await getWatchedPage("user-a", 2)).toEqual({
      kind: "ok",
      rows: [],
      total: 5,
    });
    const countRead = calls.slice(
      calls.findLastIndex((call) => call.method === "from"),
    );
    expect(countRead).toEqual([
      { method: "from", args: ["user_watched_entries"] },
      {
        method: "select",
        args: ["tmdb_id", { count: "exact", head: true }],
      },
      { method: "eq", args: ["user_id", "user-a"] },
    ]);
  });

  it("reports a thrown client as a failed read, logging no identifiers (AC-11, AC-19)", async () => {
    createClient.mockRejectedValueOnce(new Error("offline user-a"));
    expect(await getWatchedPage("user-a", 1)).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused db_error",
    );
  });

  it("reports a failed count after a past the end page as failed (AC-11)", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: { code: "PGRST000" }, count: null },
    ];
    expect(await getWatchedPage("user-a", 3)).toEqual({ kind: "failed" });
  });
});

describe("getShowRatings (spec 0019, AC-5, AC-10)", () => {
  /**
   * One rated episode row as PostgREST returns it, each with a new episode
   * id so the rows read in key order.
   */
  let episodeId = 0;
  function rated(showId: number, season: number, rating: number) {
    episodeId += 1;
    return {
      show_id: showId,
      episode_id: episodeId,
      season_number: season,
      rating,
    };
  }

  it("asks for nothing when the page has no show", async () => {
    expect(await getShowRatings("user-a", [])).toEqual({
      kind: "ok",
      ratings: new Map(),
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads the owner's rated episodes of the page's shows in one ordered query", async () => {
    responses = [{ data: [], error: null, count: 0 }];
    await getShowRatings("user-a", [1396, 1399]);
    expect(calls).toEqual([
      { method: "from", args: ["user_episode_state"] },
      {
        method: "select",
        args: [
          "show_id, episode_id, season_number, rating",
          { count: "exact" },
        ],
      },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "in", args: ["show_id", [1396, 1399]] },
      { method: "not", args: ["rating", "is", null] },
      { method: "order", args: ["show_id"] },
      { method: "order", args: ["episode_id"] },
      { method: "range", args: [0, 999] },
    ]);
  });

  it("weighs seasons equally, leaves specials out, and gives an unrated show null", async () => {
    // Season 1 averages 8 over ten episodes, season 2 averages 6 over two,
    // and a rated special does not count: 7, not 7.67 or anything else.
    const season1 = Array.from({ length: 10 }, () => rated(1396, 1, 8));
    responses = [
      {
        data: [
          ...season1,
          rated(1396, 2, 5),
          rated(1396, 2, 7),
          rated(1396, 0, 1),
          rated(1399, 0, 10),
        ],
        error: null,
        count: 14,
      },
    ];
    const result = await getShowRatings("user-a", [1396, 1399, 60625]);
    expect(result).toEqual({
      kind: "ok",
      ratings: new Map([
        [1396, 7],
        [1399, null],
        [60625, null],
      ]),
    });
  });

  it("keeps the full precision, rounding nothing", async () => {
    responses = [
      {
        data: [rated(1, 1, 7), rated(1, 1, 8), rated(1, 1, 7), rated(1, 2, 8)],
        error: null,
        count: 4,
      },
    ];
    const result = await getShowRatings("user-a", [1]);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.ratings.get(1)).toBeCloseTo((22 / 3 + 8) / 2, 12);
  });

  it("pages past the response cap until the exact count is reached", async () => {
    const first = Array.from({ length: 1000 }, () => rated(1, 1, 6));
    responses = [
      { data: first, error: null, count: 1001 },
      { data: [rated(1, 2, 10)], error: null, count: 1 },
    ];
    const result = await getShowRatings("user-a", [1]);
    expect(calls.filter((call) => call.method === "range")).toEqual([
      { method: "range", args: [0, 999] },
      { method: "range", args: [0, 999] },
    ]);
    expect(result).toEqual({ kind: "ok", ratings: new Map([[1, 8]]) });
  });

  it("starts each page after the last row read, so a rating cleared mid read skips no other row", async () => {
    // Reproduced live before the fix: with offset paging, clearing a season
    // 1 rating between pages shifted the season 2 row out of reach, and the
    // badge read 6 instead of 8. A keyset page asks for what follows the last
    // (show, episode) read, which no change below it can move.
    const first = rated(1396, 1, 6);
    const lastOfPage = rated(1396, 1, 6);
    responses = [
      { data: [first, lastOfPage], error: null, count: 3 },
      { data: [rated(1399, 2, 10)], error: null, count: 1 },
    ];
    await getShowRatings("user-a", [1396, 1399]);
    expect(calls.filter((call) => call.method === "or")).toEqual([
      {
        method: "or",
        args: [
          `show_id.gt.1396,and(show_id.eq.1396,episode_id.gt.${lastOfPage.episode_id})`,
        ],
      },
    ]);
  });

  it("goes on until a page holds all that remains, so a lower server cap skips nothing", async () => {
    responses = [
      { data: [rated(1, 1, 6)], error: null, count: 2 },
      { data: [rated(1, 1, 8)], error: null, count: 1 },
    ];
    expect(await getShowRatings("user-a", [1])).toEqual({
      kind: "ok",
      ratings: new Map([[1, 7]]),
    });
    expect(calls.filter((call) => call.method === "range")).toHaveLength(2);
  });

  it("reports a failed page as failed, never a short map (AC-10)", async () => {
    responses = [
      {
        data: Array.from({ length: 1000 }, () => rated(1, 1, 6)),
        error: null,
        count: 1001,
      },
      { data: null, error: { code: "PGRST000" }, count: null },
    ];
    expect(await getShowRatings("user-a", [1])).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused db_error",
    );
  });

  it("reports a thrown client as failed", async () => {
    createClient.mockRejectedValueOnce(new Error("offline"));
    expect(await getShowRatings("user-a", [1])).toEqual({ kind: "failed" });
  });

  it("reports a missing count as failed, since the loop could not know when to stop (AC-10)", async () => {
    responses = [{ data: [rated(1, 1, 6)], error: null, count: null }];
    expect(await getShowRatings("user-a", [1])).toEqual({ kind: "failed" });
  });

  it("stops at an empty page even when rows vanished below the count mid read", async () => {
    responses = [
      { data: [rated(1, 1, 6)], error: null, count: 3 },
      { data: [], error: null, count: 3 },
    ];
    expect(await getShowRatings("user-a", [1])).toEqual({
      kind: "ok",
      ratings: new Map([[1, 6]]),
    });
    expect(calls.filter((call) => call.method === "range")).toHaveLength(2);
  });

  it("ignores a row for a show the page did not ask about", async () => {
    responses = [
      {
        data: [rated(1, 1, 6), rated(99, 1, 10)],
        error: null,
        count: 2,
      },
    ];
    expect(await getShowRatings("user-a", [1])).toEqual({
      kind: "ok",
      ratings: new Map([[1, 6]]),
    });
  });
});

describe("getLibraryTitles (AC-11; spec 0013, AC-17)", () => {
  it("maps the found titles and leaves a missing one out", async () => {
    getMovieSummaries.mockResolvedValue({
      found: [{ id: 550, title: "Fight Club" }],
      missingIds: [999],
    });
    const result = await getLibraryTitles([550, 999]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.movies.get(550)).toMatchObject({ title: "Fight Club" });
    expect(result.movies.has(999)).toBe(false);
    expect(getTvShowsByIds).not.toHaveBeenCalled();
  });

  it("reads shows beside movies, keyed apart, so a shared id never collides", async () => {
    getMovieSummaries.mockResolvedValue({
      found: [{ id: 550, title: "Fight Club" }],
      missingIds: [],
    });
    getTvShowsByIds.mockResolvedValue({
      found: [{ id: 550, name: "A Show" }],
      missingIds: [1399],
    });
    const result = await getLibraryTitles([550], [550, 1399]);
    expect(getTvShowsByIds).toHaveBeenCalledWith([550, 1399]);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.movies.get(550)).toMatchObject({ title: "Fight Club" });
    expect(result.shows.get(550)).toMatchObject({ name: "A Show" });
    expect(result.shows.has(1399)).toBe(false);
  });

  it("reports a systemic TMDB failure on the show read as failed", async () => {
    getTvShowsByIds.mockRejectedValue(new FakeTmdbError("rate limited"));
    expect(await getLibraryTitles([], [1396])).toEqual({ kind: "failed" });
    expect(getMovieSummaries).not.toHaveBeenCalled();
  });

  it("reports a systemic TMDB failure, logging no identifiers (AC-19)", async () => {
    getMovieSummaries.mockRejectedValue(new FakeTmdbError("unauthorized 550"));
    expect(await getLibraryTitles([550])).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused tmdb_unavailable",
    );
  });

  it("rethrows anything that is not a TMDB error", async () => {
    getMovieSummaries.mockRejectedValue(new TypeError("bug"));
    await expect(getLibraryTitles([550])).rejects.toThrow("bug");
  });
});
