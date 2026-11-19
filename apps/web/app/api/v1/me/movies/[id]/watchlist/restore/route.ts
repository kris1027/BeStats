import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import {
  MOVIE_ERROR_TO_V1,
  movieIdParamSchema,
} from "@bestats/core/api/v1/movie";
import { TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import { restoreMovieWatchlistCommand } from "@/lib/tracking/commands/movie-writes";

/**
 * `POST /api/v1/me/movies/{id}/watchlist/restore` (spec 0035, Undo): plans
 * an unplanned movie again at its old place, through the command behind
 * `restoreMovieWatchlist`. Only a `movie_watchlist` cleared state for this
 * path's movie is accepted (400 otherwise); the database decides whether the
 * Undo is still allowed (AC-7).
 */
export const POST = withV1({
  name: "me.movies.watchlist.restore",
  auth: "bearer",
  input: {
    params: z.object({ id: movieIdParamSchema }),
    body: restoreBodySchema("movie_watchlist"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.movieId !== input.params.id) return v1Fail("invalid_input");
    return trackingAnswer(
      await restoreMovieWatchlistCommand(bearerDeps(user), cleared),
      MOVIE_ERROR_TO_V1,
      TRACKING_MESSAGES,
    );
  },
});
