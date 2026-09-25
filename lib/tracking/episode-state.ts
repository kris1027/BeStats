import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/tv/air-status";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { EpisodeTrackingState, TrackingRead } from "./types";

/**
 * The signed in user's state for every episode of one season, in one query for
 * the whole page (spec 0011, AC-18).
 *
 * The season header and every row ask for the same set, so the arguments are
 * primitives: React `cache()` compares by identity, and only a string lets a
 * season of any length share one read per request. Never called inside `use
 * cache`: the result belongs to one person (`AGENTS.md` section 11, AC-20).
 *
 * The filter on the page's own ids is also what keeps orphaned rows off the
 * page: an episode TMDB no longer lists stays stored but is never shown or
 * counted (AC-25). No row for an id means the empty state.
 *
 * @param showId The show, already confirmed by `loadSeason`.
 * @param idsKey The whole season's episode ids, from `episodeIdsKey`.
 */
export const getSeasonEpisodeTracking = cache(
  async (
    showId: number,
    idsKey: string,
  ): Promise<TrackingRead<Record<number, EpisodeTrackingState>>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    if (ids.length === 0) return { kind: "ok", state: {} };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_episode_state")
      .select("episode_id, watched_at, rating")
      .eq("user_id", user.id)
      .eq("show_id", showId)
      .in("episode_id", ids);

    if (error) {
      logTrackingEvent(TRACKING_EVENT.episodeRead, "db_error");
      return { kind: "failed" };
    }

    const state: Record<number, EpisodeTrackingState> = {};
    for (const row of data) {
      state[row.episode_id] = {
        watched: row.watched_at !== null,
        rating: row.rating,
      };
    }
    return { kind: "ok", state };
  },
);

/**
 * The cache key `getSeasonEpisodeTracking` expects: the same ids in any order
 * give the same key. Built once per page from the whole season, never from a
 * single row, or each row would make its own query.
 *
 * @param ids The season's episode ids.
 */
export function episodeIdsKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

/**
 * Today in UTC, read once per request so the header and every row agree on
 * which episodes have aired (spec 0011, AC-3). Request scoped by design: it is
 * only ever called after the session read, outside any cache scope.
 */
export const requestTodayUtc = cache((): string => todayUtc(new Date()));
