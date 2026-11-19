import {
  v1GenresSchema,
  v1ListSchema,
  v1SearchSchema,
} from "@bestats/core/api/v1/browse";
import { v1GameSchema } from "@bestats/core/api/v1/game";
import { v1SeasonSchema, v1ShowSchema } from "@bestats/core/api/v1/show";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import { type SearchParams, searchHref } from "@bestats/core/search/params";

import { apiRequest } from "./api";

/**
 * The first segment of every public catalog query key. It is never
 * `PRIVATE_QUERY_ROOT`, so `clearPrivateQueries()` keeps these on sign out
 * and a signed out visitor can keep browsing (prompts/mobile-app-shell-catalog.md,
 * decision 9; spec 0033, AC-13).
 */
export const CATALOG_QUERY_ROOT = "catalog";

/**
 * Query keys of the public catalog reads, all under `CATALOG_QUERY_ROOT` so
 * public data stays apart from user state (AGENTS.md section 11).
 */
export const catalogKeys = {
  list: (type: LibraryType, slug: string) =>
    [CATALOG_QUERY_ROOT, "list", type, slug] as const,
  search: (params: SearchParams) =>
    [CATALOG_QUERY_ROOT, "search", searchHref({ ...params, page: 1 })] as const,
  genres: (type: LibraryType) => [CATALOG_QUERY_ROOT, "genres", type] as const,
  show: (id: number) => [CATALOG_QUERY_ROOT, "show", id] as const,
  season: (showId: number, seasonNumber: number) =>
    [CATALOG_QUERY_ROOT, "season", showId, seasonNumber] as const,
  game: (id: number) => [CATALOG_QUERY_ROOT, "game", id] as const,
};

/**
 * `GET /api/v1/lists/{type}/{list}?page=`: one 24 title page of a catalog
 * list, the page the web's list page shows (spec 0035, API surface).
 */
export function fetchList(type: LibraryType, slug: string, page: number) {
  const query = page > 1 ? `?page=${page}` : "";
  return apiRequest(
    `/api/v1/lists/${type}/${encodeURIComponent(slug)}${query}`,
    v1ListSchema,
  );
}

/**
 * `GET /api/v1/search`, with the query string core's `searchHref` writes, so
 * the app sends exactly the params the web's `/search` URL would hold for
 * the same filters (AGENTS.md section 10). `page` is a TMDB cursor in a
 * filtered title search and a page number otherwise; both come from the
 * previous answer's `nextPage`.
 */
export function fetchSearch(params: SearchParams, page: number) {
  const href = searchHref(params, { page });
  return apiRequest(`/api/v1${href}`, v1SearchSchema);
}

/**
 * `GET /api/v1/genres?type=`: the search filter's genre choices, read through
 * `/api/v1` because the phone holds no catalog key (AGENTS.md section 5).
 */
export function fetchGenres(type: LibraryType) {
  return apiRequest(`/api/v1/genres?type=${type}`, v1GenresSchema);
}

/**
 * `GET /api/v1/shows/{id}`: the public show detail, read through `/api/v1`
 * because the phone holds no catalog key (AGENTS.md section 5).
 */
export function fetchShow(id: number) {
  return apiRequest(`/api/v1/shows/${id}`, v1ShowSchema);
}

/**
 * `GET /api/v1/games/{id}`: the public game detail, read through `/api/v1`
 * because the phone holds no catalog key (AGENTS.md section 5).
 */
export function fetchGame(id: number) {
  return apiRequest(`/api/v1/games/${id}`, v1GameSchema);
}

/**
 * `GET /api/v1/shows/{id}/seasons/{n}`: a season's episodes with their UTC
 * air dates, read through `/api/v1` because the phone holds no catalog key
 * (AGENTS.md section 5).
 */
export function fetchSeason(showId: number, seasonNumber: number) {
  return apiRequest(
    `/api/v1/shows/${showId}/seasons/${seasonNumber}`,
    v1SeasonSchema,
  );
}
