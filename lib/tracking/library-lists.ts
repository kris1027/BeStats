import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getMovieSummaries, type MovieSummary, TmdbError } from "@/lib/tmdb";

import { logTrackingEvent, TRACKING_EVENT } from "./log";

/**
 * The paged reads behind `/watchlist` and `/watched` (spec 0008, API surface).
 *
 * Postgres decides which movies are on a page and in what order; TMDB only
 * supplies their titles afterwards, 20 at most. Neither read may ever run
 * inside `use cache`: the rows belong to one person (`AGENTS.md` section 11,
 * AC-17). Each filters on `user_id` explicitly as well as through row level
 * security, the spec 0007 pattern, and orders with `movie_id` as the tiebreak
 * so two rows stamped in the same instant never swap places between pages.
 */

/** Cards per page on both list pages. */
export const LIBRARY_PAGE_SIZE = 20;

/**
 * The last page of a list of `total` rows: at least 1, so an empty list still
 * has a page to show its empty state on (AC-9).
 */
export function libraryLastPage(total: number): number {
  return Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
}

/** One page of a list, or a failed read. Never an empty list on failure. */
export type LibraryPage<Row> =
  | { kind: "ok"; rows: Row[]; total: number }
  | { kind: "failed" };

export type WatchlistRow = { movieId: number };

export type WatchedRow = {
  movieId: number;
  /** As PostgREST returned it, so Undo can put back the exact instant. */
  watchedAt: string;
  /** The personal score, or null when unrated. */
  rating: number | null;
};

/**
 * PostgREST's answer to an offset past the last row when an exact count is
 * asked for: a 416 rather than an empty page. A page past the end is a normal
 * case here (a stale link, or the last card on a page just removed), and the
 * page needs the total to redirect to the last page (AC-9), so it is read
 * again as a count alone.
 */
const RANGE_NOT_SATISFIABLE = "PGRST103";

/** The row range PostgREST takes for a 1 based page. */
function pageRange(page: number): [number, number] {
  const from = (page - 1) * LIBRARY_PAGE_SIZE;
  return [from, from + LIBRARY_PAGE_SIZE - 1];
}

/**
 * One page of the user's watchlist, newest plan first (AC-1).
 *
 * @param userId The verified session's user, never a client value.
 * @param page A page already parsed by `parsePageParam`.
 */
export async function getWatchlistPage(
  userId: string,
  page: number,
): Promise<LibraryPage<WatchlistRow>> {
  try {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from("user_movie_state")
      .select("movie_id", { count: "exact" })
      .eq("user_id", userId)
      .eq("in_watchlist", true)
      .order("watchlisted_at", { ascending: false })
      .order("movie_id", { ascending: true })
      .range(...pageRange(page));

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      return pastTheEnd(
        await supabase
          .from("user_movie_state")
          .select("movie_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("in_watchlist", true),
      );
    }
    if (error || count === null) return failed();
    return {
      kind: "ok",
      rows: data.map((row) => ({ movieId: row.movie_id })),
      total: count,
    };
  } catch {
    // A network failure inside supabase-js. The error is dropped on purpose,
    // as in the actions: its message can carry request details (AC-19).
    return failed();
  }
}

/**
 * One page of the user's watched movies, most recent first (AC-2).
 *
 * @param userId The verified session's user, never a client value.
 * @param page A page already parsed by `parsePageParam`.
 */
export async function getWatchedPage(
  userId: string,
  page: number,
): Promise<LibraryPage<WatchedRow>> {
  try {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from("user_movie_state")
      .select("movie_id, watched_at, rating", { count: "exact" })
      .eq("user_id", userId)
      .not("watched_at", "is", null)
      .order("watched_at", { ascending: false })
      .order("movie_id", { ascending: true })
      .range(...pageRange(page));

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      return pastTheEnd(
        await supabase
          .from("user_movie_state")
          .select("movie_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .not("watched_at", "is", null),
      );
    }
    if (error || count === null) return failed();

    const rows: WatchedRow[] = [];
    for (const row of data) {
      // The filter already excludes null; this narrows the type honestly
      // rather than asserting it.
      if (row.watched_at === null) continue;
      rows.push({
        movieId: row.movie_id,
        watchedAt: row.watched_at,
        rating: row.rating,
      });
    }
    return { kind: "ok", rows, total: count };
  } catch {
    return failed();
  }
}

/** A page's titles, keyed by movie id, or a systemic TMDB failure. */
export type LibraryTitles =
  | { kind: "ok"; titles: Map<number, MovieSummary> }
  | { kind: "failed" };

/**
 * The TMDB titles for one page of rows, through the cached per title reads
 * (spec 0008, AC-11).
 *
 * A movie TMDB no longer has is simply absent from the map, so the page shows
 * its "No longer on TMDB" card. A systemic failure (a rejected token, an
 * exhausted rate limit) is `failed` rather than a short map, because a short
 * map would render every movie as missing and invite the user to remove rows
 * that are fine (`AGENTS.md` section 12).
 *
 * @param ids The page's movie ids, at most `LIBRARY_PAGE_SIZE`.
 */
export async function getLibraryTitles(
  ids: readonly number[],
): Promise<LibraryTitles> {
  try {
    const { found } = await getMovieSummaries(ids);
    return {
      kind: "ok",
      titles: new Map(found.map((movie) => [movie.id, movie])),
    };
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.listRead, "tmdb_unavailable");
    return { kind: "failed" };
  }
}

/** A page past the end: no rows, and the real total to redirect with. */
function pastTheEnd(result: {
  error: unknown;
  count: number | null;
}): LibraryPage<never> {
  if (result.error || result.count === null) return failed();
  return { kind: "ok", rows: [], total: result.count };
}

function failed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.listRead, "db_error");
  return { kind: "failed" };
}
