"use server";

import { isGameReleased } from "@/lib/catalog/game-page";
import { TRACKING_EVENT, type TrackingEvent } from "@/lib/tracking/log";
import {
  gameRatingInputSchema,
  gameStatusInputSchema,
  removeGameInputSchema,
  restoreGameStatusInputSchema,
  restoreRemovedGameInputSchema,
} from "@/lib/tracking/schemas";
import { classifyGameTrackingError } from "@/lib/tracking/supabase-error";
import type {
  GameRestoreState,
  GameStatus,
  GameTrackingError,
  GameTrackingResult,
  GameUndo,
} from "@/lib/tracking/types";
import {
  parseTrackingInput,
  runTrackingWrite,
  type WriteStep,
} from "@/lib/tracking/write";
import { todayUtc } from "@/lib/tv/air-status";

import { readGameIncludingHidden } from "./[id]/load-game";

/**
 * The game status and rating mutations, as Server Actions (spec 0026, API
 * surface), sharing `runTrackingWrite` with `app/movies/actions.ts`.
 *
 * Each takes a target value, never a toggle, so the same call twice gives the
 * same row (AC-3). Each runs the same order: Zod parse, then the verified
 * session, then the IGDB check where a write could move a game forward, then
 * the SQL call through Row Level Security, then `refresh()` on success only
 * (AC-10). The release gate lives here and not in the database (spec 0024,
 * security model).
 *
 * None of them throws or redirects: every failure comes back as a
 * `GameTrackingResult`, so it reaches a toast rather than an error boundary.
 * `user_id` is always `auth.uid()` inside the SQL, never an argument
 * (`AGENTS.md` section 5).
 */

/**
 * What a write confirms with IGDB first (AC-9). `none` for a removal, a
 * cleared score and both restores, which only ever put back or take away and
 * so must work during an outage, for a hidden game and before release.
 * `known` for Want to play: any id IGDB has, hidden included, so a listed
 * game IGDB later hides can still be moved back. `listed` for Playing and
 * Finished: known, not hidden, and released. `released` for a score: known
 * and released. A hidden game can still be scored: `rate_game` needs Playing
 * or Finished, which the game could only have reached while it was listed.
 */
type IgdbCheck = "none" | "known" | "listed" | "released";

/**
 * The game side of `runTrackingWrite`: the IGDB check and release gate, and
 * the Undo that comes back.
 *
 * @param event The log event for a refusal.
 * @param gameId The already parsed game id.
 * @param check What to confirm with IGDB before writing.
 * @param write The Supabase call, given the request client and the user id.
 * @param readUndo For a write an Undo can take back, reads it from the data.
 */
async function runGameWrite<D>(
  event: TrackingEvent,
  gameId: number,
  check: IgdbCheck,
  write: WriteStep<D>,
  readUndo?: (data: D | null) => GameUndo | undefined,
): Promise<GameTrackingResult> {
  const outcome = await runTrackingWrite({
    event,
    check: check === "none" ? undefined : () => checkIgdb(gameId, check),
    write,
    classify: classifyGameTrackingError,
    read: readUndo,
  });
  if (!outcome.ok) return outcome;
  return outcome.value ? { ok: true, undo: outcome.value } : { ok: true };
}

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
 * Sets a game's status, from any status or none (AC-3). A move to Want to
 * play clears the score in the same statement, and when it did, the result
 * carries the old status, score and dates as the `status` Undo (AC-5).
 *
 * Playing and Finished are forward moves, so they wait for the release date
 * and refuse a hidden game; Want to play only needs IGDB to know the id
 * (AC-9). `set_game_status` reads the previous values under a row lock, so
 * two tabs can never both receive the same Undo (AC-13).
 *
 * The generated row type marks every `prev_*` column not null, but all of
 * them are null when there was no row, so `readRestoreState` treats them as
 * nullable.
 */
export async function setGameStatus(
  gameId: number,
  status: GameStatus,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameStatus;
  const input = parseTrackingInput(
    gameStatusInputSchema,
    { gameId, status },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runGameWrite(
    event,
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
 * Stores a score from 1 to 10, or clears it (AC-6). A score waits for the
 * release date; clearing never does, so a score stored before release can
 * always be removed (AC-8, AC-9).
 *
 * A score goes through `rate_game`, which writes only on Playing or Finished
 * and otherwise refuses with `not_started`. Clearing is a plain update that
 * touches only `rating`, so no date moves; on a row another tab removed it
 * matches nothing and succeeds, and `refresh()` shows the truth. It matches
 * only a scored row, because any update moves `updated_at`, and
 * `restore_game_status` measures its 10 minute window from that: a stale
 * tab clearing an unscored Want to play row would otherwise extend an old
 * Undo.
 */
export async function setGameRating(
  gameId: number,
  rating: number | null,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRate;
  const input = parseTrackingInput(
    gameRatingInputSchema,
    { gameId, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  const score = input.rating;
  if (score !== null) {
    return runGameWrite(event, input.gameId, "released", (supabase) =>
      supabase.rpc("rate_game", { p_game_id: input.gameId, p_rating: score }),
    );
  }

  return runGameWrite(event, input.gameId, "none", (supabase, userId) =>
    supabase
      .from("user_game_state")
      .update({ rating: null })
      .eq("user_id", userId)
      .eq("game_id", input.gameId)
      .not("rating", "is", null),
  );
}

/**
 * Removes a game from the list (AC-4). The result carries what the row held
 * as the `removed` Undo; a game another tab already removed comes back with
 * no Undo, a quiet success. Never calls IGDB (AC-9).
 *
 * As with `set_game_status`, the generated row type marks the nullable
 * columns not null, so `readRestoreState` widens them.
 */
export async function removeGame(gameId: number): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRemove;
  const input = parseTrackingInput(removeGameInputSchema, { gameId }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  return runGameWrite(
    event,
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
 * The Undo of a move to Want to play that cleared a score (AC-5): puts back
 * the old status, score and all three dates. The values are the caller's own,
 * which `setGameStatus` returned; `restore_game_status` accepts them only on a
 * row still Want to play with no score, changed in the last 10 minutes, with
 * every date in the past, and otherwise refuses as `undo_expired` (AC-14).
 *
 * No IGDB check: a restore only puts back a state the user already had, so
 * it works during an outage, for a hidden game and before release (AC-9).
 */
export async function restoreGameStatus(
  gameId: number,
  previous: GameRestoreState,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRestoreStatus;
  const input = parseTrackingInput(
    restoreGameStatusInputSchema,
    { gameId, previous },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runGameWrite(event, input.gameId, "none", (supabase) =>
    supabase.rpc("restore_game_status", {
      p_game_id: input.gameId,
      ...restoreArgs(input.previous),
    }),
  );
}

/**
 * The Undo of a removal (AC-4): puts the row back exactly as `remove_game`
 * returned it. `restore_removed_game` accepts it only when no row exists,
 * within 10 minutes of `removedAt`, with every date in the past (AC-14). No
 * IGDB check, for the same reason as `restoreGameStatus`.
 */
export async function restoreRemovedGame(
  gameId: number,
  previous: GameRestoreState,
  removedAt: string,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRestoreRemoved;
  const input = parseTrackingInput(
    restoreRemovedGameInputSchema,
    { gameId, previous, removedAt },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runGameWrite(event, input.gameId, "none", (supabase) =>
    supabase.rpc("restore_removed_game", {
      p_game_id: input.gameId,
      p_removed_at: input.removedAt,
      ...restoreArgs(input.previous),
    }),
  );
}
