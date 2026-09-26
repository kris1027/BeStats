import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { SeasonEpisodeRating } from "@/lib/tv/ratings";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { TrackingRead } from "./types";

/**
 * Rows asked for per request. The API caps every response at `max_rows`
 * (1000 in `supabase/config.toml`) and truncates past it without an error, so
 * a long running show read in one request would lose ratings silently.
 */
export const SHOW_RATINGS_PAGE_SIZE = 1000;

/**
 * The signed in user's rated episodes for one show, in one query for the
 * whole show page (spec 0012, AC-9).
 *
 * The heading and every season card ask with the same primitive, so React
 * `cache()` gives them one read per request. Rows are placed by the season
 * number stored when they were written, without asking TMDB which episodes it
 * still lists: that would cost a request per season on every show page. An
 * episode TMDB later removes or renumbers keeps counting under its old season
 * (spec 0012, Consequences).
 *
 * Reads in pages ordered by the primary key until the exact count is reached,
 * so a show with more rated episodes than one response holds (One Piece, a
 * daily soap) still averages every rating. The loop advances by the rows
 * actually returned, so a server cap below the page size cannot skip rows.
 *
 * Never called inside `use cache`: the result belongs to one person
 * (`AGENTS.md` section 11, AC-13).
 *
 * @param showId The show, already confirmed by `loadShow`.
 */
export const getShowEpisodeRatings = cache(
  async (showId: number): Promise<TrackingRead<SeasonEpisodeRating[]>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const supabase = await createClient();
    const state: SeasonEpisodeRating[] = [];
    let offset = 0;
    for (;;) {
      const { data, count, error } = await supabase
        .from("user_episode_state")
        .select("season_number, rating", { count: "exact" })
        .eq("user_id", user.id)
        .eq("show_id", showId)
        .not("rating", "is", null)
        .order("episode_id")
        .range(offset, offset + SHOW_RATINGS_PAGE_SIZE - 1);

      if (error || count === null) {
        logTrackingEvent(TRACKING_EVENT.showRatingRead, "db_error");
        return { kind: "failed" };
      }

      for (const row of data) {
        if (row.rating !== null) {
          state.push({ seasonNumber: row.season_number, rating: row.rating });
        }
      }
      offset += data.length;
      // An empty page ends the loop even if rows were deleted mid read.
      if (data.length === 0 || offset >= count) break;
    }
    return { kind: "ok", state };
  },
);
