import type { MetadataRoute } from "next";

/** The discover pages per media type the sitemap lists (spec 0016, AC-6). */
export const DISCOVER_PAGES_PER_TYPE = 10;

/**
 * The sitemap entries, in the order spec 0016, AC-6 fixes, amended by spec
 * 0017, AC-13 and spec 0021, AC-16: the two landings, the ten list pages at
 * page 1, the two legal pages, then every movie, then every show, each in
 * page order then result order.
 *
 * Ids are deduplicated within each media type, first occurrence winning,
 * because popularity can shift a title across a page boundary between two
 * reads. A movie and a show may share a number; their paths differ, so both
 * stay. No `lastModified`, `changeFrequency` or `priority`: nothing here knows
 * them truthfully. Every entry is absolute, built from `origin`, never left
 * for `metadataBase` to resolve (`lib/seo/AGENTS.md`, the absolute URL rule).
 *
 * @param origin The site origin from `siteUrl()`.
 * @param listPaths The list pages' bare paths from the registry, movie lists
 * first, each group in row order; never a `?page=N` variant (AC-16).
 * @param moviePages The ids of each discover page that loaded, in page order.
 * @param showPages As `moviePages`, for TV shows.
 */
export function sitemapEntries(
  origin: string,
  listPaths: readonly string[],
  moviePages: number[][],
  showPages: number[][],
): MetadataRoute.Sitemap {
  return [
    `${origin}/movies`,
    `${origin}/shows`,
    ...listPaths.map((path) => `${origin}${path}`),
    `${origin}/privacy`,
    `${origin}/terms`,
    ...uniqueIds(moviePages).map((id) => `${origin}/movies/${id}`),
    ...uniqueIds(showPages).map((id) => `${origin}/shows/${id}`),
  ].map((url) => ({ url }));
}

function uniqueIds(pages: number[][]): number[] {
  return [...new Set(pages.flat())];
}
