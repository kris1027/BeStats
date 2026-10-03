import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TmdbError } from "@/lib/tmdb/errors";

/**
 * covers: spec 0016, AC-6, AC-7, AC-8, AC-9; spec 0017, AC-13
 *
 * The sitemap is the one SEO surface that reads TMDB, so its order, dedupe,
 * independent failure and lifetime choice are pinned against mocked discover
 * reads. `cacheLife` only means something inside Next, so it is recorded
 * rather than run; outside Next the `use cache` directive is an inert string.
 */
const cacheLife = vi.fn();
const discoverMovies = vi.fn();
const discoverTvShows = vi.fn();

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => cacheLife(profile),
}));
vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return {
    discoverMovies: (options: unknown) => discoverMovies(options),
    discoverTvShows: (options: unknown) => discoverTvShows(options),
    TmdbError: errors.TmdbError,
  };
});

const { default: sitemap } = await import("./sitemap");

const ORIGIN = "https://bestats.example";

/** A discover page holding the given ids. */
function page(ids: number[]) {
  return {
    page: 1,
    results: ids.map((id) => ({ id })),
    totalPages: 10,
    totalResults: 200,
  };
}

/** Page N of movies holds ids N*100+1 and N*100+2; shows the same plus 5000. */
function happyReads() {
  discoverMovies.mockImplementation(async ({ page: n }: { page: number }) =>
    page([n * 100 + 1, n * 100 + 2]),
  );
  discoverTvShows.mockImplementation(async ({ page: n }: { page: number }) =>
    page([5000 + n * 100 + 1, 5000 + n * 100 + 2]),
  );
}

function urls(entries: { url: string }[]) {
  return entries.map(({ url }) => url);
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  cacheLife.mockReset();
  discoverMovies.mockReset();
  discoverTvShows.mockReset();
});

describe("the sitemap on an indexable deployment", () => {
  it("lists the landings, the legal pages, then movies, then shows, in page order (AC-6; spec 0017, AC-13)", async () => {
    happyReads();

    const listed = urls(await sitemap());

    expect(listed.slice(0, 6)).toEqual([
      `${ORIGIN}/movies`,
      `${ORIGIN}/shows`,
      `${ORIGIN}/privacy`,
      `${ORIGIN}/terms`,
      `${ORIGIN}/movies/101`,
      `${ORIGIN}/movies/102`,
    ]);
    expect(listed).toHaveLength(4 + 20 + 20);
    expect(listed[23]).toBe(`${ORIGIN}/movies/1002`);
    expect(listed[24]).toBe(`${ORIGIN}/shows/5101`);
    expect(listed.at(-1)).toBe(`${ORIGIN}/shows/6002`);
  });

  it("reads pages 1 to 10 of each landing's discover call (AC-6)", async () => {
    happyReads();

    await sitemap();

    const pages = Array.from({ length: 10 }, (_, index) => [
      { page: index + 1 },
    ]);
    expect(discoverMovies.mock.calls).toEqual(pages);
    expect(discoverTvShows.mock.calls).toEqual(pages);
  });

  it("carries only absolute URLs with no extra fields (AC-6)", async () => {
    happyReads();

    for (const entry of await sitemap()) {
      expect(Object.keys(entry)).toEqual(["url"]);
      expect(entry.url.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  it("dedupes ids within a media type, keeping the first, but not across types (AC-6)", async () => {
    discoverMovies.mockImplementation(async ({ page: n }: { page: number }) =>
      n === 1 ? page([1, 2]) : n === 2 ? page([2, 3]) : page([]),
    );
    discoverTvShows.mockImplementation(async ({ page: n }: { page: number }) =>
      n === 1 ? page([2]) : page([]),
    );

    expect(urls(await sitemap())).toEqual([
      `${ORIGIN}/movies`,
      `${ORIGIN}/shows`,
      `${ORIGIN}/privacy`,
      `${ORIGIN}/terms`,
      `${ORIGIN}/movies/1`,
      `${ORIGIN}/movies/2`,
      `${ORIGIN}/movies/3`,
      `${ORIGIN}/shows/2`,
    ]);
  });

  it("never lists search, seasons, page variants or private paths (AC-7)", async () => {
    happyReads();

    for (const url of urls(await sitemap())) {
      expect(url).not.toMatch(
        /\/search|\/season\/|\?|\/showcase|\/watchlist|\/watched|\/upcoming|\/account|\/sign-|\/api\/|\/auth\//,
      );
    }
  });

  it("keeps a complete list for days (AC-8)", async () => {
    happyReads();

    await sitemap();

    expect(cacheLife.mock.calls).toEqual([["days"]]);
  });

  it("drops only the pages whose read failed, and keeps it for minutes (AC-8)", async () => {
    happyReads();
    const working = discoverMovies.getMockImplementation();
    discoverMovies.mockImplementation(async (options: { page: number }) => {
      if (options.page === 2)
        throw new TmdbError("timeout", "/discover", "failed");
      return working?.(options);
    });
    const workingShows = discoverTvShows.getMockImplementation();
    discoverTvShows.mockImplementation(async (options: { page: number }) => {
      if (options.page === 10)
        throw new TmdbError("upstream", "/discover", "failed");
      return workingShows?.(options);
    });

    const listed = urls(await sitemap());

    expect(listed).toHaveLength(4 + 18 + 18);
    expect(listed).not.toContain(`${ORIGIN}/movies/201`);
    expect(listed).not.toContain(`${ORIGIN}/shows/6001`);
    expect(listed).toContain(`${ORIGIN}/movies/301`);
    expect(cacheLife.mock.calls).toEqual([["minutes"]]);
  });

  it("still lists the landings and legal pages when every read fails (AC-8)", async () => {
    discoverMovies.mockRejectedValue(
      new TmdbError("rate_limited", "/discover", "failed"),
    );
    discoverTvShows.mockRejectedValue(
      new TmdbError("rate_limited", "/discover", "failed"),
    );

    expect(urls(await sitemap())).toEqual([
      `${ORIGIN}/movies`,
      `${ORIGIN}/shows`,
      `${ORIGIN}/privacy`,
      `${ORIGIN}/terms`,
    ]);
    expect(cacheLife.mock.calls).toEqual([["minutes"]]);
  });

  it("rethrows a rejection that is not a TMDB failure (AC-8)", async () => {
    happyReads();
    discoverTvShows.mockRejectedValue(new TypeError("bug"));

    await expect(sitemap()).rejects.toThrow("bug");
  });
});

describe("the sitemap on a deployment that is not indexable (AC-9)", () => {
  it.each([
    ["a preview", { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: ORIGIN }],
    ["a local run", { VERCEL_ENV: undefined, NEXT_PUBLIC_SITE_URL: ORIGIN }],
    [
      "production with no site URL",
      { VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: undefined },
    ],
  ])("is empty on %s and asks TMDB nothing", async (_, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    happyReads();

    expect(await sitemap()).toEqual([]);
    expect(discoverMovies).not.toHaveBeenCalled();
    expect(discoverTvShows).not.toHaveBeenCalled();
  });
});
