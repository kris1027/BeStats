import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { SeasonEpisodeRating } from "@/lib/tv/ratings";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { TrackingRead } from "./types";

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
    const { data, error } = await supabase
      .from("user_episode_state")
      .select("season_number, rating")
      .eq("user_id", user.id)
      .eq("show_id", showId)
      .not("rating", "is", null);

    if (error) {
      logTrackingEvent(TRACKING_EVENT.showRatingRead, "db_error");
      return { kind: "failed" };
    }

    const state: SeasonEpisodeRating[] = [];
    for (const row of data) {
      if (row.rating !== null) {
        state.push({ seasonNumber: row.season_number, rating: row.rating });
      }
    }
    return { kind: "ok", state };
  },
);
