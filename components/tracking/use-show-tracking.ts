"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { toast } from "sonner";

import {
  restoreShowTracking,
  trackShow,
  untrackShow,
} from "@/app/shows/actions";
import { SHOW_TRACKING_COPY, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";
import type { ShowTrackingError, ShowTrackingUndo } from "@/lib/tracking/types";

import { settleResultCall, showShowTrackingError } from "./tracking-toast";

/** Long enough for a keyboard user to reach Undo; the server allows it. */
const UNDO_TOAST_MS = 10_000;

/**
 * The show tracking writes every surface shares (spec 0020, AC-2 to AC-6):
 * the show page toggle, the card bookmark and the missing title card. One
 * place for the toasts, the Undo of Stop tracking and the error copy, so each
 * surface only says what it shows meanwhile.
 *
 * Every call runs in its own transition; `before` runs first inside it, for
 * an optimistic update.
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
    /** Tracks the show (AC-2, AC-6). */
    track(options: { before?: () => void } = {}) {
      startTransition(async () => {
        options.before?.();
        const result = await settleResultCall(() => trackShow(showId));
        if (!result.ok) fail(result.error);
      });
    },

    /**
     * Stops tracking, with a toast that carries the Undo (AC-3). A show
     * another tab already stopped has nothing to undo, so its toast confirms
     * without one (AC-4). `restoring` runs inside the Undo's transition, for
     * a surface that shows the show tracked again at once.
     */
    untrack(options: { before?: () => void; restoring?: () => void } = {}) {
      startTransition(async () => {
        options.before?.();
        const result = await settleResultCall(() => untrackShow(showId));
        if (!result.ok) {
          fail(result.error);
          return;
        }
        const { undo } = result;
        toast(SHOW_TRACKING_COPY.stopped(showName), {
          id: toastId,
          description: undefined,
          duration: UNDO_TOAST_MS,
          action: undo
            ? {
                label: UNDO_ACTION_LABEL,
                onClick: (event) => restore(event, undo, options.restoring),
              }
            : undefined,
        });
      });
    },
  };
}

/**
 * The tracked or untracked toggle the show page and the card bookmark share
 * (spec 0020, AC-2, AC-3, AC-6): one click tracks an untracked show and stops
 * tracking a tracked one. The state is optimistic: it flips at once, flips
 * back while an Undo runs, and gives way to the server's prop once the action
 * has refreshed, or, on failure, to the unchanged prop, which is the rollback.
 *
 * @param tracked Whether the server says the show is tracked.
 * @returns `shown`, the state to draw, and `toggle`, the click handler.
 */
export function useShowTrackingToggle(
  tracked: boolean,
  options: Parameters<typeof useShowTracking>[0],
) {
  const [shown, setShown] = useOptimistic(tracked);
  const tracking = useShowTracking(options);

  function toggle() {
    if (!shown) {
      tracking.track({ before: () => setShown(true) });
      return;
    }
    tracking.untrack({
      before: () => setShown(false),
      restoring: () => setShown(true),
    });
  }

  return { shown, toggle };
}
