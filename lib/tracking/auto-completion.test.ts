import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0015, AC-4, AC-6, AC-10 to AC-12, AC-14
 *
 * The session, TMDB, the watched ids read and the database are the
 * boundaries. The rule itself (`completionVerdict`) runs as is, so these
 * cases pin what the server half adds: the read order of the write gate, the
 * function each verdict calls and with what, the logging of a check that
 * cannot decide, and the per show settling on `/upcoming`.
 */
const calls: { method: string; args: unknown[] }[] = [];
let selectResponse: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
let rpcResponse: { data: unknown; error: unknown } = {
  data: true,
  error: null,
};

function builder(response: () => unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "in", "order", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(response());
  return chain;
}

const rpc = vi.fn(async (...args: unknown[]) => {
  calls.push({ method: "rpc", args });
  return rpcResponse;
});
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder(() => selectResponse).from as (...a: unknown[]) => unknown)(
      ...args,
    ),
  rpc,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const requireUser = vi.fn(async () => ({ id: "user-a", email: "a@example" }));
vi.mock("@/lib/auth/user", () => ({ requireUser }));

class TmdbError extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}
const getTvShow = vi.fn();
const getShowEpisodes = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getTvShow: (...args: unknown[]) => getTvShow(...args),
  getShowEpisodes: (...args: unknown[]) => getShowEpisodes(...args),
  isTmdbNotFound: (error: unknown) =>
    error instanceof TmdbError && error.kind === "not_found",
  TmdbError,
}));

const getShowStatus = vi.fn();
const getWatchedEpisodeIds = vi.fn();
vi.mock("./show-state", () => ({
  getShowStatus: (...args: unknown[]) => getShowStatus(...args),
  getWatchedEpisodeIds: (...args: unknown[]) => getWatchedEpisodeIds(...args),
  showIdsKey: (ids: number[]) => ids.join(","),
}));
vi.mock("./episode-state", () => ({ requestTodayUtc: () => "2026-09-30" }));

const {
  applyAutoCompletion,
  getReconciledShowStatus,
  getSystemShows,
  reconcileUpNextShows,
} = await import("./auto-completion");

