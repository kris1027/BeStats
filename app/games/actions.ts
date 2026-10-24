"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { isGameReleased } from "@/lib/catalog/game-page";
import { createClient } from "@/lib/supabase/server";
import {
  logTrackingEvent,
  TRACKING_EVENT,
  type TrackingEvent,
} from "@/lib/tracking/log";
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
  GameTrackingResult,
  GameUndo,
} from "@/lib/tracking/types";
import { todayUtc } from "@/lib/tv/air-status";

import { readGame } from "./[id]/load-game";

/**
 * The game status and rating mutations, as Server Actions (spec 0026, API
 * surface), shaped like `app/movies/actions.ts`.
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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** A write step: PostgREST's typed data, and its error or null. */
type WriteStep<D> = (
  supabase: SupabaseClient,
  userId: string,
) => PromiseLike<{ data: D | null; error: { code?: string | null } | null }>;

/**
 * What a write confirms with IGDB first (AC-9). `none` for a removal, a
 * cleared score and both restores, which only ever put back or take away and
 * so must work during an outage, for a hidden game and before release.
 * `known` for Want to play: any id IGDB has, hidden included, so a listed
 * game IGDB later hides can still be moved back. `listed` for Playing and
 * Finished: known, not hidden, and released. `released` for a score: known
 * and released.
 */
type IgdbCheck = "none" | "known" | "listed" | "released";

/**
 * The shared shape of every game action.
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
  let undo: GameUndo | undefined;
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }

    if (check !== "none") {
      const result = await readGame(gameId);
      if (result.kind === "failed") {
        logTrackingEvent(event, "igdb_unavailable");
        return { ok: false, error: "igdb_unavailable" };
      }
      if (
        result.kind === "not_found" ||
        (check === "listed" && result.game.hidden)
      ) {
        logTrackingEvent(event, "not_found");
        return { ok: false, error: "not_found" };
      }
      if (
        check !== "known" &&
        !isGameReleased(result.game.releaseDate, todayUtc(new Date()))
      ) {
        logTrackingEvent(event, "not_released");
        return { ok: false, error: "not_released" };
      }
    }

    const supabase = await createClient();
    const { data, error } = await write(supabase, user.id);
    if (error) {
      const classified = classifyGameTrackingError(error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    undo = readUndo?.(data);
  } catch {
    // A network failure inside supabase-js, or a bug `readGame` rethrew. The
    // error object is dropped on purpose: its message can carry request
    // details that must not reach a log line (AC-15).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  refresh();
  return undo ? { ok: true, undo } : { ok: true };
}

/** Parses an action's arguments, or reports `invalid_input` (AC-15). */
function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  event: TrackingEvent,
): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  logTrackingEvent(event, "invalid_input");
  return null;
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
 * them are null when there was no row, so the reader treats them as nullable.
 */
export async function setGameStatus(
  gameId: number,
  status: GameStatus,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameStatus;
  const input = parse(gameStatusInputSchema, { gameId, status }, event);
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
      const prev = data?.[0] as
        | {
            prev_status: GameStatus | null;
            prev_rating: number | null;
            prev_added_at: string | null;
            prev_started_at: string | null;
            prev_finished_at: string | null;
          }
        | undefined;
      if (
        input.status !== "want_to_play" ||
        !prev?.prev_status ||
        prev.prev_status === "want_to_play" ||
        prev.prev_rating === null ||
        prev.prev_added_at === null
      ) {
        return undefined;
      }
      return {
        kind: "status",
        previous: {
          status: prev.prev_status,
          rating: prev.prev_rating,
          addedAt: prev.prev_added_at,
          startedAt: prev.prev_started_at,
          finishedAt: prev.prev_finished_at,
        },
      };
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
 * matches nothing and succeeds, and `refresh()` shows the truth.
 */
export async function setGameRating(
  gameId: number,
  rating: number | null,
): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRate;
  const input = parse(gameRatingInputSchema, { gameId, rating }, event);
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
      .eq("game_id", input.gameId),
  );
}

/**
 * Removes a game from the list (AC-4). The result carries what the row held
 * as the `removed` Undo; a game another tab already removed comes back with
 * no Undo, a quiet success. Never calls IGDB (AC-9).
 *
 * As with `set_game_status`, the generated row type marks the nullable
 * columns not null, so the reader widens them.
 */
export async function removeGame(gameId: number): Promise<GameTrackingResult> {
  const event = TRACKING_EVENT.gameRemove;
  const input = parse(removeGameInputSchema, { gameId }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  return runGameWrite(
    event,
    input.gameId,
    "none",
    (supabase) => supabase.rpc("remove_game", { p_game_id: input.gameId }),
    (data) => {
      const row = data?.[0] as
        | {
            removed_status: GameStatus;
            removed_rating: number | null;
            removed_added_at: string;
            removed_started_at: string | null;
            removed_finished_at: string | null;
            removed_at: string;
          }
        | undefined;
      if (!row) return undefined;
      return {
        kind: "removed",
        removedAt: row.removed_at,
        previous: {
          status: row.removed_status,
          rating: row.removed_rating,
          addedAt: row.removed_added_at,
          startedAt: row.removed_started_at,
          finishedAt: row.removed_finished_at,
        },
      };
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
  const input = parse(
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
  const input = parse(
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
