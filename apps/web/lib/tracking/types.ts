/**
 * The shapes every movie tracking surface shares (spec 0007, API surface).
 *
 * Pure and free of `server-only`, because the client controls hold a
 * `MovieTrackingState` and branch on a `MovieTrackingError` to pick a toast.
 */

import { Constants, type Database } from "@/lib/supabase/database.types";

/** What the reads return and what the controls hold between clicks. */
export type MovieTrackingState = {
  inWatchlist: boolean;
  watched: boolean;
  /** The personal score, an integer from 1 to 10, or null when unrated. */
  rating: number | null;
};

/** The empty state: no row yet, or a row that every removal has emptied. */
export const EMPTY_MOVIE_TRACKING: MovieTrackingState = {
  inWatchlist: false,
  watched: false,
  rating: null,
};

/**
 * Every reason any tracking action can refuse. A closed union rather than a
 * message, so the client picks copy from `messages.ts` and a raw Supabase or
 * TMDB error can never reach the browser (spec 0007, AC-11).
 */
export type TrackingError =
  | "invalid_input"
  | "session_expired"
  | "not_found"
  | "tmdb_unavailable"
  | "write_failed"
  /**
   * An Undo the database refused (spec 0008, AC-6, AC-7): the row was already
   * restored, changed too long ago, or never had the value to put back.
   */
  | "undo_expired";

/**
 * The shared refusals, plus the movie's own: a new watched mark or score for a
 * movie whose TMDB release date is still in the future, or missing
 * (prompts/movie-release-gate.md), and a score for a movie that is not watched
 * (prompts/movie-plan-watched-exclusive.md).
 */
export type MovieTrackingError = TrackingError | "not_released" | "not_watched";

/**
 * The watch mark and score a write removed: planning a watched movie, or
 * unmarking it, clears both (prompts/movie-plan-watched-exclusive.md). It is
 * what an Undo hands back to `restoreMovieWatched`.
 */
export type MovieClearedState = {
  /** The removed watch mark, as PostgREST returned it. */
  watchedAt: string;
  /** The removed score, or null when there was none. */
  rating: number | null;
};

/**
 * What every action returns. No state comes back: the controls converge on the
 * server prop that `refresh()` delivers in the same response, so the confirmed
 * state is only ever the server's (spec 0007, key invariants). The one
 * exception is `cleared`, what a plan or an unmark removed, which only the
 * write itself knows and which the Undo needs.
 */
export type MovieTrackingResult =
  | { ok: true; cleared?: MovieClearedState }
  | { ok: false; error: MovieTrackingError };

/** A read that treats signed out and a failed read as ordinary outcomes. */
export type TrackingRead<T> =
  | { kind: "signed_out" }
  | { kind: "ok"; state: T }
  | { kind: "failed" };

/**
 * One episode's stored state (spec 0011, API surface). Watched and rating are
 * separate facts: either can exist without the other (`AGENTS.md` section 7).
 */
export type EpisodeTrackingState = {
  watched: boolean;
  /** The personal score, an integer from 1 to 10, or null when unrated. */
  rating: number | null;
};

/** No row yet, or a row that every removal has emptied. */
export const EMPTY_EPISODE_TRACKING: EpisodeTrackingState = {
  watched: false,
  rating: null,
};

/**
 * The shared refusals, plus one of the episode's own: a creating write for an
 * episode whose air date is still in the future (spec 0011, AC-7).
 */
export type EpisodeTrackingError = TrackingError | "not_aired";

/**
 * What an episode write did to tracking on its own (spec 0020, AC-5):
 * `showTracked` is true only when the write tracked a show that was not
 * tracked, which the "added to your shows" toast confirms.
 */
export type ShowTrackingFlags = { showTracked: boolean };

/**
 * What the single episode actions and the season Undo return, with
 * `showTracked`, which the season page and Up Next confirm with a toast.
 */
export type EpisodeTrackingResult =
  | ({ ok: true } & ShowTrackingFlags)
  | { ok: false; error: EpisodeTrackingError };

/**
 * What `setEpisodeWatched` returns (spec 0014, AC-9): the shared success
 * shape plus `newlyMarked`, true only when this call set the mark, so Up Next
 * offers Undo only for a mark it made. Always false when unmarking.
 *
 * `markedAt` is the `watched_at` that mark stored, as PostgREST returned it,
 * and null whenever `newlyMarked` is false. Undo hands it back to
 * `undoEpisodeMark`, so it clears that mark and never a newer one.
 */
export type MarkEpisodeWatchedResult =
  | ({
      ok: true;
      newlyMarked: boolean;
      markedAt: string | null;
    } & ShowTrackingFlags)
  | { ok: false; error: EpisodeTrackingError };

