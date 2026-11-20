import type { MovieTrackingState } from "./types";

/**
 * One click, expressed as the target value it asks for. Target values rather
 * than toggles, so replaying the same intent twice gives the same state, which
 * is what makes queued rapid clicks settle on the last one (spec 0007, AC-15).
 */
export type TrackingIntent =
  | { kind: "watchlist"; value: boolean }
  | { kind: "watched"; value: boolean }
  | { kind: "rating"; value: number | null };

/**
 * The optimistic state a click produces, applied on top of the last state the
 * server confirmed.
 *
 * It mirrors the SQL in `supabase/schemas/05-functions.sql` exactly, because a
 * control whose optimistic guess disagrees with the database would flip twice:
 * once on the click and again when `refresh()` delivers the truth. A movie is
 * planned or watched, never both, and a score needs a watch mark
 * (prompts/movie-plan-watched-exclusive.md): planning clears the mark and the
 * score, marking clears the plan, unmarking clears the score, and a score on
 * an unwatched movie changes nothing, as `rate_movie` refuses it.
 *
 * @param state The state to build on: the server prop, or an earlier guess.
 * @param intent The click.
 * @returns The state the database will hold once the write lands.
 */
export function applyTrackingIntent(
  state: MovieTrackingState,
  intent: TrackingIntent,
): MovieTrackingState {
  switch (intent.kind) {
    case "watchlist":
      return intent.value
        ? { inWatchlist: true, watched: false, rating: null }
        : { ...state, inWatchlist: false };
    case "watched":
      return intent.value
        ? { ...state, watched: true, inWatchlist: false }
        : { ...state, watched: false, rating: null };
    case "rating":
      if (intent.value === null) return { ...state, rating: null };
      return state.watched ? { ...state, rating: intent.value } : state;
  }
}

/** Which movie pills work, from the release gate and the stored state. */
export type MovieTrackingAvailability = {
  /** Mark watched can be pressed: the movie is out, or a mark is there to remove. */
  canMark: boolean;
  /** Only Plan shows: before release with nothing stored to remove. */
  planOnly: boolean;
};

/**
 * The movie release gate as the pills read it (`AGENTS.md` section 7: a
 * movie can be watched or scored only from its release day). A stored mark
 * or score stays removable before release, so neither pill hides it. Both
 * apps call this, so the web and the phone gate the same way; the server's
 * own gate stays the authority.
 *
 * @param released Whether the release day (UTC) has come, from `isMovieReleased`.
 * @param state The shown state, pending taps included.
 */
export function movieTrackingAvailability(
  released: boolean,
  state: Pick<MovieTrackingState, "watched" | "rating">,
): MovieTrackingAvailability {
  return {
    canMark: released || state.watched,
    planOnly: !released && !state.watched && state.rating === null,
  };
}
