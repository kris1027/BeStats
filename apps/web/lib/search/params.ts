import {
  type LibraryType,
  type MediaType,
  parseLibraryTypeParam,
} from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  IGDB_CONTROL_CHARACTERS,
  IGDB_MAX_QUERY_LENGTH,
} from "@/lib/igdb/constants";

import { SEARCH_CATALOGS } from "./catalogs";

import { MAX_QUERY_LENGTH, RATING_STEPS, type RatingStep } from "./constants";

/**
 * The three catalogs `/search` covers: the navbar tab's type, so search and
 * the library pages share one definition (feature 22), `game` included
 * (spec 0029, AC-1).
 */
export type SearchType = LibraryType;

/**
 * A genre or platform as the filter bar and the parser see it. TMDB's
 * `Genre` and IGDB's `GameRef` both fit it, so one picker takes either
 * (spec 0029).
 */
export type CatalogRef = { id: number; name: string };

type ParamsOf<T extends SearchType> = {
  type: T;
  q: string | null;
  /** Deduplicated and sorted ascending, so one filter has one URL. */
  genreIds: number[];
  /** The same, and always empty for `tv` and `movie` (spec 0029, AC-2). */
  platformIds: number[];
  year: number | null;
  rating: RatingStep | null;
  page: number;
};

/** The parameters of a show or movie search, which only TMDB reads take. */
export type TmdbSearchParams = ParamsOf<MediaType>;

/** The parameters of a games search, which only IGDB reads take. */
export type GameSearchParams = ParamsOf<"game">;

/**
 * Everything `/search` shows is decided by this, and this is decided by the
 * URL alone, so a link can be shared, reloaded and returned to (spec 0010,
 * AC-7). A union on `type`, so checking it narrows the whole object and a
 * games search can never reach a TMDB read (spec 0029, AC-1).
 */
export type SearchParams = TmdbSearchParams | GameSearchParams;

/** The URL parameter a parse failed on, named in the invalid filter panel. */
export type SearchParamName =
  | "type"
  | "q"
  | "genre"
  | "platform"
  | "year"
  | "rating"
  | "page";

/**
 * The lists the parser checks ids against: the type's genres, and for
 * `game` IGDB's platforms. A list that failed to load is passed as `[]`, so
 * a URL that does not need it still parses (spec 0029, AC-11).
 */
export type SearchLists = {
  genres: readonly CatalogRef[];
  platforms?: readonly CatalogRef[];
};

/**
 * A parse's answer. `P` narrows to `TmdbSearchParams` or `GameSearchParams`
 * through `parseTmdbSearchParams` and `parseGameSearchParams`, so a caller
 * never casts what the parser already proved.
 */
export type ParseResult<P extends SearchParams = SearchParams> =
  | { ok: true; params: P }
  | { ok: false; param: SearchParamName };

type RawValue = string | string[] | undefined;
type RawParams = Record<string, RawValue>;

/** Digits only, no sign, no leading zero. The id lists do the rest. */
const LIST_ID = /^[1-9]\d{0,9}$/;
const YEAR = /^\d{4}$/;

/**
 * One value, with a repeat refused and a blank read as absent.
 *
 * A blank arrives whenever the filter bar's `GET` form submits an empty text
 * field or `Any year`, so it has to mean "not set" rather than "invalid".
 */
function single(
  value: RawValue,
): { ok: true; value: string | null } | { ok: false } {
  if (Array.isArray(value)) return { ok: false };
  if (value === undefined) return { ok: true, value: null };
  const trimmed = value.trim();
  return { ok: true, value: trimmed === "" ? null : trimmed };
}

/**
 * The ids of one repeatable parameter, each checked against its list,
 * deduplicated, sorted, and refused above `cap` once repeats are removed.
 */
function idList(
  value: RawValue,
  list: readonly CatalogRef[],
  cap: number,
): number[] | null {
  const known = new Set(list.map((entry) => entry.id));
  const ids: number[] = [];
  for (const item of value === undefined ? [] : [value].flat()) {
    if (!LIST_ID.test(item)) return null;
    const id = Number(item);
    if (!known.has(id)) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > cap) return null;
  return ids.sort((a, b) => a - b);
}

/**
 * Whether IGDB would search a games query exactly as written. The text is
 * already trimmed and not empty, so it only has to hold no control character
 * and fit IGDB's length, the rule `cleanSearchText` applies; refusing it here
 * means it never reaches IGDB as a validation error (spec 0029, AC-2).
 */
function isCleanGameQuery(query: string): boolean {
  return (
    query.length <= IGDB_MAX_QUERY_LENGTH &&
    query.replace(IGDB_CONTROL_CHARACTERS, "") === query
  );
}

/**
 * Parses the `/search` URL before any TMDB or IGDB result call is made
 * (spec 0010, AC-7, AC-18; spec 0029, AC-2).
 *
 * The first parameter that is malformed, repeated where it must be single, or
 * outside its range is returned by name, so the page can say which one and
 * offer a way out rather than guessing what was meant. A games search takes
 * `platform` too, at most 20 genres and 20 platforms, and years from 1950;
 * a `platform` on a show or movie search is invalid.
 *
 * @param raw Next's `searchParams` record.
 * @param lists The id lists of the type in `raw`, so an id from another
 * catalog is refused.
 * @param currentYear The current UTC year, read at request time by the caller,
 * so the year range moves on New Year's Day without a deploy.
 */
