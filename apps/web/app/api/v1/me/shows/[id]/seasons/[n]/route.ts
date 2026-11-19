import {
  seasonNumberParamSchema,
  showIdParamSchema,
  type V1SeasonState,
} from "@bestats/core/api/v1/show";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { logTrackingEvent, TRACKING_EVENT } from "@/lib/tracking/log";

/**
 * `GET /api/v1/me/shows/{id}/seasons/{n}` (spec 0035): the caller's own
 * watched date and rating for each episode of a season they have a row for.
 * No catalog read: the app joins it with the public season. Scoped to the
 * verified user and RLS bound, `private, no-store` (AGENTS.md section 11).
 * A watched mark and a rating are independent, so both come back as stored.
 */
export const GET = withV1({
  name: "me.shows.seasons.get",
  auth: "bearer",
  input: {
    params: z.object({ id: showIdParamSchema, n: seasonNumberParamSchema }),
  },
  handler: async ({ input, user }) => {
    const { data, error } = await user.client
      .from("user_episode_state")
      .select("episode_id, watched_at, rating")
      .eq("user_id", user.userId)
      .eq("show_id", input.params.id)
      .eq("season_number", input.params.n)
      .order("episode_id");
    if (error) {
      logTrackingEvent(TRACKING_EVENT.episodeRead, "db_error");
      return v1Fail("internal");
    }
    const body: V1SeasonState = {
      episodes: (data ?? []).map((row) => ({
        episodeId: row.episode_id,
        watchedAt: row.watched_at,
        rating: row.rating,
      })),
    };
    return v1Ok(body);
  },
});
