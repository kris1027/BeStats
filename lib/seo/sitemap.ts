import type { MetadataRoute } from "next";

/** The discover pages per media type the sitemap lists (spec 0016, AC-6). */
export const DISCOVER_PAGES_PER_TYPE = 10;

/**
 * The games the sitemap lists: the top of IGDB's Popular list, the same 200
 * as movies and shows each list (spec 0032, AC-6).
 */
export const GAME_SITEMAP_LIMIT = 200;

/**
 * The sitemap entries, in the order spec 0016, AC-6 fixes, amended by spec
 * 0017, AC-13, spec 0021, AC-16 and spec 0032, AC-6: the three landings, the
 * list pages at page 1, the two legal pages, then every movie, every show and
 * every game, each in page order then result order.
 *
 * Ids are deduplicated within each media type, first occurrence winning,
 * because popularity can shift a title across a page boundary between two
 * reads. A movie, a show and a game may share a number; their paths differ,
 * so all stay. Games are capped at `GAME_SITEMAP_LIMIT` after deduplication.
 * No `lastModified`, `changeFrequency` or `priority`: nothing here knows them
 * truthfully. Every entry is absolute, built from `origin`, never left
 * for `metadataBase` to resolve (`lib/seo/AGENTS.md`, the absolute URL rule).
 *
 * @param origin The site origin from `siteUrl()`.
 * @param listPaths The list pages' bare paths from the registry, movie lists
 * first, then show lists, then games lists, each group in row order; never a
 * `?page=N` variant (AC-16).
 * @param moviePages The ids of each discover page that loaded, in page order.
 * @param showPages As `moviePages`, for TV shows.
 * @param gameIds The ids of IGDB's Popular list in rank order, empty when
 * that read failed (AC-7).
 */
export function sitemapEntries(
  origin: string,
  listPaths: readonly string[],
  moviePages: number[][],
  showPages: number[][],
  gameIds: number[],
): MetadataRoute.Sitemap {
  return [
    `${origin}/movies`,
    `${origin}/shows`,
    `${origin}/games`,
    ...listPaths.map((path) => `${origin}${path}`),
    `${origin}/privacy`,
    `${origin}/terms`,
    ...uniqueIds(moviePages.flat()).map((id) => `${origin}/movies/${id}`),
    ...uniqueIds(showPages.flat()).map((id) => `${origin}/shows/${id}`),
    ...uniqueIds(gameIds)
      .slice(0, GAME_SITEMAP_LIMIT)
      .map((id) => `${origin}/games/${id}`),
  ].map((url) => ({ url }));
}

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}
