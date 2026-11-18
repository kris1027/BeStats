import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tmdbRequest } from "./client";
import { fetchMovieGenres } from "./genres";
import { fetchMovie } from "./movies";
import { movieSummarySchema, pagedSchema } from "./schemas";
import {
  fetchDiscoverMovies,
  fetchSearchMovies,
  fetchSearchTvShows,
} from "./search";
import { fetchShowEpisodes } from "./show-episodes";
import { fetchSeason, fetchShowCast, fetchTvShow } from "./tv";

/**
 * LIVE CHECK. This file talks to the real TMDB API.
 *
 * It exists to notice drift the committed fixtures cannot: a field TMDB stops
 * sending, a rename, a shape change. It is not part of `pnpm test` and its
 * passing is never evidence that the fixture suite passed, or the other way
 * round (spec 0002, AC-24).
 *
 * Run: `pnpm tmdb:live`. With no token it skips rather than fails, because an
 * environment without a credential is a normal environment here.
 */

/**
 * Reads the token from the environment, falling back to `.env.local`.
 *
 * Vitest does not load `.env.local` into `process.env` the way `next dev` does,
 * and asking someone to export the variable by hand before running one check is
 * the kind of friction that stops a check from ever being run.
 */
function loadToken(): string | null {
  if (process.env.TMDB_READ_ACCESS_TOKEN) {
    return process.env.TMDB_READ_ACCESS_TOKEN;
  }
  try {
    const file = readFileSync(".env.local", "utf8");
    const line = file
      .split("\n")
      .find((entry) => entry.startsWith("TMDB_READ_ACCESS_TOKEN="));
    const value = line?.slice("TMDB_READ_ACCESS_TOKEN=".length).trim();
    if (value) {
      process.env.TMDB_READ_ACCESS_TOKEN = value;
      return value;
    }
  } catch {
    // No .env.local is a normal state, for example in CI.
  }
  return null;
}

const hasToken = loadToken() !== null;

describe.skipIf(!hasToken)("TMDB live check (real network)", () => {
  it("reads a known movie and still parses it", async () => {
    const movie = await fetchMovie(550);
    expect(movie.title).toBe("Fight Club");
    expect(movie.releaseYear).toBe(1999);
    expect(movie.cast.length).toBeGreaterThan(0);
    expect(movie.posterUrl).toContain("image.tmdb.org");
  });

  it("reads a known show and its season summaries", async () => {
    const show = await fetchTvShow(1396);
    expect(show.name).toBe("Breaking Bad");
    expect(show.status.length).toBeGreaterThan(0);
    expect(show.seasons.some((season) => season.isSpecials)).toBe(true);
    expect(show.overviewLanguage).toBe("en");
    expect(show.lastAirYear).toBe(2013);
  });

  it("reads a known show's series cast from aggregate credits", async () => {
    const cast = await fetchShowCast(1396);
    expect(cast.length).toBe(12);
    expect(cast[0].name).toBe("Bryan Cranston");
    expect(cast[0].character).toBe("Walter White");
  });

  it("reads a known season, including its specials", async () => {
    const season = await fetchSeason(1396, 1);
    expect(season.episodes.length).toBeGreaterThan(0);
    expect(season.episodes[0].showId).toBe(1396);

    const specials = await fetchSeason(1396, 0);
    expect(specials.seasonNumber).toBe(0);
  });

  it("reads every regular episode of a known show completely", async () => {
    const all = await fetchShowEpisodes(1396);
    expect(all.complete).toBe(true);
    expect(all.episodes.length).toBeGreaterThan(50);
    expect(all.episodes.every((episode) => episode.seasonNumber > 0)).toBe(
      true,
    );
  });

  it("searches and reads a genre list", async () => {
    const page = await fetchSearchMovies("fight club");
    expect(page.results.length).toBeGreaterThan(0);
    expect(page.totalResults).toBeGreaterThan(0);

    const genres = await fetchMovieGenres();
    expect(genres.length).toBeGreaterThan(0);
  });

  // Spec 0010 filters a search locally because `/search/movie` ignores
  // `with_genres`. If TMDB ever starts honouring it, this fails, so the local
  // scan can be revisited rather than silently doubling up (AC-23).
  it("ignores with_genres on /search/movie", async () => {
    const schema = pagedSchema(movieSummarySchema);
    const plain = await tmdbRequest(
      "/search/movie",
      { query: "dune", include_adult: false },
      schema,
    );
    // 10402 is Music, which no Dune film carries.
    const withGenre = await tmdbRequest(
      "/search/movie",
      { query: "dune", include_adult: false, with_genres: "10402" },
      schema,
    );
    expect(withGenre.total_results).toBe(plain.total_results);
    expect(withGenre.results.map((movie) => movie.id)).toEqual(
      plain.results.map((movie) => movie.id),
    );
  });

  // The count caps `formatResultCount` words as `10,000+` and `20,000+`
  // (spec 0010, AC-3), observed on 2026-09-24.
  it("still caps search totals at 10,000 and discover totals at 20,001", async () => {
    const search = await fetchSearchTvShows("the");
    expect(search.totalResults).toBe(10_000);

    const discover = await fetchDiscoverMovies();
    expect(discover.totalResults).toBe(20_001);
  });
});

describe.skipIf(hasToken)("TMDB live check", () => {
  it("skips without a token, which is not a failure", () => {
    expect(hasToken).toBe(false);
  });
});
