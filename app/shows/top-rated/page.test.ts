import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0021, AC-15
 *
 * A TV list page through the same flow as `/movies/popular`: its h1 as the
 * title, its note as the description, page N's own canonical, and `noindex`
 * past the last page. The list read is replaced.
 */
const getTvList = vi.fn();

vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return {
    getTvList: (...args: unknown[]) => getTvList(...args),
    TmdbError: errors.TmdbError,
  };
});

const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";

function metadataFor(page?: string) {
  return generateMetadata({
    searchParams: Promise.resolve(page === undefined ? {} : { page }),
  } as Parameters<typeof generateMetadata>[0]);
}

/** A TMDB list page with no titles, as the metadata reads only its counts. */
const tmdbPage = (totalPages: number) => ({
  page: 1,
  results: [],
  totalPages,
  totalResults: totalPages * 20,
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN));

afterEach(() => {
  getTvList.mockReset();
  vi.unstubAllEnvs();
});

describe("the top rated shows list's metadata", () => {
  it("reads the top_rated list and names the page by its h1 and note", async () => {
    getTvList.mockResolvedValue(tmdbPage(100));

    const metadata = await metadataFor();

    expect(getTvList).toHaveBeenCalledWith("top_rated", { page: 1 });
    expect(metadata.title).toBe("Top rated shows");
    expect(metadata.description).toBe("Ordered by TMDB community rating.");
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/shows/top-rated`,
    });
  });

  it("gives page 2 its own canonical", async () => {
    getTvList.mockResolvedValue(tmdbPage(100));

    const metadata = await metadataFor("2");

    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/shows/top-rated?page=2`,
    });
  });

  it("is noindex past the last page", async () => {
    getTvList.mockResolvedValue(tmdbPage(100));

    const metadata = await metadataFor("999");

    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates).toBeUndefined();
  });
});
