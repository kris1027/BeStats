"use server";

import {
  episodeMarkUndoInputSchema,
  episodeRatingInputSchema,
  episodeWatchedInputSchema,
  restoreShowTrackingInputSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
  trackShowInputSchema,
  untrackShowInputSchema,
} from "@bestats/core/tracking/schemas";
import type {
  EpisodeTrackingResult,
  MarkEpisodeWatchedResult,
  SeasonUndo,
  SeasonWatchedResult,
  ShowTrackingResult,
  ShowTrackingUndo,
  UntrackShowResult,
} from "@bestats/core/tracking/types";

import {
  restoreShowTrackingCommand,
  setEpisodeRatingCommand,
  setEpisodeWatchedCommand,
  setSeasonWatchedCommand,
  trackShowCommand,
  undoEpisodeMarkCommand,
  undoSeasonWatchedCommand,
  untrackShowCommand,
} from "@/lib/tracking/commands/show-writes";
import { TRACKING_EVENT } from "@/lib/tracking/log";
import { parseTrackingInput, withCookieSession } from "@/lib/tracking/write";

/**
 * The episode and season tracking mutations, as Server Actions (spec 0011,
 * API surface), and the show tracking writes (spec 0020, API surface).
 *
 * Each parses its arguments with the core schema, verifies the cookie session
 * and runs the command in `lib/tracking/commands/show-writes.ts`, the same one
 * the `/api/v1/me` show routes run (spec 0033, AC-5), then `refresh()` on
 * success only. None throws or redirects: every failure is a returned result,
 * so the client rolls back with a toast rather than an error boundary (spec
 * 0011, AC-13). `user_id` is always the session's (AGENTS.md section 5).
 */

/**
 * Marks one episode watched, or clears the mark (spec 0011, AC-5; spec 0014,
 * AC-9). Rules and Undo: `setEpisodeWatchedCommand`.
 */
export async function setEpisodeWatched(
  showId: number,
  seasonNumber: number,
  episodeId: number,
  watched: boolean,
): Promise<MarkEpisodeWatchedResult> {
  const event = TRACKING_EVENT.episodeWatched;
  const input = parseTrackingInput(
    episodeWatchedInputSchema,
    { showId, seasonNumber, episodeId, watched },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    setEpisodeWatchedCommand(deps, input),
  );
}

/**
 * Undo for a mark made on an Up next card, only while it is still the one
 * that tap stored (spec 0014, AC-9). Rules: `undoEpisodeMarkCommand`.
 */
export async function undoEpisodeMark(
  showId: number,
  episodeId: number,
  markedAt: string,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeUndoMark;
  const input = parseTrackingInput(
    episodeMarkUndoInputSchema,
    { showId, episodeId, markedAt },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    undoEpisodeMarkCommand(deps, input),
  );
}

/**
 * Stores a personal score from 1 to 10, or clears it (spec 0011, AC-6,
 * AC-7). Rules: `setEpisodeRatingCommand`.
 */
export async function setEpisodeRating(
  showId: number,
  seasonNumber: number,
  episodeId: number,
  rating: number | null,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeRate;
  const input = parseTrackingInput(
    episodeRatingInputSchema,
    { showId, seasonNumber, episodeId, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    setEpisodeRatingCommand(deps, input),
  );
}

/**
 * Marks every aired episode of a season watched, or unmarks the season
 * (spec 0011, AC-9 to AC-11). Rules and Undo: `setSeasonWatchedCommand`.
 */
export async function setSeasonWatched(
  showId: number,
  seasonNumber: number,
  watched: boolean,
  episodeIds?: number[],
): Promise<SeasonWatchedResult> {
  const event = TRACKING_EVENT.seasonWatched;
  const input = parseTrackingInput(
    seasonWatchedInputSchema,
    watched
      ? { showId, seasonNumber, watched }
      : { showId, seasonNumber, watched, episodeIds },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    setSeasonWatchedCommand(deps, input),
  );
}

/** The Undo on a season toast (spec 0011, AC-10, AC-11). */
export async function undoSeasonWatched(
  showId: number,
  undo: SeasonUndo,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.seasonUndo;
  const input = parseTrackingInput(
    seasonUndoInputSchema,
    { showId, undo },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    undoSeasonWatchedCommand(deps, input),
  );
}

/** Tracks a show (spec 0020, AC-2, AC-6). Rules: `trackShowCommand`. */
export async function trackShow(showId: number): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.trackShow;
  const input = parseTrackingInput(trackShowInputSchema, { showId }, event);
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) => trackShowCommand(deps, input));
}

/**
 * Stops tracking a show, keeping every mark and rating (spec 0020, AC-3,
 * AC-4, AC-6). Rules and Undo: `untrackShowCommand`.
 */
export async function untrackShow(showId: number): Promise<UntrackShowResult> {
  const event = TRACKING_EVENT.untrackShow;
  const input = parseTrackingInput(untrackShowInputSchema, { showId }, event);
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) => untrackShowCommand(deps, input));
}

/** The Undo of Stop tracking (spec 0020, AC-3). */
export async function restoreShowTracking(
  showId: number,
  undo: ShowTrackingUndo,
): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.restoreShowTracking;
  const input = parseTrackingInput(
    restoreShowTrackingInputSchema,
    { showId, undo },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };
  return withCookieSession(event, (deps) =>
    restoreShowTrackingCommand(deps, input),
  );
}
