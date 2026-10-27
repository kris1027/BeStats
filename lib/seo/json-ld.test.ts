import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type GameJsonLdInput,
  gameJsonLd,
  jsonLdScript,
  type MovieJsonLdInput,
  movieJsonLd,
  type ShowJsonLdInput,
  showJsonLd,
} from "./json-ld";

/**
 * covers: spec 0016, AC-21, AC-22, AC-23; spec 0032, AC-3
 *
 * Structured data is read by machines that take it at face value, so the
 * omission rule (never a placeholder, never a rating) and the escaping that
 * keeps TMDB text inside its script tag are both pinned here.
 */
const ORIGIN = "https://bestats.example";

afterEach(() => vi.unstubAllEnvs());

const MOVIE: MovieJsonLdInput = {
  id: 550,
  title: "Fight Club",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  releaseDate: "1999-10-15",
  overview: "An insomniac office worker...",
  genres: [{ name: "Drama" }],
  runtimeMinutes: 139,
  cast: [
    { name: "Second", order: 1 },
    { name: "First", order: 0 },
  ],
};

const SHOW: ShowJsonLdInput = {
  id: 1396,
  name: "Breaking Bad",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  firstAirDate: "2008-01-20",
  lastAirDate: "2013-09-29",
  status: "Ended",
  overview: "A chemistry teacher...",
  genres: [{ name: "Drama" }, { name: "Crime" }],
  numberOfSeasons: 5,
  numberOfEpisodes: 62,
};

describe("movieJsonLd (AC-21)", () => {
  it("maps every field from the movie", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    expect(movieJsonLd(MOVIE)).toEqual({
      "@context": "https://schema.org",
      "@type": "Movie",
      name: "Fight Club",
      url: `${ORIGIN}/movies/550`,
      image: MOVIE.posterUrl,
      datePublished: "1999-10-15",
      description: "An insomniac office worker...",
      genre: ["Drama"],
      duration: "PT139M",
      actor: [
        { "@type": "Person", name: "First" },
        { "@type": "Person", name: "Second" },
      ],
    });
  });

  it("lists the first 10 cast members by billing order", () => {
    const cast = Array.from({ length: 14 }, (_, index) => ({
      name: `Actor ${13 - index}`,
      order: 13 - index,
    }));

    const { actor } = movieJsonLd({ ...MOVIE, cast }) as {
      actor: { name: string }[];
    };

    expect(actor.map(({ name }) => name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Actor ${index}`),
    );
  });

  it("leaves out every field whose source is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

    expect(
      movieJsonLd({
        ...MOVIE,
        posterUrl: null,
        releaseDate: null,
        overview: null,
        genres: [],
        runtimeMinutes: null,
        cast: [],
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Movie",
      name: "Fight Club",
    });
  });

  it("never carries a rating", () => {
    const json = JSON.stringify(movieJsonLd(MOVIE));
    expect(json).not.toMatch(/rating|review/i);
  });
});

describe("showJsonLd (AC-22)", () => {
  it("maps every field, with an end date for an ended show", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    expect(showJsonLd(SHOW)).toEqual({
      "@context": "https://schema.org",
      "@type": "TVSeries",
      name: "Breaking Bad",
      url: `${ORIGIN}/shows/1396`,
      image: SHOW.posterUrl,
      startDate: "2008-01-20",
      endDate: "2013-09-29",
      description: "A chemistry teacher...",
      genre: ["Drama", "Crime"],
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
    });
  });

  it.each([
    "Returning Series",
    "In Production",
    "Planned",
    "Pilot",
    "",
  ] as const)("claims no end date while the status is %j", (status) => {
    expect(showJsonLd({ ...SHOW, status })).not.toHaveProperty("endDate");
  });

  it("claims an end date for a canceled show", () => {
    expect(showJsonLd({ ...SHOW, status: "Canceled" })).toHaveProperty(
      "endDate",
      "2013-09-29",
    );
  });

  it("leaves out missing and zero values", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

    expect(
      showJsonLd({
        ...SHOW,
        posterUrl: null,
        firstAirDate: null,
        lastAirDate: null,
        overview: null,
        genres: [],
        numberOfSeasons: 0,
        numberOfEpisodes: 0,
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "TVSeries",
      name: "Breaking Bad",
    });
  });
});

const GAME: GameJsonLdInput = {
  id: 1942,
  name: "The Witcher 3: Wild Hunt",
  coverUrl:
    "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1wyy.jpg",
  releaseDate: "2015-05-19",
  summary: "RPG and sequel to The Witcher 2 (2011).",
  genres: [{ name: "Role-playing (RPG)" }, { name: "Adventure" }],
  platforms: [{ name: "PC (Microsoft Windows)" }, { name: "PlayStation 4" }],
  developers: ["CD Projekt RED"],
  publishers: ["CD Projekt", "Bandai Namco Entertainment"],
};

describe("gameJsonLd (spec 0032, AC-3)", () => {
  it("maps every field from the game", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    expect(gameJsonLd(GAME)).toEqual({
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: "The Witcher 3: Wild Hunt",
      url: `${ORIGIN}/games/1942`,
      image: GAME.coverUrl,
      datePublished: "2015-05-19",
      description: "RPG and sequel to The Witcher 2 (2011).",
      genre: ["Role-playing (RPG)", "Adventure"],
      gamePlatform: ["PC (Microsoft Windows)", "PlayStation 4"],
      author: [{ "@type": "Organization", name: "CD Projekt RED" }],
      publisher: [
        { "@type": "Organization", name: "CD Projekt" },
        { "@type": "Organization", name: "Bandai Namco Entertainment" },
      ],
    });
  });

  it("drops a blank company name", () => {
    const { author, publisher } = gameJsonLd({
      ...GAME,
      developers: ["  ", "CD Projekt RED"],
      publishers: [""],
    });

    expect(author).toEqual([
      { "@type": "Organization", name: "CD Projekt RED" },
    ]);
    expect(publisher).toBeUndefined();
  });

  it("leaves out every field whose source is missing, and the url without a site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

    expect(
      gameJsonLd({
        ...GAME,
        coverUrl: null,
        releaseDate: null,
        summary: null,
        genres: [],
        platforms: [],
        developers: [],
        publishers: [],
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: "The Witcher 3: Wild Hunt",
    });
  });

  it("never carries a rating, even when handed a whole Game", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
    const game = { ...GAME, communityRating: 9.3, communityRatingCount: 5501 };

    expect(JSON.stringify(gameJsonLd(game))).not.toMatch(/rating|review/i);
  });
});

describe("jsonLdScript (AC-23)", () => {
  const hostile = {
    description: "</script><script>alert(1)</script>\u2028\u2029",
  };

  it("leaves no less than sign and no raw line terminator", () => {
    const body = jsonLdScript(hostile);

    expect(body).not.toContain("<");
    expect(body).not.toMatch(/[\u2028\u2029]/);
    expect(body).toContain("\\u003c/script>");
    expect(body).toContain("\\u2028\\u2029");
  });

  it("still parses back to the same data", () => {
    expect(JSON.parse(jsonLdScript(hostile))).toEqual(hostile);
  });
});
