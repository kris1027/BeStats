import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0013, AC-1, AC-5, AC-9, AC-10, AC-12, AC-15, AC-18, AC-20
 *
 * The request scoped reads behind the status pill, the progress line, the
 * Next episode pills and the grid bookmarks. The session and the database are
 * the boundaries, so those are replaced; the query builder records what it was
 * asked and answers from a queue, so a test can script a paged read.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
let responses: { data: unknown; error: unknown; count?: number | null }[] = [];

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "eq",
    "in",
    "not",
    "order",
    "range",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(responses.shift());
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(responses.shift());
  return chain;
}

// The client itself must not be thenable, or awaiting `createClient()` would
// resolve straight to the query result.
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const {
  getShowStatus,
  getShowStatuses,
  getWatchedEpisodeIds,
  showIdsKey,
  WATCHED_IDS_PAGE_SIZE,
} = await import("./show-state");

const USER = { id: "user-a", email: "a@example.test" };
const called = (method: string) =>
  calls.filter((call) => call.method === method).map((call) => call.args);

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  getOptionalUser.mockResolvedValue(USER);
  responses = [];
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  warn.mockRestore();
});

/** A failed read logs its event and outcome, and nothing that names a person. */
function expectAnonymousLog(event: string) {
  expect(warn).toHaveBeenCalledWith(`${event} refused db_error`);
  for (const [line] of warn.mock.calls) {
    expect(String(line)).not.toMatch(/user-a|example\.test|1396/);
  }
}

describe("showIdsKey", () => {
  it("gives the same key for the same ids in any order, with repeats dropped", () => {
    expect(showIdsKey([1399, 1396, 1399])).toBe("1396,1399");
    expect(showIdsKey([1396, 1399])).toBe(showIdsKey([1399, 1396]));
  });

  it("sorts by number, not as text", () => {
    expect(showIdsKey([100, 9, 20])).toBe("9,20,100");
  });

  it("is empty for no ids", () => {
    expect(showIdsKey([])).toBe("");
  });
});

describe("getShowStatus (AC-1, AC-5)", () => {
  it("is signed out, with no session read, when the public env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    expect(await getShowStatus(1396)).toEqual({ kind: "signed_out" });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("is signed out, with no query, for a visitor", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getShowStatus(1396)).toEqual({ kind: "signed_out" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null, not a sixth status, when there is no row", async () => {
    responses = [{ data: null, error: null }];
    expect(await getShowStatus(1396)).toEqual({ kind: "ok", state: null });
  });

  it("maps the row and scopes the query to the session user (AC-20)", async () => {
    responses = [
      { data: { status: "on_hold", status_source: "user" }, error: null },
    ];
    expect(await getShowStatus(1396)).toEqual({
      kind: "ok",
      state: { status: "on_hold", source: "user" },
    });
    expect(called("from")).toEqual([["user_show_state"]]);
    expect(called("eq")).toEqual([
      ["user_id", "user-a"],
      ["show_id", 1396],
    ]);
  });

  it("reports a Supabase error as failed, never as untracked (AC-5)", async () => {
    responses = [{ data: null, error: { code: "42501" } }];
    expect(await getShowStatus(1396)).toEqual({ kind: "failed" });
    expectAnonymousLog("show_tracking.status_read");
  });

  it("reports a thrown client as failed instead of throwing (AC-5)", async () => {
    createClient.mockRejectedValueOnce(new Error("fetch failed for user-a"));
    expect(await getShowStatus(1396)).toEqual({ kind: "failed" });
    expectAnonymousLog("show_tracking.status_read");
  });
});

describe("getShowStatuses (AC-18)", () => {
  it("is signed out for a visitor, so the grid renders no bookmark", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getShowStatuses("1396,1399")).toEqual({ kind: "signed_out" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers an empty grid with an empty map and no query", async () => {
    const result = await getShowStatuses("");
    expect(result).toEqual({ kind: "ok", state: new Map() });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads the whole grid in one query, owner scoped, leaving untracked shows out", async () => {
    responses = [
      {
        data: [
          { show_id: 1396, status: "watching" },
          { show_id: 1399, status: "want_to_watch" },
        ],
        error: null,
      },
    ];
    const result = await getShowStatuses("1396,1399,60059");
    expect(result).toEqual({
      kind: "ok",
      state: new Map([
        [1396, "watching"],
        [1399, "want_to_watch"],
      ]),
    });
    expect(called("from")).toHaveLength(1);
    expect(called("eq")).toEqual([["user_id", "user-a"]]);
    expect(called("in")).toEqual([["show_id", [1396, 1399, 60059]]]);
  });

  it("reports a failed read as failed, logging no identifiers", async () => {
    responses = [{ data: null, error: { code: "PGRST000" } }];
    expect(await getShowStatuses("1396")).toEqual({ kind: "failed" });
    expectAnonymousLog("show_tracking.status_read");
  });
});

