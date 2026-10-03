import type { MetadataRoute } from "next";

/** The discover pages per media type the sitemap lists (spec 0016, AC-6). */
export const DISCOVER_PAGES_PER_TYPE = 10;

/**
 * The sitemap entries, in the order spec 0016, AC-6 fixes: the two landings,
 * then every movie, then every show, each in page order then result order.
 *
 * Ids are deduplicated within each media type, first occurrence winning,
 * because popularity can shift a title across a page boundary between two
 * reads. A movie and a show may share a number; their paths differ, so both
 * stay. No `lastModified`, `changeFrequency` or `priority`: nothing here knows
 * them truthfully. Every entry is absolute, built from `origin`, never left
 * for `metadataBase` to resolve (`lib/seo/AGENTS.md`, the absolute URL rule).
 *
 * @param origin The site origin from `siteUrl()`.
 * @param moviePages The ids of each discover page that loaded, in page order.
 * @param showPages As `moviePages`, for TV shows.
 */
export function sitemapEntries(
  origin: string,
  moviePages: number[][],
  showPages: number[][],
): MetadataRoute.Sitemap {
  return [
    `${origin}/movies`,
    `${origin}/shows`,
    ...uniqueIds(moviePages).map((id) => `${origin}/movies/${id}`),
    ...uniqueIds(showPages).map((id) => `${origin}/shows/${id}`),
  ].map((url) => ({ url }));
}

function uniqueIds(pages: number[][]): number[] {
  return [...new Set(pages.flat())];
}
