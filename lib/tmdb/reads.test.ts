import { afterEach, describe, expect, it } from "vitest";
import genresFixture from "./__fixtures__/genres-movie.json";
import { installFetchMock, restoreFetchMock } from "./__fixtures__/helpers";
import movieFixture from "./__fixtures__/movie-550.json";
import movieNoEnglishFixture from "./__fixtures__/movie-427311.json";
import searchFixture from "./__fixtures__/search-movie.json";
import season0Fixture from "./__fixtures__/season-1396-0.json";
import season1Fixture from "./__fixtures__/season-1396-1.json";
import tvFixture from "./__fixtures__/tv-1396.json";
import aggregateFixture from "./__fixtures__/tv-1396-aggregate-credits.json";
import { fetchMovieGenres } from "./genres";
import { BACKDROP_SIZE, POSTER_SIZE, PROFILE_SIZE, STILL_SIZE } from "./images";
import { fetchMovie } from "./movies";
import {
  fetchDiscoverMovies,
  fetchDiscoverTvShows,
  fetchSearchMovies,
  fetchSearchTvShows,
} from "./search";
import { fetchSeason, fetchShowCast, fetchTvShow } from "./tv";

/**
 * Normalization against real TMDB payloads captured from the live API.
 *
 * These fixtures are a snapshot: they drift as TMDB changes, and the opt in
 * live check (`pnpm tmdb:live`) is what notices. What they lock down here is
 * the contract every page depends on, above all that missing data stays missing
 * (spec 0002, AC-13).
 */

afterEach(restoreFetchMock);

