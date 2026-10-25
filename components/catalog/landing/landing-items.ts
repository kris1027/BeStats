import { connection } from "next/server";

import type { CatalogList } from "@/lib/catalog/lists";
import {
  gameHref,
  type LibraryType,
  titleHref,
} from "@/lib/catalog/media-type";
import { isCatalogError } from "@/lib/catalog-errors";
import {
  readTaggedCatalogList,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";

/**
 * One title as every landing section draws it, whichever media type it is
 * (prompts/home-parallax-landing.md). The sections render posters, wide
 * cards and list rows from this alone, so none of them branches on the type
 * except to pick the status badge. A game joins in spec 0028: its cover is
 * the poster, its IGDB art the backdrop, and its rating is IGDB's.
 */
export type LandingItem = {
  mediaType: LibraryType;
  id: number;
  title: string;
  href: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** The community rating, always shown as its own catalog's (AGENTS.md §9). */
  rating: { source: "tmdb" | "igdb"; value: number | null };
  /**
   * A movie's or game's release date, for the card's release gate and the
   * Coming soon date; null for TV.
   */
  releaseDate: string | null;
  /** A show's first air year, the TV Upcoming card's label (decision 12). */
  year: number | null;
  genreIds: number[];
};

/**
 * One page of a landing list, read at request time (`connection()` before the
 * read), so the build asks TMDB nothing and passes with no token, as the old
 * rows did (spec 0021, AC-7). Every section asks the same cached call, so the
 * hero and the pinned row share one request for page 1. `page` exists only
 * for the Upcoming rows, whose rows 3 and 4 come from page 2
 * (prompts/home-parallax-landing.md, decision 13, amended 2026-10-18).
 *
 * A games list reads the same 24 game page its list page shows, so See all
 * costs nothing more either (spec 0028, AC-3).
 *
 * @returns The page, or null when TMDB or IGDB failed: the section shows its
 * own Try again and the rest of the landing renders (decision 16). Anything
 * else, an `IgdbValidationError` included, is a bug and is rethrown.
 */
export async function readLandingList(
  list: CatalogList,
  page = 1,
): Promise<TaggedCatalogPage | null> {
  await connection();
  try {
    return await readTaggedCatalogList(list, page);
  } catch (error) {
    if (!isCatalogError(error)) throw error;
    return null;
  }
}

/**
 * The titles from `start` up to `end`, as `LandingItem`s. The one place a
 * TV, movie and game result are told apart, so every section draws all
 * three from the same shape; the `href` comes from `titleHref`, the one
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
      rating: { source: "tmdb", value: show.tmdbRating },
      releaseDate: null,
      year: show.firstAirYear,
      genreIds: show.genreIds,
    }));
  }
  if (page.mediaType === "game") {
    return page.paged.results.slice(start, end).map((game) => ({
      mediaType: "game",
      id: game.id,
      title: game.name,
      href: gameHref(game.id),
      posterUrl: game.coverUrl,
      backdropUrl: game.artUrl,
      rating: { source: "igdb", value: game.communityRating },
      releaseDate: game.releaseDate,
      year: game.releaseYear,
      genreIds: game.genreIds,
    }));
  }
  return page.paged.results.slice(start, end).map((movie) => ({
    mediaType: "movie",
    id: movie.id,
    title: movie.title,
    href: titleHref("movie", movie.id),
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    rating: { source: "tmdb", value: movie.tmdbRating },
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

/**
 * Up to `count` titles of `page` that are not already in `seen`, in TMDB's
 * order. A list such as Upcoming shifts while it is read, so a title can sit
 * on both pages; skipping it here keeps a section from showing it twice
 * (decision 13, amended 2026-10-18). The limit applies after the skip, so
 * repeats never cost the page its share of the rows.
 */
export function newLandingItems(
  page: TaggedCatalogPage,
  seen: readonly number[],
  count: number,
): LandingItem[] {
  const skip = new Set(seen);
  return landingItems(page, 0, page.paged.results.length)
    .filter((item) => !skip.has(item.id))
    .slice(0, count);
}
