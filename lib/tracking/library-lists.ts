import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getMovieSummaries,
  getTvShowsByIds,
  type MovieSummary,
  TmdbError,
  type TvShowSummary,
} from "@/lib/tmdb";

import {
  ratingsBySeason,
  type SeasonEpisodeRating,
  showRating,
} from "@/lib/tv/ratings";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import { SHOW_RATINGS_PAGE_SIZE } from "./show-ratings";
import type { TvStatus } from "./types";

/**
 * The paged reads behind `/watchlist` and `/watched` (spec 0008, API surface;
 * spec 0013 for the merged watchlist).
 *
 * Postgres decides which titles are on a page and in what order; TMDB only
 * supplies their titles afterwards, 20 at most. Neither read may ever run
 * inside `use cache`: the rows belong to one person (`AGENTS.md` section 11,
 * AC-17). Each filters on `user_id` explicitly as well as through row level
 * security, the spec 0007 pattern, and orders with the TMDB id as the final
 * tiebreak so two rows stamped in the same instant never swap places between
 * pages.
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

/**
 * One watchlist entry: a planned movie, or a show that is Want to Watch or
 * Watching (spec 0013, AC-13). `status` is the show's, and null for a movie.
 */
export type WatchlistRow = {
  kind: "movie" | "tv";
  tmdbId: number;
  status: TvStatus | null;
};

/**
 * One watched entry: a watched movie, or a show with status Completed
 * (spec 0019, AC-1, AC-4).
 */
export type WatchedRow = {
  kind: "movie" | "tv";
  tmdbId: number;
  /**
   * The entry's sort time (AC-2). For a movie it is `watched_at` as PostgREST
   * returned it, so Undo can put back the exact instant.
   */
  watchedAt: string;
  /** A movie's personal score, or null when unrated; always null for a show. */
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
 * One page of the user's watchlist: planned movies and Want to Watch or
 * Watching shows in one order, newest first (spec 0008, AC-1; spec 0013,
 * AC-13).
 *
 * Read from the `user_watchlist_entries` view, which runs with the reader's
 * rights, so both tables' row level security applies. One ordered query with
 * an exact count, so the page and the total are always the truthful merged
 * ones: `listed_at` descending, then `kind` (movies before shows on a tie),
 * then the TMDB id.
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
      .from("user_watchlist_entries")
      .select("kind, tmdb_id, status", { count: "exact" })
      .eq("user_id", userId)
      .order("listed_at", { ascending: false })
      .order("kind", { ascending: true })
      .order("tmdb_id", { ascending: true })
      .range(...pageRange(page));

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      return pastTheEnd(
        await supabase
          .from("user_watchlist_entries")
          .select("tmdb_id", { count: "exact", head: true })
          .eq("user_id", userId),
      );
    }
    if (error || count === null) return failed();

    const rows: WatchlistRow[] = [];
    for (const row of data) {
      // A view's columns are all nullable to the type generator; the view
      // itself never yields a null id or an unknown kind.
      if (row.tmdb_id === null) continue;
      if (row.kind !== "movie" && row.kind !== "tv") continue;
      rows.push({ kind: row.kind, tmdbId: row.tmdb_id, status: row.status });
    }
    return { kind: "ok", rows, total: count };
  } catch {
    // A network failure inside supabase-js. The error is dropped on purpose,
    // as in the actions: its message can carry request details (AC-19).
    return failed();
  }
}

