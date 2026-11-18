import "server-only";

import type { MovieTrackingResult } from "@bestats/core/tracking/types";

import { TRACKING_EVENT } from "../log";
import { readCleared, runMovieCommand } from "./movie";
import type { TrackingDeps } from "./run";

/**
 * Marks a movie watched, or clears the mark: the command behind both the
 * `setMovieWatched` Server Action and `PUT /api/v1/me/movies/{id}/watched`
 * (spec 0033, AC-5). Its input is already parsed and its user verified.
 *
 * A new mark waits for the TMDB release date (`not_released`); clearing
 * never does, so a mark stored before release can always be removed
 * (AGENTS.md section 7, spec 0033, AC-6).
 *
 * Marking goes through `mark_movie_watched`, which also clears the plan and
 * keeps an existing date. Unmarking goes through `unmark_movie_watched`,
 * which also removes the score, since a movie score needs a watch mark, and
 * returns both as `cleared` for the Undo
 * (prompts/movie-plan-watched-exclusive.md).
 */
export function setMovieWatchedCommand(
  deps: TrackingDeps,
  input: { movieId: number; watched: boolean },
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watched;
  if (input.watched) {
    return runMovieCommand(deps, event, input.movieId, "released", (supabase) =>
      supabase.rpc("mark_movie_watched", { p_movie_id: input.movieId }),
    );
  }
  return runMovieCommand(
    deps,
    event,
    input.movieId,
    "none",
    (supabase) =>
      supabase
        .rpc("unmark_movie_watched", { p_movie_id: input.movieId })
        .single(),
    readCleared,
  );
}
