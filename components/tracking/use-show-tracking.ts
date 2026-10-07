"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { toast } from "sonner";

import {
  restoreShowTracking,
  setShowHold,
  trackShow,
  untrackShow,
} from "@/app/shows/actions";
import { SHOW_TRACKING_COPY, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";
import type {
  ShowHold,
  ShowTrackingError,
  ShowTrackingUndo,
} from "@/lib/tracking/types";

import { settleResultCall, showShowTrackingError } from "./tracking-toast";

/** Long enough for a keyboard user to reach Undo; the server allows it. */
const UNDO_TOAST_MS = 10_000;

/**
 * The show tracking writes every surface shares (spec 0020, AC-2 to AC-6,
 * AC-10): the show page pill, the card bookmark, and the Paused & dropped and
 * missing title cards. One place for the toasts, the Undo of Stop tracking
 * and the error copy, so each surface only says what it shows meanwhile.
 *
 * Each write names the hold the surface showed (`expected`), so a surface
 * rendered before the show changed elsewhere refreshes instead of
 * overwriting or deleting the newer state (AC-4). Every call runs in its own
 * transition; `before` runs first inside it, for an optimistic update, and
 * `after` gets the outcome.
 *
 * @param showId The show.
 * @param showName The name the toasts use.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 * @param toastId The surface's toast id, one per show and surface.
 */
export function useShowTracking({
  showId,
  showName,
  returnPath,
  toastId,
}: {
  showId: number;
  showName: string;
  returnPath: string;
  toastId: string;
}) {
  const router = useRouter();

  function fail(error: ShowTrackingError) {
    showShowTrackingError(error, {
      id: toastId,
      returnPath,
      navigate: router.push,
    });
  }

  /**
   * Sonner deletes a toast once its action runs, and an outcome that lands
   * during the exit animation vanishes with it (spec 0008). So the click
   * keeps the toast, takes the Undo off it so it cannot run twice, and the
   * outcome then closes it or rewrites it in place.
   */
  function restore(
    event: { preventDefault: () => void },
    undo: ShowTrackingUndo,
    before?: () => void,
  ) {
    event.preventDefault();
    const message = SHOW_TRACKING_COPY.stopped(showName);
    toast(message, { id: toastId, action: undefined });
    startTransition(async () => {
      before?.();
      const result = await settleResultCall(() =>
        restoreShowTracking(showId, undo),
      );
      if (result.ok) {
        toast.dismiss(toastId);
        return;
      }
      if (result.error === "undo_expired") {
        toast(SHOW_TRACKING_COPY.undoExpired, {
          id: toastId,
          description: undefined,
          action: undefined,
        });
        return;
      }
      fail(result.error);
    });
  }

  return {
    /** Tracks the show with no hold (AC-2, AC-6). */
    track(options: { before?: () => void } = {}) {
      startTransition(async () => {
        options.before?.();
        const result = await settleResultCall(() => trackShow(showId));
        if (!result.ok) fail(result.error);
      });
    },

    /** Pauses, drops or resumes the show, over the hold it showed (AC-4). */
    setHold(
      hold: ShowHold | null,
      expected: ShowHold | null,
      options: { before?: () => void; after?: (ok: boolean) => void } = {},
    ) {
      startTransition(async () => {
        options.before?.();
        const result = await settleResultCall(() =>
          setShowHold(showId, hold, expected),
        );
        if (!result.ok) fail(result.error);
        options.after?.(result.ok);
      });
    },

    /**
     * Stops tracking, with a toast that carries the Undo (AC-3). `restoring`
     * runs inside the Undo's transition, for a surface that shows the show
     * tracked again at once.
     */
    untrack(
      expected: ShowHold | null,
      options: {
        before?: () => void;
        after?: (ok: boolean) => void;
        restoring?: () => void;
      } = {},
    ) {
      startTransition(async () => {
        options.before?.();
        const result = await settleResultCall(() =>
          untrackShow(showId, expected),
        );
        options.after?.(result.ok);
        if (!result.ok) {
          fail(result.error);
          return;
        }
        const { undo } = result;
        toast(SHOW_TRACKING_COPY.stopped(showName), {
          id: toastId,
          description: undefined,
          duration: UNDO_TOAST_MS,
          action: {
            label: UNDO_ACTION_LABEL,
            onClick: (event) => restore(event, undo, options.restoring),
          },
        });
      });
    },
  };
}
