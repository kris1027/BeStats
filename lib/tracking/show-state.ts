import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { TrackingRead } from "./types";

/**
 * The request scoped reads behind the show tracking control, the progress
 * line and the grid bookmarks (spec 0013, API surface; spec 0020).
 *
 * None may ever run inside `use cache`: every result belongs to one person
 * (`AGENTS.md` section 11, AC-12, AC-22). Each is wrapped in React `cache()`
 * with primitive arguments, so every piece of one page that asks the same
 * question shares one query per request. Each checks `publicEnvProblems()`
 * first, as the movie reads do, so a clone with no Supabase configuration
 * still serves the catalog with no personal widgets.
 */

/**
 * Rows asked for per request. The API caps every response at `max_rows`
 * (1000 in `supabase/config.toml`) and truncates past it without an error.
 */
export const WATCHED_IDS_PAGE_SIZE = 1000;

/**
 * Whether the signed in user tracks one show (spec 0020, AC-1, AC-2): a show
 * is tracked while its row exists, with nothing else to read.
 *
 * @param showId The show, already confirmed by `loadShow`.
 */
export const getShowTracking = cache(
  async (showId: number): Promise<TrackingRead<boolean>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_show_state")
        .select("show_id")
        .eq("user_id", user.id)
        .eq("show_id", showId)
        .maybeSingle();

      if (error) return trackingReadFailed();
      return { kind: "ok", state: data !== null };
    } catch {
      // A network failure inside supabase-js. The error is dropped: its
      // message can carry request details (AC-21).
      return trackingReadFailed();
    }
  },
);

/**
 * Which shows on a grid are tracked, in one query for the whole grid (spec
 * 0020, AC-6), the `getWatchlistedMovieIds` pattern.
 *
 * @param idsKey The grid's show ids, from `showIdsKey`.
 */
export const getTrackedShows = cache(
  async (idsKey: string): Promise<TrackingRead<Set<number>>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const ids = parseIdsKey(idsKey);
    if (ids.length === 0) return { kind: "ok", state: new Set() };

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_show_state")
        .select("show_id")
        .eq("user_id", user.id)
        .in("show_id", ids);

      if (error) return trackingReadFailed();
      return { kind: "ok", state: new Set(data.map((row) => row.show_id)) };
    } catch {
      return trackingReadFailed();
    }
  },
);

/**
 * The signed in user's watched episode ids for each of the given shows, any
 * season, in one paged query (spec 0013, AC-9, AC-10, AC-15).
 *
 * Progress matches these against TMDB's own episode ids, never against the
 * stored season and episode numbers, so an episode TMDB renumbers still
 * counts once and a special or an episode TMDB dropped simply finds no match
 * (spec 0011, AC-25). Reads in pages ordered by the primary key until the
 * exact count is reached, as `getShowEpisodeRatings` does, so a long running
 * show never loses rows to the response cap.
 *
 * @param idsKey The show ids, from `showIdsKey`: one for the show hero.
 */
export const getWatchedEpisodeIds = cache(
  async (idsKey: string): Promise<TrackingRead<Map<number, Set<number>>>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const ids = parseIdsKey(idsKey);
    const state = new Map<number, Set<number>>(
      ids.map((id) => [id, new Set<number>()]),
    );
    if (ids.length === 0) return { kind: "ok", state };

    try {
      const supabase = await createClient();
      let offset = 0;
      for (;;) {
        const { data, count, error } = await supabase
          .from("user_episode_state")
          .select("show_id, episode_id", { count: "exact" })
          .eq("user_id", user.id)
          .in("show_id", ids)
          .not("watched_at", "is", null)
          .order("episode_id")
          .range(offset, offset + WATCHED_IDS_PAGE_SIZE - 1);

        if (error || count === null) return watchedReadFailed();

        for (const row of data) state.get(row.show_id)?.add(row.episode_id);
        offset += data.length;
        // An empty page ends the loop even if rows were deleted mid read.
        if (data.length === 0 || offset >= count) break;
      }
      return { kind: "ok", state };
    } catch {
      return watchedReadFailed();
    }
  },
);

/**
 * The cache key the reads above expect: the same ids in any order give the
 * same key, so every card on one page shares one read.
 *
 * @param ids The show ids.
 */
export function showIdsKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

function parseIdsKey(idsKey: string): number[] {
  return idsKey === "" ? [] : idsKey.split(",").map(Number);
}

function trackingReadFailed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.showTrackingRead, "db_error");
  return { kind: "failed" };
}

function watchedReadFailed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.watchedEpisodesRead, "db_error");
  return { kind: "failed" };
}
