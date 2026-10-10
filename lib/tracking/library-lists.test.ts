import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-2, AC-9, AC-11; spec 0020, AC-7 to AC-13, AC-16,
 * AC-17, AC-22
 *
 * The database and TMDB are the boundaries, so those are replaced. The query
 * builder records what it was asked, so each test asserts the order, the
 * filters, the ceiling and the owner filter that would reach PostgREST. Each
 * builder answers from a queue, so a test can script the tracked rows, the
 * watched episodes and a count read. Classification itself is real: the
 * classifiers have their own tables, and these cases check that the reads
 * feed them and keep each tab's own titles in its own order.
 */
const calls: { method: string; args: unknown[] }[] = [];
let responses: {
  data: unknown;
  error: unknown;
  count?: number | null;
}[] = [];
/** How many reads were awaited at once, at most, so a test can bound it. */
let inFlight = 0;
let maxInFlight = 0;

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "eq",
    "is",
    "in",
    "gte",
    "not",
    "order",
    "range",
    "limit",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => {
    const response = responses.shift();
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // Settles on a later task, so reads fired together overlap as they would
    // against PostgREST.
    return new Promise((settle) => setTimeout(settle, 0)).then(() => {
      inFlight -= 1;
      return resolve(response);
    });
  };
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

class FakeTmdbError extends Error {}
const getMovieSummaries = vi.fn();
const getTvShowsSettled = vi.fn();
const getMoviesSettled = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getMovieSummaries: (...args: unknown[]) => getMovieSummaries(...args),
  getTvShowsSettled: (...args: unknown[]) => getTvShowsSettled(...args),
  getMoviesSettled: (...args: unknown[]) => getMoviesSettled(...args),
  TmdbError: FakeTmdbError,
}));

const {
  getLibraryMovieTitles,
  getMovieLibraryTab,
  getShowLibraryTab,
  getWatchedMoviesPage,
  LIBRARY_CLASSIFY_LIMIT,
  LIBRARY_PAGE_SIZE,
  libraryLastPage,
} = await import("./library-lists");

const TODAY = "2026-10-07";

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.length = 0;
  responses = [];
  inFlight = 0;
  maxInFlight = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

/** A show with one season of three episodes, the last of which aired. */
function show(
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `Show ${id}`,
    posterUrl: null,
    tmdbRating: 8,
    status: "Returning Series",
    seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: "2026-01-01" }],
    lastEpisodeToAir: {
      seasonNumber: 1,
      episodeNumber: 3,
      airDate: "2026-02-01",
    },
    nextEpisodeToAir: null,
    ...overrides,
  };
}

function tracked(
  showId: number,
  trackedAt = "2026-09-01T00:00:00+00:00",
  lastWatchedAt: string | null = null,
) {
  return {
    show_id: showId,
    tracked_at: trackedAt,
    last_watched_at: lastWatchedAt,
  };
}

function settled(
  shows: Record<string, unknown>[],
  missingIds: number[] = [],
  failedIds: number[] = [],
) {
  return {
    found: new Map(shows.map((item) => [item.id as number, item])),
    missingIds,
    failedIds,
  };
}

describe("libraryLastPage", () => {
  it.each([
    [0, 1],
    [20, 1],
    [21, 2],
    [41, 3],
  ])("a list of %s cards ends on page %s", (total, last) => {
    expect(libraryLastPage(total)).toBe(last);
  });

  it("pages by 20 and checks at most 500 titles (AC-16)", () => {
    expect(LIBRARY_PAGE_SIZE).toBe(20);
    expect(LIBRARY_CLASSIFY_LIMIT).toBe(500);
  });
});

