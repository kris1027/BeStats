import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0011, AC-5 to AC-11, AC-14, AC-15, AC-19, AC-21, AC-22, AC-24;
 * spec 0013, AC-2, AC-4, AC-8, AC-16, AC-19, AC-21
 *
 * The session, TMDB and the database are the boundaries, so those are the
 * three things replaced. The fake Supabase client records every call, so each
 * test asserts what would reach PostgREST, and that nothing is written at all
 * on a refusal. The clock is pinned so the air status boundary is exact.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const loadSeason = vi.fn();
vi.mock("./[id]/season/[number]/load-season", () => ({ loadSeason }));

const loadShow = vi.fn();
vi.mock("./[id]/load-show", () => ({ loadShow }));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh }));

const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "update", "eq", "rpc"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
  rpc: (...args: unknown[]) =>
    (builder().rpc as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const {
  restoreShowStatus,
  setEpisodeRating,
  setEpisodeWatched,
  setSeasonWatched,
  setShowStatus,
  undoSeasonWatched,
} = await import("./actions");

const USER = { id: "user-a", email: "a@example.test" };
const SHOW = 1396;

/** Season 1 on 2026-09-25 (UTC): aired, aired today, tomorrow, no date. */
const SEASON = {
  seasonNumber: 1,
  episodes: [
    { id: 62085, episodeNumber: 1, airDate: "2026-09-01" },
    { id: 62086, episodeNumber: 2, airDate: "2026-09-25" },
    { id: 62087, episodeNumber: 3, airDate: "2026-09-26" },
    { id: 62088, episodeNumber: 4, airDate: null },
  ],
};

const writes = () => calls.filter((call) => call.method !== "eq");
const eqs = () => calls.filter((call) => call.method === "eq");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T23:30:00Z"));
  getOptionalUser.mockResolvedValue(USER);
  loadSeason.mockResolvedValue({
    kind: "found",
    show: { id: SHOW },
    season: SEASON,
  });
  loadShow.mockResolvedValue({ kind: "found", show: { id: SHOW } });
  result = { data: null, error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("setEpisodeWatched", () => {
  it("marks through mark_episode_watched with TMDB's numbers (AC-5, AC-7)", async () => {
    expect(await setEpisodeWatched(SHOW, 1, 62086, true)).toEqual({
      ok: true,
      showStarted: false,
    });
    expect(loadSeason).toHaveBeenCalledWith(SHOW, 1);
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "mark_episode_watched",
          {
            p_show_id: SHOW,
            p_season_number: 1,
            p_episode_number: 2,
            p_episode_id: 62086,
          },
        ],
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("allows an episode with no air date (AC-3)", async () => {
    expect(await setEpisodeWatched(SHOW, 1, 62088, true)).toEqual({
      ok: true,
      showStarted: false,
    });
  });

  it("refuses an episode that airs tomorrow in UTC, writing nothing (AC-7)", async () => {
    expect(await setEpisodeWatched(SHOW, 1, 62087, true)).toEqual({
      ok: false,
      error: "not_aired",
    });
    expect(writes()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "episode_tracking.watched refused not_aired",
    );
  });

  it("refuses an episode the season does not list (AC-7)", async () => {
    expect(await setEpisodeWatched(SHOW, 1, 99999, true)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(writes()).toEqual([]);
  });

  it.each([
    ["show_not_found", "not_found"],
    ["season_not_found", "not_found"],
    ["failed", "tmdb_unavailable"],
  ])("maps a %s season read to %s (AC-7)", async (kind, error) => {
    loadSeason.mockResolvedValue({ kind });
    expect(await setEpisodeWatched(SHOW, 1, 62085, true)).toEqual({
      ok: false,
      error,
    });
    expect(writes()).toEqual([]);
  });

  it("unmarks by clearing only watched_at, skipping TMDB (AC-5, AC-7)", async () => {
    loadSeason.mockResolvedValue({ kind: "failed" });
    expect(await setEpisodeWatched(SHOW, 1, 62087, false)).toEqual({
      ok: true,
      showStarted: false,
    });
    expect(loadSeason).not.toHaveBeenCalled();
    expect(writes()).toEqual([
      { method: "from", args: ["user_episode_state"] },
      { method: "update", args: [{ watched_at: null }] },
    ]);
    expect(eqs()).toEqual([
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["episode_id", 62087] },
    ]);
  });
});

describe("setEpisodeRating", () => {
  it("rates through rate_episode (AC-6)", async () => {
    expect(await setEpisodeRating(SHOW, 1, 62085, 8)).toEqual({
      ok: true,
      showStarted: false,
    });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "rate_episode",
          {
            p_show_id: SHOW,
            p_season_number: 1,
            p_episode_number: 1,
            p_episode_id: 62085,
            p_rating: 8,
          },
        ],
      },
    ]);
  });

  it("refuses to rate an upcoming episode (AC-7)", async () => {
    expect(await setEpisodeRating(SHOW, 1, 62087, 8)).toEqual({
      ok: false,
      error: "not_aired",
    });
    expect(writes()).toEqual([]);
  });

  it("clears by nulling only rating, skipping TMDB, even for an upcoming episode (AC-2, AC-6)", async () => {
    expect(await setEpisodeRating(SHOW, 1, 62087, null)).toEqual({
      ok: true,
      showStarted: false,
    });
    expect(loadSeason).not.toHaveBeenCalled();
    expect(writes()).toEqual([
      { method: "from", args: ["user_episode_state"] },
      { method: "update", args: [{ rating: null }] },
    ]);
  });
});

