import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IgdbError,
  type IgdbErrorKind,
  IgdbValidationError,
  isIgdbNotFound,
} from "./errors";

/**
 * The cached wrappers: each lifetime, the failure profile, the rebuilt error,
 * and validation that happens outside any cached scope (spec 0023, AC-7,
 * AC-8, AC-11, AC-12b).
 *
 * `cacheLife` only means something inside Next, so it is a spy here, and the
 * inner reads are replaced so no request is made. Outside Next the `use cache`
 * directive is an inert string, so each scope runs on every call.
 */
const cacheLife = vi.fn();
const inner = {
  fetchGame: vi.fn(),
  fetchGamesByIds: vi.fn(),
  fetchSearchGames: vi.fn(),
  fetchDiscoverGames: vi.fn(),
  fetchGameGenres: vi.fn(),
  fetchGamePlatforms: vi.fn(),
  fetchPopularGames: vi.fn(),
};

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => cacheLife(profile),
}));
vi.mock("./games", () => ({
  fetchGame: (id: number) => inner.fetchGame(id),
}));
vi.mock("./batch", () => ({
  fetchGamesByIds: (ids: number[]) => inner.fetchGamesByIds(ids),
}));
vi.mock("./search", () => ({
  fetchSearchGames: (options: unknown) => inner.fetchSearchGames(options),
}));
vi.mock("./discover", () => ({
  fetchDiscoverGames: (options: unknown) => inner.fetchDiscoverGames(options),
}));
vi.mock("./popularity", () => ({
  fetchPopularGames: (kind: unknown) => inner.fetchPopularGames(kind),
}));
vi.mock("./reference", () => ({
  fetchGameGenres: () => inner.fetchGameGenres(),
  fetchGamePlatforms: () => inner.fetchGamePlatforms(),
}));

const {
  discoverGames,
  getGame,
  getGameGenres,
  getGamePlatforms,
  getGamesByIds,
  getPopularGames,
  searchGames,
} = await import("./reads");

afterEach(() => {
  cacheLife.mockReset();
  for (const mock of Object.values(inner)) mock.mockReset();
});

const READS = [
  ["getGame", () => getGame(1942), inner.fetchGame, "hours"],
  ["getGamesByIds", () => getGamesByIds([1]), inner.fetchGamesByIds, "hours"],
  [
    "searchGames",
    () => searchGames({ query: "zelda" }),
    inner.fetchSearchGames,
    "minutes",
  ],
  [
    "discoverGames",
    () => discoverGames({ sort: "rating_desc" }),
    inner.fetchDiscoverGames,
    "minutes",
  ],
  // spec 0028, AC-4: both requests settle as one hours entry.
  [
    "getPopularGames",
    () => getPopularGames("trending"),
    inner.fetchPopularGames,
    "hours",
  ],
  ["getGameGenres", () => getGameGenres(), inner.fetchGameGenres, "max"],
  [
    "getGamePlatforms",
    () => getGamePlatforms(),
    inner.fetchGamePlatforms,
    "max",
  ],
] as const;

const TRANSIENT: IgdbErrorKind[] = ["timeout", "rate_limited", "upstream"];
const SETTLED: IgdbErrorKind[] = ["not_found", "unauthorized", "bad_response"];

describe.each(READS)("%s", (_name, call, fetcher, profile) => {
  it(`caches a success for ${profile}`, async () => {
    fetcher.mockResolvedValue({ ok: "value" });
    await expect(call()).resolves.toEqual({ ok: "value" });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(profile);
  });

  it.each(TRANSIENT)("caches a %s failure for seconds", async (kind) => {
    fetcher.mockRejectedValue(new IgdbError(kind, "games", "x"));
    await expect(call()).rejects.toMatchObject({ kind });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("seconds");
  });

  it.each(SETTLED)("caches a %s failure for minutes", async (kind) => {
    fetcher.mockRejectedValue(new IgdbError(kind, "games", "x", 404));
    const error = await call().catch((caught) => caught);
    expect(error).toBeInstanceOf(IgdbError);
    expect(error).toMatchObject({ kind, status: 404, endpoint: "games" });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("minutes");
  });
});

describe("the rebuilt error", () => {
  it("keeps isIgdbNotFound true across the cache boundary", async () => {
    inner.fetchGame.mockRejectedValue(
      new IgdbError("not_found", "games", "gone"),
    );
    const error = await getGame(5).catch((caught) => caught);
    expect(isIgdbNotFound(error)).toBe(true);
  });
});

describe("validation, outside any cached scope", () => {
  it.each([
    ["getGame", () => getGame(0)],
    ["getGamesByIds", () => getGamesByIds([1, -2])],
    ["searchGames", () => searchGames({ query: "  " })],
    ["discoverGames", () => discoverGames({ sort: "rating_desc", page: 51 })],
    [
      "discoverGames with a page size of 30",
      () =>
        discoverGames({
          sort: "rating_desc",
          pageSize: 30 as unknown as 24,
        }),
    ],
    ["getPopularGames", () => getPopularGames("hot" as unknown as "trending")],
  ])("%s throws IgdbValidationError and caches nothing", async (_n, call) => {
    await expect(call()).rejects.toBeInstanceOf(IgdbValidationError);
    expect(cacheLife).not.toHaveBeenCalled();
    for (const mock of Object.values(inner))
      expect(mock).not.toHaveBeenCalled();
  });

  it("keys a batch on the deduped, sorted ids", async () => {
    inner.fetchGamesByIds.mockResolvedValue({ found: [], missingIds: [] });
    await getGamesByIds([3, 1, 3]);
    expect(inner.fetchGamesByIds).toHaveBeenCalledWith([1, 3]);
  });

  it("answers an empty batch without a cached read", async () => {
    await expect(getGamesByIds([])).resolves.toEqual({
      found: [],
      missingIds: [],
    });
    expect(inner.fetchGamesByIds).not.toHaveBeenCalled();
  });

  it("hands search the canonical options", async () => {
    inner.fetchSearchGames.mockResolvedValue({});
    await searchGames({ query: " zelda ", genreIds: [9, 5, 9] });
    expect(inner.fetchSearchGames).toHaveBeenCalledWith({
      query: "zelda",
      genreIds: [5, 9],
      page: 1,
    });
  });
});