describe("getShowLibraryTab (AC-7 to AC-12, AC-16)", () => {
  it("reads the owner's tracked shows by activity, with the ceiling in SQL, then their regular episodes", async () => {
    responses = [
      { data: [tracked(1), tracked(2)], error: null },
      {
        data: [{ show_id: 1, season_number: 1, episode_number: 1 }],
        error: null,
        count: 1,
      },
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1), show(2)]));

    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(calls.slice(0, 7)).toEqual([
      { method: "from", args: ["user_tracked_shows"] },
      { method: "select", args: ["show_id, tracked_at, last_watched_at"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "order", args: ["last_activity_at", { ascending: false }] },
      { method: "order", args: ["show_id", { ascending: true }] },
      { method: "limit", args: [501] },
      { method: "from", args: ["user_episode_state"] },
    ]);
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["show_id", [1, 2]] },
        { method: "gte", args: ["season_number", 1] },
        { method: "not", args: ["watched_at", "is", null] },
      ]),
    );
    expect(getTvShowsSettled).toHaveBeenCalledWith([1, 2]);
    expect(tab).toEqual({
      kind: "ok",
      cards: [
        {
          page: "watchlist",
          showId: 1,
          title: { name: "Show 1", posterUrl: null, tmdbRating: 8 },
          next: { season: 1, episode: 2 },
        },
        {
          page: "watchlist",
          showId: 2,
          title: { name: "Show 2", posterUrl: null, tmdbRating: 8 },
          next: { season: 1, episode: 1 },
        },
      ],
      total: 2,
      failedCount: 0,
      capped: false,
    });
  });

  it("puts each show on exactly one of the three tabs (AC-8)", async () => {
    const shows = [
      show(1),
      show(2, {
        nextEpisodeToAir: {
          seasonNumber: 2,
          episodeNumber: 1,
          airDate: "2026-10-20",
        },
      }),
      show(3, { status: "Ended" }),
    ];
    const watchedAll = [1, 2, 3].map((episode) => ({
      season_number: 1,
      episode_number: episode,
    }));
    const script = () => [
      { data: [tracked(1), tracked(2), tracked(3)], error: null },
      {
        data: [
          ...watchedAll.map((row) => ({ ...row, show_id: 2 })),
          ...watchedAll.map((row) => ({ ...row, show_id: 3 })),
        ],
        error: null,
        count: 6,
      },
    ];
    getTvShowsSettled.mockResolvedValue(settled(shows));

    const ids = {} as Record<string, number[]>;
    for (const tab of ["watchlist", "upcoming", "watched"] as const) {
      responses = script();
      const result = await getShowLibraryTab({
        userId: "user-a",
        tab: tab,
        page: 1,
        today: TODAY,
      });
      if (result.kind !== "ok") throw new Error("read failed");
      ids[tab] = result.cards.map((card) => card.showId);
    }
    expect(ids).toEqual({ watchlist: [1], upcoming: [2], watched: [3] });
  });

  it("orders Upcoming dated soonest first, Date TBA last, then tracked_at newest first (AC-11)", async () => {
    responses = [
      {
        data: [
          tracked(1, "2026-09-01T00:00:00+00:00"),
          tracked(2, "2026-09-03T00:00:00+00:00"),
          tracked(3, "2026-09-02T00:00:00+00:00"),
          tracked(4, "2026-09-04T00:00:00+00:00"),
        ],
        error: null,
      },
      { data: [], error: null, count: 0 },
    ];
    const unaired = { seasons: [], lastEpisodeToAir: null };
    getTvShowsSettled.mockResolvedValue(
      settled([
        show(1, {
          ...unaired,
          nextEpisodeToAir: {
            seasonNumber: 1,
            episodeNumber: 1,
            airDate: "2026-12-01",
          },
        }),
        show(2, unaired),
        show(3, {
          ...unaired,
          nextEpisodeToAir: {
            seasonNumber: 1,
            episodeNumber: 1,
            airDate: "2026-11-01",
          },
        }),
        show(4, unaired),
      ]),
    );
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "upcoming",
      page: 1,
      today: TODAY,
    });
    if (tab.kind !== "ok") throw new Error("read failed");
    expect(tab.cards.map((card) => card.showId)).toEqual([3, 1, 4, 2]);
  });

  it("orders Watched by the newest watched episode, else tracked_at (AC-12)", async () => {
    responses = [
      {
        data: [
          tracked(1, "2026-09-05T00:00:00+00:00", "2026-09-06T00:00:00+00:00"),
          tracked(2, "2026-09-07T00:00:00+00:00", null),
          tracked(3, "2026-09-01T00:00:00+00:00", "2026-09-08T00:00:00+00:00"),
        ],
        error: null,
      },
      {
        data: [1, 3].flatMap((showId) =>
          [1, 2, 3].map((episode) => ({
            show_id: showId,
            season_number: 1,
            episode_number: episode,
          })),
        ),
        error: null,
        count: 6,
      },
    ];
    getTvShowsSettled.mockResolvedValue(
      settled([
        show(1),
        show(2, { seasons: [], lastEpisodeToAir: null }),
        show(3),
      ]),
    );
    // Show 2 has nothing aired and nothing watched, so it is on Upcoming.
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watched",
      page: 1,
      today: TODAY,
    });
    if (tab.kind !== "ok") throw new Error("read failed");
    expect(tab.cards.map((card) => card.showId)).toEqual([3, 1]);
  });

  it("states the ceiling when a 501st show exists, classifying only 500 (AC-16)", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => tracked(index + 1));
    responses = [
      { data: rows, error: null },
      { data: [], error: null, count: 0 },
    ];
    getTvShowsSettled.mockResolvedValue(settled([]));
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(tab).toMatchObject({ kind: "ok", capped: true });
    expect(getTvShowsSettled.mock.calls[0][0]).toHaveLength(500);
  });

  it("pages the tab's own cards and counts them all (AC-16)", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => tracked(index + 1));
    responses = [
      { data: rows, error: null },
      { data: [], error: null, count: 0 },
    ];
    getTvShowsSettled.mockResolvedValue(
      settled(rows.map((row) => show(row.show_id))),
    );
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 2,
      today: TODAY,
    });
    if (tab.kind !== "ok") throw new Error("read failed");
    expect(tab.total).toBe(25);
    expect(tab.cards.map((card) => card.showId)).toEqual([21, 22, 23, 24, 25]);
  });

  it("reads past the response cap for the watched episodes, page by page", async () => {
    responses = [
      { data: [tracked(1)], error: null },
      {
        data: [{ show_id: 1, season_number: 1, episode_number: 1 }],
        error: null,
        count: 1500,
      },
      {
        data: [{ show_id: 1, season_number: 1, episode_number: 2 }],
        error: null,
        count: 1500,
      },
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1)]));
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(
      calls.filter((call) => call.method === "range").map((call) => call.args),
    ).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(tab).toMatchObject({
      cards: [expect.objectContaining({ next: { season: 1, episode: 3 } })],
    });
  });

  it("reads the watched episode pages one at a time, however long the history", async () => {
    const page = (episode: number) => ({
      data: [{ show_id: 1, season_number: 1, episode_number: episode }],
      error: null,
      count: 5000,
    });
    responses = [
      { data: [tracked(1)], error: null },
      ...[1, 2, 3, 4, 5].map(page),
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1)]));
    await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(
      calls.filter((call) => call.method === "range").map((call) => call.args),
    ).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
    ]);
    expect(maxInFlight).toBe(1);
  });

  it("stops after one read when the history fits a single page exactly", async () => {
    responses = [
      { data: [tracked(1)], error: null },
      {
        data: [{ show_id: 1, season_number: 1, episode_number: 1 }],
        error: null,
        count: 1000,
      },
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1)]));
    await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(
      calls.filter((call) => call.method === "range").map((call) => call.args),
    ).toEqual([[0, 999]]);
  });

  it("stops at an empty page when rows were deleted during the read", async () => {
    responses = [
      { data: [tracked(1)], error: null },
      {
        data: [{ show_id: 1, season_number: 1, episode_number: 1 }],
        error: null,
        count: 3000,
      },
      { data: [], error: null, count: 3000 },
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1)]));
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(
      calls.filter((call) => call.method === "range").map((call) => call.args),
    ).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(tab).toMatchObject({
      kind: "ok",
      cards: [expect.objectContaining({ next: { season: 1, episode: 2 } })],
    });
  });

  it.each([
    ["an error", { data: null, error: { code: "PGRST000" }, count: null }],
    ["no count", { data: [], error: null, count: null }],
  ])(
    "fails the tab when a later history page comes back with %s, never placing shows on half a history",
    async (_label, broken) => {
      responses = [
        { data: [tracked(1)], error: null },
        {
          data: [{ show_id: 1, season_number: 1, episode_number: 1 }],
          error: null,
          count: 2500,
        },
        broken,
      ];
      getTvShowsSettled.mockResolvedValue(settled([show(1)]));
      const tab = await getShowLibraryTab({
        userId: "user-a",
        tab: "watchlist",
        page: 1,
        today: TODAY,
      });
      expect(tab).toEqual({ kind: "failed" });
      expect(getTvShowsSettled).not.toHaveBeenCalled();
    },
  );

  it("leaves a failed title off every tab and counts it, keeping a missing one on Watchlist only (AC-17)", async () => {
    responses = [
      { data: [tracked(1), tracked(2), tracked(3)], error: null },
      { data: [], error: null, count: 0 },
    ];
    getTvShowsSettled.mockResolvedValue(settled([show(1)], [2], [3]));
    const tab = await getShowLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(tab).toMatchObject({
      kind: "ok",
      total: 2,
      failedCount: 1,
      cards: [{ showId: 1 }, { page: "missing", showId: 2 }],
    });

    responses = [
      { data: [tracked(1), tracked(2), tracked(3)], error: null },
      { data: [], error: null, count: 0 },
    ];
    const upcoming = await getShowLibraryTab({
      userId: "user-a",
      tab: "upcoming",
      page: 1,
      today: TODAY,
    });
    expect(upcoming).toMatchObject({ kind: "ok", total: 0, failedCount: 1 });
  });

  it("reports a systemic TMDB failure as tmdb_failed (AC-17)", async () => {
    responses = [
      { data: [tracked(1)], error: null },
      { data: [], error: null, count: 0 },
    ];
    getTvShowsSettled.mockRejectedValue(new FakeTmdbError("rate limited"));
    expect(
      await getShowLibraryTab({
        userId: "user-a",
        tab: "watchlist",
        page: 1,
        today: TODAY,
      }),
    ).toEqual({
      kind: "tmdb_failed",
    });
  });

  it("reports a failed Postgres read as failed, never an empty tab, logging no identifiers", async () => {
    responses = [{ data: null, error: { code: "PGRST000" } }];
    expect(
      await getShowLibraryTab({
        userId: "user-a",
        tab: "watchlist",
        page: 1,
        today: TODAY,
      }),
    ).toEqual({
      kind: "failed",
    });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused db_error",
    );
    expect(getTvShowsSettled).not.toHaveBeenCalled();
  });

  it("answers no tracked shows with an empty tab and no TMDB read", async () => {
    responses = [{ data: [], error: null }];
    expect(
      await getShowLibraryTab({
        userId: "user-a",
        tab: "watched",
        page: 1,
        today: TODAY,
      }),
    ).toEqual({
      kind: "ok",
      cards: [],
      total: 0,
      failedCount: 0,
      capped: false,
    });
    expect(getTvShowsSettled).not.toHaveBeenCalled();
  });
});