/**
 * One page of the user's watched history: watched movies and Completed shows
 * in one order, most recent first (spec 0008, AC-2; spec 0019, AC-1 to AC-3).
 *
 * Read from the `user_watched_entries` view, which runs with the reader's
 * rights, so every table's row level security applies. One ordered query with
 * an exact count, so the page and the total are the truthful merged ones:
 * `last_watched_at` descending, then `kind` (movies before shows on a tie),
 * then the TMDB id.
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
      .from("user_watched_entries")
      .select("kind, tmdb_id, last_watched_at, rating", { count: "exact" })
      .eq("user_id", userId)
      .order("last_watched_at", { ascending: false })
      .order("kind", { ascending: true })
      .order("tmdb_id", { ascending: true })
      .range(...pageRange(page));

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      return pastTheEnd(
        await supabase
          .from("user_watched_entries")
          .select("tmdb_id", { count: "exact", head: true })
          .eq("user_id", userId),
      );
    }
    if (error || count === null) return failed();

    const rows: WatchedRow[] = [];
    for (const row of data) {
      // A view's columns are all nullable to the type generator; the view
      // itself never yields a null id or time, or an unknown kind.
      if (row.tmdb_id === null || row.last_watched_at === null) continue;
      if (row.kind !== "movie" && row.kind !== "tv") continue;
      rows.push({
        kind: row.kind,
        tmdbId: row.tmdb_id,
        watchedAt: row.last_watched_at,
        rating: row.rating,
      });
    }
    return { kind: "ok", rows, total: count };
  } catch {
    return failed();
  }
}

/**
 * Each listed show's calculated rating: the equal weight mean of its rated
 * regular seasons, unrounded, or null when none is rated (spec 0019, AC-5;
 * `AGENTS.md` section 9). The rule itself lives once, in `lib/tv/ratings.ts`.
 *
 * One query for the whole page rather than one per card, read in pages
 * because the API truncates past `max_rows` without an error and a short read
 * would average the wrong ratings. Each page starts after the last
 * `(show_id, episode_id)` read, not at an offset: a rating cleared or added
 * mid read would shift an offset, skipping or repeating a row of another
 * season. Keyset pages read each row at most once, and every row that stays
 * put is read.
 *
 * A failed read is `failed`, never a short map: a show missing from the map
 * would render with no badge, a false "not rated" (AC-10).
 *
 * @param userId The verified session's user, never a client value.
 * @param showIds The page's show ids, at most `LIBRARY_PAGE_SIZE`.
 */
export async function getShowRatings(
  userId: string,
  showIds: readonly number[],
): Promise<
  { kind: "ok"; ratings: Map<number, number | null> } | { kind: "failed" }
> {
  const rows = new Map<number, SeasonEpisodeRating[]>(
    showIds.map((id) => [id, []]),
  );
  if (showIds.length === 0) return { kind: "ok", ratings: new Map() };

  try {
    const supabase = await createClient();
    let after: { showId: number; episodeId: number } | null = null;
    for (;;) {
      let query = supabase
        .from("user_episode_state")
        .select("show_id, episode_id, season_number, rating", {
          count: "exact",
        })
        .eq("user_id", userId)
        .in("show_id", [...showIds])
        .not("rating", "is", null);
      if (after) {
        query = query.or(
          `show_id.gt.${after.showId},and(show_id.eq.${after.showId},episode_id.gt.${after.episodeId})`,
        );
      }
      const { data, count, error } = await query
        .order("show_id")
        .order("episode_id")
        .range(0, SHOW_RATINGS_PAGE_SIZE - 1);
      if (error || count === null) return failed();

      for (const row of data) {
        if (row.rating === null) continue;
        rows
          .get(row.show_id)
          ?.push({ seasonNumber: row.season_number, rating: row.rating });
      }
      // `count` is what remains past the cursor, so a page holding all of it
      // is the last. An empty page ends the loop whatever the count says.
      const last = data.at(-1);
      if (!last || data.length >= count) break;
      after = { showId: last.show_id, episodeId: last.episode_id };
    }
  } catch {
    return failed();
  }

  const ratings = new Map<number, number | null>();
  for (const [showId, showRows] of rows) {
    ratings.set(showId, showRating(ratingsBySeason(showRows)).mean);
  }
  return { kind: "ok", ratings };
}

/** A page's titles, keyed by TMDB id per kind, or a systemic TMDB failure. */
export type LibraryTitles =
  | {
      kind: "ok";
      movies: Map<number, MovieSummary>;
      shows: Map<number, TvShowSummary>;
    }
  | { kind: "failed" };

/**
 * The TMDB titles for one page of rows, through the cached per title reads
 * (spec 0008, AC-11; spec 0013, AC-17).
 *
 * A title TMDB no longer has is simply absent from its map, so the page shows
 * its "No longer on TMDB" card. A systemic failure (a rejected token, an
 * exhausted rate limit) is `failed` rather than a short map, because a short
 * map would render every title as missing and invite the user to remove rows
 * that are fine (`AGENTS.md` section 12).
 *
 * @param movieIds The page's movie ids.
 * @param showIds The page's show ids. Together at most `LIBRARY_PAGE_SIZE`.
 */
export async function getLibraryTitles(
  movieIds: readonly number[],
  showIds: readonly number[] = [],
): Promise<LibraryTitles> {
  try {
    const [movies, shows] = await Promise.all([
      movieIds.length > 0
        ? getMovieSummaries(movieIds)
        : { found: [], missingIds: [] },
      showIds.length > 0
        ? getTvShowsByIds(showIds)
        : { found: [], missingIds: [] },
    ]);
    return {
      kind: "ok",
      movies: new Map(movies.found.map((movie) => [movie.id, movie])),
      shows: new Map(shows.found.map((show) => [show.id, show])),
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
