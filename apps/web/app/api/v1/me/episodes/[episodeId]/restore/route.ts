import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import {
  EPISODE_ERROR_TO_V1,
  showIdParamSchema,
} from "@bestats/core/api/v1/show";
import { EPISODE_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import { undoEpisodeMarkCommand } from "@/lib/tracking/commands/show-writes";

/**
 * `POST /api/v1/me/episodes/{episodeId}/restore` (spec 0035, Undo): clears a
 * mark only while it is still the one the earlier write stored, through the
 * command behind `undoEpisodeMark`. Only an `episode` cleared state for this
 * path's episode is accepted (400 otherwise); a mark changed since answers
 * 409 `undo_expired` (spec 0033, AC-7).
 */
export const POST = withV1({
  name: "me.episodes.restore",
  auth: "bearer",
  input: {
    params: z.object({ episodeId: showIdParamSchema }),
    body: restoreBodySchema("episode"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.episodeId !== input.params.episodeId) {
      return v1Fail("invalid_input");
    }
    return trackingAnswer(
      await undoEpisodeMarkCommand(bearerDeps(user), cleared),
      EPISODE_ERROR_TO_V1,
      EPISODE_TRACKING_MESSAGES,
    );
  },
});