function movie(id: number, releaseDate: string | null) {
  return {
    id,
    title: `Movie ${id}`,
    posterUrl: null,
    tmdbRating: 7,
    releaseDate,
  };
}

describe("getMovieLibraryTab (AC-13, AC-16, AC-17)", () => {
  it("reads planned movies not yet watched, plan order, with the ceiling in SQL", async () => {
    responses = [
      {
        data: [
          { movie_id: 1, watchlisted_at: "2026-09-02T00:00:00+00:00" },
          { movie_id: 2, watchlisted_at: "2026-09-01T00:00:00+00:00" },
        ],
        error: null,
      },
    ];
    getMoviesSettled.mockResolvedValue(
      settled([movie(1, "2026-01-01"), movie(2, "2026-12-01")] as never),
    );
    const tab = await getMovieLibraryTab({
      userId: "user-a",
      tab: "watchlist",
      page: 1,
      today: TODAY,
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_movie_state"] },
      { method: "select", args: ["movie_id, watchlisted_at"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["in_watchlist", true] },
      { method: "is", args: ["watched_at", null] },
      { method: "order", args: ["watchlisted_at", { ascending: false }] },
      { method: "order", args: ["movie_id", { ascending: true }] },
      { method: "limit", args: [501] },
    ]);
    expect(tab).toMatchObject({
      kind: "ok",
      total: 1,
      cards: [{ page: "watchlist", movieId: 1 }],
    });
  });

  it("orders Upcoming soonest release first, Date TBA last, then the plan order", async () => {
    responses = [
      {
        data: [1, 2, 3, 4].map((id) => ({
          movie_id: id,
          watchlisted_at: `2026-09-0${5 - id}T00:00:00+00:00`,
        })),
        error: null,
      },
    ];
    getMoviesSettled.mockResolvedValue(
      settled([
        movie(1, null),
        movie(2, "2026-12-01"),
        movie(3, "2026-02-30"),
        movie(4, "2026-11-01"),
      ] as never),
    );
    const tab = await getMovieLibraryTab({
      userId: "user-a",
      tab: "upcoming",
      page: 1,
      today: TODAY,
    });
    if (tab.kind !== "ok") throw new Error("read failed");
    expect(tab.cards).toEqual([
      expect.objectContaining({ movieId: 4, releaseDate: "2026-11-01" }),
      expect.objectContaining({ movieId: 2, releaseDate: "2026-12-01" }),
      expect.objectContaining({ movieId: 1, releaseDate: null }),
      expect.objectContaining({ movieId: 3, releaseDate: null }),
    ]);
  });

  it("keeps a missing movie at the end of Watchlist and counts a failed one (AC-17)", async () => {
    responses = [
      {
        data: [1, 2, 3].map((id) => ({
          movie_id: id,
          watchlisted_at: "2026-09-01T00:00:00+00:00",
        })),
        error: null,
      },
    ];
    getMoviesSettled.mockResolvedValue(
      settled([movie(1, "2026-01-01")] as never, [2], [3]),
    );
    expect(
      await getMovieLibraryTab({
        userId: "user-a",
        tab: "watchlist",
        page: 1,
        today: TODAY,
      }),
    ).toMatchObject({
      total: 2,
      failedCount: 1,
      cards: [{ movieId: 1 }, { page: "missing", movieId: 2 }],
    });
  });

  it("reports a systemic TMDB failure as tmdb_failed", async () => {
    responses = [
      {
        data: [{ movie_id: 1, watchlisted_at: "2026-09-01T00:00:00+00:00" }],
        error: null,
      },
    ];
    getMoviesSettled.mockRejectedValue(new FakeTmdbError("unauthorized"));
    expect(
      await getMovieLibraryTab({
        userId: "user-a",
        tab: "upcoming",
        page: 1,
        today: TODAY,
      }),
    ).toEqual({
      kind: "tmdb_failed",
    });
  });
});

describe("getWatchedMoviesPage (spec 0008, AC-2, AC-9)", () => {
  it("reads the owner's watched movies, newest first, 20 per page, with an exact count", async () => {
    responses = [
      {
        data: [
          {
            movie_id: 603,
            watched_at: "2026-09-01T10:00:00.123456+00:00",
            rating: 9,
          },
        ],
        error: null,
        count: 22,
      },
    ];
    expect(await getWatchedMoviesPage("user-a", 2)).toEqual({
      kind: "ok",
      rows: [
        {
          tmdbId: 603,
          watchedAt: "2026-09-01T10:00:00.123456+00:00",
          rating: 9,
        },
      ],
      total: 22,
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_movie_state"] },
      {
        method: "select",
        args: ["movie_id, watched_at, rating", { count: "exact" }],
      },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "not", args: ["watched_at", "is", null] },
      { method: "order", args: ["watched_at", { ascending: false }] },
      { method: "order", args: ["movie_id", { ascending: true }] },
      { method: "range", args: [20, 39] },
    ]);
  });

  it("answers a page past the end with the real total, from a count only read (AC-9)", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: null, count: 3 },
    ];
    expect(await getWatchedMoviesPage("user-a", 9)).toEqual({
      kind: "ok",
      rows: [],
      total: 3,
    });
  });

  it("reports a failed read, never an empty list (AC-11)", async () => {
    responses = [{ data: null, error: { code: "PGRST000" }, count: null }];
    expect(await getWatchedMoviesPage("user-a", 1)).toEqual({ kind: "failed" });
  });
});

describe("getLibraryMovieTitles (spec 0008, AC-11)", () => {
  it("maps the found titles and leaves a missing one out", async () => {
    getMovieSummaries.mockResolvedValue({
      found: [movie(1, null)],
      missingIds: [2],
    });
    const titles = await getLibraryMovieTitles([1, 2]);
    expect(titles.kind === "ok" && [...titles.movies.keys()]).toEqual([1]);
  });

  it("reports a systemic TMDB failure as failed, and rethrows anything else", async () => {
    getMovieSummaries.mockRejectedValueOnce(new FakeTmdbError("down"));
    expect(await getLibraryMovieTitles([1])).toEqual({ kind: "failed" });
    getMovieSummaries.mockRejectedValueOnce(new Error("bug"));
    await expect(getLibraryMovieTitles([1])).rejects.toThrow("bug");
  });
});
