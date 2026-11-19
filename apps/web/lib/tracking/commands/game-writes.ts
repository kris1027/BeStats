import "server-only";

import { isGameReleased } from "@bestats/core/catalog/game-page";
import type {
  gameRatingInputSchema,
  gameStatusInputSchema,
  removeGameInputSchema,
  restoreGameStatusInputSchema,
  restoreRemovedGameInputSchema,
} from "@bestats/core/tracking/schemas";
import type {
  GameRestoreState,
  GameStatus,
  GameTrackingError,
  GameTrackingResult,
  GameUndo,
} from "@bestats/core/tracking/types";
import { todayUtc } from "@bestats/core/tv/air-status";
import type { z } from "zod";

import { readGameIncludingHidden } from "@/lib/igdb/load-game";

import { TRACKING_EVENT, type TrackingEvent } from "../log";
import { classifyGameTrackingError } from "../supabase-error";
import { runTrackingCommand, type TrackingDeps, type WriteStep } from "./run";

/**
 * The game status, score and removal commands (spec 0026, API surface),
 * shared by the Server Actions in `app/games/actions.ts` and the
 * `/api/v1/me/games` routes (spec 0033, AC-5).
 *
 * Each runs after its input is parsed and its user verified: the IGDB check
 * where a write could move a game forward, then the SQL call through Row
 * Level Security. Each takes a target value, never a toggle, so the same call
 * twice gives the same row (spec 0026, AC-3). The release gate lives here and
 * not in the database (spec 0024, security model), and the date it reads is
 * always IGDB's on the server, never the caller's (spec 0033, AC-6). None
 * throws, and `user_id` is always `auth.uid()` inside the SQL or the verified
 * user's (AGENTS.md section 5).
 */

/**
 * What a write confirms with IGDB first (spec 0026, AC-9). `none` for a
 * removal, a cleared score and both restores, which only ever put back or
 * take away and so must work during an outage, for a hidden game and before
 * release. `known` for Want to play: any id IGDB has, hidden included, so a
 * listed game IGDB later hides can still be moved back. `listed` for Playing
 * and Finished: known, not hidden, and released. `released` for a score:
 * known and released. A hidden game can still be scored: `rate_game` needs
 * Playing or Finished, which the game could only have reached while listed.
 */
type IgdbCheck = "none" | "known" | "listed" | "released";

/** Confirms the game with IGDB, and where asked, that it is out. */
async function checkIgdb(
  gameId: number,
  check: Exclude<IgdbCheck, "none">,
): Promise<GameTrackingError | null> {
  const result = await readGameIncludingHidden(gameId);
  if (result.kind === "failed") return "igdb_unavailable";
  if (
    result.kind === "not_found" ||
    (check === "listed" && result.game.hidden)
  ) {
    return "not_found";
  }
  if (
    check !== "known" &&
    !isGameReleased(result.game.releaseDate, todayUtc(new Date()))
  ) {
    return "not_released";
  }
  return null;
}

/**
 * The game side of `runTrackingCommand`: the IGDB check and release gate, and
 * the Undo that comes back. Shared by every game command, so none of them can
 * skip the gate (AGENTS.md section 7, "Games").
 */
async function runGameCommand<D>(
  deps: TrackingDeps,
  event: TrackingEvent,
  gameId: number,
  check: IgdbCheck,
  write: WriteStep<D>,
  readUndo?: (data: D | null) => GameUndo | undefined,
): Promise<GameTrackingResult> {
  const outcome = await runTrackingCommand(deps, {
    event,
    check: check === "none" ? undefined : () => checkIgdb(gameId, check),
    write,
    classify: classifyGameTrackingError,
    read: readUndo,
  });
  if (!outcome.ok) return outcome;
  return outcome.value ? { ok: true, undo: outcome.value } : { ok: true };
}

/**
 * The five columns `set_game_status` (`prev_*`) and `remove_game`
 * (`removed_*`) both return, under their prefix. Every column is nullable
 * here although the generated row marks them not null: `prev_*` are all null
 * when there was no row. Typed from the prefix rather than a hand written
 * shape, so a renamed SQL column is still a compile error at the call.
 */
type RestoreColumns<P extends "prev_" | "removed_"> = Record<
  `${P}status`,
  GameStatus | null
> &
  Record<`${P}rating`, number | null> &
  Record<`${P}added_at` | `${P}started_at` | `${P}finished_at`, string | null>;

/**
 * Reads the state an Undo puts back from a write's prefixed columns, or null
 * when the row held no game (no status or no added date).
 */
function readRestoreState<P extends "prev_" | "removed_">(
  row: RestoreColumns<P>,
  prefix: P,
): GameRestoreState | null {
  const status: GameStatus | null = row[`${prefix}status`];
  const addedAt: string | null = row[`${prefix}added_at`];
  if (status === null || addedAt === null) return null;
  return {
    status,
    addedAt,
    rating: row[`${prefix}rating`],
    startedAt: row[`${prefix}started_at`],
    finishedAt: row[`${prefix}finished_at`],
  };
}

/** The restore arguments both Undo functions share. */
function restoreArgs(previous: GameRestoreState) {
  return {
    p_status: previous.status,
    p_added_at: previous.addedAt,
    p_rating: previous.rating ?? undefined,
    p_started_at: previous.startedAt ?? undefined,
    p_finished_at: previous.finishedAt ?? undefined,
  };
}

