import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchMovieGenres } from "./genres";
import { fetchMovie } from "./movies";
import { fetchSearchMovies } from "./search";
import { fetchShowEpisodes } from "./show-episodes";
import { fetchSeason, fetchTvShow } from "./tv";

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
});

describe.skipIf(hasToken)("TMDB live check", () => {
  it("skips without a token, which is not a failure", () => {
    expect(hasToken).toBe(false);
  });
});
