import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { catalogList, GAME_LIST_SLUGS } from "@/lib/catalog/lists";
import { IgdbError, IgdbValidationError } from "@/lib/igdb/errors";
import { TmdbError } from "@/lib/tmdb/errors";

/**
 * covers: spec 0032, AC-4, AC-5
 *
 * Games open to search engines like movies and shows: `/games` carries its
 * canonical and the site card, and a games list page is indexed when its page
 * shows games and is not past a known last page. The grid read is replaced;
 * the error classes are the real ones, so the catch branch runs as is.
 */
const readTaggedCatalogGridPage = vi.fn();

vi.mock("@/lib/catalog-list-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog-list-read")>()),
  readTaggedCatalogGridPage: (list: unknown, page: number) =>
    readTaggedCatalogGridPage(list, page),
}));
vi.mock("@/lib/igdb", async () => {
  const errors = await import("@/lib/igdb/errors");
  return { IgdbError: errors.IgdbError };
});
vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return { TmdbError: errors.TmdbError };
});

const { catalogListMetadata, gamesMetadata } = await import(
  "./landing-metadata"
);

const ORIGIN = "https://bestats.example";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN));

afterEach(() => {
  readTaggedCatalogGridPage.mockReset();
  vi.unstubAllEnvs();
});

/** A games page holding `count` games, with IGDB's count or none. */
function gamePage(count: number, totalResults: number | null) {
  return {
    mediaType: "game",
    paged: {
      page: 1,
      results: Array.from({ length: count }, (_, id) => ({ id })),
      hasNextPage: false,
      totalResults,
    },
  };
}

function metadataFor(
  list: Parameters<typeof catalogListMetadata>[0],
  page?: string,
) {
  return catalogListMetadata(
    list,
    Promise.resolve(page === undefined ? {} : { page }),
  );
}

describe("gamesMetadata (AC-4)", () => {
  it("keeps its title and description, with the /games canonical and the site card", () => {
    const metadata = gamesMetadata({
      title: "Games",
      description: "Browse games.",
    });

    expect(metadata.title).toBe("Games");
    expect(metadata.description).toBe("Browse games.");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toEqual({ canonical: `${ORIGIN}/games` });
    expect(metadata.openGraph).toMatchObject({
      url: `${ORIGIN}/games`,
      type: "website",
      images: [`${ORIGIN}/opengraph-image`],
    });
  });

  it("leaves the canonical out without a site URL, never relative", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

    const metadata = gamesMetadata({ title: "Games", description: "x" });

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph?.images).toBeUndefined();
  });
});

describe("a games list page's metadata (AC-5)", () => {
  it.each(GAME_LIST_SLUGS)(
    "indexes page 1 of %s with its h1, note and own canonical",
    async (slug) => {
      const list = catalogList("game", slug);
      readTaggedCatalogGridPage.mockResolvedValue(gamePage(24, 500));

      const metadata = await metadataFor(list);

      expect(readTaggedCatalogGridPage).toHaveBeenCalledWith(list, 1);
      expect(metadata.title).toBe(list.heading);
      expect(metadata.description).toBe(list.note);
      expect(metadata.robots).toBeUndefined();
      expect(metadata.alternates).toEqual({
        canonical: `${ORIGIN}/games/${slug}`,
      });
    },
  );

  it("indexes page 3 of a list with no IGDB count while it shows games", async () => {
    readTaggedCatalogGridPage.mockResolvedValue(gamePage(24, null));

    const metadata = await metadataFor(
      catalogList("game", "recently-released"),
      "3",
    );

    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/games/recently-released?page=3`,
    });
  });

  it.each([
    ["an empty page", gamePage(0, null)],
    ["a page past the counted last one", gamePage(5, 24)],
  ])("is noindex with no canonical for %s", async (_, result) => {
    readTaggedCatalogGridPage.mockResolvedValue(result);

    const metadata = await metadataFor(catalogList("game", "top-rated"), "2");

    expect(metadata).toEqual({
      title: catalogList("game", "top-rated").heading,
      description: catalogList("game", "top-rated").note,
      robots: { index: false },
    });
  });

  it("is noindex without asking IGDB for an invalid page", async () => {
    const metadata = await metadataFor(catalogList("game", "popular"), "abc");

    expect(metadata.robots).toEqual({ index: false });
    expect(readTaggedCatalogGridPage).not.toHaveBeenCalled();
  });

  it.each([
    ["an IGDB failure", new IgdbError("rate_limited", "games", "failed")],
    ["a TMDB failure", new TmdbError("timeout", "/discover", "failed")],
  ])("is noindex for %s", async (_, error) => {
    readTaggedCatalogGridPage.mockRejectedValue(error);

    const metadata = await metadataFor(catalogList("game", "trending"));

    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates).toBeUndefined();
  });

  it("rethrows an IGDB validation error, a bug rather than an outage", async () => {
    readTaggedCatalogGridPage.mockRejectedValue(
      new IgdbValidationError("page", "bad"),
    );

    await expect(
      metadataFor(catalogList("game", "trending")),
    ).rejects.toBeInstanceOf(IgdbValidationError);
  });
});

describe("a TMDB list page keeps the rule it had (AC-5)", () => {
  const tmdbPage = (totalPages: number) => ({
    mediaType: "movie",
    paged: { page: 1, results: [], totalPages, totalResults: 0 },
  });

  it("indexes its last page and not the one after", async () => {
    const list = catalogList("movie", "top-rated");
    readTaggedCatalogGridPage.mockResolvedValue(tmdbPage(6));

    expect((await metadataFor(list, "6")).robots).toBeUndefined();
    expect((await metadataFor(list, "7")).robots).toEqual({ index: false });
  });
});
