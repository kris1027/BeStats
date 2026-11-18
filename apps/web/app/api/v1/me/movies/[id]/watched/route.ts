import {
  MOVIE_ERROR_TO_V1,
  movieIdParamSchema,
  v1WatchedBodySchema,
} from "@bestats/core/api/v1/movie";
import { TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { setMovieWatchedCommand } from "@/lib/tracking/commands/set-movie-watched";

/**
 * `PUT /api/v1/me/movies/{id}/watched` (spec 0033, child 0035): marks a movie
 * watched, or clears the mark, for the verified caller.
 *
 * It runs `setMovieWatchedCommand`, the very command behind the web's
 * `setMovieWatched` Server Action, so the same input gives the same result
 * (AC-5). The release gate runs inside it on a date read on the server: a mark
 * before release day (UTC) answers 409 `not_released` and writes nothing,
 * while clearing a mark is never gated (AC-6). A refusal carries the action's
 * own error word as `reason` and its English copy as the message. The user
 * id is the verified token's, never the caller's (AGENTS.md sections 5, 7
 * and 11).
 */
export const PUT = withV1({
  name: "me.movies.watched.put",
  auth: "bearer",
  input: {
    params: z.object({ id: movieIdParamSchema }),
    body: v1WatchedBodySchema,
  },
  handler: async ({ input, user }) => {
    const result = await setMovieWatchedCommand(
      { userId: user.userId, getClient: async () => user.client },
      { movieId: input.params.id, watched: input.body.watched },
    );
    if (result.ok) return v1Ok(result);
    return v1Fail(MOVIE_ERROR_TO_V1[result.error], {
      reason: result.error,
      message: TRACKING_MESSAGES[result.error],
    });
  },
});
