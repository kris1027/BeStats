"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { restoreMovieWatched } from "@/app/movies/actions";
import {
  MOVIE_CLEARED_MESSAGES,
  UNDO_ACTION_LABEL,
} from "@/lib/tracking/messages";
import type { MovieClearedState } from "@/lib/tracking/types";

import {
  runUndoInToast,
  showTrackingError,
  UNDO_TOAST_MS,
} from "./tracking-toast";

/** Which write removed the watch mark. */
export type MovieClearKind = "planned" | "unwatched";

/**
 * The toast each write shows for what it cleared, or null for none. Planning
 * a watched movie always says so. Unmarking says so only when a score went
 * with it, since the pill itself already shows the mark is gone.
 */
const CLEARED_MESSAGE: Record<
  MovieClearKind,
  (cleared: MovieClearedState) => string | null
> = {
  planned: (cleared) => MOVIE_CLEARED_MESSAGES.planned(cleared.rating !== null),
  unwatched: (cleared) =>
    cleared.rating === null ? null : MOVIE_CLEARED_MESSAGES.unwatched,
};

/**
 * The toast a movie write shows when it removed a watch mark, and its Undo
 * (prompts/movie-plan-watched-exclusive.md). The movie page and the poster
 * card bookmark share it, so their copy is written once; the Undo itself is
 * `runUndoInToast`, which the Watched page shares too.
 *
 * @param movieId The movie.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 */
export function useMovieClearedUndo({
  movieId,
  returnPath,
}: {
  movieId: number;
  returnPath: string;
}) {
  const router = useRouter();
  const toastId = `movie-cleared-${movieId}`;

  /**
   * Shows the toast for what a write cleared, if it is worth one.
   *
   * @param kind The write that cleared it.
   * @param cleared The action's `cleared`, absent when nothing was watched.
   * @param restoring Runs inside the Undo's transition, for an optimistic
   * update that shows the mark back at once.
   */
  return function showCleared(
    kind: MovieClearKind,
    cleared: MovieClearedState | undefined,
    restoring?: () => void,
  ) {
    if (!cleared) return;
    const message = CLEARED_MESSAGE[kind](cleared);
    if (message === null) return;
    toast(message, {
      id: toastId,
      duration: UNDO_TOAST_MS,
      action: {
        label: UNDO_ACTION_LABEL,
        onClick: (event) =>
          runUndoInToast(event, {
            id: toastId,
            message,
            expiredMessage: MOVIE_CLEARED_MESSAGES.undoExpired,
            restore: () =>
              restoreMovieWatched(movieId, cleared.watchedAt, cleared.rating),
            restoring,
            onError: (error) =>
              showTrackingError(error, {
                movieId,
                control: "watched",
                returnPath,
                navigate: router.push,
              }),
          }),
      },
    });
  };
}
