import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0027, AC-6, AC-7, AC-15; prompts/game-coming-soon.md, R1 to R3
 *
 * The database and IGDB are the boundaries, so those are replaced. The query
 * builder records what it was asked, so each test asserts the status filter,
 * the order, the range and the owner filter that would reach PostgREST.
 */
const calls: { method: string; args: unknown[] }[] = [];
let responses: { data: unknown; error: unknown; count?: number | null }[] = [];

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "order", "range", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve(responses.shift()));
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/tmdb", () => ({ TmdbError: class extends Error {} }));

class FakeIgdbError extends Error {}
const getGamesByIds = vi.fn();
vi.mock("@/lib/igdb", () => ({
  getGamesByIds: (...args: unknown[]) => getGamesByIds(...args),
  IgdbError: FakeIgdbError,
}));

const {
  GAME_LIBRARY_TABS,
  getGameLibraryPage,
  getLibraryGames,
  getWantToPlayTab,
} = await import("./game-library");

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

const ROW = {
  game_id: 1942,
  status: "finished",
  rating: 9,
  added_at: "2026-01-01T10:00:00+00:00",
  started_at: "2026-02-01T10:00:00+00:00",
  finished_at: "2026-03-01T10:00:00+00:00",
};

describe("getGameLibraryPage", () => {
  it.each([
    ["watchlist", "want_to_play", "added_at"],
    ["upcoming", "playing", "started_at"],
    ["watched", "finished", "finished_at"],
  ] as const)(
    "reads %s as the owner's %s games, newest %s first, 24 per page",
    async (tab, status, order) => {
      responses = [{ data: [ROW], error: null, count: 25 }];

      expect(
        await getGameLibraryPage({ userId: "user-a", tab, page: 2 }),
      ).toEqual({
        kind: "ok",
        total: 25,
        rows: [
          {
            gameId: 1942,
            status: "finished",
            rating: 9,
            addedAt: ROW.added_at,
            startedAt: ROW.started_at,
            finishedAt: ROW.finished_at,
          },
        ],
      });
      expect(GAME_LIBRARY_TABS[tab]).toEqual({ status, order });
      expect(calls).toEqual([
        { method: "from", args: ["user_game_state"] },
        {
          method: "select",
          args: [
            "game_id, status, rating, added_at, started_at, finished_at",
            { count: "exact" },
          ],
        },
        { method: "eq", args: ["user_id", "user-a"] },
        { method: "eq", args: ["status", status] },
        { method: "order", args: [order, { ascending: false }] },
        { method: "order", args: ["game_id", { ascending: true }] },
        { method: "range", args: [24, 47] },
      ]);
    },
  );

  it("answers a page past the end with the real total from a count read", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: null, count: 30 },
    ];

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "watched", page: 5 }),
    ).toEqual({ kind: "ok", rows: [], total: 30 });
    expect(calls.slice(-4)).toEqual([
      { method: "from", args: ["user_game_state"] },
      { method: "select", args: ["game_id", { count: "exact", head: true }] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["status", "finished"] },
    ]);
  });

  it("fails, logging the outcome class only, on a Postgres error", async () => {
    responses = [{ data: null, error: { code: "42501" }, count: null }];

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "watchlist", page: 1 }),
    ).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused db_error",
    );
  });

  it("reads page 1 from the first row", async () => {
    responses = [{ data: [], error: null, count: 0 }];

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "watchlist", page: 1 }),
    ).toEqual({ kind: "ok", rows: [], total: 0 });
    expect(calls.at(-1)).toEqual({ method: "range", args: [0, 23] });
  });

  it("fails when PostgREST returns no count, rather than guessing a total", async () => {
    responses = [{ data: [ROW], error: null, count: null }];

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "watched", page: 1 }),
    ).toEqual({ kind: "failed" });
  });

  it("fails when the count read after a page past the end fails too", async () => {
    responses = [
      { data: null, error: { code: "PGRST103" }, count: null },
      { data: null, error: { code: "57014" }, count: null },
    ];

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "watched", page: 9 }),
    ).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("fails when the client cannot be created", async () => {
    createClient.mockRejectedValueOnce(new Error("no cookies"));

    expect(
      await getGameLibraryPage({ userId: "user-a", tab: "upcoming", page: 1 }),
    ).toEqual({ kind: "failed" });
  });
});

describe("getLibraryGames", () => {
  it("keys IGDB's games by id and passes the missing ids through", async () => {
    const game = { id: 1942, name: "The Witcher 3" };
    getGamesByIds.mockResolvedValueOnce({ found: [game], missingIds: [7] });

    const result = await getLibraryGames([1942, 7]);

    expect(getGamesByIds).toHaveBeenCalledWith([1942, 7]);
    expect(result).toEqual({
      kind: "ok",
      games: new Map([[1942, game]]),
      missingIds: [7],
    });
  });

  it("turns an IgdbError into a failed read, never an empty map", async () => {
    getGamesByIds.mockRejectedValueOnce(new FakeIgdbError("rate limited"));

    expect(await getLibraryGames([1942])).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith(
      "movie_tracking.list_read refused igdb_unavailable",
    );
  });

  it("rethrows anything else as a bug", async () => {
    getGamesByIds.mockRejectedValueOnce(new TypeError("bad id"));

    await expect(getLibraryGames([1942])).rejects.toThrow("bad id");
  });
});

