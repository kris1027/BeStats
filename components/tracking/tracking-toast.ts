"use client";

import { toast } from "sonner";

import {
  EPISODE_TRACKING_MESSAGES,
  SIGN_IN_ACTION_LABEL,
  TRACKING_MESSAGES,
} from "@/lib/tracking/messages";
import type {
  EpisodeTrackingError,
  MovieTrackingError,
} from "@/lib/tracking/types";

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
export async function settleTrackingCall<E extends EpisodeTrackingError>(
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

/** The Sign in action a session expired toast carries, and no other. */
function signInAction(
  error: EpisodeTrackingError,
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