describe("getWatchedEpisodeIds (AC-9, AC-10, AC-12, AC-15)", () => {
  it("is signed out for a visitor, with no query", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getWatchedEpisodeIds("1396")).toEqual({ kind: "signed_out" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("gives every asked show an entry, even one with nothing watched", async () => {
    responses = [
      {
        data: [
          { show_id: 1396, episode_id: 62085 },
          { show_id: 1396, episode_id: 62086 },
        ],
        error: null,
        count: 2,
      },
    ];
    const result = await getWatchedEpisodeIds("1396,1399");
    expect(result).toEqual({
      kind: "ok",
      state: new Map([
        [1396, new Set([62085, 62086])],
        [1399, new Set()],
      ]),
    });
  });

  it("reads only the owner's watched rows, ordered by id, with an exact count", async () => {
    responses = [{ data: [], error: null, count: 0 }];
    await getWatchedEpisodeIds("1396");
    expect(called("from")).toEqual([["user_episode_state"]]);
    expect(called("select")).toEqual([
      ["show_id, episode_id", { count: "exact" }],
    ]);
    expect(called("eq")).toEqual([["user_id", "user-a"]]);
    expect(called("not")).toEqual([["watched_at", "is", null]]);
    expect(called("order")).toEqual([["episode_id"]]);
  });

  it("pages past the response cap until the exact count is reached", async () => {
    const page = (from: number, size: number) =>
      Array.from({ length: size }, (_, i) => ({
        show_id: 1396,
        episode_id: from + i,
      }));
    const total = WATCHED_IDS_PAGE_SIZE + 5;
    responses = [
      { data: page(1, WATCHED_IDS_PAGE_SIZE), error: null, count: total },
      {
        data: page(WATCHED_IDS_PAGE_SIZE + 1, 5),
        error: null,
        count: total,
      },
    ];

    const result = await getWatchedEpisodeIds("1396");

    expect(called("range")).toEqual([
      [0, WATCHED_IDS_PAGE_SIZE - 1],
      [WATCHED_IDS_PAGE_SIZE, 2 * WATCHED_IDS_PAGE_SIZE - 1],
    ]);
    expect(result.kind === "ok" && result.state.get(1396)?.size).toBe(total);
  });

  it("stops on an empty page even when the count promised more", async () => {
    responses = [
      { data: [{ show_id: 1396, episode_id: 1 }], error: null, count: 3 },
      { data: [], error: null, count: 3 },
    ];
    const result = await getWatchedEpisodeIds("1396");
    expect(called("range")).toHaveLength(2);
    expect(result).toEqual({
      kind: "ok",
      state: new Map([[1396, new Set([1])]]),
    });
  });

  it("ignores a row for a show it was not asked about", async () => {
    responses = [
      {
        data: [
          { show_id: 1396, episode_id: 1 },
          { show_id: 9999, episode_id: 2 },
        ],
        error: null,
        count: 2,
      },
    ];
    const result = await getWatchedEpisodeIds("1396");
    expect(result).toEqual({
      kind: "ok",
      state: new Map([[1396, new Set([1])]]),
    });
  });

  it("reports a read with no count as failed, never a partial set (AC-11)", async () => {
    responses = [
      { data: [{ show_id: 1396, episode_id: 1 }], error: null, count: null },
    ];
    expect(await getWatchedEpisodeIds("1396")).toEqual({ kind: "failed" });
    expectAnonymousLog("show_tracking.watched_read");
  });

  it("reports an error on a later page as failed, dropping the first page", async () => {
    responses = [
      {
        data: [{ show_id: 1396, episode_id: 1 }],
        error: null,
        count: WATCHED_IDS_PAGE_SIZE + 1,
      },
      { data: null, error: { code: "PGRST000" }, count: null },
    ];
    expect(await getWatchedEpisodeIds("1396")).toEqual({ kind: "failed" });
  });

  it("reports a thrown client as failed instead of throwing", async () => {
    createClient.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await getWatchedEpisodeIds("1396")).toEqual({ kind: "failed" });
    expectAnonymousLog("show_tracking.watched_read");
  });
});
