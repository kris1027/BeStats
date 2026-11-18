import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0016, AC-14, AC-15
 *
 * A season page's canonical carries the season path, it shares as a plain
 * `website`, and its image falls back from the season poster to the show's
 * artwork. `loadSeason` is replaced; the metadata helpers are the real ones.
 */
const loadSeason = vi.fn();

vi.mock("./load-season", () => ({
  loadSeason: (id: number, seasonNumber: number) =>
    loadSeason(id, seasonNumber),
}));

const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const SEASON_POSTER = "https://image.tmdb.org/t/p/w500/season.jpg";
const BACKDROP = "https://image.tmdb.org/t/p/w1280/backdrop.jpg";
const SHOW_POSTER = "https://image.tmdb.org/t/p/w500/show.jpg";

const SHOW = {
  name: "Breaking Bad",
  backdropUrl: BACKDROP,
  posterUrl: SHOW_POSTER,
};
const SEASON = {
  name: "Season 1",
  overview: "Walter White begins cooking.",
  posterUrl: SEASON_POSTER,
};

function metadataFor(id: string, number: string) {
  return generateMetadata({
    params: Promise.resolve({ id, number }),
  } as Parameters<typeof generateMetadata>[0]);
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN));

afterEach(() => {
  loadSeason.mockReset();
  vi.unstubAllEnvs();
});

describe("a found season's metadata (AC-14)", () => {
  it("declares the season canonical, a website type and the season poster", async () => {
    loadSeason.mockResolvedValue({ kind: "found", show: SHOW, season: SEASON });

    const metadata = await metadataFor("1396", "1");

    expect(metadata.title).toBe("Season 1 · Breaking Bad");
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/shows/1396/season/1`,
    });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: `${ORIGIN}/shows/1396/season/1`,
      images: [SEASON_POSTER],
    });
  });

  it("keeps specials, season 0, on their own canonical", async () => {
    loadSeason.mockResolvedValue({ kind: "found", show: SHOW, season: SEASON });

    const metadata = await metadataFor("1396", "0");

    expect(loadSeason).toHaveBeenCalledWith(1396, 0);
    expect(metadata.alternates?.canonical).toBe(
      `${ORIGIN}/shows/1396/season/0`,
    );
  });

  it.each([
    ["the show backdrop", { posterUrl: null }, SHOW, BACKDROP],
    [
      "the show poster",
      { posterUrl: null },
      { ...SHOW, backdropUrl: null },
      SHOW_POSTER,
    ],
    [
      "the site card",
      { posterUrl: null },
      { ...SHOW, backdropUrl: null, posterUrl: null },
      `${ORIGIN}/opengraph-image`,
    ],
  ])(
    "falls back to %s when the season has no poster",
    async (_, seasonPatch, show, image) => {
      loadSeason.mockResolvedValue({
        kind: "found",
        show,
        season: { ...SEASON, ...seasonPatch },
      });

      const metadata = await metadataFor("1396", "1");

      expect(metadata.openGraph?.images).toEqual([image]);
    },
  );
});

describe("a season page with nothing to show (AC-15)", () => {
  it.each([
    ["a missing show", { kind: "show_not_found" }, "Show not found"],
    [
      "a missing season",
      { kind: "season_not_found", show: SHOW },
      "Season not found",
    ],
    ["a failed TMDB read", { kind: "failed" }, "Season"],
  ])("is noindex with no canonical for %s", async (_, result, title) => {
    loadSeason.mockResolvedValue(result);

    const metadata = await metadataFor("1396", "99");

    expect(metadata).toEqual({ title, robots: { index: false } });
  });

  it("is noindex for a malformed season number without asking TMDB", async () => {
    const metadata = await metadataFor("1396", "one");

    expect(metadata.robots).toEqual({ index: false });
    expect(loadSeason).not.toHaveBeenCalled();
  });
});
