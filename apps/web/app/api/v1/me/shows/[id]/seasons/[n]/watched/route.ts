import {
  EPISODE_ERROR_TO_V1,
  seasonNumberParamSchema,
  showIdParamSchema,
  v1SeasonWatchedBodySchema,
} from "@bestats/core/api/v1/show";
import { EPISODE_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import { setSeasonWatchedCommand } from "@/lib/tracking/commands/show-writes";

/**
 * `PUT /api/v1/me/shows/{id}/seasons/{n}/watched` (spec 0035): marks every
 * aired episode of a season watched (taken from TMDB on the server, never
 * future or undated ones), or unmarks the episodes the screen named, through
 * the command behind `setSeasonWatched` (spec 0033, AC-5; AGENTS.md
 * section 7). The result's `undo` is what the season restore takes back.
 */
export const PUT = withV1({
  name: "me.shows.seasons.watched.put",
  auth: "bearer",
  input: {
    params: z.object({ id: showIdParamSchema, n: seasonNumberParamSchema }),
    body: v1SeasonWatchedBodySchema,
  },
  handler: async ({ input, user }) => {
    const target = { showId: input.params.id, seasonNumber: input.params.n };
    const result = await setSeasonWatchedCommand(
      bearerDeps(user),
      input.body.watched
        ? { ...target, watched: true }
        : { ...target, watched: false, episodeIds: input.body.episodeIds },
    );
    return trackingAnswer(
      result,
      EPISODE_ERROR_TO_V1,
      EPISODE_TRACKING_MESSAGES,
    );
  },
});