describe("fetchMovie", () => {
  it("normalizes a movie in exactly one request, with credits and translations appended", async () => {
    const fetchMock = installFetchMock([{ body: movieFixture }]);

    const movie = await fetchMovie(550);

    expect(fetchMock.attempts).toBe(1);
    expect(fetchMock.url().pathname).toBe("/3/movie/550");
    expect(fetchMock.url().searchParams.get("append_to_response")).toBe(
      "credits,translations",
    );
    expect(movie.title).toBe("Fight Club");
    expect(movie.releaseDate).toBe("1999-10-15");
    expect(movie.releaseYear).toBe(1999);
    expect(movie.runtimeMinutes).toBe(139);
    expect(movie.tmdbRating).toBeGreaterThan(8);
    expect(movie.tmdbVoteCount).toBeGreaterThan(0);
    expect(movie.genres.map((genre) => genre.name)).toContain("Drama");
    expect(movie.cast[0]?.name).toBe("Edward Norton");
    expect(movie.cast[0]?.order).toBe(0);
  });

  it("builds every image URL with its pinned default size", async () => {
    installFetchMock([{ body: movieFixture }]);

    const movie = await fetchMovie(550);

    expect(movie.posterUrl).toContain(`/t/p/${POSTER_SIZE}/`);
    expect(movie.backdropUrl).toContain(`/t/p/${BACKDROP_SIZE}/`);
    expect(movie.cast[0]?.profileUrl).toContain(`/t/p/${PROFILE_SIZE}/`);
    expect(POSTER_SIZE).toBe("w500");
    expect(BACKDROP_SIZE).toBe("w1280");
    expect(PROFILE_SIZE).toBe("w185");
  });

  it("reports missing metadata as null, never as zero or empty text", async () => {
    installFetchMock([
      {
        body: {
          ...movieFixture,
          poster_path: null,
          backdrop_path: null,
          overview: "",
          tagline: "   ",
          runtime: 0,
          vote_average: 0,
          vote_count: 0,
          release_date: "",
          genres: [],
          credits: { cast: [] },
          translations: { translations: [] },
        },
      },
    ]);

    const movie = await fetchMovie(550);

    expect(movie.posterUrl).toBeNull();
    expect(movie.backdropUrl).toBeNull();
    expect(movie.overview).toBeNull();
    expect(movie.tagline).toBeNull();
    expect(movie.runtimeMinutes).toBeNull();
    expect(movie.tmdbRating).toBeNull();
    expect(movie.tmdbVoteCount).toBe(0);
    expect(movie.releaseDate).toBeNull();
    expect(movie.releaseYear).toBeNull();
    expect(movie.cast).toEqual([]);
  });

  it("drops one malformed credit and keeps the rest of the cast", async () => {
    const cast = movieFixture.credits.cast;
    installFetchMock([
      {
        body: {
          ...movieFixture,
          credits: { cast: [{ nonsense: true }, ...cast] },
        },
      },
    ]);

    const movie = await fetchMovie(550);

    expect(movie.cast).toHaveLength(cast.length);
    expect(movie.cast[0]?.name).toBe("Edward Norton");
  });

  it("keeps an English overview and marks it as English · covers spec 0006 AC-5", async () => {
    installFetchMock([{ body: movieFixture }]);

    const movie = await fetchMovie(550);

    expect(movie.overview).toMatch(/^A ticking-time-bomb insomniac/);
    expect(movie.overviewLanguage).toBe("en");
  });

  it("falls back to the original language overview when English is empty · covers spec 0006 AC-5", async () => {
    installFetchMock([{ body: movieNoEnglishFixture }]);

    const movie = await fetchMovie(427311);

    expect(movieNoEnglishFixture.overview).toBe("");
    expect(movie.overview).toMatch(/^Pendant quatre ans/);
    expect(movie.overviewLanguage).toBe("fr");
  });

  it("never falls back to a language other than the original · covers spec 0006 AC-5", async () => {
    installFetchMock([
      {
        body: {
          ...movieNoEnglishFixture,
          translations: {
            translations: [
              { iso_639_1: "de", data: { overview: "Ein deutscher Text." } },
              { iso_639_1: "fr", data: { overview: "   " } },
            ],
          },
        },
      },
    ]);

    const movie = await fetchMovie(427311);

    expect(movie.overview).toBeNull();
    expect(movie.overviewLanguage).toBeNull();
  });

  it("drops a malformed translation without failing the read · covers spec 0006 AC-5", async () => {
    const translations = movieNoEnglishFixture.translations.translations;
    installFetchMock([
      {
        body: {
          ...movieNoEnglishFixture,
          translations: {
            translations: [{ iso_639_1: 42 }, "nonsense", ...translations],
          },
        },
      },
    ]);

    const movie = await fetchMovie(427311);

    expect(movie.overviewLanguage).toBe("fr");
    expect(movie.overview).toMatch(/^Pendant quatre ans/);
  });

  it("reads the adult flag, treating a missing flag as false · covers spec 0006 AC-9", async () => {
    installFetchMock([
      { body: { ...movieFixture, adult: true } },
      { body: { ...movieFixture, adult: undefined } },
    ]);

    expect((await fetchMovie(550)).adult).toBe(true);
    expect((await fetchMovie(550)).adult).toBe(false);
  });

  it("raises bad_response when the title is missing, returning nothing partial", async () => {
    installFetchMock([{ body: { ...movieFixture, title: undefined } }]);

    const error = await fetchMovie(550).catch((e) => e);

    expect(error.kind).toBe("bad_response");
  });

  it("rejects an id that is not a positive integer before building a URL", async () => {
    const fetchMock = installFetchMock([{ body: movieFixture }]);

    const error = await fetchMovie(-1).catch((e) => e);

    expect(error.kind).toBe("bad_response");
    expect(fetchMock.attempts).toBe(0);
  });
});

