"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { toast } from "sonner";

import { restoreMovieWatched } from "@/app/movies/actions";
import {
  MOVIE_CLEARED_MESSAGES,
  UNDO_ACTION_LABEL,
} from "@/lib/tracking/messages";
import type { MovieClearedState } from "@/lib/tracking/types";

import { settleResultCall, showTrackingError } from "./tracking-toast";

/** Long enough for a keyboard user to reach Undo; the server allows 10 min. */
const UNDO_TOAST_MS = 10_000;

/** Which write removed the watch mark. */
export type MovieClearKind = "planned" | "unwatched";

/**
 * The toast a movie write shows when it removed a watch mark, and its Undo
 * (prompts/movie-plan-watched-exclusive.md). The movie page and the poster
 * card bookmark share it, so the copy and the Undo are written once.
 *
 * Planning a watched movie always says so. Unmarking says so only when a
 * score went with it, since the pill itself already shows the mark is gone.
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
   * Sonner deletes a toast once its action runs, and an outcome that lands
   * during the exit animation vanishes with it (spec 0008). So the click
   * keeps the toast, takes the Undo off it so it cannot run twice, and the
   * outcome then closes it or rewrites it in place.
   */
  function undo(
    event: { preventDefault: () => void },
    message: string,
    cleared: MovieClearedState,
    restoring?: () => void,
  ) {
    event.preventDefault();
    toast(message, { id: toastId, action: undefined });
    startTransition(async () => {
      restoring?.();
      const result = await settleResultCall(() =>
        restoreMovieWatched(movieId, cleared.watchedAt, cleared.rating),
      );
      if (result.ok) {
        toast.dismiss(toastId);
        return;
      }
      if (result.error === "undo_expired") {
        toast(MOVIE_CLEARED_MESSAGES.undoExpired, {
          id: toastId,
          action: undefined,
        });
        return;
      }
      toast.dismiss(toastId);
      showTrackingError(result.error, {
        movieId,
        control: "watched",
        returnPath,
        navigate: router.push,
      });
    });
  }

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
    if (kind === "unwatched" && cleared.rating === null) return;
    const message =
      kind === "planned"
        ? MOVIE_CLEARED_MESSAGES.planned(cleared.rating !== null)
        : MOVIE_CLEARED_MESSAGES.unwatched;
    toast(message, {
      id: toastId,
      duration: UNDO_TOAST_MS,
      action: {
        label: UNDO_ACTION_LABEL,
        onClick: (event) => undo(event, message, cleared, restoring),
      },
    });
  };
}
