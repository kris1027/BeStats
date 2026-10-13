import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0016, AC-17, as amended by spec 0021, AC-15
 *
 * The paged popular grid moved from `/movies` to `/movies/popular`, and its
 * metadata with it: page N declares its own canonical, and an invalid page, a
 * page past the last one or a failed TMDB read is `noindex`. The discover read
 * is replaced; `TmdbError` is the real one, so the catch branch is exercised
 * as is. Every list page is built the same way through `catalogListMetadata`.
 */
const discoverMovies = vi.fn();

vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return {
    discoverMovies: (input: { page: number }) => discoverMovies(input),
    TmdbError: errors.TmdbError,
  };
});

const { TmdbError } = await import("@/lib/tmdb/errors");

/** A TMDB list page with no titles, as the metadata reads only its counts. */
const tmdbPage = (totalPages: number) => ({
  page: 1,
  results: [],
  totalPages,
  totalResults: totalPages * 20,
});

const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const TITLE = "Popular movies";
const DESCRIPTION = "Ordered by current popularity on TMDB.";

function metadataFor(page?: string | string[]) {
  return generateMetadata({
    searchParams: Promise.resolve(page === undefined ? {} : { page }),
  } as Parameters<typeof generateMetadata>[0]);
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN));

afterEach(() => {
  discoverMovies.mockReset();
  vi.unstubAllEnvs();
});

describe("the popular movies list's metadata (spec 0021, AC-15)", () => {
  it("declares /movies/popular as the canonical of page 1, with the site card", async () => {
    discoverMovies.mockResolvedValue(tmdbPage(50));

    const metadata = await metadataFor();

    expect(metadata.title).toBe(TITLE);
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/movies/popular`,
    });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      images: [`${ORIGIN}/opengraph-image`],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("gives page N its own canonical", async () => {
    discoverMovies.mockResolvedValue(tmdbPage(50));

    const metadata = await metadataFor("2");

    expect(discoverMovies).toHaveBeenCalledWith({ page: 2 });
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/movies/popular?page=2`,
    });
  });

  it("indexes the last page itself", async () => {
    // 7 TMDB pages hold 140 titles, 6 pages of 24 (spec 0022, AC-21).
    discoverMovies.mockResolvedValue(tmdbPage(7));

    const metadata = await metadataFor("6");

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(
      `${ORIGIN}/movies/popular?page=6`,
    );
  });

  it("is noindex with no canonical for a page past the last one", async () => {
    discoverMovies.mockResolvedValue(tmdbPage(7));

    const metadata = await metadataFor("7");

    expect(metadata).toEqual({
      title: TITLE,
      description: DESCRIPTION,
      robots: { index: false },
    });
  });

  it.each(["abc", "0", "", ["1", "2"]])(
    "is noindex without asking TMDB for the page value %j",
    async (page) => {
      const metadata = await metadataFor(page);

      expect(metadata.robots).toEqual({ index: false });
      expect(metadata.alternates).toBeUndefined();
      expect(discoverMovies).not.toHaveBeenCalled();
    },
  );

  it("is noindex when the TMDB read fails", async () => {
    discoverMovies.mockRejectedValue(
      new TmdbError("unauthorized", "/discover/movie", "bad token", 401),
    );

    const metadata = await metadataFor("7");

    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates).toBeUndefined();
  });

  it("rethrows a rejection that is not a TMDB failure", async () => {
    discoverMovies.mockRejectedValue(new TypeError("a bug"));

    await expect(metadataFor()).rejects.toThrow("a bug");
  });
});
