import { z } from "zod";

import { parsePageParam } from "@/lib/catalog/pages";
import type { Genre } from "@/lib/tmdb/types";

import {
  MAX_QUERY_LENGTH,
  MIN_YEAR,
  RATING_STEPS,
  type RatingStep,
} from "./constants";

/** The two catalogs `/search` covers. */
export type SearchType = "tv" | "movie";

/**
 * Everything `/search` shows is decided by this, and this is decided by the
 * URL alone, so a link can be shared, reloaded and returned to (spec 0010,
 * AC-7).
 */
export type SearchParams = {
  type: SearchType;
  q: string | null;
  /** Deduplicated and sorted ascending, so one filter has one URL. */
  genreIds: number[];
  year: number | null;
  rating: RatingStep | null;
  page: number;
};

/** The URL parameter a parse failed on, named in the invalid filter panel. */
export type SearchParamName =
  | "type"
  | "q"
  | "genre"
  | "year"
  | "rating"
  | "page";

export type ParseResult =
  | { ok: true; params: SearchParams }
  | { ok: false; param: SearchParamName };

type RawValue = string | string[] | undefined;
type RawParams = Record<string, RawValue>;

const typeSchema = z.enum(["tv", "movie"]);
/** Digits only, no sign, no leading zero. The genre list does the rest. */
const GENRE_ID = /^[1-9]\d{0,9}$/;
const YEAR = /^\d{4}$/;

/** The search type a URL asks for, or null when it names neither catalog. */
export function parseSearchType(value: RawValue): SearchType | null {
  if (value === undefined) return "tv";
  if (Array.isArray(value)) return null;
  const parsed = typeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

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
 * Parses the `/search` URL before any TMDB result call is made
 * (spec 0010, AC-7, AC-18).
 *
 * The first parameter that is malformed, repeated where it must be single, or
 * outside its range is returned by name, so the page can say which one and
 * offer a way out rather than guessing what was meant.
 *
 * @param raw Next's `searchParams` record.
 * @param genres The genre list of the type in `raw`, so an id from the other
 * catalog is refused.
 * @param currentYear The current UTC year, read at request time by the caller,
 * so the year range moves on New Year's Day without a deploy.
 */
export function parseSearchParams(
  raw: RawParams,
  genres: readonly Genre[],
  currentYear: number,
): ParseResult {
  const type = parseSearchType(raw.type);
  if (type === null) return { ok: false, param: "type" };

  const q = single(raw.q);
  if (!q.ok || (q.value !== null && q.value.length > MAX_QUERY_LENGTH)) {
    return { ok: false, param: "q" };
  }

  const known = new Set(genres.map((genre) => genre.id));
  const genreValues = raw.genre === undefined ? [] : [raw.genre].flat();
  const genreIds: number[] = [];
  for (const value of genreValues) {
    if (!GENRE_ID.test(value)) return { ok: false, param: "genre" };
    const id = Number(value);
    if (!known.has(id)) return { ok: false, param: "genre" };
    if (!genreIds.includes(id)) genreIds.push(id);
  }
  genreIds.sort((a, b) => a - b);

  const year = single(raw.year);
  if (!year.ok) return { ok: false, param: "year" };
  let yearValue: number | null = null;
  if (year.value !== null) {
    yearValue = Number(year.value);
    if (
      !YEAR.test(year.value) ||
      yearValue < MIN_YEAR ||
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

  return {
    ok: true,
    params: {
      type,
      q: q.value,
      genreIds,
      year: yearValue,
      rating: ratingValue,
      page,
    },
  };
}

/**
 * The one canonical `/search` URL for a set of parameters (spec 0010, AC-7).
 *
 * `type` is always written, so a copied link says which catalog it searches
 * and matches the `See all` link quick search builds (AC-4). Everything else
 * is left out when it is empty or the default, `page=1` included, so the same
 * search never has two URLs. The results boundary keys on this string.
 *
 * @param params The current parameters.
 * @param overrides Fields to change, such as `{ page: 3 }`.
 */
export function searchHref(
  params: SearchParams,
  overrides: Partial<SearchParams> = {},
): string {
  const next = { ...params, ...overrides };
  const query = new URLSearchParams();
  query.set("type", next.type);
  if (next.q) query.set("q", next.q);
  for (const id of [...new Set(next.genreIds)].sort((a, b) => a - b)) {
    query.append("genre", String(id));
  }
  if (next.year !== null) query.set("year", String(next.year));
  if (next.rating !== null) query.set("rating", String(next.rating));
  if (next.page > 1) query.set("page", String(next.page));
  return `/search?${query.toString()}`;
}

/** The parameters of a fresh search of one catalog: nothing set, page 1. */
export function emptySearchParams(type: SearchType): SearchParams {
  return { type, q: null, genreIds: [], year: null, rating: null, page: 1 };
}

/** True when anything a person can clear is set: a query or any filter. */
export function hasAnyFilter(params: SearchParams): boolean {
  return (
    params.q !== null ||
    params.genreIds.length > 0 ||
    params.year !== null ||
    params.rating !== null
  );
}
