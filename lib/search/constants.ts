/**
 * Every fixed number search runs on, pinned by spec 0010's constants list.
 *
 * Pure and free of `server-only`, because the navbar's Client Components read
 * the quick search values and the page and the Route Handler read the rest.
 */

/** The shortest trimmed query quick search asks TMDB about (AC-2). */
export const QUICK_MIN_CHARS = 2;

/** How long typing must pause before quick search sends a request (AC-2). */
export const QUICK_DEBOUNCE_MS = 250;

/** Rows in the quick search panel (AC-2, AC-20). */
export const QUICK_LIMIT = 5;

/** How long the results page's text field waits before it applies (AC-9). */
export const FILTER_DEBOUNCE_MS = 400;

/** The longest trimmed query either surface accepts (AC-7, AC-20). */
export const MAX_QUERY_LENGTH = 100;

/** The earliest year the year filter offers (AC-7). */
export const MIN_YEAR = 1900;

/** The minimum TMDB ratings the rating filter offers (AC-7, AC-8). */
export const RATING_STEPS = [5, 6, 7, 8, 9] as const;

export type RatingStep = (typeof RATING_STEPS)[number];

/**
 * The vote floor that comes with a rating filter, so a title rated 9 by three
 * people never passes a `9+` filter (AC-8, AC-12, AC-13).
 */
export const MIN_VOTE_COUNT = 100;

/**
 * Filtered search stops reading TMDB pages once it has kept this many
 * results, TMDB's own page size (AC-13).
 */
export const SCAN_TARGET = 20;

/** The most TMDB pages filtered search reads for one results page (AC-13). */
export const SCAN_MAX_PAGES = 5;

/** TMDB's result page size, which the partial range is computed from. */
export const TMDB_PAGE_SIZE = 20;

/**
 * TMDB's search endpoints report at most this many results, so a total at the
 * cap is a floor, not a count (AC-3). Observed live on 2026-09-24 and asserted
 * by `pnpm tmdb:live`.
 */
export const SEARCH_COUNT_CAP = 10_000;

/** The same cap for discover, which stops at one past 20,000 (AC-3). */
export const DISCOVER_COUNT_CAP = 20_001;