describe("invalid input (AC-15)", () => {
  it.each([
    ["a zero show id", () => setEpisodeWatched(0, 1, 62085, true)],
    ["a fractional episode id", () => setEpisodeWatched(SHOW, 1, 1.5, true)],
    ["an id above 32 bits", () => setEpisodeWatched(SHOW, 1, 2 ** 31, true)],
    ["a negative season", () => setEpisodeWatched(SHOW, -1, 62085, true)],
    ["a season above smallint", () => setEpisodeWatched(SHOW, 32768, 1, true)],
    [
      "a non boolean flag",
      () => setEpisodeWatched(SHOW, 1, 62085, "yes" as unknown as boolean),
    ],
    ["a rating of 0", () => setEpisodeRating(SHOW, 1, 62085, 0)],
    ["a rating of 11", () => setEpisodeRating(SHOW, 1, 62085, 11)],
    ["a rating of 7.5", () => setEpisodeRating(SHOW, 1, 62085, 7.5)],
    ["an unmark with no ids", () => setSeasonWatched(SHOW, 1, false)],
    [
      "an unmark with an empty list",
      () => setSeasonWatched(SHOW, 1, false, []),
    ],
    [
      "an unmark with 1001 ids",
      () =>
        setSeasonWatched(
          SHOW,
          1,
          false,
          Array.from({ length: 1001 }, (_, i) => i + 1),
        ),
    ],
    [
      "an unmark with a bad id",
      () => setSeasonWatched(SHOW, 1, false, [62085, -3]),
    ],
    [
      "an undo with an empty list",
      () => undoSeasonWatched(SHOW, { kind: "unmark", episodeIds: [] }),
    ],
    [
      "a restore with an unparsable date",
      () =>
        undoSeasonWatched(SHOW, {
          kind: "restore",
          entries: [{ episodeId: 62085, watchedAt: "yesterday" }],
        }),
    ],
    [
      "a restore with a future date",
      () =>
        undoSeasonWatched(SHOW, {
          kind: "restore",
          entries: [{ episodeId: 62085, watchedAt: "2026-09-26T00:00:00Z" }],
        }),
    ],
  ])("refuses %s before any call", async (_, call) => {
    expect(await call()).toEqual({ ok: false, error: "invalid_input" });
    expect(getOptionalUser).not.toHaveBeenCalled();
    expect(loadSeason).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("the session (AC-14, AC-19)", () => {
  it("returns session_expired with no session, and writes nothing", async () => {
    getOptionalUser.mockResolvedValue(null);
    for (const call of [
      () => setEpisodeWatched(SHOW, 1, 62085, true),
      () => setEpisodeRating(SHOW, 1, 62085, null),
      () => setSeasonWatched(SHOW, 1, true),
      () => undoSeasonWatched(SHOW, { kind: "unmark", episodeIds: [1] }),
    ]) {
      expect(await call()).toEqual({ ok: false, error: "session_expired" });
    }
    expect(loadSeason).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each(["PGRST301", "PGRST303"])(
    "reports an expired JWT (%s) as session_expired",
    async (code) => {
      result = { data: null, error: { code } };
      expect(await setEpisodeWatched(SHOW, 1, 62085, true)).toEqual({
        ok: false,
        error: "session_expired",
      });
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});

describe("setSeasonWatched", () => {
  it("marks only the aired episodes TMDB lists, and offers their Undo (AC-9, AC-10)", async () => {
    result = {
      data: [{ marked_ids: [62086], show_started: false }],
      error: null,
    };
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: true,
      undo: { kind: "unmark", episodeIds: [62086] },
      showStarted: false,
    });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "mark_season_watched",
          {
            p_show_id: SHOW,
            p_season_number: 1,
            p_episode_ids: [62085, 62086],
            p_episode_numbers: [1, 2],
          },
        ],
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers no Undo when nothing was newly marked (AC-10)", async () => {
    result = { data: [{ marked_ids: [], show_started: false }], error: null };
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: true,
      undo: null,
      showStarted: false,
    });
  });

  it("writes nothing when no episode has aired", async () => {
    loadSeason.mockResolvedValue({
      kind: "found",
      show: { id: SHOW },
      season: { seasonNumber: 1, episodes: [SEASON.episodes[2]] },
    });
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: true,
      undo: null,
      showStarted: false,
    });
    expect(writes()).toEqual([]);
  });

  it("refuses when TMDB fails (AC-7)", async () => {
    loadSeason.mockResolvedValue({ kind: "failed" });
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: false,
      error: "tmdb_unavailable",
    });
    expect(writes()).toEqual([]);
  });

  it("unmarks the rendered ids without TMDB, and offers their old dates back (AC-11)", async () => {
    result = {
      data: [{ episode_id: 62087, watched_at: "2026-09-20T10:00:00+00:00" }],
      error: null,
    };
    expect(
      await setSeasonWatched(SHOW, 1, false, [62085, 62086, 62087]),
    ).toEqual({
      ok: true,
      undo: {
        kind: "restore",
        entries: [{ episodeId: 62087, watchedAt: "2026-09-20T10:00:00+00:00" }],
      },
      showStarted: false,
    });
    expect(loadSeason).not.toHaveBeenCalled();
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "unmark_episodes_watched",
          { p_show_id: SHOW, p_episode_ids: [62085, 62086, 62087] },
        ],
      },
    ]);
  });

  it("maps the function's list guard (22023) to invalid_input", async () => {
    result = { data: null, error: { code: "22023" } };
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });
});