describe("getWantToPlayTab", () => {
  const TODAY = "2026-10-24";

  /** A Want to play row, newest added first in the order given. */
  function wantRow(gameId: number) {
    return {
      game_id: gameId,
      status: "want_to_play",
      rating: null,
      added_at: "2026-01-01T10:00:00+00:00",
      started_at: null,
      finished_at: null,
    };
  }

  function withReleases(releases: Record<number, string | null>) {
    getGamesByIds.mockResolvedValue({
      found: Object.entries(releases).map(([id, releaseDate]) => ({
        id: Number(id),
        releaseDate,
      })),
      missingIds: [],
    });
  }

  const read = (tab: "watchlist" | "coming-soon", page = 1) =>
    getWantToPlayTab({ userId: "user-a", tab, page, today: TODAY });

  const ids = (result: Awaited<ReturnType<typeof read>>) =>
    result.kind === "ok" ? result.rows.map((row) => row.gameId) : result;

  it("reads up to 501 of the owner's Want to play games, newest added first", async () => {
    responses = [{ data: [], error: null }];
    getGamesByIds.mockResolvedValue({ found: [], missingIds: [] });

    await read("coming-soon");

    expect(calls).toEqual([
      { method: "from", args: ["user_game_state"] },
      {
        method: "select",
        args: ["game_id, status, rating, added_at, started_at, finished_at"],
      },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["status", "want_to_play"] },
      { method: "order", args: ["added_at", { ascending: false }] },
      { method: "order", args: ["game_id", { ascending: true }] },
      { method: "limit", args: [501] },
    ]);
  });

  it("puts released games on Want to play and the rest on Coming soon, each once", async () => {
    const rows = [wantRow(1), wantRow(2), wantRow(3), wantRow(4)];
    // 1 came out before today, 2 comes out today, 3 later, 4 has no date.
    const releases = {
      1: "2020-05-01",
      2: TODAY,
      3: "2027-02-03",
      4: null,
    };

    responses = [{ data: rows, error: null }];
    withReleases(releases);
    expect(ids(await read("watchlist"))).toEqual([1, 2]);

    responses = [{ data: rows, error: null }];
    withReleases(releases);
    expect(ids(await read("coming-soon"))).toEqual([3, 4]);
  });

  it("orders Coming soon soonest first, TBA last, then by the added order", async () => {
    responses = [
      {
        data: [wantRow(1), wantRow(2), wantRow(3), wantRow(4), wantRow(5)],
        error: null,
      },
    ];
    withReleases({
      1: null,
      2: "2027-06-01",
      3: "2026-11-01",
      4: "2027-06-01",
      5: null,
    });

    expect(ids(await read("coming-soon"))).toEqual([3, 2, 4, 1, 5]);
  });

  it("keeps a game IGDB no longer has on Want to play, at the end", async () => {
    responses = [{ data: [wantRow(7), wantRow(1)], error: null }];
    getGamesByIds.mockResolvedValue({
      found: [{ id: 1, releaseDate: "2020-01-01" }],
      missingIds: [7],
    });

    const result = await read("watchlist");
    expect(ids(result)).toEqual([1, 7]);
    expect(result.kind === "ok" && result.games.has(7)).toBe(false);
  });

  it("pages in memory with an exact total, and says when it was capped", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => wantRow(i + 1));
    responses = [{ data: rows, error: null }];
    withReleases(
      Object.fromEntries(rows.map((row) => [row.game_id, "2020-01-01"])),
    );

    const result = await read("watchlist", 2);

    expect(getGamesByIds).toHaveBeenCalledWith(
      rows.slice(0, 500).map((row) => row.game_id),
    );
    expect(result).toMatchObject({ kind: "ok", total: 500, capped: true });
    expect(ids(result)).toEqual(Array.from({ length: 24 }, (_, i) => i + 25));
  });

  it("fails on a Postgres error, and reads no games", async () => {
    responses = [{ data: null, error: { code: "42501" } }];

    expect(await read("watchlist")).toEqual({ kind: "failed" });
    expect(getGamesByIds).not.toHaveBeenCalled();
  });

  it("answers a systemic IGDB failure as igdb_failed, never an empty page", async () => {
    responses = [{ data: [wantRow(1)], error: null }];
    getGamesByIds.mockRejectedValueOnce(new FakeIgdbError("rate limited"));

    expect(await read("coming-soon")).toEqual({ kind: "igdb_failed" });
  });
});
