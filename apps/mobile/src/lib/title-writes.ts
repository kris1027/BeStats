import type {
  V1GameTitleState,
  V1MovieTitleState,
  V1ShowTitleState,
} from "@bestats/core/api/v1/titles";
import {
  applyGameIntent,
  type GameIntent,
} from "@bestats/core/tracking/game-intent";
import {
  applyTrackingIntent,
  type TrackingIntent,
} from "@bestats/core/tracking/intent";
import {
  GAME_TRACKING_MESSAGES,
  GAME_UNDO_MESSAGES,
  MOVIE_CLEARED_MESSAGES,
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_MESSAGES,
  TRACKING_MESSAGES,
} from "@bestats/core/tracking/messages";
import type { GameUndo } from "@bestats/core/tracking/types";

import { useToast } from "@/components/toast";

import { restoreGame, writeGameIntent } from "./games";
import { restoreMovie, writeMovieIntent } from "./movies";
import { restoreShowTracking, trackShow, untrackShow } from "./shows";
import { trackingKeys, useTrackingWrite, useUndoToast } from "./tracking";

/** What a write that removed a watch mark returned, for its Undo. */
type MovieCleared = { watchedAt: string; rating: number | null };

/**
 * A movie write carries its core intent, so the optimistic state is core's,
 * and says which Undo it may need: Plan on a watched movie drops its mark
 * and score, and removing a mark drops the score.
 */
export type MovieWrite = TrackingIntent & { clears?: "planned" | "unwatched" };

/**
 * Core's plan, mark and score rule over the v1 movie state. Only the
 * timestamp is the app's own: a new mark shows now until the server's answer
 * replaces it (apps/mobile/AGENTS.md, BeStats rules).
 */
export function applyMovieIntents(
  current: V1MovieTitleState,
  intents: readonly TrackingIntent[],
): V1MovieTitleState {
  const next = intents.reduce(applyTrackingIntent, {
    inWatchlist: current.planned,
    watched: current.watchedAt !== null,
    rating: current.rating,
  });
  return {
    planned: next.inWatchlist,
    watchedAt: next.watched
      ? (current.watchedAt ?? new Date().toISOString())
      : null,
    rating: next.rating,
  };
}

/**
 * Every movie write with its Undo, shared by the movie screen and the
 * catalog cards (prompts/mobile-look-card-actions.md, decision 11), so the
 * same action says the same thing wherever it starts. A movie is planned or
 * watched, never both (AGENTS.md section 7): a write that removed a watch
 * mark offers Undo, which brings the mark back with its score
 * (prompts/movie-plan-watched-exclusive.md). Both write to the title's own
 * key, so a card and the movie screen never disagree.
 */
export function useMovieWrite(id: number, onFailure?: () => void) {
  const key = trackingKeys.title("movie", id);
  const offerUndo = useUndoToast();
  const control = `movie-${id}`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (current: V1MovieTitleState, cleared: MovieCleared) =>
      applyMovieIntents(current, [
        { kind: "watched", value: true },
        { kind: "rating", value: cleared.rating },
      ]),
    write: (cleared: MovieCleared) =>
      restoreMovie({ kind: "movie_watched", movieId: id, ...cleared }),
    failure: TRACKING_MESSAGES.write_failed,
    expired: MOVIE_CLEARED_MESSAGES.undoExpired,
  });

  return useTrackingWrite({
    stateKey: key,
    control: (intent: MovieWrite) => `${control}-${intent.kind}`,
    apply: (current: V1MovieTitleState, intent: MovieWrite) =>
      applyMovieIntents(current, [intent]),
    write: (intent: MovieWrite) => writeMovieIntent(id, intent),
    failure: TRACKING_MESSAGES.write_failed,
    onFailure,
    onSuccess: (result, intent) => {
      const cleared = result.cleared;
      if (!cleared || !intent.clears) return;
      const message =
        intent.clears === "planned"
          ? MOVIE_CLEARED_MESSAGES.planned(cleared.rating !== null)
          : cleared.rating === null
            ? null
            : MOVIE_CLEARED_MESSAGES.unwatched;
      if (message === null) return;
      offerUndo(message, `${control}-${intent.kind}`, (done) =>
        restore.mutate(cleared, { onSettled: done }),
      );
    },
  });
}

/**
 * The show tracking toggle with its Undo, shared by the show screen and the
 * catalog cards (spec 0013). Stop tracking keeps every mark and rating and
 * offers Undo; a show another device already stopped is a quiet success
 * with no Undo (`lib/tracking/AGENTS.md`, Show tracking).
 */
export function useShowTrackingWrite(id: number, name: string) {
  const key = trackingKeys.title("tv", id);
  const offerUndo = useUndoToast();
  const toast = useToast();
  const control = `show-${id}-tracking`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (current: V1ShowTitleState) => ({ ...current, tracked: true }),
    write: (undo: { trackedAt: string }) =>
      restoreShowTracking({ kind: "show_tracking", showId: id, undo }),
    failure: SHOW_TRACKING_MESSAGES.write_failed,
    expired: SHOW_TRACKING_COPY.undoExpired,
  });

  return useTrackingWrite({
    stateKey: key,
    control,
    apply: (current: V1ShowTitleState, tracked: boolean) => ({
      ...current,
      tracked,
    }),
    write: async (tracked: boolean) =>
      tracked ? { undo: null, ...(await trackShow(id)) } : untrackShow(id),
    failure: SHOW_TRACKING_MESSAGES.write_failed,
    onSuccess: (result, tracked) => {
      if (tracked) return;
      const message = SHOW_TRACKING_COPY.stopped(name);
      const undo = result.undo;
      if (undo === null) {
        toast.show({ id: control, message });
        return;
      }
      offerUndo(message, control, (done) =>
        restore.mutate(undo, { onSettled: done }),
      );
    },
  });
}

/**
 * Every game write with its Undo, shared by the game screen and the catalog
 * cards (spec 0026): a removal, and a status change that cleared a score,
 * each offer Undo, which puts the earlier status and score back.
 */
export function useGameWrite(id: number, onFailure?: () => void) {
  const key = trackingKeys.title("game", id);
  const offerUndo = useUndoToast();
  const control = `game-${id}`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (_current: V1GameTitleState, undo: GameUndo) => ({
      status: undo.previous.status,
      rating: undo.previous.rating,
    }),
    write: (undo: GameUndo) =>
      restoreGame(
        undo.kind === "removed"
          ? {
              kind: "game_removed",
              gameId: id,
              previous: undo.previous,
              removedAt: undo.removedAt,
            }
          : { kind: "game_status", gameId: id, previous: undo.previous },
      ),
    failure: GAME_TRACKING_MESSAGES.write_failed,
    expired: GAME_UNDO_MESSAGES.undoExpired,
  });

  return useTrackingWrite({
    stateKey: key,
    control: (intent: GameIntent) => `${control}-${intent.kind}`,
    apply: applyGameIntent,
    write: (intent: GameIntent) => writeGameIntent(id, intent),
    failure: GAME_TRACKING_MESSAGES.write_failed,
    onFailure,
    onSuccess: (result, intent) => {
      const undo = result.undo;
      if (!undo) return;
      offerUndo(
        undo.kind === "removed"
          ? GAME_UNDO_MESSAGES.removed
          : GAME_UNDO_MESSAGES.scoreCleared,
        `${control}-${intent.kind}`,
        (done) => restore.mutate(undo, { onSettled: done }),
      );
    },
  });
}