describe("undoSeasonWatched", () => {
  it("takes back a mark through unmark_episodes_watched (AC-10)", async () => {
    expect(
      await undoSeasonWatched(SHOW, { kind: "unmark", episodeIds: [62086] }),
    ).toEqual({ ok: true, showStarted: false });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "unmark_episodes_watched",
          { p_show_id: SHOW, p_episode_ids: [62086] },
        ],
      },
    ]);
    expect(loadSeason).not.toHaveBeenCalled();
  });

  it("takes back an unmark through restore_episodes_watched (AC-11)", async () => {
    expect(
      await undoSeasonWatched(SHOW, {
        kind: "restore",
        entries: [{ episodeId: 62087, watchedAt: "2026-09-20T10:00:00+00:00" }],
      }),
    ).toEqual({ ok: true, showStarted: false });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_episodes_watched",
          {
            p_show_id: SHOW,
            p_entries: [
              { episode_id: 62087, watched_at: "2026-09-20T10:00:00+00:00" },
            ],
          },
        ],
      },
    ]);
  });

  it("reports a refused restore (P0002) as undo_expired, with no refresh", async () => {
    result = { data: null, error: { code: "P0002" } };
    expect(
      await undoSeasonWatched(SHOW, {
        kind: "restore",
        entries: [{ episodeId: 62087, watchedAt: "2026-09-20T10:00:00+00:00" }],
      }),
    ).toEqual({ ok: false, error: "undo_expired" });
    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "season_tracking.undo refused undo_expired",
    );
  });
});

