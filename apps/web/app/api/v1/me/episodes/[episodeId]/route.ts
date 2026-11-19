import {
  EPISODE_ERROR_TO_V1,
  showIdParamSchema,
  v1EpisodeBodySchema,
} from "@bestats/core/api/v1/show";
import { EPISODE_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import {
  setEpisodeRatingCommand,
  setEpisodeWatchedCommand,
} from "@/lib/tracking/commands/show-writes";

/**
 * `PUT /api/v1/me/episodes/{episodeId}` (spec 0035): marks an episode
 * watched or rates it, one change per request, through the commands behind
 * `setEpisodeWatched` and `setEpisodeRating` (spec 0033, AC-5). A mark or a
 * score on an episode still to air answers 409 `not_released` with reason
 * `not_aired`; removing either is never gated. Marking returns `markedAt`,
 * which the episode restore takes back for the Undo (AC-7).
 */
export const PUT = withV1({
  name: "me.episodes.put",
  auth: "bearer",
  input: {
    params: z.object({ episodeId: showIdParamSchema }),
    body: v1EpisodeBodySchema,
  },
  handler: async ({ input, user }) => {
    const deps = bearerDeps(user);
    const body = input.body;
    const target = {
      showId: body.showId,
      seasonNumber: body.season,
      episodeId: input.params.episodeId,
    };
    const result =
      "watched" in body
        ? await setEpisodeWatchedCommand(deps, {
            ...target,
            watched: body.watched,
          })
        : await setEpisodeRatingCommand(deps, {
            ...target,
            rating: body.rating,
          });
    return trackingAnswer(
      result,
      EPISODE_ERROR_TO_V1,
      EPISODE_TRACKING_MESSAGES,
    );
  },
});
