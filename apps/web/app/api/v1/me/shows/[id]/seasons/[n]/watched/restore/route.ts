import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import {
  EPISODE_ERROR_TO_V1,
  seasonNumberParamSchema,
  showIdParamSchema,
} from "@bestats/core/api/v1/show";
import { EPISODE_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import { undoSeasonWatchedCommand } from "@/lib/tracking/commands/show-writes";

/**
 * `POST /api/v1/me/shows/{id}/seasons/{n}/watched/restore` (spec 0035,
 * Undo): reverses a season mark or unmark with the `undo` the write returned,
 * through the command behind `undoSeasonWatched`. Only a `season` cleared
 * state for this path's show is accepted (400 otherwise); the database bounds
 * every restored date (spec 0033, AC-7).
 */
export const POST = withV1({
  name: "me.shows.seasons.watched.restore",
  auth: "bearer",
  input: {
    params: z.object({ id: showIdParamSchema, n: seasonNumberParamSchema }),
    body: restoreBodySchema("season"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.showId !== input.params.id) return v1Fail("invalid_input");
    return trackingAnswer(
      await undoSeasonWatchedCommand(bearerDeps(user), cleared),
      EPISODE_ERROR_TO_V1,
      EPISODE_TRACKING_MESSAGES,
    );
  },
});
