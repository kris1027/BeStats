import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { POPULAR_GAME_LISTS } from "@/lib/catalog/game-lists";
import { catalogListsFor, listPath } from "@/lib/catalog/lists";
import { getPopularGames, IgdbError } from "@/lib/igdb";
import { isIndexableDeployment, siteUrl } from "@/lib/seo/site";
import { DISCOVER_PAGES_PER_TYPE, sitemapEntries } from "@/lib/seo/sitemap";
import { discoverMovies, discoverTvShows, TmdbError } from "@/lib/tmdb";

/**
 * `/sitemap.xml` (spec 0016, AC-6 to AC-9): the three landings, every list
 * page (spec 0021, AC-16; spec 0032, AC-6), the two legal pages (spec 0017,
 * AC-13), then the 200 most popular movies, shows and games, all pages a
 * signed out visitor can open from a landing.
 *
 * A deployment that is not indexable answers an empty `urlset` and asks TMDB
 * and IGDB nothing. Prerendered, so the build decides which branch it is, and it reads
 * no request state, so nothing user specific can reach it (`lib/seo/AGENTS.md`,
 * the prerendered routes and request state rules).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  if (!isIndexableDeployment() || origin === null) return [];

  const { moviePages, showPages, gameIds } = await popularTitleIds();
  return sitemapEntries(origin, LIST_PATHS, moviePages, showPages, gameIds);
}

/**
 * Every list page at page 1, movie lists first, then show lists, then games
 * lists, each in row order (spec 0021, AC-16; spec 0032, AC-6). From the
 * registry, so a new list is listed with no change here.
 */
const LIST_PATHS = [
  ...catalogListsFor("movie"),
  ...catalogListsFor("tv"),
  ...catalogListsFor("game"),
].map(listPath);

/**
 * The ids on discover pages 1 to 10 for each media type, read with exactly the
 * calls `/movies/popular` and `/shows/popular` make, so they share cache
 * entries and every listed title is linked from a public page (spec 0016,
 * AC-6, AC-8; spec 0021, AC-3).
 *
 * The games are IGDB's Popular list, cut to its first 200 by
 * `sitemapEntries`, the exact read
 * `/games/popular` makes (spec 0032, AC-6), so every listed game is linked
 * from a public page too, and that read returns visible games only.
 *
 * The 21 reads settle independently: a `TmdbError` drops only its own page
 * and an `IgdbError` only the game ids, so an upstream hiccup shrinks the
 * list instead of failing the file (spec 0032, AC-7). `getPopularGames`
 * rebuilds its error outside its own cached scope, so `instanceof` holds
 * here. Any other rejection, a validation error included, is a bug and is
 * rethrown. A complete list lives for days; a
 * partial one for minutes, so the full list returns soon after TMDB recovers
 * (`lib/seo/AGENTS.md`, the sitemap cache rule).
 * Only plain id arrays leave this scope (`AGENTS.md`, the cached scope rule).
 */
async function popularTitleIds(): Promise<{
  moviePages: number[][];
  showPages: number[][];
  gameIds: number[];
}> {
  "use cache";
  const pages = Array.from(
    { length: DISCOVER_PAGES_PER_TYPE },
    (_, index) => index + 1,
  );
  const [games, ...settled] = await Promise.allSettled([
    getPopularGames(POPULAR_GAME_LISTS.popular),
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

  let gameIds: number[] = [];
  if (games.status === "fulfilled") {
    gameIds = games.value.map((game) => game.id);
  } else if (games.reason instanceof IgdbError) {
    failed = true;
  } else {
    throw games.reason;
  }

  if (failed) {
    cacheLife("minutes");
  } else {
    cacheLife("days");
  }

  return {
    moviePages: idPages.slice(0, DISCOVER_PAGES_PER_TYPE),
    showPages: idPages.slice(DISCOVER_PAGES_PER_TYPE),
    gameIds,
  };
}
