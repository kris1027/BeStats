import type { GameStatus, GameTrackingState } from "./types";

/**
 * Whether a status can carry a score: Playing or Finished, never Want to
 * play or no status (`AGENTS.md` "Games", spec 0026, AC-6). The one copy the
 * TypeScript side reads; `rate_game` and the table's check hold it in SQL.
 */
export function canHoldScore(status: GameStatus | null): boolean {
  return status === "playing" || status === "finished";
}

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
  return canHoldScore(state.status)
    ? { ...state, rating: intent.value }
    : state;
}

/**
 * Whether the release gate holds a status pill back (`AGENTS.md` "Games",
 * spec 0026, AC-8): before release only Want to play can be chosen, while the
 * pressed pill stays live so it can still be removed. Both apps call this;
 * the server's gate stays the authority.
 *
 * @param released Whether the game is out, from `isGameReleased`.
 * @param current The shown status, pending taps included.
 * @param status The pill asked about.
 */
export function isGameStatusHeldBack(
  released: boolean,
  current: GameStatus | null,
  status: GameStatus,
): boolean {
  return !released && status !== "want_to_play" && current !== status;
}

/**
 * Whether choosing `status` opens the score sheet (spec 0026, AC-7): moving
 * into Finished with no score asks for one at once, while Playing never does.
 *
 * @param state The shown state, pending taps included.
 * @param status The pill just chosen.
 */
export function opensScoreSheet(
  state: GameTrackingState,
  status: GameStatus,
): boolean {
  return (
    status === "finished" &&
    state.status !== "finished" &&
    state.rating === null
  );
}
