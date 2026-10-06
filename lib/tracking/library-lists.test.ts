import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-1, AC-2, AC-9, AC-11, AC-19; spec 0013, AC-13, AC-17;
 * spec 0019, AC-1 to AC-3, AC-12
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
  for (const method of ["from", "select", "eq", "not", "order", "range"]) {
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
          { kind: "tv", tmdb_id: 1400, status: null },
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
