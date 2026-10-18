import { connection } from "next/server";

import type { CatalogList } from "@/lib/catalog/lists";
import { type MediaType, titleHref } from "@/lib/catalog/media-type";
import {
  readTaggedCatalogList,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";
import { TmdbError } from "@/lib/tmdb";

/**
 * One title as every landing section draws it, whichever media type it is
 * (prompts/home-parallax-landing.md). The sections render posters, wide
 * cards and list rows from this alone, so none of them branches on the type
 * except to pick the status badge.
 */
export type LandingItem = {
  mediaType: MediaType;
  id: number;
  title: string;
  href: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  tmdbRating: number | null;
  /** A movie's release date, for the card's release gate; null for TV. */
  releaseDate: string | null;
  /** A show's first air year, the TV Upcoming card's label (decision 12). */
  year: number | null;
  genreIds: number[];
};

/**
 * One page of a landing list, page 1 unless asked, read at request time (`connection()` before the
 * read), so the build asks TMDB nothing and passes with no token, as the old
 * rows did (spec 0021, AC-7). Every section asks the same cached call, so the
 * hero and the pinned row share one request.
 *
 * @returns The page, or null when TMDB failed: the section shows its own
 * Try again and the rest of the landing renders (decision 16). Anything other
 * than a `TmdbError` is a bug and is rethrown.
 */
export async function readLandingList(
  list: CatalogList,
  page = 1,
): Promise<TaggedCatalogPage | null> {
  await connection();
  try {
    return await readTaggedCatalogList(list, page);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return null;
  }
}

/**
 * The titles from `start` up to `end`, as `LandingItem`s. The one place a
 * TV result and a movie result are told apart, so every section draws both
 * catalogs from the same shape; the `href` comes from `titleHref`, the one
 * title URL builder (prompts/landing-review-fixes.md, decision 1).
 */
export function landingItems(
  page: TaggedCatalogPage,
  start: number,
  end: number,
): LandingItem[] {
  if (page.mediaType === "tv") {
    return page.paged.results.slice(start, end).map((show) => ({
      mediaType: "tv",
      id: show.id,
      title: show.name,
      href: titleHref("tv", show.id),
      posterUrl: show.posterUrl,
      backdropUrl: show.backdropUrl,
      tmdbRating: show.tmdbRating,
      releaseDate: null,
      year: show.firstAirYear,
      genreIds: show.genreIds,
    }));
  }
  return page.paged.results.slice(start, end).map((movie) => ({
    mediaType: "movie",
    id: movie.id,
    title: movie.title,
    href: titleHref("movie", movie.id),
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    tmdbRating: movie.tmdbRating,
    releaseDate: movie.releaseDate,
    year: movie.releaseYear,
    genreIds: movie.genreIds,
  }));
}

/**
 * Every id a section renders. The badge and control slots key their one
 * session read on this array, so a section passes the same `ids` to every
 * card and the whole section costs one read, not one per card
 * (prompts/catalog-card-status.md).
 */
export function itemIds(items: readonly LandingItem[]): number[] {
  return items.map((item) => item.id);
}
