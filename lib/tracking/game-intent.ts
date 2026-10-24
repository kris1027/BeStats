import type { GameStatus, GameTrackingState } from "./types";

/**
 * One click on the game status control, as the target it asks for (spec
 * 0026, AC-11). A null status is a removal. Targets rather than toggles, so
 * replaying an intent gives the same state.
 */
export type GameIntent =
  | { kind: "status"; value: GameStatus | null }
  | { kind: "rating"; value: number | null };

/**
 * The optimistic state a click produces, on top of the last state the server
 * confirmed.
 *
 * It mirrors the SQL in `supabase/schemas/05-functions.sql`, so the control
 * never flips twice: `set_game_status` keeps the score between Playing and
 * Finished and nulls it on Want to play, `remove_game` deletes the row, and
 * `rate_game` refuses a score on no status or Want to play, so that changes
 * nothing here either. Clearing a score always lands.
 *
 * @param state The state to build on: the server prop, or an earlier guess.
 * @param intent The click.
 * @returns The state the database will hold once the write lands.
 */
export function applyGameIntent(
  state: GameTrackingState,
  intent: GameIntent,
): GameTrackingState {
  if (intent.kind === "status") {
    if (intent.value === null || intent.value === "want_to_play") {
      return { status: intent.value, rating: null };
    }
    return { status: intent.value, rating: state.rating };
  }
  if (intent.value === null) return { ...state, rating: null };
  return state.status === "playing" || state.status === "finished"
    ? { ...state, rating: intent.value }
    : state;
}