/**
 * How to take back a season write (spec 0011, AC-10, AC-11). Marking reports
 * the ids it newly marked, so Undo clears exactly those; unmarking reports the
 * dates it cleared, so Undo can put each one back.
 */
export type SeasonUndo =
  | { kind: "unmark"; episodeIds: number[] }
  | { kind: "restore"; entries: { episodeId: number; watchedAt: string }[] };

/** `undo` is null when the write changed nothing. */
export type SeasonWatchedResult =
  | ({ ok: true; undo: SeasonUndo | null } & ShowTrackingFlags)
  | { ok: false; error: EpisodeTrackingError };

/**
 * The Undo of Stop tracking (spec 0020, AC-3): the `tracked_at` that
 * `untrack_show` reported deleting, so the show returns to its old place.
 * A show is tracked or not; there is no hold (amended 2026-10-10).
 */
export type ShowTrackingUndo = { trackedAt: string };

/**
 * A tracking write's failure: exactly the shared classes. Stop tracking is
 * idempotent (AC-4), so no stale state class exists.
 */
export type ShowTrackingError = TrackingError;

/** What `trackShow` and `restoreShowTracking` return. */
export type ShowTrackingResult =
  | { ok: true }
  | { ok: false; error: ShowTrackingError };

/**
 * What `untrackShow` returns: the Undo it carries, or null when the show was
 * already untracked (stopped in another tab), which has nothing to undo.
 */
export type UntrackShowResult =
  | { ok: true; undo: ShowTrackingUndo | null }
  | { ok: false; error: ShowTrackingError };

/**
 * A game's place in a person's list, set by hand (spec 0024, `AGENTS.md`
 * "Games"). Taken from the generated enum, so a status added in SQL fails
 * the type check everywhere it is not handled.
 */
export type GameStatus = Database["public"]["Enums"]["game_status"];

/**
 * A game that has been started: the statuses that may hold a score and that
 * a card shows as the read only chip rather than the Want to play bookmark
 * (`AGENTS.md` "Games", spec 0030, AC-2, AC-6, AC-11).
 */
export type StartedGameStatus = Exclude<GameStatus, "want_to_play">;

/**
 * Whether a game card's or library item's status is a started one. A guard
 * on the whole item, so a card status union narrows to its scored variant.
 * Null or undefined, a game with no row or no read, is not started.
 *
 * @param item Anything carrying a stored game status.
 */
export function isStartedGame<T extends { status: GameStatus | null }>(
  item: T | null | undefined,
): item is T & { status: StartedGameStatus } {
  return (
    item !== null &&
    item !== undefined &&
    item.status !== null &&
    item.status !== "want_to_play"
  );
}

/**
 * Every status, from the generated enum in its SQL order, which is also the
 * pill order (spec 0026, AC-2). The Zod schema and the control both read it,
 * so a status added in SQL reaches them with `pnpm db:types` alone.
 */
export const GAME_STATUSES = Constants.public.Enums.game_status;

/**
 * One game's stored state (spec 0026, API surface): no status means the game
 * is not in the list. A score lives only on Playing or Finished.
 */
export type GameTrackingState = {
  status: GameStatus | null;
  /** The personal score, an integer from 1 to 10, or null when unrated. */
  rating: number | null;
};

/** No row: the game is not in the list. */
export const EMPTY_GAME_TRACKING: GameTrackingState = {
  status: null,
  rating: null,
};

/**
 * Everything an Undo puts back exactly (spec 0026, AC-4, AC-5): the status,
 * the score and the three list dates, as the write that removed them
 * returned them. Carried in the toast, never shown or edited.
 */
export type GameRestoreState = {
  status: GameStatus;
  rating: number | null;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * How to take back a game write: a move to Want to play that cleared a
 * score (`status`), or a removal (`removed`), which also carries when it
 * happened, since the 10 minute window is measured from it (AC-14).
 */
export type GameUndo =
  | { kind: "status"; previous: GameRestoreState }
  | { kind: "removed"; previous: GameRestoreState; removedAt: string };

/**
 * The shared refusals with IGDB in place of TMDB, plus the game's own: a
 * forward move before the release date (AC-9), and a score on a game that
 * is not Playing or Finished (AC-6).
 */
export type GameTrackingError =
  | Exclude<TrackingError, "tmdb_unavailable">
  | "igdb_unavailable"
  | "not_released"
  | "not_started";

/**
 * What every game action returns. As for movies, no state comes back: the
 * control converges on the server prop `refresh()` delivers. `undo` is the
 * one thing only the write knows.
 */
export type GameTrackingResult =
  | { ok: true; undo?: GameUndo }
  | { ok: false; error: GameTrackingError };
