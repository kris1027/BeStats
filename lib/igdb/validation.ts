import {
  IGDB_BATCH_LIMIT,
  IGDB_MAX_FILTER_IDS,
  IGDB_MAX_PAGE,
  IGDB_MIN_YEAR,
  IGDB_YEARS_AHEAD,
} from "./constants";
import { IgdbValidationError } from "./errors";
import { cleanSearchText } from "./query";
import type {
  DiscoverGamesOptions,
  DiscoverSort,
  SearchGamesOptions,
} from "./types";

/**
 * Input guards, run before any request (spec 0023, AC-11, AC-12b).
 *
 * A bad value throws `IgdbValidationError` naming the field: it is never sent
 * to IGDB and never cached, because `reads.ts` validates before it enters a
 * cached scope. Out of range values throw rather than clamp, so a bad URL
 * value surfaces instead of quietly showing another page.
 *
 * The validated forms are canonical (id lists deduped and sorted, absent
 * options dropped), so equal requests share one cache entry.
 */

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonical(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function assertGameId(id: unknown): number {
  if (!isPositiveInt(id)) {
    throw new IgdbValidationError(
      "id",
      "A game id must be a positive integer.",
    );
  }
  return id;
}

/** 0 to 500 positive integers, deduped and sorted (AC-11). */
export function canonicalGameIds(ids: readonly unknown[]): number[] {
  if (!Array.isArray(ids) || !ids.every(isPositiveInt)) {
    throw new IgdbValidationError(
      "ids",
      "Every game id must be a positive integer.",
    );
  }
  const sorted = canonical(ids as number[]);
  if (sorted.length > IGDB_BATCH_LIMIT) {
    throw new IgdbValidationError(
      "ids",
      `At most ${IGDB_BATCH_LIMIT} game ids load in one batch.`,
    );
  }
  return sorted;
}

function filterIds(
  field: string,
  ids: readonly unknown[] | undefined,
): number[] | undefined {
  if (ids === undefined) return undefined;
  if (!Array.isArray(ids) || !ids.every(isPositiveInt)) {
    throw new IgdbValidationError(field, `${field} must be positive integers.`);
  }
  const sorted = canonical(ids as number[]);
  if (sorted.length > IGDB_MAX_FILTER_IDS) {
    throw new IgdbValidationError(
      field,
      `${field} takes at most ${IGDB_MAX_FILTER_IDS} ids.`,
    );
  }
  return sorted.length > 0 ? sorted : undefined;
}

function page(value: unknown): number {
  if (value === undefined) return 1;
  if (!isPositiveInt(value) || value > IGDB_MAX_PAGE) {
    throw new IgdbValidationError(
      "page",
      `page must be an integer from 1 to ${IGDB_MAX_PAGE}.`,
    );
  }
  return value;
}

function minRating(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new IgdbValidationError("minRating", "minRating must be 0 to 10.");
  }
  return value;
}

function nonNegative(field: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!isNonNegativeInt(value)) {
    throw new IgdbValidationError(
      field,
      `${field} must be a non negative integer.`,
    );
  }
  return value;
}

/** 1950 to the current UTC year plus 5. The clock bounds it; it never fills it. */
function year(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const latest = new Date().getUTCFullYear() + IGDB_YEARS_AHEAD;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < IGDB_MIN_YEAR ||
    value > latest
  ) {
    throw new IgdbValidationError(
      "year",
      `year must be an integer from ${IGDB_MIN_YEAR} to ${latest}.`,
    );
  }
  return value;
}

/** A real `YYYY-MM-DD` calendar day: `2026-02-30` is refused, not rolled over. */
function utcDay(field: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new IgdbValidationError(field, `${field} must be YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new IgdbValidationError(field, `${field} is not a calendar day.`);
  }
  return value;
}

const SORTS: readonly DiscoverSort[] = [
  "rating_desc",
  "rating_count_desc",
  "release_desc",
  "release_asc",
  "hypes_desc",
];

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** The validated search options, the query cleaned but not yet escaped. */
export type ValidSearchOptions = SearchGamesOptions & { page: number };

export function validateSearchOptions(
  options: SearchGamesOptions,
): ValidSearchOptions {
  return withoutUndefined({
    query: cleanSearchText(options?.query),
    genreIds: filterIds("genreIds", options.genreIds),
    platformIds: filterIds("platformIds", options.platformIds),
    year: year(options.year),
    minRating: minRating(options.minRating),
    page: page(options.page),
  });
}

export type ValidDiscoverOptions = DiscoverGamesOptions & { page: number };

export function validateDiscoverOptions(
  options: DiscoverGamesOptions,
): ValidDiscoverOptions {
  if (!SORTS.includes(options?.sort)) {
    throw new IgdbValidationError(
      "sort",
      `sort must be one of ${SORTS.join(", ")}.`,
    );
  }
  const releasedFrom = utcDay("releasedFrom", options.releasedFrom);
  const releasedTo = utcDay("releasedTo", options.releasedTo);
  if (releasedFrom && releasedTo && releasedFrom > releasedTo) {
    throw new IgdbValidationError(
      "releasedFrom",
      "releasedFrom must not be after releasedTo.",
    );
  }
  return withoutUndefined({
    genreIds: filterIds("genreIds", options.genreIds),
    platformIds: filterIds("platformIds", options.platformIds),
    releasedFrom,
    releasedTo,
    minRating: minRating(options.minRating),
    minRatingCount: nonNegative("minRatingCount", options.minRatingCount),
    minHypes: nonNegative("minHypes", options.minHypes),
    sort: options.sort,
    page: page(options.page),
  });
}
