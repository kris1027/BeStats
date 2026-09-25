import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0011, AC-4, AC-17, AC-18, AC-22, AC-25
 *
 * The season page's one private read. The session and the database are the
 * boundaries, so those are what is replaced; the query builder records what it
 * was asked, which is how the single query and the owner scope are pinned.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "in"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(response);
  return chain;
}

// The client itself must not be thenable, or awaiting `createClient()` would
// resolve straight to the query result.
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { episodeIdsKey, getSeasonEpisodeTracking, requestTodayUtc } =
  await import("./episode-state");

const SHOW = 1396;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  response = { data: [], error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
  warn.mockRestore();
});

describe("getSeasonEpisodeTracking", () => {
  it("is signed out, with no session read, when the public env is missing (AC-4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    expect(await getSeasonEpisodeTracking(SHOW, "62085")).toEqual({
      kind: "signed_out",
    });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("is signed out, with no query, for a visitor (AC-4)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getSeasonEpisodeTracking(SHOW, "62085")).toEqual({
      kind: "signed_out",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns an empty state with no query for a season with no episodes", async () => {
    expect(await getSeasonEpisodeTracking(SHOW, "")).toEqual({
      kind: "ok",
      state: {},
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads the whole season in one query scoped to the session user and show (AC-18)", async () => {
    await getSeasonEpisodeTracking(SHOW, episodeIdsKey([62087, 62085, 62086]));
    expect(calls.filter((c) => c.method === "from")).toEqual([
      { method: "from", args: ["user_episode_state"] },
    ]);
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
    expect(calls).toContainEqual({ method: "eq", args: ["show_id", SHOW] });
    expect(calls).toContainEqual({
      method: "in",
      args: ["episode_id", [62085, 62086, 62087]],
    });
  });

  it("keeps watched and rating apart, and leaves unstored ids out of the map", async () => {
    response = {
      data: [
        { episode_id: 62085, watched_at: "2026-09-20T10:00:00Z", rating: null },
        { episode_id: 62086, watched_at: null, rating: 7 },
        { episode_id: 62087, watched_at: "2026-09-21T10:00:00Z", rating: 9 },
      ],
      error: null,
    };
    expect(
      await getSeasonEpisodeTracking(SHOW, "62085,62086,62087,62088"),
    ).toEqual({
      kind: "ok",
      state: {
        62085: { watched: true, rating: null },
        62086: { watched: false, rating: 7 },
        62087: { watched: true, rating: 9 },
      },
    });
  });

  it("only asks for the ids the page lists, so an orphaned row never reaches it (AC-25)", async () => {
    await getSeasonEpisodeTracking(SHOW, "62085");
    const inCall = calls.find((c) => c.method === "in");
    expect(inCall?.args).toEqual(["episode_id", [62085]]);
  });

  it("reports a failed read so the header can show its retry line (AC-17)", async () => {
    response = { data: null, error: { code: "PGRST000" } };
    expect(await getSeasonEpisodeTracking(SHOW, "62085")).toEqual({
      kind: "failed",
    });
  });

  it("logs a failed read as one line with no ids or email (AC-22)", async () => {
    response = {
      data: null,
      error: { code: "PGRST000", message: "user-a 1396 62085" },
    };
    await getSeasonEpisodeTracking(SHOW, "62085");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("episode_tracking.read refused db_error");
  });
});

describe("episodeIdsKey", () => {
  it("gives one key for the same ids in any order, with duplicates dropped", () => {
    expect(episodeIdsKey([62087, 62085, 62086, 62085])).toBe(
      "62085,62086,62087",
    );
  });

  it("sorts numerically, not as strings", () => {
    expect(episodeIdsKey([100, 9, 20])).toBe("9,20,100");
  });

  it("is an empty string for a season with no episodes", () => {
    expect(episodeIdsKey([])).toBe("");
  });
});

describe("requestTodayUtc", () => {
  it("is today's UTC calendar date, not the local one (AC-3)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T23:30:00-05:00"));
    expect(requestTodayUtc()).toBe("2026-09-26");
  });
});