describe("fetchTvShow", () => {
  it("normalizes a show, its status and its native season summaries", async () => {
    const fetchMock = installFetchMock([{ body: tvFixture }]);

    const show = await fetchTvShow(1396);

    expect(fetchMock.url().pathname).toBe("/3/tv/1396");
    expect(show.name).toBe("Breaking Bad");
    expect(show.firstAirYear).toBe(2008);
    // Reported verbatim; scope feature 16 decides what it means.
    expect(show.status).toBe("Ended");
    expect(show.seasons.map((season) => season.seasonNumber)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(
      show.seasons.find((season) => season.seasonNumber === 0)?.isSpecials,
    ).toBe(true);
    expect(
      show.seasons.find((season) => season.seasonNumber === 1)?.isSpecials,
    ).toBe(false);
  });

  /** covers: spec 0009, AC-6, AC-20 */
  it("appends translations, not credits, still in one request", async () => {
    const fetchMock = installFetchMock([{ body: tvFixture }]);

    const show = await fetchTvShow(1396);

    expect(fetchMock.attempts).toBe(1);
    expect(fetchMock.url().searchParams.get("append_to_response")).toBe(
      "translations",
    );
    expect(show).not.toHaveProperty("cast");
    expect(show.adult).toBe(false);
    expect(show.tagline).toBe("Change the equation.");
    expect(show.originalLanguage).toBe("en");
    expect(show.lastAirYear).toBe(2013);
    expect(show.overview).toMatch(/^Walter White/);
    expect(show.overviewLanguage).toBe("en");
  });

  /** covers: spec 0009, AC-6 */
  it("falls back to the original language overview, and says which", async () => {
    installFetchMock([
      {
        body: {
          ...tvFixture,
          overview: "",
          original_language: "es",
        },
      },
    ]);

    const show = await fetchTvShow(1396);

    expect(show.overviewLanguage).toBe("es");
    expect(show.overview).toMatch(/^Un profesor de química/);
  });

  /** covers: spec 0009, AC-5 */
  it("leaves every missing show value missing", async () => {
    installFetchMock([
      {
        body: {
          ...tvFixture,
          adult: undefined,
          tagline: "",
          overview: "",
          last_air_date: null,
          translations: { translations: [] },
        },
      },
    ]);

    const show = await fetchTvShow(1396);

    expect(show.adult).toBe(false);
    expect(show.tagline).toBeNull();
    expect(show.overview).toBeNull();
    expect(show.overviewLanguage).toBeNull();
    expect(show.lastAirYear).toBeNull();
  });
});

/** covers: spec 0009, AC-8 */
describe("fetchShowCast", () => {
  it("reads the aggregate credits and keeps the most episodes first, capped at 12", async () => {
    const fetchMock = installFetchMock([{ body: aggregateFixture }]);

    const cast = await fetchShowCast(1396);

    expect(fetchMock.attempts).toBe(1);
    expect(fetchMock.url().pathname).toBe("/3/tv/1396/aggregate_credits");
    expect(cast).toHaveLength(12);
    expect(cast[0]).toMatchObject({
      personId: 17419,
      name: "Bryan Cranston",
      character: "Walter White",
      creditId: "52542282760ee313280017f9",
    });
    expect(cast[0]?.profileUrl).toContain(`/t/p/${PROFILE_SIZE}/`);
  });

  it("sorts by total episodes, then TMDB's order, even when TMDB lists them out of order", async () => {
    installFetchMock([
      {
        body: {
          ...aggregateFixture,
          cast: [...aggregateFixture.cast].reverse(),
        },
      },
    ]);

    const cast = await fetchShowCast(1396);

    // Six people share 62 episodes; TMDB's order settles them.
    expect(cast.slice(0, 7).map((member) => member.name)).toEqual([
      "Bryan Cranston",
      "Aaron Paul",
      "Anna Gunn",
      "RJ Mitte",
      "Dean Norris",
      "Betsy Brandt",
      "Bob Odenkirk",
    ]);
    // Steven Michael Quezada (33) outranks Giancarlo Esposito (28) despite
    // Esposito's lower order, because episode count comes first.
    const names = cast.map((member) => member.name);
    expect(names.indexOf("Steven Michael Quezada")).toBeLessThan(
      names.indexOf("Giancarlo Esposito"),
    );
  });

  it("picks the role with the most episodes, the first on a tie", async () => {
    const tina = aggregateFixture.cast.find((p) => p.name === "Tina Parker");
    installFetchMock([
      {
        body: {
          cast: [
            tina,
            {
              ...tina,
              id: 1,
              name: "Tied",
              roles: [
                { credit_id: "a", character: "First", episode_count: 2 },
                { credit_id: "b", character: "Second", episode_count: 2 },
              ],
            },
          ],
        },
      },
    ]);

    const cast = await fetchShowCast(1396);

    expect(cast.find((m) => m.name === "Tina Parker")?.character).toBe(
      "Francesca",
    );
    expect(cast.find((m) => m.name === "Tied")).toMatchObject({
      character: "First",
      creditId: "a",
    });
  });

  it("drops a malformed person, or one with no role, and keeps the rest", async () => {
    installFetchMock([
      {
        body: {
          cast: [
            { nonsense: true },
            { ...aggregateFixture.cast[0], id: 2, roles: [] },
            aggregateFixture.cast[1],
          ],
        },
      },
    ]);

    const cast = await fetchShowCast(1396);

    expect(cast.map((member) => member.name)).toEqual(["Aaron Paul"]);
  });

  it("returns an empty cast when TMDB lists nobody", async () => {
    installFetchMock([{ body: { id: 1396, cast: [], crew: [] } }]);

    expect(await fetchShowCast(1396)).toEqual([]);
  });
});

describe("fetchSeason", () => {
  it("returns the four identity values every episode row stores", async () => {
    installFetchMock([{ body: season1Fixture }]);

    const season = await fetchSeason(1396, 1);

    expect(season.episodes).toHaveLength(7);
    for (const episode of season.episodes) {
      expect(typeof episode.id).toBe("number");
      // Injected from the argument: TMDB's season payload omits it.
      expect(episode.showId).toBe(1396);
      expect(episode.seasonNumber).toBe(1);
      expect(typeof episode.episodeNumber).toBe("number");
    }
    expect(season.episodes[0]?.name).toBe("Pilot");
    expect(season.episodes[0]?.airDate).toBe("2008-01-20");
    expect(season.episodes[0]?.stillUrl).toContain(`/t/p/${STILL_SIZE}/`);
  });

  it("reads season 0 normally, and the summary marks it as specials", async () => {
    installFetchMock([{ body: season0Fixture }]);

    const specials = await fetchSeason(1396, 0);

    expect(specials.seasonNumber).toBe(0);
    expect(specials.episodes.length).toBeGreaterThan(0);
    expect(
      specials.episodes.every((episode) => episode.seasonNumber === 0),
    ).toBe(true);
  });

  it("keeps an episode with no air date, and never coerces the date", async () => {
    const episodes = season1Fixture.episodes.map((episode, index) =>
      index === 0 ? { ...episode, air_date: null } : episode,
    );
    installFetchMock([{ body: { ...season1Fixture, episodes } }]);

    const season = await fetchSeason(1396, 1);

    expect(season.episodes).toHaveLength(7);
    expect(season.episodes[0]?.airDate).toBeNull();
  });

  it("keeps an episode missing only its name, so the count stays right", async () => {
    const episodes = season1Fixture.episodes.map((episode, index) =>
      index === 2 ? { ...episode, name: null } : episode,
    );
    installFetchMock([{ body: { ...season1Fixture, episodes } }]);

    const season = await fetchSeason(1396, 1);

    expect(season.episodes).toHaveLength(7);
    expect(season.episodes[2]?.name).toBeNull();
    expect(season.episodes[2]?.id).toBeGreaterThan(0);
  });

  it("raises bad_response when an episode is missing its identity", async () => {
    const episodes = season1Fixture.episodes.map((episode, index) =>
      index === 2 ? { ...episode, id: undefined } : episode,
    );
    installFetchMock([{ body: { ...season1Fixture, episodes } }]);

    const error = await fetchSeason(1396, 1).catch((e) => e);

    expect(error.kind).toBe("bad_response");
  });
});

describe("search and discover", () => {
  it("sends include_adult=false and returns TMDB's own pagination", async () => {
    const fetchMock = installFetchMock([{ body: searchFixture }]);

    const page = await fetchSearchMovies("fight club");

    expect(fetchMock.url().pathname).toBe("/3/search/movie");
    expect(fetchMock.url().searchParams.get("query")).toBe("fight club");
    expect(fetchMock.url().searchParams.get("include_adult")).toBe("false");
    expect(page.page).toBe(searchFixture.page);
    expect(page.totalPages).toBe(searchFixture.total_pages);
    expect(page.totalResults).toBe(searchFixture.total_results);
    expect(page.results[0]?.title).toBe("Fight Club");
  });

  it("rejects an empty query before making a request", async () => {
    const fetchMock = installFetchMock([{ body: searchFixture }]);

    const error = await fetchSearchMovies("   ").catch((e) => e);

    expect(error.kind).toBe("bad_response");
    expect(fetchMock.attempts).toBe(0);
  });

  it("rejects a page that is not a positive integer", async () => {
    const fetchMock = installFetchMock([{ body: searchFixture }]);

    const error = await fetchSearchMovies("fight club", { page: 0 }).catch(
      (e) => e,
    );

    expect(error.kind).toBe("bad_response");
    expect(fetchMock.attempts).toBe(0);
  });

  it("maps movie discovery filters to TMDB's parameter names", async () => {
    const fetchMock = installFetchMock([{ body: searchFixture }]);

    await fetchDiscoverMovies({
      genreIds: [18, 53],
      year: 1999,
      minRating: 7.5,
      page: 2,
    });

    const params = fetchMock.url().searchParams;
    expect(fetchMock.url().pathname).toBe("/3/discover/movie");
    expect(params.get("with_genres")).toBe("18,53");
    expect(params.get("primary_release_year")).toBe("1999");
    expect(params.get("vote_average.gte")).toBe("7.5");
    expect(params.get("include_adult")).toBe("false");
    expect(params.get("page")).toBe("2");
  });

  it("uses the first air year for TV discovery", async () => {
    const fetchMock = installFetchMock([
      { body: { page: 1, results: [], total_pages: 0, total_results: 0 } },
    ]);

    await fetchDiscoverTvShows({ year: 2008, genreIds: [18] });

    const params = fetchMock.url().searchParams;
    expect(fetchMock.url().pathname).toBe("/3/discover/tv");
    expect(params.get("first_air_date_year")).toBe("2008");
    expect(params.has("primary_release_year")).toBe(false);
  });
});

describe("genre ids and the vote floor (spec 0010, AC-23)", () => {
  it("normalizes a search result's genre_ids to genreIds", async () => {
    installFetchMock([{ body: searchFixture }]);

    const page = await fetchSearchMovies("fight club");

    expect(page.results[0]?.genreIds).toEqual(
      searchFixture.results[0].genre_ids,
    );
  });

  it("reads missing genre_ids as an empty list, never a guess", async () => {
    installFetchMock([
      {
        body: {
          page: 1,
          results: [
            { id: 1, name: "No genres", genre_ids: null },
            { id: 2, name: "Absent" },
          ],
          total_pages: 1,
          total_results: 2,
        },
      },
    ]);

    const page = await fetchSearchTvShows("genres");

    expect(page.results.map((show) => show.genreIds)).toEqual([[], []]);
  });

  it("takes a detail read's genre ids from its genres list", async () => {
    installFetchMock([{ body: movieFixture }]);

    const movie = await fetchMovie(550);

    expect(movie.genreIds).toEqual(
      movieFixture.genres.map((genre) => genre.id),
    );
  });

  it("sends several genres as a comma list, which TMDB reads as all of them", async () => {
    const fetchMock = installFetchMock([
      { body: { page: 1, results: [], total_pages: 0, total_results: 0 } },
    ]);

    await fetchDiscoverTvShows({ genreIds: [18, 35] });

    expect(fetchMock.url().searchParams.get("with_genres")).toBe("18,35");
  });

  it("sends minVoteCount as vote_count.gte, and nothing when it is unset", async () => {
    const fetchMock = installFetchMock([
      { body: { page: 1, results: [], total_pages: 0, total_results: 0 } },
      { body: { page: 1, results: [], total_pages: 0, total_results: 0 } },
    ]);

    await fetchDiscoverMovies({ minRating: 7, minVoteCount: 100 });
    expect(fetchMock.url().searchParams.get("vote_count.gte")).toBe("100");

    await fetchDiscoverMovies({});
    expect(fetchMock.url(1).searchParams.has("vote_count.gte")).toBe(false);
  });
});

describe("genre lists", () => {
  it("returns TMDB's genres unchanged", async () => {
    const fetchMock = installFetchMock([{ body: genresFixture }]);

    const genres = await fetchMovieGenres();

    expect(fetchMock.url().pathname).toBe("/3/genre/movie/list");
    expect(genres.length).toBeGreaterThan(0);
    expect(genres[0]).toEqual({
      id: genresFixture.genres[0].id,
      name: genresFixture.genres[0].name,
    });
  });
});