/**
 * Sets a game's status, from any status or none: the command behind
 * `setGameStatus` and `PUT /api/v1/me/games/{id}` with a status (spec 0026,
 * AC-3). A move to Want to play clears the score in the same statement, and
 * when it did, the result carries the old status, score and dates as the
 * `status` Undo (AC-5).
 *
 * Playing and Finished are forward moves, so they wait for the release date
 * and refuse a hidden game; Want to play only needs IGDB to know the id
 * (AC-9). `set_game_status` reads the previous values under a row lock, so
 * two tabs can never both receive the same Undo (AC-13).
 */
export function setGameStatusCommand(
  deps: TrackingDeps,
  input: z.infer<typeof gameStatusInputSchema>,
): Promise<GameTrackingResult> {
  return runGameCommand(
    deps,
    TRACKING_EVENT.gameStatus,
    input.gameId,
    input.status === "want_to_play" ? "known" : "listed",
    (supabase) =>
      supabase.rpc("set_game_status", {
        p_game_id: input.gameId,
        p_status: input.status,
      }),
    (data) => {
      const row = data?.[0];
      const previous = row ? readRestoreState(row, "prev_") : null;
      if (
        input.status !== "want_to_play" ||
        !previous ||
        previous.status === "want_to_play" ||
        previous.rating === null
      ) {
        return undefined;
      }
      return { kind: "status", previous };
    },
  );
}

/**
 * Stores a score from 1 to 10, or clears it: the command behind
 * `setGameRating` and `PUT /api/v1/me/games/{id}` with a rating (spec 0026,
 * AC-6). A score waits for the release date; clearing never does, so a score
 * stored before release can always be removed (AC-8, AC-9; spec 0033, AC-6).
 *
 * A score goes through `rate_game`, which writes only on Playing or Finished
 * and otherwise refuses with `not_started`. Clearing is a plain update that
 * touches only `rating`, so no date moves; on a row another tab removed it
 * matches nothing and succeeds. It matches only a scored row, because any
 * update moves `updated_at`, and `restore_game_status` measures its 10 minute
 * window from that: a stale tab clearing an unscored Want to play row would
 * otherwise extend an old Undo.
 */
export function setGameRatingCommand(
  deps: TrackingDeps,
  input: z.infer<typeof gameRatingInputSchema>,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRate;
  const score = input.rating;
  if (score !== null) {
    return runGameCommand(deps, event, input.gameId, "released", (supabase) =>
      supabase.rpc("rate_game", { p_game_id: input.gameId, p_rating: score }),
    );
  }
  return runGameCommand(deps, event, input.gameId, "none", (supabase, userId) =>
    supabase
      .from("user_game_state")
      .update({ rating: null })
      .eq("user_id", userId)
      .eq("game_id", input.gameId)
      .not("rating", "is", null),
  );
}

/**
 * Removes a game from the list: the command behind `removeGame` and
 * `DELETE /api/v1/me/games/{id}` (spec 0026, AC-4). The result carries what
 * the row held as the `removed` Undo; a game another tab already removed
 * comes back with no Undo, a quiet success. Never calls IGDB (AC-9).
 */
export function removeGameCommand(
  deps: TrackingDeps,
  input: z.infer<typeof removeGameInputSchema>,
): Promise<GameTrackingResult> {
  return runGameCommand(
    deps,
    TRACKING_EVENT.gameRemove,
    input.gameId,
    "none",
    (supabase) => supabase.rpc("remove_game", { p_game_id: input.gameId }),
    (data) => {
      const row = data?.[0];
      const previous = row ? readRestoreState(row, "removed_") : null;
      if (!row || !previous) return undefined;
      return { kind: "removed", removedAt: row.removed_at, previous };
    },
  );
}

/**
 * The Undo of a move to Want to play that cleared a score: the command behind
 * `restoreGameStatus` and the `game_status` restore route (spec 0026, AC-5;
 * spec 0035, Undo). `restore_game_status` accepts the values only on a row
 * still Want to play with no score, changed in the last 10 minutes, with
 * every date in the past, and otherwise refuses as `undo_expired` (AC-14).
 *
 * No IGDB check: a restore only puts back a state the user already had, so
 * it works during an outage, for a hidden game and before release (AC-9).
 */
export function restoreGameStatusCommand(
  deps: TrackingDeps,
  input: z.infer<typeof restoreGameStatusInputSchema>,
): Promise<GameTrackingResult> {
  return runGameCommand(
    deps,
    TRACKING_EVENT.gameRestoreStatus,
    input.gameId,
    "none",
    (supabase) =>
      supabase.rpc("restore_game_status", {
        p_game_id: input.gameId,
        ...restoreArgs(input.previous),
      }),
  );
}

/**
 * The Undo of a removal: the command behind `restoreRemovedGame` and the
 * `game_removed` restore route (spec 0026, AC-4). `restore_removed_game`
 * puts the row back only when none exists, within 10 minutes of `removedAt`,
 * with every date in the past (AC-14). No IGDB check, for the same reason as
 * `restoreGameStatusCommand`.
 */
export function restoreRemovedGameCommand(
  deps: TrackingDeps,
  input: z.infer<typeof restoreRemovedGameInputSchema>,
): Promise<GameTrackingResult> {
  return runGameCommand(
    deps,
    TRACKING_EVENT.gameRestoreRemoved,
    input.gameId,
    "none",
    (supabase) =>
      supabase.rpc("restore_removed_game", {
        p_game_id: input.gameId,
        p_removed_at: input.removedAt,
        ...restoreArgs(input.previous),
      }),
  );
}