const SHOW = 70523;
const EPISODES = [
  { id: 1, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
  { id: 2, seasonNumber: 1, episodeNumber: 2, airDate: "2026-01-08" },
  { id: 9, seasonNumber: 0, episodeNumber: 1, airDate: "2026-01-01" },
];

function episodesRead(overrides: Record<string, unknown> = {}) {
  return {
    episodes: EPISODES,
    complete: true,
    failedSeasonNumbers: [],
    showStatus: "Ended",
    ...overrides,
  };
}

function watched(ids: number[], showId = SHOW) {
  return { kind: "ok", state: new Map([[showId, new Set(ids)]]) };
}

const write = { kind: "write", newlyWatchedRegular: true } as const;
const visit = { kind: "visit" } as const;
const rpcCalls = () => calls.filter((call) => call.method === "rpc");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls.length = 0;
  selectResponse = {
    data: { status: "watching", status_source: "system" },
    error: null,
  };
  rpcResponse = { data: true, error: null };
  getTvShow.mockResolvedValue({ id: SHOW, status: "Ended" });
  getShowEpisodes.mockResolvedValue(episodesRead());
  getWatchedEpisodeIds.mockResolvedValue(watched([1, 2]));
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("applyAutoCompletion after a write (AC-4)", () => {
  it("completes a finished and watched show with the eligible ids", async () => {
    expect(await applyAutoCompletion(SHOW, write)).toEqual({
      changed: "completed",
    });
    expect(rpcCalls()).toEqual([
      {
        method: "rpc",
        args: [
          "complete_show_automatically",
          { p_show_id: SHOW, p_episode_ids: [1, 2], p_allow_user_source: true },
        ],
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("selects the row fresh, for the caller only", async () => {
    await applyAutoCompletion(SHOW, write);
    expect(calls.slice(0, 5)).toEqual([
      { method: "from", args: ["user_show_state"] },
      { method: "select", args: ["status, status_source"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["show_id", SHOW] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("sends p_allow_user_source false for a write that watched nothing new", async () => {
    await applyAutoCompletion(SHOW, {
      kind: "write",
      newlyWatchedRegular: false,
    });
    expect(rpcCalls()[0].args[1]).toMatchObject({ p_allow_user_source: false });
  });

  it.each([
    { status: "on_hold", status_source: "user" },
    { status: "dropped", status_source: "system" },
    { status: "completed", status_source: "system" },
    { status: "want_to_watch", status_source: "user" },
    null,
  ])("stops at the row for %j, reading nothing from TMDB", async (row) => {
    selectResponse = { data: row, error: null };
    expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
    expect(getTvShow).not.toHaveBeenCalled();
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops at a Watching the user chose when the write watched nothing new", async () => {
    selectResponse = {
      data: { status: "watching", status_source: "user" },
      error: null,
    };
    await applyAutoCompletion(SHOW, {
      kind: "write",
      newlyWatchedRegular: false,
    });
    expect(getTvShow).not.toHaveBeenCalled();
  });

  it("stops at the show status for an ongoing show, reading no season", async () => {
    getTvShow.mockResolvedValue({ id: SHOW, status: "Returning Series" });
    expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("writes nothing while an aired regular episode is unwatched", async () => {
    getWatchedEpisodeIds.mockResolvedValue(watched([1, 9]));
    expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports nothing changed when the database found the row moved", async () => {
    rpcResponse = { data: false, error: null };
    expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
  });
});

describe("a check that cannot decide (AC-6, AC-12)", () => {
  it.each([
    [
      "an incomplete read",
      () =>
        getShowEpisodes.mockResolvedValue(episodesRead({ complete: false })),
      "incomplete",
    ],
    [
      "a TMDB outage on the show",
      () => getTvShow.mockRejectedValue(new TmdbError("timeout")),
      "tmdb_unavailable",
    ],
    [
      "a TMDB outage on the episodes",
      () => getShowEpisodes.mockRejectedValue(new TmdbError("upstream")),
      "tmdb_unavailable",
    ],
    [
      "a show TMDB no longer has",
      () => getTvShow.mockRejectedValue(new TmdbError("not_found")),
      "not_found",
    ],
    [
      "a failed watched ids read",
      () => getWatchedEpisodeIds.mockResolvedValue({ kind: "failed" }),
      "db_error",
    ],
    [
      "a failed row read",
      () => {
        selectResponse = { data: null, error: { code: "XX000" } };
      },
      "db_error",
    ],
    [
      "a refused status write",
      () => {
        rpcResponse = { data: null, error: { code: "42501" } };
      },
      "forbidden",
    ],
    [
      "a network failure",
      () => rpc.mockRejectedValueOnce(new Error("offline")),
      "db_error",
    ],
  ])(
    "changes nothing and logs one event on %s",
    async (_, arrange, outcome) => {
      arrange();
      expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        `show_tracking.auto_complete refused ${outcome}`,
      );
    },
  );

  it("never writes on an incomplete read, in either direction", async () => {
    getShowEpisodes.mockResolvedValue(episodesRead({ complete: false }));
    await applyAutoCompletion(SHOW, visit, {
      status: "completed",
      source: "system",
    });
    await applyAutoCompletion(SHOW, visit, {
      status: "watching",
      source: "system",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("applyAutoCompletion on a visit (AC-10, AC-14)", () => {
  it("uses the row the page read, with no select and no status gate", async () => {
    await applyAutoCompletion(SHOW, visit, {
      status: "watching",
      source: "system",
    });
    expect(calls.filter((call) => call.method === "from")).toEqual([]);
    expect(getTvShow).not.toHaveBeenCalled();
    expect(rpcCalls()[0].args[1]).toMatchObject({ p_allow_user_source: false });
  });

  it("reopens an automatic Completed that is no longer finished", async () => {
    getWatchedEpisodeIds.mockResolvedValue(watched([1]));
    expect(
      await applyAutoCompletion(SHOW, visit, {
        status: "completed",
        source: "system",
      }),
    ).toEqual({ changed: "reopened" });
    expect(rpcCalls()).toEqual([
      {
        method: "rpc",
        args: ["reopen_show_automatically", { p_show_id: SHOW }],
      },
    ]);
  });

  it.each([
    { status: "watching", source: "user" },
    { status: "completed", source: "user" },
    { status: "on_hold", source: "system" },
  ] as const)("never reads TMDB for %j", async (row) => {
    await applyAutoCompletion(SHOW, visit, row);
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("getReconciledShowStatus (AC-10)", () => {
  it("returns the stored row untouched for a status the user chose", async () => {
    const read = { kind: "ok", state: { status: "watching", source: "user" } };
    getShowStatus.mockResolvedValue(read);
    expect(await getReconciledShowStatus(SHOW)).toBe(read);
    expect(getShowEpisodes).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "signed_out" },
    { kind: "failed" },
    { kind: "ok", state: null },
  ])("passes %j through", async (read) => {
    getShowStatus.mockResolvedValue(read);
    expect(await getReconciledShowStatus(SHOW)).toBe(read);
  });

  it("shows Completed once the check completed the show", async () => {
    getShowStatus.mockResolvedValue({
      kind: "ok",
      state: { status: "watching", source: "system" },
    });
    expect(await getReconciledShowStatus(SHOW)).toEqual({
      kind: "ok",
      state: { status: "completed", source: "system" },
    });
  });

  it("shows Watching once the check reopened the show", async () => {
    getShowStatus.mockResolvedValue({
      kind: "ok",
      state: { status: "completed", source: "system" },
    });
    getShowEpisodes.mockResolvedValue(
      episodesRead({ showStatus: "Returning Series" }),
    );
    expect(await getReconciledShowStatus(SHOW)).toEqual({
      kind: "ok",
      state: { status: "watching", source: "system" },
    });
  });

  it("keeps the stored row when the check cannot decide (AC-12)", async () => {
    const read = {
      kind: "ok",
      state: { status: "watching", source: "system" },
    };
    getShowStatus.mockResolvedValue(read);
    getShowEpisodes.mockRejectedValue(new TmdbError("timeout"));
    expect(await getReconciledShowStatus(SHOW)).toBe(read);
  });
});

describe("getSystemShows and reconcileUpNextShows (AC-11, AC-12)", () => {
  it("reads the caller's Watching and Completed rows the system set", async () => {
    selectResponse = {
      data: [
        { show_id: 1, status: "watching" },
        { show_id: 2, status: "completed" },
      ],
      error: null,
    };
    expect(await getSystemShows()).toEqual({
      kind: "ok",
      state: [
        { showId: 1, status: "watching" },
        { showId: 2, status: "completed" },
      ],
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_show_state"] },
      { method: "select", args: ["show_id, status"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["status_source", "system"] },
      { method: "in", args: ["status", ["watching", "completed"]] },
      { method: "order", args: ["show_id"] },
    ]);
  });

  it("checks every show, each settled on its own", async () => {
    selectResponse = {
      data: [
        { show_id: 1, status: "watching" },
        { show_id: 2, status: "watching" },
        { show_id: 3, status: "completed" },
      ],
      error: null,
    };
    getShowEpisodes.mockImplementation(async (showId: number) => {
      if (showId === 2) throw new TmdbError("timeout");
      return episodesRead();
    });
    getWatchedEpisodeIds.mockResolvedValue({
      kind: "ok",
      state: new Map([
        [1, new Set([1, 2])],
        [2, new Set([1, 2])],
        [3, new Set([1])],
      ]),
    });

    await reconcileUpNextShows();

    // One batched read of the watched ids for the whole page.
    expect(getWatchedEpisodeIds.mock.calls).toEqual([["1,2,3"]]);

    expect(rpcCalls().map((call) => call.args)).toEqual([
      [
        "complete_show_automatically",
        { p_show_id: 1, p_episode_ids: [1, 2], p_allow_user_source: false },
      ],
      ["reopen_show_automatically", { p_show_id: 3 }],
    ]);
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.auto_complete refused tmdb_unavailable",
    );
  });

  it("never has more than 8 shows in flight", async () => {
    selectResponse = {
      data: Array.from({ length: 30 }, (_, index) => ({
        show_id: index + 1,
        status: "watching",
      })),
      error: null,
    };
    let inFlight = 0;
    let peak = 0;
    getShowEpisodes.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return episodesRead();
    });

    await reconcileUpNextShows();

    expect(getShowEpisodes).toHaveBeenCalledTimes(30);
    expect(peak).toBe(8);
  });

  it("skips the check and logs when the watched ids cannot be read", async () => {
    selectResponse = {
      data: [{ show_id: 1, status: "watching" }],
      error: null,
    };
    getWatchedEpisodeIds.mockResolvedValue({ kind: "failed" });
    await reconcileUpNextShows();
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.auto_complete refused db_error",
    );
  });

  it("skips the check and logs when the rows cannot be read", async () => {
    selectResponse = { data: null, error: { code: "XX000" } };
    await reconcileUpNextShows();
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.auto_complete refused db_error",
    );
  });
});

describe("applyAutoCompletion, the edges of applying a verdict", () => {
  const completedSystem = { status: "completed", source: "system" } as const;

  it.each([
    [
      "the episode read",
      () => getShowEpisodes.mockRejectedValue(new TypeError("bug")),
    ],
    [
      "the status gate",
      () =>
        getTvShow.mockRejectedValue(
          new Error("TMDB_READ_ACCESS_TOKEN is missing"),
        ),
    ],
  ])(
    "logs a failure of %s that is not a TmdbError as tmdb_unavailable, writing nothing (AC-6)",
    async (_, arrange) => {
      arrange();
      expect(await applyAutoCompletion(SHOW, write)).toEqual({ changed: null });
      expect(rpc).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        "show_tracking.auto_complete refused tmdb_unavailable",
      );
    },
  );

  it("reports nothing changed when the database found the row already reopened (AC-16)", async () => {
    getWatchedEpisodeIds.mockResolvedValue(watched([1]));
    rpcResponse = { data: false, error: null };
    expect(await applyAutoCompletion(SHOW, visit, completedSystem)).toEqual({
      changed: null,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a refused reopen once and changes nothing (AC-12)", async () => {
    getWatchedEpisodeIds.mockResolvedValue(watched([1]));
    rpcResponse = { data: null, error: { code: "42501" } };
    expect(await applyAutoCompletion(SHOW, visit, completedSystem)).toEqual({
      changed: null,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.auto_complete refused forbidden",
    );
  });

  it("uses watched ids the caller already read instead of reading them again", async () => {
    expect(
      await applyAutoCompletion(
        SHOW,
        visit,
        { status: "watching", source: "system" },
        new Set([1, 2]),
      ),
    ).toEqual({ changed: "completed" });
    expect(getWatchedEpisodeIds).not.toHaveBeenCalled();
  });

  it("reads a show with no watched rows as nothing watched", async () => {
    getWatchedEpisodeIds.mockResolvedValue({ kind: "ok", state: new Map() });
    expect(await applyAutoCompletion(SHOW, visit, completedSystem)).toEqual({
      changed: "reopened",
    });
  });
});

describe("reconcileUpNextShows, the quiet paths (AC-11)", () => {
  it("reads nothing more when no show was set by the system", async () => {
    selectResponse = { data: [], error: null };
    await reconcileUpNextShows();
    expect(getWatchedEpisodeIds).not.toHaveBeenCalled();
    expect(getShowEpisodes).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reopens an automatic Completed missing from the batched watched ids", async () => {
    selectResponse = {
      data: [{ show_id: 4, status: "completed" }],
      error: null,
    };
    getWatchedEpisodeIds.mockResolvedValue({ kind: "ok", state: new Map() });
    await reconcileUpNextShows();
    expect(rpcCalls().map((call) => call.args)).toEqual([
      ["reopen_show_automatically", { p_show_id: 4 }],
    ]);
  });
});
