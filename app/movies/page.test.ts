import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0016, AC-17
 *
 * The movie landing indexes only a page that shows results: page N declares
 * its own canonical, and an invalid page, a page past the last one or a failed
 * TMDB read is `noindex`. The discover read is replaced; `TmdbError` is the
 * real one, so the catch branch is exercised as is. `/shows` is built the same
 * way from `discoverTvShows`.
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
const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const DESCRIPTION =
  "Browse popular movies on BeStats. See the cast, ratings and details, and keep track of what you watch.";

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

describe("the movie landing's metadata (AC-17)", () => {
  it("declares /movies as the canonical of page 1, with the site card", async () => {
    discoverMovies.mockResolvedValue({ totalPages: 50 });

    const metadata = await metadataFor();

    expect(metadata.title).toBe("Movies");
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.alternates).toEqual({ canonical: `${ORIGIN}/movies` });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      images: [`${ORIGIN}/opengraph-image`],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("gives page N its own canonical", async () => {
    discoverMovies.mockResolvedValue({ totalPages: 50 });

    const metadata = await metadataFor("2");

    expect(discoverMovies).toHaveBeenCalledWith({ page: 2 });
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/movies?page=2`,
    });
  });

  it("indexes the last page itself", async () => {
    discoverMovies.mockResolvedValue({ totalPages: 7 });

    const metadata = await metadataFor("7");

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/movies?page=7`);
  });

  it("is noindex with no canonical for a page past the last one", async () => {
    discoverMovies.mockResolvedValue({ totalPages: 7 });

    const metadata = await metadataFor("8");

    expect(metadata).toEqual({
      title: "Movies",
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
