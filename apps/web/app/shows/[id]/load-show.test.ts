import { afterEach, describe, expect, it, vi } from "vitest";

import { TmdbError } from "@/lib/tmdb/errors";

/**
 * covers: spec 0009, AC-14, AC-15
 *
 * The show and season pages, and their metadata, all branch on `loadShow` and
 * `loadSeason`, so their outcomes are the contract. The cached reads are
 * replaced; `TmdbError` and `isTmdbNotFound` are the real ones.
 */
const getTvShow = vi.fn();
const getSeason = vi.fn();

vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return {
    getTvShow: (id: number) => getTvShow(id),
    getSeason: (id: number, n: number) => getSeason(id, n),
    isTmdbNotFound: errors.isTmdbNotFound,
    TmdbError: errors.TmdbError,
  };
});

const { loadShow } = await import("./load-show");
const { loadSeason } = await import("./season/[number]/load-season");

const SHOW = {
  id: 1396,
  name: "Breaking Bad",
  adult: false,
  seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }],
};

afterEach(() => {
  getTvShow.mockReset();
  getSeason.mockReset();
});

describe("loadShow", () => {
  it("returns the show when TMDB has it", async () => {
    getTvShow.mockResolvedValue(SHOW);

    expect(await loadShow(1396)).toEqual({ kind: "found", show: SHOW });
  });

  it("reports an adult flagged show as not found", async () => {
    getTvShow.mockResolvedValue({ ...SHOW, adult: true });

    expect(await loadShow(1396)).toEqual({ kind: "not_found" });
  });

  it("reports TMDB's not found as not found", async () => {
    getTvShow.mockRejectedValue(new TmdbError("not_found", "/tv/1", "gone"));

    expect(await loadShow(1)).toEqual({ kind: "not_found" });
  });

  it.each(["timeout", "rate_limited", "upstream"] as const)(
    "reports %s as failed",
    async (kind) => {
      getTvShow.mockRejectedValue(new TmdbError(kind, "/tv/1", "down"));

      expect(await loadShow(1)).toEqual({ kind: "failed" });
    },
  );

  it("rethrows anything that is not a TMDB outcome", async () => {
    getTvShow.mockRejectedValue(new TypeError("bug"));

    await expect(loadShow(1)).rejects.toThrow("bug");
  });
});

describe("loadSeason", () => {
  it("returns the show and the season when both exist", async () => {
    getTvShow.mockResolvedValue(SHOW);
    getSeason.mockResolvedValue({ seasonNumber: 2, episodes: [] });

    const result = await loadSeason(1396, 2);

    expect(result).toEqual({
      kind: "found",
      show: SHOW,
      season: { seasonNumber: 2, episodes: [] },
    });
    expect(getSeason).toHaveBeenCalledWith(1396, 2);
  });

  it("reads specials like any other listed season", async () => {
    getTvShow.mockResolvedValue(SHOW);
    getSeason.mockResolvedValue({ seasonNumber: 0, episodes: [] });

    expect((await loadSeason(1396, 0)).kind).toBe("found");
  });

  it("answers a season the show does not list without asking TMDB", async () => {
    getTvShow.mockResolvedValue(SHOW);

    const result = await loadSeason(1396, 42);

    expect(result).toEqual({ kind: "season_not_found", show: SHOW });
    expect(getSeason).not.toHaveBeenCalled();
  });

  it("treats a listed season TMDB cannot find as not found", async () => {
    getTvShow.mockResolvedValue(SHOW);
    getSeason.mockRejectedValue(new TmdbError("not_found", "/s", "gone"));

    expect(await loadSeason(1396, 1)).toEqual({
      kind: "season_not_found",
      show: SHOW,
    });
  });

  it("is show not found for an unknown or adult show, never reading a season", async () => {
    getTvShow.mockResolvedValue({ ...SHOW, adult: true });

    expect(await loadSeason(1396, 1)).toEqual({ kind: "show_not_found" });
    expect(getSeason).not.toHaveBeenCalled();
  });

  it("is failed when either read fails upstream", async () => {
    getTvShow.mockRejectedValue(new TmdbError("timeout", "/tv/1", "slow"));
    expect(await loadSeason(1, 1)).toEqual({ kind: "failed" });

    getTvShow.mockResolvedValue(SHOW);
    getSeason.mockRejectedValue(new TmdbError("upstream", "/s", "down"));
    expect(await loadSeason(1396, 1)).toEqual({ kind: "failed" });
  });

  it("rethrows a season read error that is not a TMDB outcome", async () => {
    getTvShow.mockResolvedValue(SHOW);
    getSeason.mockRejectedValue(new TypeError("bug"));

    await expect(loadSeason(1396, 1)).rejects.toThrow("bug");
  });
});
