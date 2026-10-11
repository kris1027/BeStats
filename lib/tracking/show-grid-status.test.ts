import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/catalog-card-status.md, R5 to R8
 *
 * The composition is under test: the reads and the classifier are replaced,
 * so each case says only what reaches the cards.
 */
vi.mock("server-only", () => ({}));
const getTrackedShows = vi.fn();
vi.mock("./show-state", () => ({
  getTrackedShows: (...args: unknown[]) => getTrackedShows(...args),
}));
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const readWatchedRegular = vi.fn();
vi.mock("./library-lists", () => ({
  readWatchedRegular: (...args: unknown[]) => readWatchedRegular(...args),
}));
class TmdbError extends Error {}
const getTvShowsSettled = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  TmdbError,
  getTvShowsSettled: (...args: unknown[]) => getTvShowsSettled(...args),
}));
const classifyShow = vi.fn();
vi.mock("@/lib/tv/library-page", () => ({
  classifyShow: (...args: unknown[]) => classifyShow(...args),
}));
const getShowRatings = vi.fn();
vi.mock("./show-ratings", () => ({
  getShowRatings: (...args: unknown[]) => getShowRatings(...args),
}));
vi.mock("./episode-state", () => ({ requestTodayUtc: () => "2026-10-10" }));

const { getShowGridStatus } = await import("./show-grid-status");

const WATCHLIST = { page: "watchlist", next: { season: 1, episode: 2 } };
const WATCHED = { page: "watched", label: "finished" };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getOptionalUser.mockResolvedValue({ id: "user-a" });
  getTrackedShows.mockResolvedValue({ kind: "ok", state: new Set([1, 2]) });
  readWatchedRegular.mockResolvedValue(new Map());
  getTvShowsSettled.mockResolvedValue({
    found: new Map([
      [1, { id: 1 }],
      [2, { id: 2 }],
    ]),
    missingIds: [],
    failedIds: [],
  });
  classifyShow.mockImplementation((show: { id: number }) =>
    show.id === 1 ? WATCHLIST : WATCHED,
  );
  getShowRatings.mockResolvedValue({
    kind: "ok",
    ratings: new Map([[2, 7.5]]),
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("getShowGridStatus", () => {
  it("passes a visitor or a failed tracked read straight through", async () => {
    getTrackedShows.mockResolvedValue({ kind: "signed_out" });
    expect(await getShowGridStatus("1,2,3")).toEqual({ kind: "signed_out" });
    getTrackedShows.mockResolvedValue({ kind: "failed" });
    expect(await getShowGridStatus("1,2,4")).toEqual({ kind: "failed" });
  });

  it("places each tracked show, with the show rating only on Watched", async () => {
    expect(await getShowGridStatus("1,2,3")).toEqual({
      kind: "ok",
      state: new Map([
        [1, { ...WATCHLIST, rating: null }],
        [2, { ...WATCHED, rating: 7.5 }],
      ]),
    });
    expect(getTvShowsSettled).toHaveBeenCalledWith([1, 2]);
    expect(readWatchedRegular).toHaveBeenCalledWith({}, "user-a", [1, 2]);
    expect(getShowRatings).toHaveBeenCalledWith("user-a", [2]);
  });

  it("reads nothing more when no grid show is tracked", async () => {
    getTrackedShows.mockResolvedValue({ kind: "ok", state: new Set() });
    expect(await getShowGridStatus("5,6")).toEqual({
      kind: "ok",
      state: new Map(),
    });
    expect(getTvShowsSettled).not.toHaveBeenCalled();
  });

  it("leaves every tracked show plain when the episodes fail", async () => {
    readWatchedRegular.mockResolvedValue(null);
    expect(await getShowGridStatus("1,2,7")).toEqual({
      kind: "ok",
      state: new Map([
        [1, null],
        [2, null],
      ]),
    });
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.watched_read refused db_error",
    );
  });

  it("leaves every tracked show plain on a systemic TMDB failure", async () => {
    getTvShowsSettled.mockRejectedValue(new TmdbError("rate limited"));
    const result = await getShowGridStatus("1,2,8");
    expect(result).toEqual({
      kind: "ok",
      state: new Map([
        [1, null],
        [2, null],
      ]),
    });
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.grid_read refused tmdb_unavailable",
    );
  });

  it("leaves a show plain when its own TMDB read failed", async () => {
    getTvShowsSettled.mockResolvedValue({
      found: new Map([[1, { id: 1 }]]),
      missingIds: [],
      failedIds: [2],
    });
    const result = await getShowGridStatus("1,2,9");
    expect(result.kind === "ok" && result.state.get(2)).toBeNull();
    expect(getShowRatings).not.toHaveBeenCalled();
  });

  it("leaves a Watched show plain, never unrated, when its rating read fails", async () => {
    getShowRatings.mockResolvedValue({ kind: "failed" });
    const result = await getShowGridStatus("1,2,10");
    expect(result.kind === "ok" && result.state.get(2)).toBeNull();
    expect(result.kind === "ok" && result.state.get(1)).toEqual({
      ...WATCHLIST,
      rating: null,
    });
  });
});
