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
 * once on the click and again when `refresh()` delivers the truth. The two
 * couplings are the first transition into watched clearing the bookmark, and a
 * rating on an unwatched movie counting as that first transition. Unwatching
 * and clearing a rating touch only their own field (`AGENTS.md` section 7).
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
      return { ...state, inWatchlist: intent.value };
    case "watched":
      if (!intent.value) return { ...state, watched: false };
      return state.watched ? state : markWatched(state);
    case "rating":
      if (intent.value === null) return { ...state, rating: null };
      return state.watched
        ? { ...state, rating: intent.value }
        : { ...markWatched(state), rating: intent.value };
  }
}

function markWatched(state: MovieTrackingState): MovieTrackingState {
  return { ...state, watched: true, inWatchlist: false };
}
