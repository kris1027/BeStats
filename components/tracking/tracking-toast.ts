"use client";

import { startTransition } from "react";
import { toast } from "sonner";

import {
  EPISODE_TRACKING_MESSAGES,
  SHOW_TRACKING_MESSAGES,
  SIGN_IN_ACTION_LABEL,
  TRACKING_MESSAGES,
} from "@/lib/tracking/messages";
import type {
  EpisodeTrackingError,
  MovieTrackingError,
  ShowTrackingError,
} from "@/lib/tracking/types";

/**
 * How long a toast carrying Undo stays up: long enough for a keyboard user to
 * reach the action. The server allows 10 minutes, so the toast is the limit.
 */
export const UNDO_TOAST_MS = 10_000;

/** Which control failed, so each keeps one toast of its own. */
export type TrackingControl = "watchlist" | "watched" | "rating";

/**
 * Runs a tracking action and turns every failure into a `MovieTrackingError`
 * (spec 0007, AC-11).
 *
 * A rejected call (offline, a server error, a deploy that changed the action
 * ids) is caught here and reported as `write_failed`, so it rolls the control
 * back with a toast instead of reaching an error boundary.
 *
 * @param call The Server Action call.
 * @returns The error class, or null when the write landed.
 */
export async function settleTrackingCall<
  E extends MovieTrackingError | EpisodeTrackingError | ShowTrackingError,
>(
  call: () => Promise<{ ok: true } | { ok: false; error: E }>,
): Promise<E | "write_failed" | null> {
  try {
    const result = await call();
    return result.ok ? null : result.error;
  } catch {
    return "write_failed";
  }
}

/**
 * Shows the toast for a failed tracking write.
 *
 * One id per movie and control, so repeated failures replace each other rather
 * than stacking. The session expired toast carries a Sign in action that
 * brings the person back to the page they were on (AC-12).
 *
 * @param error The error class the action returned.
 * @param options.movieId The movie, for the toast id.
 * @param options.control The control that failed, for the toast id.
 * @param options.returnPath The page to come back to after signing in.
 * @param options.navigate The router push, for the Sign in action.
 */
export function showTrackingError(
  error: MovieTrackingError,
  {
    movieId,
    control,
    returnPath,
    navigate,
  }: {
    movieId: number;
    control: TrackingControl;
    returnPath: string;
    navigate: (href: string) => void;
  },
): void {
  toast(TRACKING_MESSAGES[error], {
    id: `movie-tracking-${movieId}-${control}`,
    action: signInAction(error, returnPath, navigate),
  });
}

/**
 * Shows the toast for a failed episode or season write (spec 0011, AC-7,
 * AC-14). The caller names the toast id, one per episode and control or one
 * per season, so repeated failures replace each other.
 *
 * @param error The error class the action returned.
 * @param options.id The toast id.
 * @param options.returnPath The page to come back to after signing in.
 * @param options.navigate The router push, for the Sign in action.
 */
export function showEpisodeTrackingError(
  error: EpisodeTrackingError,
  {
    id,
    returnPath,
    navigate,
  }: { id: string; returnPath: string; navigate: (href: string) => void },
): void {
  toast(EPISODE_TRACKING_MESSAGES[error], {
    id,
    description: undefined,
    action: signInAction(error, returnPath, navigate),
  });
}

/**
 * Runs an action and keeps its whole result, which can carry an Undo (spec
 * 0013, spec 0020). A rejected call settles as `write_failed`, as
 * `settleTrackingCall` does, so the control rolls back with a toast.
 *
 * @param call The Server Action call.
 */
export async function settleResultCall<R extends { ok: boolean }>(
  call: () => Promise<R>,
): Promise<R | { ok: false; error: "write_failed" }> {
  try {
    return await call();
  } catch {
    return { ok: false, error: "write_failed" };
  }
}

/**
 * Runs an Undo from the toast that offered it (spec 0008).
 *
 * Sonner deletes a toast once its action runs, after a short exit animation,
 * and an outcome that lands inside that animation merges into the dying toast
 * and vanishes with it, which is how a quick "Couldn't undo" went unseen. So
 * the click keeps the toast (`preventDefault`), takes the Undo off it so it
 * cannot run twice, and the outcome then closes it or rewrites it in place.
 *
 * @param event The action's click event.
 * @param options.id The toast id.
 * @param options.message The toast's text while the restore runs.
 * @param options.expiredMessage The text when the database refuses the Undo.
 * @param options.restore The restoring Server Action call.
 * @param options.restoring Runs inside the transition first, for a control
 * that shows the restored state at once.
 * @param options.onError Shows any other failure, once the toast is closed.
 */
export function runUndoInToast<E extends string>(
  event: { preventDefault: () => void },
  {
    id,
    message,
    expiredMessage,
    restore,
    restoring,
    onError,
  }: {
    id: string;
    message: string;
    expiredMessage: string;
    restore: () => Promise<{ ok: true } | { ok: false; error: E }>;
    restoring?: () => void;
    onError: (error: E | "write_failed") => void;
  },
): void {
  event.preventDefault();
  toast(message, { id, action: undefined });
  startTransition(async () => {
    restoring?.();
    const result = await settleResultCall(restore);
    if (result.ok) {
      toast.dismiss(id);
      return;
    }
    if (result.error === "undo_expired") {
      // Sonner merges an update into the toast with the same id, so a
      // description from the first toast survives unless cleared here.
      toast(expiredMessage, { id, description: undefined, action: undefined });
      return;
    }
    toast.dismiss(id);
    onError(result.error);
  });
}

/**
 * Shows the toast for a failed show tracking write (spec 0020, AC-2 to
 * AC-4). The caller names the toast id, one per show and surface, so
 * repeated failures replace each other and an Undo's outcome rewrites its
 * own toast.
 *
 * @param error The error class the action returned.
 * @param options.id The toast id.
 * @param options.returnPath The page to come back to after signing in.
 * @param options.navigate The router push, for the Sign in action.
 */
export function showShowTrackingError(
  error: ShowTrackingError,
  {
    id,
    returnPath,
    navigate,
  }: { id: string; returnPath: string; navigate: (href: string) => void },
): void {
  toast(SHOW_TRACKING_MESSAGES[error], {
    id,
    description: undefined,
    action: signInAction(error, returnPath, navigate),
  });
}

/** The Sign in action a session expired toast carries, and no other. */
function signInAction(
  error: MovieTrackingError | EpisodeTrackingError | ShowTrackingError,
  returnPath: string,
  navigate: (href: string) => void,
) {
  return error === "session_expired"
    ? {
        label: SIGN_IN_ACTION_LABEL,
        onClick: () =>
          navigate(`/sign-in?next=${encodeURIComponent(returnPath)}`),
      }
    : undefined;
}
