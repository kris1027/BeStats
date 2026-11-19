import {
  nextPageOf,
  V1_PAGE_SIZE,
  type V1Search,
} from "@bestats/core/api/v1/browse";
import { parseLibraryTypeParam } from "@bestats/core/catalog/media-type";
import { IGDB_MAX_PAGE } from "@bestats/core/igdb/constants";
import { SEARCH_CATALOGS } from "@bestats/core/search/catalogs";
import { searchMode } from "@bestats/core/search/mode";
import {
  parseGameSearchParams,
  parseTmdbSearchParams,
} from "@bestats/core/search/params";
import { z } from "zod";

import {
  catalogFailure,
  itemFromGame,
  itemFromSearchResult,
} from "@/lib/api/v1/browse";
import { type V1Outcome, v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { lastGamePage } from "@/lib/catalog-list-read";
import { readGameSearchPage } from "@/lib/search/game-read";
import { readGameLists } from "@/lib/search/lists";
import { readSearchGridPage } from "@/lib/search/read";
import { scanFilteredSearch } from "@/lib/search/scan";
import { type Genre, getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";

type RawParams = Record<string, string | string[]>;

/**
 * The raw query, as the web's `/search` page receives it: each key once as a
 * string, a repeated key (`genre`, `platform`) as an array. The core parser
 * below decides what is valid, so the two surfaces refuse the same URLs.
 */
const rawQuerySchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);

/**
 * `GET /api/v1/search` (spec 0035; AGENTS.md section 10): the web's `/search`
 * for the app. It takes the web's own params (`type`, `q`, `genre`,
 * `platform`, `year`, `rating`, `page`), parses them with the same core
 * parsers against the same cached genre and platform lists, and answers with
 * the same reads the results page makes: one 24 title grid page for browse,
 * discover and plain search, the page scan for a query with a genre or a
 * rating, and IGDB for games. So every result meets every filter, the count
 * is exact or marked partial, and a title search keeps TMDB's order.
 *
 * An invalid param is 400, a page past the end 404 (the web's "That page
 * doesn't exist"), a catalog failure 502, each `no-store`. A success is
 * public and may be shared for five minutes, as `/api/search` is.
 */
export const GET = withV1({
  name: "search.get",
  auth: "public",
  cache: "public, s-maxage=300, stale-while-revalidate=600",
  input: { query: rawQuerySchema },
  handler: async ({ input }) => {
    const raw = input.query;
    const type = parseLibraryTypeParam(raw.type);
    if (type === null) return v1Fail("invalid_input");
    try {
      return type === "game"
        ? await searchGames(raw)
        : await searchTmdb(raw, type);
    } catch (error) {
      return catalogFailure(error);
    }
  },
});

/** Shows and movies, as the results page's TMDB branch reads them. */
async function searchTmdb(
  raw: RawParams,
  type: "movie" | "tv",
): Promise<V1Outcome> {
  // Without the genre list a genre id cannot be checked, so only a request
  // that names one needs it (spec 0010, AC-19).
  let genres: Genre[] = [];
  try {
    genres = type === "movie" ? await getMovieGenres() : await getTvGenres();
  } catch (error) {
    if (!(error instanceof TmdbError) || raw.genre !== undefined) throw error;
  }

  const parsed = parseTmdbSearchParams(
    raw,
    { genres },
    new Date().getUTCFullYear(),
  );
  if (!parsed.ok) return v1Fail("invalid_input");
  const { params } = parsed;
  const mode = searchMode(params);

  if (mode === "filtered_search") {
    const scan = await scanFilteredSearch(params);
    if (scan.kind === "no_such_page") return v1Fail("not_found");
    const body: V1Search = {
      type,
      mode,
      page: params.page,
      pageSize: V1_PAGE_SIZE,
      results: scan.results.map(itemFromSearchResult),
      total: scan.totalResults,
      totalIsExact: false,
      nextPage: scan.nextPage,
      scanned:
        scan.totalResults === 0
          ? null
          : { fromIndex: scan.fromIndex, toIndex: scan.toIndex },
    };
    return v1Ok(body);
  }

  const page = await readSearchGridPage(mode, params);
  if (params.page > Math.max(page.totalPages, 1)) return v1Fail("not_found");
  const body: V1Search = {
    type,
    mode,
    page: params.page,
    pageSize: V1_PAGE_SIZE,
    results: page.results.map(itemFromSearchResult),
    total: page.totalResults,
    totalIsExact: true,
    nextPage: nextPageOf(params.page, page.totalPages),
    scanned: null,
  };
  return v1Ok(body);
}

/** Games, as the results page's games branch reads them (spec 0029). */
async function searchGames(raw: RawParams): Promise<V1Outcome> {
  const lists = await readGameLists();
  if (
    (lists.genres === null && raw.genre !== undefined) ||
    (lists.platforms === null && raw.platform !== undefined)
  ) {
    return v1Fail("catalog_unavailable");
  }

  const parsed = parseGameSearchParams(raw, lists, new Date().getUTCFullYear());
  if (!parsed.ok) return v1Fail("invalid_input");
  const { params } = parsed;
  if (params.page > SEARCH_CATALOGS.game.maxPage) return v1Fail("not_found");

  const mode = searchMode(params);
  const paged = await readGameSearchPage(mode, params);
  const lastPage = lastGamePage(paged);
  const pastEnd =
    params.page > 1 &&
    (paged.results.length === 0 ||
      (lastPage !== null && params.page > lastPage));
  if (pastEnd) return v1Fail("not_found");

  const body: V1Search = {
    type: "game",
    mode,
    page: params.page,
    pageSize: V1_PAGE_SIZE,
    results: paged.results.map(itemFromGame),
    total: paged.totalResults,
    totalIsExact: paged.totalResults !== null,
    nextPage: nextPageOf(
      params.page,
      lastPage,
      paged.hasNextPage && params.page < IGDB_MAX_PAGE,
    ),
    scanned: null,
  };
  return v1Ok(body);
}
