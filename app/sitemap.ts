import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { isIndexableDeployment, siteUrl } from "@/lib/seo/site";
import { SITEMAP_PAGES, sitemapEntries } from "@/lib/seo/sitemap";
import { discoverMovies, discoverTvShows, TmdbError } from "@/lib/tmdb";

/**
 * `/sitemap.xml` (spec 0016, AC-6 to AC-9): the two landings plus the 200 most
 * popular movies and 200 most popular shows, all pages a signed out visitor
 * can open from a landing.
 *
 * A deployment that is not indexable answers an empty `urlset` and asks TMDB
 * nothing. Prerendered, so the build decides which branch it is.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  if (!isIndexableDeployment() || origin === null) return [];

  const { moviePages, showPages } = await popularTitleIds();
  return sitemapEntries(origin, moviePages, showPages);
}

/**
 * The ids on discover pages 1 to 10 for each media type, read with exactly the
 * calls the `/movies` and `/shows` landings make, so they share cache entries
 * and every listed title is linked from a public page (spec 0016, AC-6, AC-8).
 *
 * The 20 reads settle independently: a `TmdbError` drops only its own page,
 * so a TMDB hiccup shrinks the list instead of failing the file. Any other
 * rejection is a bug and is rethrown. A complete list lives for days; a
 * partial one for minutes, so the full list returns soon after TMDB recovers.
 * Only plain id arrays leave this scope (`AGENTS.md`, the cached scope rule).
 */
async function popularTitleIds(): Promise<{
  moviePages: number[][];
  showPages: number[][];
}> {
  "use cache";
  const pages = Array.from({ length: SITEMAP_PAGES }, (_, index) => index + 1);
  const settled = await Promise.allSettled([
    ...pages.map((page) => discoverMovies({ page })),
    ...pages.map((page) => discoverTvShows({ page })),
  ]);

  const idPages: number[][] = [];
  let failed = false;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      idPages.push(result.value.results.map((title) => title.id));
    } else if (result.reason instanceof TmdbError) {
      failed = true;
      idPages.push([]);
    } else {
      throw result.reason;
    }
  }

  if (failed) {
    cacheLife("minutes");
  } else {
    cacheLife("days");
  }

  return {
    moviePages: idPages.slice(0, SITEMAP_PAGES),
    showPages: idPages.slice(SITEMAP_PAGES),
  };
}
