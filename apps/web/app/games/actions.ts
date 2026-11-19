"use server";

import {
  gameRatingInputSchema,
  gameStatusInputSchema,
  removeGameInputSchema,
  restoreGameStatusInputSchema,
  restoreRemovedGameInputSchema,
} from "@bestats/core/tracking/schemas";
import type {
  GameRestoreState,
  GameStatus,
  GameTrackingResult,
} from "@bestats/core/tracking/types";
import {
  removeGameCommand,
  restoreGameStatusCommand,
  restoreRemovedGameCommand,
  setGameRatingCommand,
  setGameStatusCommand,
} from "@/lib/tracking/commands/game-writes";
import { TRACKING_EVENT } from "@/lib/tracking/log";
import { parseTrackingInput, withCookieSession } from "@/lib/tracking/write";

/**
 * The game status and rating mutations, as Server Actions (spec 0026, API
 * surface). Each is a thin wrapper: Zod parse, then the verified cookie
 * session, then the command in `lib/tracking/commands/game-writes.ts` that
 * the `/api/v1/me/games` routes run too (spec 0033, AC-5), then `refresh()`
 * on success only (AC-10).
 *
 * None of them throws or redirects: every failure comes back as a
 * `GameTrackingResult`, so it reaches a toast rather than an error boundary.
 * `user_id` is always the verified session's, never an argument
 * (`AGENTS.md` section 5).
 */

/**
 * Sets a game's status, from any status or none (AC-3). A move to Want to
 * play that cleared a score returns the `status` Undo (AC-5); Playing and
 * Finished wait for the release date (AC-9).
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

  return withCookieSession(event, (deps) => setGameStatusCommand(deps, input));
}

/**
 * Stores a score from 1 to 10, or clears it (AC-6). A score waits for the
 * release date; clearing never does (AC-8, AC-9).
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

  return withCookieSession(event, (deps) => setGameRatingCommand(deps, input));
}

/**
 * Removes a game from the list, returning the `removed` Undo when a row was
 * there (AC-4). Never calls IGDB (AC-9).
 */
export async function removeGame(gameId: number): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRemove;
  const input = parseTrackingInput(removeGameInputSchema, { gameId }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  return withCookieSession(event, (deps) => removeGameCommand(deps, input));
}

/**
 * The Undo of a move to Want to play that cleared a score (AC-5): puts back
 * the old status, score and all three dates, which `setGameStatus` returned.
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

  return withCookieSession(event, (deps) =>
    restoreGameStatusCommand(deps, input),
  );
}

/**
 * The Undo of a removal (AC-4): puts the row back exactly as `removeGame`
 * returned it, within 10 minutes of `removedAt` (AC-14).
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

  return withCookieSession(event, (deps) =>
    restoreRemovedGameCommand(deps, input),
  );
}
