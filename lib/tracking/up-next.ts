import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import type { MovieSummary } from "@/lib/tmdb";
import { airStatus } from "@/lib/tv/air-status";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { TrackingRead } from "./types";

/**
 * The request scoped reads behind `/upcoming` (spec 0014, API surface).
 *
 * Neither may ever run inside `use cache`: both answers belong to one person
 * (`AGENTS.md` section 11, AC-15). Each calls `requireUser()` itself, outside
 * its `try`, so a request that got past the proxy still reads nothing, and
 * filters `user_id` explicitly as well as through row level security, the
 * spec 0007 pattern. Each is wrapped in React `cache()`, so the page asks
 * each question once per request.
 */

/**
 * How many planned movies Coming soon checks for a release date (AC-11). Each
 * one is a TMDB summary read, cached but cold for a new heavy user, so the
 * page checks the most recent plans and says so when there are more.
 */
export const UPCOMING_MOVIE_CHECK_LIMIT = 200;

/**
 * The ids of the user's Watching shows, most recently active first (AC-3).
 *
 * Read from `user_up_next_shows`, which lists Watching shows only and works
 * out `last_activity_at`; `show_id` is the tiebreak, so two shows touched in
 * the same instant never swap places. Every row, with no page: Up Next shows
 * all of them (spec 0014, Consequences).
 */
export const getUpNextShows = cache(
  async (): Promise<TrackingRead<number[]>> => {
    const user = await requireUser();

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_up_next_shows")
        .select("show_id")
        .eq("user_id", user.id)
        .order("last_activity_at", { ascending: false })
        .order("show_id", { ascending: true });

      if (error) return upNextReadFailed();
      // A view's columns are all nullable to the type generator; the view
      // itself never yields a null id.
      const ids = data.flatMap((row) =>
        row.show_id === null ? [] : [row.show_id],
      );
      return { kind: "ok", state: ids };
    } catch {
      // A network failure inside supabase-js. The error is dropped: its
      // message can carry request details.
      return upNextReadFailed();
    }
  },
);

/** The planned movies Coming soon checks, and how many are planned in all. */
export type UpcomingMovieCandidates = { ids: number[]; total: number };

/**
 * The user's most recently planned movies, at most
 * `UPCOMING_MOVIE_CHECK_LIMIT`, newest plan first, with the exact number
 * planned (AC-11). Reads `user_movie_state` through its watchlist index, in
 * the watchlist page's own order.
 */
export const getUpcomingMovieCandidates = cache(
  async (): Promise<TrackingRead<UpcomingMovieCandidates>> => {
    const user = await requireUser();

    try {
      const supabase = await createClient();
      const { data, error, count } = await supabase
        .from("user_movie_state")
        .select("movie_id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("in_watchlist", true)
        .order("watchlisted_at", { ascending: false })
        .order("movie_id", { ascending: false })
        .limit(UPCOMING_MOVIE_CHECK_LIMIT);

      if (error || count === null) return comingSoonReadFailed();
      return {
        kind: "ok",
        state: { ids: data.map((row) => row.movie_id), total: count },
      };
    } catch {
      return comingSoonReadFailed();
    }
  },
);

/** A Coming soon movie: a summary whose release date is known. */
export type ComingSoonMovie = MovieSummary & { releaseDate: string };

/**
 * The planned movies that are not out yet, soonest first (AC-11).
 *
 * Kept only when `airStatus` calls the release date `upcoming`: a known date
 * strictly after today's UTC date, the rule episodes use. An undated or
 * released movie is left out; it stays on `/watchlist`. Ties on the date fall
 * back to the title, then the id, so the order never depends on TMDB's reply.
 *
 * @param summaries The candidates TMDB found.
 * @param today `requestTodayUtc()`, read once per request.
 */
export function comingSoonMovies(
  summaries: readonly MovieSummary[],
  today: string,
): ComingSoonMovie[] {
  return summaries
    .filter(
      (movie): movie is ComingSoonMovie =>
        movie.releaseDate !== null &&
        airStatus(movie.releaseDate, today) === "upcoming",
    )
    .sort(
      (a, b) =>
        (a.releaseDate < b.releaseDate
          ? -1
          : a.releaseDate > b.releaseDate
            ? 1
            : 0) ||
        a.title.localeCompare(b.title, "en") ||
        a.id - b.id,
    );
}

function upNextReadFailed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.upNextRead, "db_error");
  return { kind: "failed" };
}

function comingSoonReadFailed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.comingSoonRead, "db_error");
  return { kind: "failed" };
}