export function parseSearchParams(
  raw: RawParams,
  lists: SearchLists,
  currentYear: number,
): ParseResult {
  const type = parseLibraryTypeParam(raw.type);
  if (type === null) return { ok: false, param: "type" };
  const isGame = type === "game";

  const q = single(raw.q);
  if (
    !q.ok ||
    (q.value !== null &&
      (q.value.length > MAX_QUERY_LENGTH ||
        (isGame && !isCleanGameQuery(q.value))))
  ) {
    return { ok: false, param: "q" };
  }

  const maxIds = SEARCH_CATALOGS[type].maxFilterIds ?? Number.POSITIVE_INFINITY;
  const genreIds = idList(raw.genre, lists.genres, maxIds);
  if (genreIds === null) return { ok: false, param: "genre" };

  let platformIds: number[] = [];
  if (isGame) {
    const ids = idList(raw.platform, lists.platforms ?? [], maxIds);
    if (ids === null) return { ok: false, param: "platform" };
    platformIds = ids;
  } else if (raw.platform !== undefined) {
    return { ok: false, param: "platform" };
  }

  const year = single(raw.year);
  if (!year.ok) return { ok: false, param: "year" };
  let yearValue: number | null = null;
  if (year.value !== null) {
    yearValue = Number(year.value);
    if (
      !YEAR.test(year.value) ||
      yearValue < minYear(type) ||
      yearValue > currentYear + 1
    ) {
      return { ok: false, param: "year" };
    }
  }

  const rating = single(raw.rating);
  if (!rating.ok) return { ok: false, param: "rating" };
  let ratingValue: RatingStep | null = null;
  if (rating.value !== null) {
    const step = RATING_STEPS.find((value) => String(value) === rating.value);
    if (step === undefined) return { ok: false, param: "rating" };
    ratingValue = step;
  }

  const page = parsePageParam(raw.page);
  if (page === null) return { ok: false, param: "page" };

  const common = {
    q: q.value,
    genreIds,
    year: yearValue,
    rating: ratingValue,
    page,
  };
  return {
    ok: true,
    params:
      type === "game"
        ? { ...common, type, platformIds }
        : { ...common, type, platformIds: [] },
  };
}

/**
 * IGDB's genre and platform lists as the games search reads them, each null
 * when IGDB could not supply it (spec 0029, AC-11).
 */
export type GameLists = {
  genres: CatalogRef[] | null;
  platforms: CatalogRef[] | null;
};

/**
 * `parseSearchParams` for a request already known to be a games search, as
 * the results and the filter bar both call it (spec 0029, AC-1, AC-2). A
 * missing list is read as empty, so only a URL that names one of its ids
 * fails. The result is narrowed rather than cast: a URL whose `type` is not
 * `game` is refused by name.
 */
export function parseGameSearchParams(
  raw: RawParams,
  lists: GameLists,
  currentYear: number,
): ParseResult<GameSearchParams> {
  const parsed = parseSearchParams(
    raw,
    { genres: lists.genres ?? [], platforms: lists.platforms ?? [] },
    currentYear,
  );
  if (!parsed.ok) return parsed;
  const { params } = parsed;
  return params.type === "game"
    ? { ok: true, params }
    : { ok: false, param: "type" };
}

/**
 * `parseSearchParams` for a request already known to be a show or movie
 * search, the mirror of `parseGameSearchParams`. Narrowed rather than cast:
 * a URL whose `type` is `game` is refused by name.
 */
export function parseTmdbSearchParams(
  raw: RawParams,
  lists: SearchLists,
  currentYear: number,
): ParseResult<TmdbSearchParams> {
  const parsed = parseSearchParams(raw, lists, currentYear);
  if (!parsed.ok) return parsed;
  const { params } = parsed;
  return params.type === "game"
    ? { ok: false, param: "type" }
    : { ok: true, params };
}

/**
 * The earliest year a type's year filter offers: TMDB's 1900, IGDB's 1950
 * (spec 0029, AC-2).
 */
export function minYear(type: SearchType): number {
  return SEARCH_CATALOGS[type].minYear;
}

/**
 * The one canonical `/search` URL for a set of parameters (spec 0010, AC-7).
 *
 * `type` is always written, so a copied link says which catalog it searches
 * and matches the `See all` link quick search builds (AC-4). Platforms follow
 * the genres (spec 0029, AC-2). Everything else
 * is left out when it is empty or the default, `page=1` included, so the same
 * search never has two URLs. The results boundary keys on this string.
 *
 * @param params The current parameters.
 * @param overrides Fields to change, such as `{ page: 3 }`.
 */
export function searchHref(
  params: SearchParams,
  overrides: Partial<Omit<SearchParams, "type">> = {},
): string {
  const next = { ...params, ...overrides };
  const query = new URLSearchParams();
  query.set("type", next.type);
  if (next.q) query.set("q", next.q);
  for (const id of [...new Set(next.genreIds)].sort((a, b) => a - b)) {
    query.append("genre", String(id));
  }
  for (const id of [...new Set(next.platformIds)].sort((a, b) => a - b)) {
    query.append("platform", String(id));
  }
  if (next.year !== null) query.set("year", String(next.year));
  if (next.rating !== null) query.set("rating", String(next.rating));
  if (next.page > 1) query.set("page", String(next.page));
  return `/search?${query.toString()}`;
}

/** The parameters of a fresh search of one catalog: nothing set, page 1. */
export function emptySearchParams(type: "game"): GameSearchParams;
export function emptySearchParams(type: MediaType): TmdbSearchParams;
export function emptySearchParams(type: SearchType): SearchParams;
export function emptySearchParams(type: SearchType): SearchParams {
  return {
    type,
    q: null,
    genreIds: [],
    platformIds: [],
    year: null,
    rating: null,
    page: 1,
  } as SearchParams;
}

/** True when anything a person can clear is set: a query or any filter. */
export function hasAnyFilter(params: SearchParams): boolean {
  return (
    params.q !== null ||
    params.genreIds.length > 0 ||
    params.platformIds.length > 0 ||
    params.year !== null ||
    params.rating !== null
  );
}
