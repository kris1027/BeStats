import {
  MOVIE_ERROR_TO_V1,
  movieIdParamSchema,
  v1RatingBodySchema,
} from "@bestats/core/api/v1/movie";
import { TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import { setMovieRatingCommand } from "@/lib/tracking/commands/movie-writes";

/**
 * `PUT /api/v1/me/movies/{id}/rating` (spec 0035): stores or clears the
 * caller's score through the command behind `setMovieRating` (spec 0033,
 * AC-5). A score before release day (UTC) answers 409 `not_released`; a
 * clear is never gated (AC-6).
 */
export const PUT = withV1({
  name: "me.movies.rating.put",
  auth: "bearer",
  input: {
    params: z.object({ id: movieIdParamSchema }),
    body: v1RatingBodySchema,
  },
  handler: async ({ input, user }) =>
    trackingAnswer(
      await setMovieRatingCommand(bearerDeps(user), {
        movieId: input.params.id,
        rating: input.body.rating,
      }),
      MOVIE_ERROR_TO_V1,
      TRACKING_MESSAGES,
    ),
});
