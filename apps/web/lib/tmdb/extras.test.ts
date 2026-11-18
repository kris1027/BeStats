import { afterEach, describe, expect, it } from "vitest";

import { installFetchMock, restoreFetchMock } from "./__fixtures__/helpers";
import movieExtrasFixture from "./__fixtures__/movie-550-extras.json";
import tvExtrasFixture from "./__fixtures__/tv-1396-extras.json";
import { fetchMovieExtras, fetchTvExtras } from "./extras";
import { PROVIDER_LOGO_SIZE } from "./images";
import {
  movieAgeRatings,
  normalizeWatchProviders,
  pickTrailer,
  showAgeRatings,
} from "./normalize-extras";

/**
 * covers: spec 0022, AC-8, AC-11, AC-12, AC-13, AC-14
 *
 * The extras read and the rules that pick one value out of many. The live
 * fixtures (captured 2026-10-12, trimmed to three countries and three
 * recommendations) prove the request and the shapes; the unit cases pin the
 * edges of each choice, where a wrong branch would show another country's
 * rating, a teaser over a trailer, or an unsafe embed key.
 */

afterEach(restoreFetchMock);

function video(overrides: Record<string, unknown> = {}) {
  return {
    site: "YouTube",
    type: "Trailer",
    key: "abcdefghijk",
    name: "Official Trailer",
    official: true,
    published_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function provider(id: number, name: string, priority?: number) {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/${id}.png`,
    display_priority: priority,
  };
}

describe("fetchMovieExtras", () => {
  it("asks for every extra in one request, keeping videos with no language (AC-8)", async () => {
    const fetchMock = installFetchMock([{ body: movieExtrasFixture }]);

    await fetchMovieExtras(550);

    expect(fetchMock.attempts).toBe(1);
    expect(fetchMock.url().pathname).toBe("/3/movie/550");
    expect(fetchMock.url().searchParams.get("append_to_response")).toBe(
      "videos,recommendations,watch/providers,release_dates",
    );
    expect(fetchMock.url().searchParams.get("include_video_language")).toBe(
      "en,null",
    );
    // No region is sent: every country comes back (AC-9).
    expect(fetchMock.url().searchParams.has("watch_region")).toBe(false);
    expect(fetchMock.url().searchParams.has("region")).toBe(false);
  });

  it("normalizes the live payload for every country at once", async () => {
    installFetchMock([{ body: movieExtrasFixture }]);

    const extras = await fetchMovieExtras(550);

    // The official trailer beats the newer unofficial one and the featurettes.
    expect(extras.trailer).toEqual({
      key: "dfeUzm6KF4g",
      name: expect.any(String),
    });
    expect(Object.keys(extras.watchProviders).sort()).toEqual([
      "DE",
      "PL",
      "US",
    ]);
    expect(extras.watchProviders.PL?.stream.map((p) => p.name)).toContain(
      "Netflix",
    );
    expect(extras.watchProviders.PL?.link).toContain("locale=PL");
    expect(extras.ageRatings).toMatchObject({ US: "R", PL: "18" });
    expect(extras.recommendations.mediaType).toBe("movie");
    expect(extras.recommendations.paged.results).toHaveLength(3);
    expect(extras.recommendations.paged.results[0]).toHaveProperty("title");
  });

  it("reads a missing key as empty, never as a failure", async () => {
    installFetchMock([{ body: { id: 1 } }]);

    expect(await fetchMovieExtras(1)).toEqual({
      trailer: null,
      recommendations: {
        mediaType: "movie",
        paged: { page: 1, results: [], totalPages: 0, totalResults: 0 },
      },
      watchProviders: {},
      ageRatings: {},
    });
  });

  it("drops an adult or malformed recommendation (AC-14)", async () => {
    const base = movieExtrasFixture.recommendations.results[0];
    installFetchMock([
      {
        body: {
          recommendations: {
            page: 1,
            total_pages: 1,
            total_results: 3,
            results: [
              { ...base, id: 1, adult: true },
              { id: 2 },
              { ...base, id: 3, adult: false },
            ],
          },
        },
      },
    ]);

    const extras = await fetchMovieExtras(550);

    expect(extras.recommendations.paged.results.map((m) => m.id)).toEqual([3]);
  });

  it("surfaces a 404 as not_found, for the page to show its error line", async () => {
    installFetchMock([{ status: 404, body: {} }]);

    await expect(fetchMovieExtras(550)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("fetchTvExtras", () => {
  it("appends content ratings instead of release dates (AC-8, AC-13)", async () => {
    const fetchMock = installFetchMock([{ body: tvExtrasFixture }]);

    const extras = await fetchTvExtras(1396);

    expect(fetchMock.url().pathname).toBe("/3/tv/1396");
    expect(fetchMock.url().searchParams.get("append_to_response")).toBe(
      "videos,recommendations,watch/providers,content_ratings",
    );
    expect(extras.ageRatings).toMatchObject({ US: "TV-MA", DE: "16" });
    expect(extras.recommendations.mediaType).toBe("tv");
    expect(extras.recommendations.paged.results[0]).toHaveProperty("name");
    expect(extras.trailer?.key).toBe("VFkjBy2b50Q");
  });
});

describe("pickTrailer (AC-11)", () => {
  it("prefers a trailer over a teaser, even an official teaser", () => {
    expect(
      pickTrailer([
        video({ type: "Teaser", key: "teaserkey01" }),
        video({ official: false, key: "trailerkey1" }),
      ])?.key,
    ).toBe("trailerkey1");
  });

  it("falls back to a teaser when there is no trailer", () => {
    expect(
      pickTrailer([
        video({ type: "Featurette", key: "featurette1" }),
        video({ type: "Teaser", key: "teaserkey01" }),
      ])?.key,
    ).toBe("teaserkey01");
  });

  it("prefers an official trailer, then the newest", () => {
    expect(
      pickTrailer([
        video({
          official: false,
          key: "unofficial1",
          published_at: "2024-01-01",
        }),
        video({ key: "officialold", published_at: "2010-01-01" }),
        video({ key: "officialnew", published_at: "2015-01-01" }),
      ])?.key,
    ).toBe("officialnew");
  });

  it("sorts an unreadable date as the oldest", () => {
    expect(
      pickTrailer([
        video({ key: "nodatekey01", published_at: "not a date" }),
        video({ key: "datedkey001", published_at: "2001-01-01" }),
      ])?.key,
    ).toBe("datedkey001");
  });

  it("drops a video with an unsafe key, without hiding a good one", () => {
    expect(
      pickTrailer([
        video({ key: "bad/key?x=1", published_at: "2030-01-01" }),
        video({ key: "short" }),
        video({ key: "goodkey0001", published_at: "2000-01-01" }),
      ])?.key,
    ).toBe("goodkey0001");
    expect(pickTrailer([video({ key: "a".repeat(21) })])).toBeNull();
  });

  it("ignores videos hosted anywhere but YouTube", () => {
    expect(pickTrailer([video({ site: "Vimeo" })])).toBeNull();
  });

  it("names an unnamed video after its type", () => {
    expect(pickTrailer([video({ name: "  " })])?.name).toBe("Trailer");
  });

  it("returns null with no videos at all", () => {
    expect(pickTrailer(undefined)).toBeNull();
    expect(pickTrailer([{ junk: true }])).toBeNull();
  });
});

describe("normalizeWatchProviders (AC-12)", () => {
  it("groups Stream, Free (free then ads) and Rent or buy (rent then buy), merged by id", () => {
    const regions = normalizeWatchProviders({
      PL: {
        link: "https://www.themoviedb.org/movie/1/watch?locale=PL",
        flatrate: [provider(8, "Netflix", 0)],
        free: [provider(1, "Free One", 5)],
        ads: [provider(1, "Free One", 5), provider(2, "Ads Two", 1)],
        rent: [provider(10, "Amazon Video", 3)],
        buy: [provider(10, "Amazon Video", 3), provider(11, "Apple TV", 2)],
      },
    });

    expect(regions.PL?.stream.map((p) => p.name)).toEqual(["Netflix"]);
    expect(regions.PL?.free.map((p) => p.id)).toEqual([2, 1]);
    expect(regions.PL?.rentOrBuy.map((p) => p.id)).toEqual([11, 10]);
    expect(regions.PL?.link).toContain("locale=PL");
  });

  it("orders by priority, then name, with no priority last", () => {
    const regions = normalizeWatchProviders({
      US: {
        flatrate: [
          provider(3, "Zeta"),
          provider(2, "Beta", 1),
          provider(1, "Alpha", 1),
        ],
      },
    });

    expect(regions.US?.stream.map((p) => p.name)).toEqual([
      "Alpha",
      "Beta",
      "Zeta",
    ]);
  });

  it("lets one provider sit in more than one group", () => {
    const regions = normalizeWatchProviders({
      US: {
        flatrate: [provider(9, "Both", 1)],
        rent: [provider(9, "Both", 1)],
      },
    });

    expect(regions.US?.stream).toHaveLength(1);
    expect(regions.US?.rentOrBuy).toHaveLength(1);
  });

  it("keeps a missing logo as null and drops a malformed provider", () => {
    const regions = normalizeWatchProviders({
      US: {
        flatrate: [
          { provider_id: 5, provider_name: "No Logo", logo_path: null },
          { provider_name: "No id" },
          provider(6, "With Logo", 1),
        ],
      },
    });

    expect(regions.US?.stream).toEqual([
      {
        id: 6,
        name: "With Logo",
        logoUrl: expect.stringContaining(`/${PROVIDER_LOGO_SIZE}/6.png`),
      },
      { id: 5, name: "No Logo", logoUrl: null },
    ]);
  });

  it("keeps a country with no providers, with empty groups and no link", () => {
    expect(normalizeWatchProviders({ FR: {} })).toEqual({
      FR: { link: null, stream: [], free: [], rentOrBuy: [] },
    });
  });
});

describe("movieAgeRatings (AC-13)", () => {
  it("takes the theatrical certification first", () => {
    expect(
      movieAgeRatings([
        {
          iso_3166_1: "US",
          release_dates: [
            { certification: "PG", type: 1 },
            { certification: "R", type: 3 },
          ],
        },
      ]),
    ).toEqual({ US: "R" });
  });

  it("falls back to the first non empty certification in TMDB's order", () => {
    expect(
      movieAgeRatings([
        {
          iso_3166_1: "DE",
          release_dates: [
            { certification: "", type: 3 },
            { certification: "  ", type: 1 },
            { certification: " 16 ", type: 4 },
            { certification: "12", type: 5 },
          ],
        },
      ]),
    ).toEqual({ DE: "16" });
  });

  it("leaves out a country with no certification at all", () => {
    expect(
      movieAgeRatings([
        { iso_3166_1: "FR", release_dates: [{ certification: "", type: 3 }] },
        { junk: true },
      ]),
    ).toEqual({});
  });
});

describe("showAgeRatings (AC-13)", () => {
  it("keeps each country's rating, trimmed, and leaves out an empty one", () => {
    expect(
      showAgeRatings([
        { iso_3166_1: "US", rating: " TV-MA " },
        { iso_3166_1: "PL", rating: "" },
        { iso_3166_1: "GB" },
      ]),
    ).toEqual({ US: "TV-MA" });
  });
});
