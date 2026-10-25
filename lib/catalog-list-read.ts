import { connection } from "next/server";

import {
  gameListOptions,
  isPopularGameList,
  POPULAR_GAME_LISTS,
} from "@/lib/catalog/game-lists";
import { readGridPage } from "@/lib/catalog/grid-page";
import type {
  CatalogList,
  GameCatalogList,
  MovieCatalogList,
  MovieListSlug,
  TmdbCatalogList,
  TvCatalogList,
  TvListSlug,
} from "@/lib/catalog/lists";
import {
  discoverGames,
  type GameSummary,
  getPopularGames,
  type Paged as IgdbPaged,
} from "@/lib/igdb";
import { IGDB_LIST_PAGE_SIZE, IGDB_MAX_PAGE } from "@/lib/igdb/constants";
import {
  discoverMovies,
  discoverTvShows,
  getMovieList,
  getTvList,
  type MovieListKind,
  type MovieSummary,
  type Paged,
  type TvListKind,
  type TvShowSummary,
} from "@/lib/tmdb";
import { todayUtc } from "@/lib/tv/air-status";

const TV_KINDS: Record<Exclude<TvListSlug, "popular">, TvListKind> = {
  trending: "trending",
  "airing-today": "airing_today",
  "on-the-air": "on_the_air",
  "top-rated": "top_rated",
};

const MOVIE_KINDS: Record<Exclude<MovieListSlug, "popular">, MovieListKind> = {
  trending: "trending",
  "now-playing": "now_playing",
  upcoming: "upcoming",
  "top-rated": "top_rated",
};

/**
 * One page of a list, the one place an app slug becomes a TMDB call
 * (spec 0021, the dispatcher).
 *
 * Popular reads `discoverTvShows({ page })` or `discoverMovies({ page })` with
 * no other option, the exact calls the sitemap makes, so the three share
 * cache entries. Every other slug maps to its TMDB list kind. A landing row
 * and page 1 of its list page both call this with page 1, so they share one
 * cache entry and See all costs no extra request (AC-3).
 *
 * It lives beside `lib/landing-metadata.ts`, outside `lib/catalog/`, because
 * it touches TMDB at runtime and `lib/catalog/` stays pure for the proxy.
 *
 * @throws {TmdbError} When TMDB fails; callers catch it into their own state.
 */
export function readCatalogList(
  list: TvCatalogList,
  page: number,
): Promise<Paged<TvShowSummary>>;
export function readCatalogList(
  list: MovieCatalogList,
  page: number,
): Promise<Paged<MovieSummary>>;
export function readCatalogList(
  list: TmdbCatalogList,
  page: number,
): Promise<Paged<TvShowSummary> | Paged<MovieSummary>>;
export function readCatalogList(
  list: TmdbCatalogList,
  page: number,
): Promise<Paged<TvShowSummary> | Paged<MovieSummary>> {
  if (list.mediaType === "tv") {
    return list.slug === "popular"
      ? discoverTvShows({ page })
      : getTvList(TV_KINDS[list.slug], { page });
  }
  return list.slug === "popular"
    ? discoverMovies({ page })
    : getMovieList(MOVIE_KINDS[list.slug], { page });
}

/**
 * One page of a list, tagged with its media type so a renderer can narrow it.
 * A games page carries IGDB's paging (a count or null, and `hasNextPage`)
 * rather than TMDB's `totalPages` (spec 0028).
 */
export type TaggedCatalogPage =
  | { mediaType: "tv"; paged: Paged<TvShowSummary> }
  | { mediaType: "movie"; paged: Paged<MovieSummary> }
  | { mediaType: "game"; paged: IgdbPaged<GameSummary> };

/**
 * One 24 game page of a games list (spec 0028, AC-2, AC-4, AC-10), the one
 * place a games slug becomes an IGDB call.
 *
 * A popularity list is read whole and sliced, so `totalResults` is the exact
 * number of visible games. A discover list asks IGDB for the page at 24, so
 * its count is IGDB's own or null. A page past IGDB's 50 is answered empty,
 * never asked for, so it reads as "no such page" rather than a validation
 * error. A landing section and its list page call this with the same
 * arguments, so they share one cache entry.
 *
 * @param today The current UTC day, read by the caller after `connection()`;
 * only the discover windows use it.
 * @throws {IgdbError} When IGDB fails; callers catch it into their own state.
 */
