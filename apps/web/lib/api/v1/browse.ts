import "server-only";

import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { MovieSummary, TvShowSummary } from "@bestats/core/tmdb/types";

import { type GameSummary, IgdbError } from "@/lib/igdb";
import type { SearchResult } from "@/lib/search/read";
import { TmdbError } from "@/lib/tmdb";

import { type V1Failure, v1Fail } from "./with-v1";

/**
 * The one browse item every v1 page returns (spec 0035): what the web's
 * poster card shows of a title, from whichever catalog read produced it.
 * Fields are passed through from the shared normalizers, never invented
 * (AGENTS.md section 14).
 */
export function itemFromMovie(movie: MovieSummary): V1CatalogItem {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.releaseYear,
    releaseDate: movie.releaseDate,
    posterUrl: movie.posterUrl,
    communityRating: movie.tmdbRating,
  };
}

/** As `itemFromMovie`, for a show: its name and first air day. */
export function itemFromShow(show: TvShowSummary): V1CatalogItem {
  return {
    id: show.id,
    title: show.name,
    year: show.firstAirYear,
    releaseDate: show.firstAirDate,
    posterUrl: show.posterUrl,
    communityRating: show.tmdbRating,
  };
}

/** As `itemFromMovie`, for a game: its cover and IGDB's rating. */
export function itemFromGame(game: GameSummary): V1CatalogItem {
  return {
    id: game.id,
    title: game.name,
    year: game.releaseYear,
    releaseDate: game.releaseDate,
    posterUrl: game.coverUrl,
    communityRating: game.communityRating,
  };
}

/**
 * A search result in the shared shape. Search reduces both TMDB catalogs to
 * `SearchResult`, which keeps a movie's release day but not a show's first
 * air day, so a show's `releaseDate` is null here rather than guessed.
 */
export function itemFromSearchResult(result: SearchResult): V1CatalogItem {
  return {
    id: result.id,
    title: result.title,
    year: result.year,
    releaseDate: result.releaseDate,
    posterUrl: result.posterUrl,
    communityRating: result.tmdbRating,
  };
}

/**
 * A catalog failure as a v1 refusal: 502 `catalog_unavailable` for a
 * `TmdbError` or `IgdbError`, which `withV1` answers with `no-store`, so an
 * outage is never cached. Anything else is a bug and is thrown again, which
 * `withV1` answers with 500.
 */
export function catalogFailure(error: unknown): V1Failure {
  if (error instanceof TmdbError || error instanceof IgdbError) {
    return v1Fail("catalog_unavailable");
  }
  throw error;
}