describe("failures and logs (AC-13, AC-22, AC-24)", () => {
  it("turns a thrown client into write_failed instead of throwing", async () => {
    createClient.mockRejectedValueOnce(new Error("fetch failed for user-a"));
    expect(await setEpisodeWatched(SHOW, 1, 62085, true)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(warn).toHaveBeenCalledWith(
      "episode_tracking.watched refused db_error",
    );
  });

  it("logs a policy refusal as forbidden and shows write_failed", async () => {
    result = { data: null, error: { code: "42501", message: "user-a" } };
    expect(await setEpisodeRating(SHOW, 1, 62085, 8)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(warn).toHaveBeenCalledWith(
      "episode_tracking.rate refused forbidden",
    );
  });

  it("never logs an id, an email, a count or a rating", async () => {
    result = { data: null, error: { code: "23514" } };
    await setEpisodeRating(SHOW, 1, 62085, 8);
    await setSeasonWatched(SHOW, 1, false, [62085, 62086]);
    const logged = warn.mock.calls.flat().join(" ");
    for (const secret of ["user-a", "a@example", "1396", "62085", " 8", " 2"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("does not log a successful write", async () => {
    await setEpisodeWatched(SHOW, 1, 62085, true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never names user_show_state on any path; the start is in SQL (AC-24, spec 0013 AC-6)", async () => {
    result = { data: [], error: null };
    await setEpisodeWatched(SHOW, 1, 62085, true);
    await setEpisodeWatched(SHOW, 1, 62085, false);
    await setEpisodeRating(SHOW, 1, 62085, 5);
    await setEpisodeRating(SHOW, 1, 62085, null);
    await setSeasonWatched(SHOW, 1, true);
    await setSeasonWatched(SHOW, 1, false, [62085]);
    await undoSeasonWatched(SHOW, { kind: "unmark", episodeIds: [62085] });
    expect(JSON.stringify(calls)).not.toContain("user_show_state");
  });
});

describe("showStarted (spec 0013, AC-8)", () => {
  it("reports the automatic start the episode function returned", async () => {
    result = { data: [{ show_started: true }], error: null };
    expect(await setEpisodeWatched(SHOW, 1, 62085, true)).toEqual({
      ok: true,
      showStarted: true,
    });
    expect(await setEpisodeRating(SHOW, 1, 62085, 7)).toEqual({
      ok: true,
      showStarted: true,
    });
  });

  it("reports it from a season mark beside the Undo", async () => {
    result = {
      data: [{ marked_ids: [62085], show_started: true }],
      error: null,
    };
    expect(await setSeasonWatched(SHOW, 1, true)).toEqual({
      ok: true,
      undo: { kind: "unmark", episodeIds: [62085] },
      showStarted: true,
    });
  });
});

describe("setShowStatus (spec 0013)", () => {
  it("sets a status through set_show_status after confirming the show, never sending a source (AC-2)", async () => {
    result = {
      data: [
        {
          status: "watching",
          status_source: "user",
          listed_at: "2026-09-25T10:00:00+00:00",
          previous_status: null,
          previous_source: null,
          previous_listed_at: null,
        },
      ],
      error: null,
    };
    expect(await setShowStatus(SHOW, "watching")).toEqual({
      ok: true,
      undo: null,
    });
    expect(loadShow).toHaveBeenCalledWith(SHOW);
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: ["set_show_status", { p_show_id: SHOW, p_status: "watching" }],
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("returns the replaced values as the Undo of Stop watching (AC-16)", async () => {
    result = {
      data: [
        {
          status: "on_hold",
          status_source: "user",
          listed_at: "2026-09-01T10:00:00+00:00",
          previous_status: "watching",
          previous_source: "system",
          previous_listed_at: "2026-09-01T10:00:00+00:00",
        },
      ],
      error: null,
    };
    expect(await setShowStatus(SHOW, "on_hold")).toEqual({
      ok: true,
      undo: {
        expected: "on_hold",
        status: "watching",
        source: "system",
        listedAt: "2026-09-01T10:00:00+00:00",
        removedAt: null,
      },
    });
  });

  it("refuses a show TMDB does not have, writing nothing", async () => {
    loadShow.mockResolvedValue({ kind: "not_found" });
    expect(await setShowStatus(SHOW, "watching")).toEqual({
      ok: false,
      error: "not_found",
    });
    loadShow.mockResolvedValue({ kind: "failed" });
    expect(await setShowStatus(SHOW, "watching")).toEqual({
      ok: false,
      error: "tmdb_unavailable",
    });
    expect(writes()).toEqual([]);
  });

  it("removes through remove_show_status without TMDB, returning the removal's Undo (AC-4)", async () => {
    result = {
      data: [
        {
          status: "want_to_watch",
          status_source: "user",
          listed_at: "2026-09-01T10:00:00+00:00",
          removed_at: "2026-09-25T23:30:00+00:00",
        },
      ],
      error: null,
    };
    expect(await setShowStatus(SHOW, null)).toEqual({
      ok: true,
      undo: {
        expected: null,
        status: "want_to_watch",
        source: "user",
        listedAt: "2026-09-01T10:00:00+00:00",
        removedAt: "2026-09-25T23:30:00+00:00",
      },
    });
    expect(loadShow).not.toHaveBeenCalled();
    expect(writes()).toEqual([
      { method: "rpc", args: ["remove_show_status", { p_show_id: SHOW }] },
    ]);
  });

  it("offers no Undo when there was nothing to remove", async () => {
    result = { data: [], error: null };
    expect(await setShowStatus(SHOW, null)).toEqual({ ok: true, undo: null });
  });

  it.each([
    [0, "watching"],
    [SHOW, "binging"],
    [1.5, null],
  ])(
    "refuses %s / %s as invalid input before any read (AC-21)",
    async (id, status) => {
      expect(await setShowStatus(id, status as "watching")).toEqual({
        ok: false,
        error: "invalid_input",
      });
      expect(getOptionalUser).not.toHaveBeenCalled();
      expect(writes()).toEqual([]);
    },
  );

  it("answers an expired session with session_expired (AC-21)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await setShowStatus(SHOW, "dropped")).toEqual({
      ok: false,
      error: "session_expired",
    });
    expect(writes()).toEqual([]);
  });

  it("reports a failed write as write_failed with no refresh, so the pill rolls back (AC-2)", async () => {
    result = { data: null, error: { code: "XX000" } };
    expect(await setShowStatus(SHOW, "on_hold")).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("never sends a user id; the owner comes from the session in SQL (AC-20, AC-21)", async () => {
    result = { data: [], error: null };
    await setShowStatus(SHOW, "watching");
    await setShowStatus(SHOW, null);
    for (const call of writes()) {
      expect(JSON.stringify(call.args)).not.toMatch(/user/);
    }
  });
});

describe("restoreShowStatus (spec 0013, AC-19, AC-21)", () => {
  const removal = {
    expected: null,
    status: "watching" as const,
    source: "system" as const,
    listedAt: "2026-09-01T10:00:00+00:00",
    removedAt: "2026-09-25T23:29:00+00:00",
  };

  it("sends a removal's Undo, leaving out the expected status", async () => {
    expect(await restoreShowStatus(SHOW, removal)).toEqual({
      ok: true,
      undo: null,
    });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_show_status",
          {
            p_show_id: SHOW,
            p_status: "watching",
            p_source: "system",
            p_listed_at: "2026-09-01T10:00:00+00:00",
            p_removed_at: "2026-09-25T23:29:00+00:00",
          },
        ],
      },
    ]);
  });

  it("sends a Stop watching Undo with the expected status and no removal time", async () => {
    await restoreShowStatus(SHOW, {
      ...removal,
      expected: "on_hold",
      removedAt: null,
    });
    expect(writes()[0].args[1]).toEqual({
      p_show_id: SHOW,
      p_status: "watching",
      p_source: "system",
      p_expected: "on_hold",
      p_listed_at: "2026-09-01T10:00:00+00:00",
    });
  });

  it("reports a refused Undo as undo_expired", async () => {
    result = { data: null, error: { code: "P0002" } };
    expect(await restoreShowStatus(SHOW, removal)).toEqual({
      ok: false,
      error: "undo_expired",
    });
  });

  it.each([
    ["a removal with no removal time", { ...removal, removedAt: null }],
    ["a time in the future", { ...removal, listedAt: "2026-09-27T00:00:00Z" }],
    ["a time with no offset", { ...removal, removedAt: "2026-09-25T23:29:00" }],
    ["an unknown source", { ...removal, source: "robot" }],
  ])("refuses %s as invalid input", async (_name, undo) => {
    expect(
      await restoreShowStatus(SHOW, undo as unknown as typeof removal),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(writes()).toEqual([]);
  });

  it("answers an expired session with session_expired, writing nothing (AC-21)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await restoreShowStatus(SHOW, removal)).toEqual({
      ok: false,
      error: "session_expired",
    });
    expect(writes()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});