export async function readGameListPage(
  list: GameCatalogList,
  page: number,
  today: string,
): Promise<IgdbPaged<GameSummary>> {
  if (isPopularGameList(list.slug)) {
    const games = await getPopularGames(POPULAR_GAME_LISTS[list.slug]);
    const start = (page - 1) * IGDB_LIST_PAGE_SIZE;
    return {
      page,
      results: games.slice(start, start + IGDB_LIST_PAGE_SIZE),
      hasNextPage: start + IGDB_LIST_PAGE_SIZE < games.length,
      totalResults: games.length,
    };
  }
  if (page > IGDB_MAX_PAGE) {
    return { page, results: [], hasNextPage: false, totalResults: null };
  }
  return discoverGames({ ...gameListOptions(list.slug, today), page });
}

/**
 * `readGameListPage` at request time: `connection()` first, so `pnpm build`
 * asks IGDB nothing, then today's UTC day (spec 0028, AC-18).
 */
async function readTaggedGamePage(
  list: GameCatalogList,
  page: number,
): Promise<TaggedCatalogPage> {
  await connection();
  return {
    mediaType: "game",
    paged: await readGameListPage(list, page, todayUtc(new Date())),
  };
}

/**
 * The last page a list reaches, or null when it is not known (spec 0021,
 * AC-9; spec 0028, AC-10). A TMDB list knows its pages. A games list knows
 * them from a count, capped at IGDB's 50; with no count it does not, and the
 * pager offers Next only while IGDB says there is more.
 */
export function lastListPage(result: TaggedCatalogPage): number | null {
  if (result.mediaType !== "game") return result.paged.totalPages;
  const { totalResults } = result.paged;
  if (totalResults === null) return null;
  return Math.min(IGDB_MAX_PAGE, Math.ceil(totalResults / IGDB_LIST_PAGE_SIZE));
}

/**
 * Whether the pager offers Next on a list whose last page is unknown (spec
 * 0028, AC-10): only a games list with no count, only while IGDB says there
 * is more, and never past IGDB's page 50. A list with a known last page
 * leaves Next to `PaginationLinks`, which counts to it.
 */
export function listHasNextPage(
  result: TaggedCatalogPage,
  page: number,
): boolean {
  return (
    lastListPage(result) === null &&
    result.mediaType === "game" &&
    result.paged.hasNextPage &&
    page < IGDB_MAX_PAGE
  );
}

/**
 * `readCatalogList` with its result tagged, so a component rendering any list
 * picks the show or movie card by narrowing on `mediaType` rather than by a
 * cast. The very same call underneath, so it shares the cache entry. The
 * landing rows read TMDB page 1 through this. A games list reads its 24 game
 * page, the same one its list page shows (spec 0028, AC-3).
 *
 * @throws {TmdbError} When TMDB fails.
 * @throws {IgdbError} When IGDB fails, for a games list.
 */
export async function readTaggedCatalogList(
  list: CatalogList,
  page: number,
): Promise<TaggedCatalogPage> {
  if (list.mediaType === "game") return readTaggedGamePage(list, page);
  return list.mediaType === "tv"
    ? { mediaType: "tv", paged: await readCatalogList(list, page) }
    : { mediaType: "movie", paged: await readCatalogList(list, page) };
}

/**
 * One 24 title page of a list's See all grid, tagged like
 * `readTaggedCatalogList` (spec 0022, AC-21): the two `readCatalogList` pages
 * that hold it, so the grid's pages share cache entries with each other and
 * page 1 shares TMDB page 1 with the landing row. `totalPages` is the grid's
 * own count. The landing rows keep reading TMDB page 1 alone.
 *
 * The two branches make the same call: each narrows `list`, which picks the
 * `readCatalogList` overload and so the result type `readGridPage` infers.
 *
 * @throws {TmdbError} When either TMDB read fails.
 */
export async function readTaggedCatalogGridPage(
  list: CatalogList,
  page: number,
): Promise<TaggedCatalogPage> {
  // A games list page is already 24 games, so the grid page is the list page.
  if (list.mediaType === "game") return readTaggedGamePage(list, page);
  return list.mediaType === "tv"
    ? {
        mediaType: "tv",
        paged: await readGridPage(page, (tmdbPage) =>
          readCatalogList(list, tmdbPage),
        ),
      }
    : {
        mediaType: "movie",
        paged: await readGridPage(page, (tmdbPage) =>
          readCatalogList(list, tmdbPage),
        ),
      };
}
