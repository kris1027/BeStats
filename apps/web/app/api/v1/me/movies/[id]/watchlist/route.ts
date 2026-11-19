import {
  MOVIE_ERROR_TO_V1,
  movieIdParamSchema,
  v1WatchlistBodySchema,
} from "@bestats/core/api/v1/movie";
import { TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import { setMovieWatchlistCommand } from "@/lib/tracking/commands/movie-writes";

/**
 * `PUT /api/v1/me/movies/{id}/watchlist` (spec 0035): plans or unplans a
 * movie for the verified caller, through the same command as the web's
 * `setMovieWatchlist` (spec 0033, AC-5). Planning a watched movie returns the
 * dropped mark and score as `cleared`, for the Undo (AC-7).
 */
export const PUT = withV1({
  name: "me.movies.watchlist.put",
  auth: "bearer",
  input: {
    params: z.object({ id: movieIdParamSchema }),
    body: v1WatchlistBodySchema,
  },
  handler: async ({ input, user }) =>
    trackingAnswer(
      await setMovieWatchlistCommand(bearerDeps(user), {
        movieId: input.params.id,
        inWatchlist: input.body.planned,
      }),
      MOVIE_ERROR_TO_V1,
      TRACKING_MESSAGES,
    ),
});
