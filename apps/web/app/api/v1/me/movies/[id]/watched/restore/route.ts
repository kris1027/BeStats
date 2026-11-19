import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import {
  MOVIE_ERROR_TO_V1,
  movieIdParamSchema,
} from "@bestats/core/api/v1/movie";
import { TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import { restoreMovieWatchedCommand } from "@/lib/tracking/commands/movie-writes";

/**
 * `POST /api/v1/me/movies/{id}/watched/restore` (spec 0035, Undo): puts back
 * a removed watch mark and score, through the command behind
 * `restoreMovieWatched`. Only a `movie_watched` cleared state for this path's
 * movie is accepted (400 otherwise), and it waits for the release date like a
 * new mark (spec 0033, AC-6, AC-7).
 */
export const POST = withV1({
  name: "me.movies.watched.restore",
  auth: "bearer",
  input: {
    params: z.object({ id: movieIdParamSchema }),
    body: restoreBodySchema("movie_watched"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.movieId !== input.params.id) return v1Fail("invalid_input");
    return trackingAnswer(
      await restoreMovieWatchedCommand(bearerDeps(user), cleared),
      MOVIE_ERROR_TO_V1,
      TRACKING_MESSAGES,
    );
  },
});
